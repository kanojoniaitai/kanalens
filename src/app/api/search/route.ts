import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { passages, vocabularies, grammars, dictionaryEntries } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

const APPROVED_STATUS = "approved";

function matchHint(row: {
  title_ja: string;
  title_en: string;
  translation: string;
  paragraphs_json: string;
  grammar_points_json: string;
  word_gloss_json: string;
  review_notes: string | null;
  source_title: string | null;
  source_locator: string | null;
}, query: string): string {
  const checks: [string, string | null][] = [
    ["title", `${row.title_ja} ${row.title_en}`],
    ["reading", row.paragraphs_json],
    ["translation", row.translation],
    ["vocabulary", row.word_gloss_json],
    ["grammar", row.grammar_points_json],
    ["practice", row.review_notes],
    ["source", `${row.source_title ?? ""} ${row.source_locator ?? ""}`],
  ];
  return checks.find(([, value]) => value?.toLowerCase().includes(query.toLowerCase()))?.[0] ?? "passage";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 1) {
      return NextResponse.json({ results: { passages: [], vocabularies: [], dictionary: [], grammars: [] } });
    }

    const db = await getDb();
    const like = `%${q}%`;

    const passageResults = await db
      .select({
        id: passages.id,
        title_ja: passages.title_ja,
        title_en: passages.title_en,
        translation: passages.translation,
        paragraphs_json: passages.paragraphs_json,
        grammar_points_json: passages.grammar_points_json,
        word_gloss_json: passages.word_gloss_json,
        review_notes: passages.review_notes,
        source_title: passages.source_title,
        source_locator: passages.source_locator,
      })
      .from(passages)
      .where(and(
        eq(passages.verification_status, APPROVED_STATUS),
        sql`${passages.title_ja} LIKE ${like}
          OR ${passages.title_en} LIKE ${like}
          OR ${passages.translation} LIKE ${like}
          OR ${passages.paragraphs_json} LIKE ${like}
          OR ${passages.grammar_points_json} LIKE ${like}
          OR ${passages.word_gloss_json} LIKE ${like}
          OR ${passages.review_notes} LIKE ${like}
          OR ${passages.source_title} LIKE ${like}
          OR ${passages.source_locator} LIKE ${like}`,
      ))
      .limit(20);

    const vocabResults = await db
      .select({
        id: vocabularies.id,
        word: vocabularies.word,
        reading: vocabularies.reading,
        gloss_en: vocabularies.gloss_en,
      })
      .from(vocabularies)
      .where(sql`${vocabularies.word} LIKE ${like} OR ${vocabularies.reading} LIKE ${like} OR ${vocabularies.gloss_en} LIKE ${like}`)
      .limit(10);

    const grammarResults = await db
      .select({
        id: grammars.id,
        pattern: grammars.pattern,
        explanation_en: grammars.explanation_en,
      })
      .from(grammars)
      .where(sql`${grammars.pattern} LIKE ${like} OR ${grammars.explanation_en} LIKE ${like}`)
      .limit(10);

    const dictionaryResults = await db
      .select({
        id: dictionaryEntries.id,
        expression: dictionaryEntries.expression,
        reading: dictionaryEntries.reading,
        meaning: dictionaryEntries.meaning,
        source: dictionaryEntries.source,
      })
      .from(dictionaryEntries)
      .where(sql`${dictionaryEntries.expression} LIKE ${like} OR ${dictionaryEntries.reading} LIKE ${like} OR ${dictionaryEntries.meaning} LIKE ${like}`)
      .limit(12);

    return NextResponse.json({
      results: {
        passages: passageResults.map((p) => ({
          id: p.id,
          title_ja: p.title_ja,
          title_en: p.title_en,
          source_title: p.source_title,
          source_locator: p.source_locator,
          match_hint: matchHint(p, q),
          type: "passage" as const,
        })),
        vocabularies: vocabResults.map((v) => ({ ...v, type: "vocabulary" as const })),
        dictionary: dictionaryResults.map((d) => ({ ...d, type: "dictionary" as const })),
        grammars: grammarResults.map((g) => ({ ...g, type: "grammar" as const })),
      },
    });
  } catch (error) {
    console.error("[API /search] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
