import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db/index";
import { readingStats, passages, vocabularies, grammars } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7";

    const db = await getDb();

    const days = parseInt(range, 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const stats = await db
      .select()
      .from(readingStats)
      .where(sql`${readingStats.date} >= ${since}`)
      .orderBy(desc(readingStats.date));

    const totalPassages = await db.select({ count: sql<number>`count(*)` }).from(passages);
    const totalVocab = await db.select({ count: sql<number>`count(*)` }).from(vocabularies);
    const totalGrammar = await db.select({ count: sql<number>`count(*)` }).from(grammars);

    const now = new Date().toISOString();
    const dueVocab = await db
      .select({ count: sql<number>`count(*)` })
      .from(vocabularies)
      .where(sql`${vocabularies.next_review_at} IS NOT NULL AND ${vocabularies.next_review_at} <= ${now}`);

    const streakResult = await db
      .select({ date: readingStats.date })
      .from(readingStats)
      .where(sql`${readingStats.passages_read} > 0`)
      .orderBy(desc(readingStats.date))
      .limit(30);

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(today.getTime() - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      if (streakResult.some((s) => s.date === checkDate)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return NextResponse.json({
      dailyStats: stats,
      totals: {
        passages: totalPassages[0]?.count ?? 0,
        vocabulary: totalVocab[0]?.count ?? 0,
        grammar: totalGrammar[0]?.count ?? 0,
        dueReviews: dueVocab[0]?.count ?? 0,
        streak,
      },
    });
  } catch (error) {
    console.error("[API /reading-stats GET] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { passages_read, words_learned, time_spent_ms } = body;

    const db = await getDb();
    const today = new Date().toISOString().split("T")[0];

    const existing = await db
      .select()
      .from(readingStats)
      .where(eq(readingStats.date, today))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(readingStats)
        .set({
          passages_read: (existing[0].passages_read ?? 0) + (passages_read || 0),
          words_learned: (existing[0].words_learned ?? 0) + (words_learned || 0),
          time_spent_ms: (existing[0].time_spent_ms ?? 0) + (time_spent_ms || 0),
        })
        .where(eq(readingStats.date, today));
    } else {
      await db.insert(readingStats).values({
        id: nanoid(),
        date: today,
        passages_read: passages_read || 0,
        words_learned: words_learned || 0,
        time_spent_ms: time_spent_ms || 0,
      });
    }

    saveDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /reading-stats POST] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
