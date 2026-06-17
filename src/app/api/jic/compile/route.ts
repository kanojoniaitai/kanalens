import { NextRequest, NextResponse } from "next/server";
import { compilePassage, compileSentence } from "@/lib/jic";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, sentence } = body as { text?: string; sentence?: string };

    if (!text && !sentence) {
      return NextResponse.json(
        { error: "Provide either 'text' (full passage) or 'sentence' (single sentence)" },
        { status: 400 }
      );
    }

    if (sentence) {
      const result = compileSentence(sentence);
      return NextResponse.json({
        compiled: result.compiled,
        original: result.original,
        warnings: result.warnings,
      });
    }

    if (text) {
      const result = compilePassage(text);
      return NextResponse.json({
        compiled: result.fullCode,
        sentences: result.sentences.map(s => ({
          original: s.original,
          compiled: s.compiled,
          warnings: s.warnings,
        })),
        warnings: result.warnings,
      });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("[API /jic/compile] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
