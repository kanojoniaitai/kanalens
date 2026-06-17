import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db/index";
import { vocabularies } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const review = searchParams.get("review");
    const offset = (page - 1) * limit;

    const db = await getDb();

    if (review === "due") {
      const now = new Date().toISOString();
      const result = await db
        .select()
        .from(vocabularies)
        .where(sql`${vocabularies.next_review_at} IS NOT NULL AND ${vocabularies.next_review_at} <= ${now}`)
        .orderBy(vocabularies.next_review_at)
        .limit(limit)
        .offset(offset);

      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(vocabularies)
        .where(sql`${vocabularies.next_review_at} IS NOT NULL AND ${vocabularies.next_review_at} <= ${now}`);
      const total = totalRows[0]?.count ?? 0;

      return NextResponse.json({ vocabularies: result, total });
    }

    const result = await db
      .select()
      .from(vocabularies)
      .orderBy(vocabularies.created_at)
      .limit(limit)
      .offset(offset);

    const totalRows = await db.select({ count: sql<number>`count(*)` }).from(vocabularies);
    const total = totalRows[0]?.count ?? 0;

    return NextResponse.json({ vocabularies: result, total });
  } catch (error) {
    console.error("[API /vocabulary GET] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { word, reading, pos, gloss_en, source_passage_id } = body;

    if (!word || !reading || !pos || !gloss_en) {
      return NextResponse.json(
        { error: "Missing required fields: word, reading, pos, gloss_en" },
        { status: 400 }
      );
    }

    const db = await getDb();

    const existing = await db
      .select()
      .from(vocabularies)
      .where(eq(vocabularies.word, word))
      .limit(1);

    if (existing.length > 0) {
      if (source_passage_id) {
        await db.update(vocabularies).set({ source_passage_id }).where(eq(vocabularies.id, existing[0].id));
        saveDb();
        const updated = await db.select().from(vocabularies).where(eq(vocabularies.id, existing[0].id)).limit(1);
        return NextResponse.json({ vocabulary: updated[0], updated: true });
      }
      return NextResponse.json({ vocabulary: existing[0], updated: true });
    }

    const now = new Date().toISOString();
    const id = nanoid();
    const nextReview = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    await db.insert(vocabularies).values({
      id,
      word,
      reading,
      pos,
      gloss_en,
      source_passage_id: source_passage_id ?? null,
      review_count: 0,
      ease_factor: 2.5,
      next_review_at: nextReview,
      last_review_at: null,
      created_at: now,
    });
    saveDb();

    const vocab = await db.select().from(vocabularies).where(eq(vocabularies.id, id)).limit(1);
    return NextResponse.json({ vocabulary: vocab[0] });
  } catch (error) {
    console.error("[API /vocabulary POST] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, rating } = body;

    if (!id || !rating) {
      return NextResponse.json({ error: "Missing required fields: id, rating" }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db.select().from(vocabularies).where(eq(vocabularies.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Vocabulary not found" }, { status: 404 });
    }

    const vocab = existing[0];
    const currentEase = vocab.ease_factor ?? 2.5;
    const currentCount = vocab.review_count ?? 0;

    let newEase = currentEase;
    let interval: number;

    if (rating <= 2) {
      interval = 1;
      newEase = Math.max(1.3, currentEase - 0.2);
    } else if (rating === 3) {
      interval = currentCount === 0 ? 1 : 6;
      newEase = Math.max(1.3, currentEase - 0.15);
    } else if (rating === 4) {
      interval = currentCount === 0 ? 4 : currentCount < 3 ? 6 : Math.round(currentCount * currentEase);
      newEase = currentEase + 0.15;
    } else {
      interval = currentCount === 0 ? 4 : currentCount < 3 ? 10 : Math.round(currentCount * currentEase * 1.3);
      newEase = currentEase + 0.25;
    }

    const now = new Date();
    const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000).toISOString();

    await db
      .update(vocabularies)
      .set({
        review_count: currentCount + 1,
        ease_factor: newEase,
        next_review_at: nextReview,
        last_review_at: now.toISOString(),
      })
      .where(eq(vocabularies.id, id));
    saveDb();

    const updated = await db.select().from(vocabularies).where(eq(vocabularies.id, id)).limit(1);
    return NextResponse.json({ vocabulary: updated[0] });
  } catch (error) {
    console.error("[API /vocabulary PUT] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Vocabulary ID required" }, { status: 400 });
    }

    const db = await getDb();
    await db.delete(vocabularies).where(eq(vocabularies.id, id));
    saveDb();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /vocabulary DELETE] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
