import { NextRequest, NextResponse } from "next/server";
import { testApiKey } from "@/lib/llm/generator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiKey = typeof body.deepseek_api_key === "string"
      ? body.deepseek_api_key.trim()
      : typeof body.openai_key === "string"
        ? body.openai_key.trim()
        : "";

    if (apiKey) {
      const valid = await testApiKey(apiKey);
      if (valid) {
        return NextResponse.json({ ok: true, message: "API key is valid" });
      }
      return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /settings] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
