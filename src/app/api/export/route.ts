import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { vocabularies, grammars } from "@/lib/db/schema";
import { exportVocabularyToMarkdown, exportVocabularyToJson, exportGrammarToMarkdown, exportGrammarToJson } from "@/lib/export/format";
import type { Vocabulary, GrammarSave } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "vocabulary";
    const format = searchParams.get("format") || "markdown";

    const db = await getDb();

    if (type === "grammar") {
      const grammarRows = await db.select().from(grammars);
      const grammarList: GrammarSave[] = grammarRows.map((g) => ({
        id: g.id,
        pattern: g.pattern,
        explanation_en: g.explanation_en,
        source_passage_id: g.source_passage_id,
        created_at: g.created_at,
      }));

      if (format === "json") {
        const json = exportGrammarToJson(grammarList);
        return new NextResponse(json, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="kanalens-grammar-export-${new Date().toISOString().split("T")[0]}.json"`,
          },
        });
      }

      const md = exportGrammarToMarkdown(grammarList);
      return new NextResponse(md, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="kanalens-grammar-export-${new Date().toISOString().split("T")[0]}.md"`,
        },
      });
    }

    const vocabRows = await db.select().from(vocabularies);
    const vocabList: Vocabulary[] = vocabRows.map((v) => ({
      id: v.id,
      word: v.word,
      reading: v.reading,
      pos: v.pos as Vocabulary["pos"],
      gloss_en: v.gloss_en,
      source_passage_id: v.source_passage_id,
      review_count: v.review_count ?? 0,
      ease_factor: v.ease_factor ?? 2.5,
      next_review_at: v.next_review_at ?? null,
      last_review_at: v.last_review_at ?? null,
      created_at: v.created_at,
    }));

    if (format === "json") {
      const json = exportVocabularyToJson(vocabList);
      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="kanalens-vocabulary-export-${new Date().toISOString().split("T")[0]}.json"`,
        },
      });
    }

    const md = exportVocabularyToMarkdown(vocabList);
    return new NextResponse(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="kanalens-vocabulary-export-${new Date().toISOString().split("T")[0]}.md"`,
      },
    });
  } catch (error) {
    console.error("[API /export] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
