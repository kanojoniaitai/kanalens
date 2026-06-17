import { NextRequest, NextResponse } from "next/server";
import { generateJIC } from "@/lib/llm/generator";
import { getPassageById, updatePassageJIC } from "@/lib/pool/manager";
import { isReusableKanbunSentence } from "@/lib/jic/kanbun";
import type { JICSentenceCode } from "@/lib/types";

function hasReusableJic(sentences: JICSentenceCode[] | undefined): boolean {
  return Boolean(
    sentences?.length
    && sentences.every(isReusableKanbunSentence)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { passage_id } = body;
    const apiKey = request.headers.get("x-api-key") || process.env.DEEPSEEK_API_KEY || "";

    if (!passage_id) {
      return NextResponse.json({ error: "passage_id is required" }, { status: 400 });
    }

    const passage = await getPassageById(passage_id);
    if (!passage) {
      return NextResponse.json({ error: "Passage not found" }, { status: 404 });
    }

    if (hasReusableJic(passage.jic_sentences)) {
      return NextResponse.json({ jic_sentences: passage.jic_sentences, jic_code: passage.jic_code });
    }

    const fullText = passage.paragraphs.map(p => p.text).join("\n");

    const jicSentences = await generateJIC(fullText, apiKey || undefined);

    await updatePassageJIC(passage_id, jicSentences);

    const jicCode = jicSentences.map(s => s.jic_code).join("\n");

    return NextResponse.json({ jic_sentences: jicSentences, jic_code: jicCode });
  } catch (error) {
    console.error("[API /jic/generate] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
