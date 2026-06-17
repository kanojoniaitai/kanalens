import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, saveDb } from "@/lib/db/index";
import { mistakeRecords } from "@/lib/db/schema";

function clampLimit(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 80;
  return Math.min(Math.max(Number.parseInt(value, 10), 1), 200);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const passageId = searchParams.get("passage_id");
    const limit = clampLimit(searchParams.get("limit"));
    const db = await getDb();

    const query = db
      .select()
      .from(mistakeRecords)
      .where(passageId ? eq(mistakeRecords.passage_id, passageId) : undefined)
      .orderBy(desc(mistakeRecords.created_at))
      .limit(limit);

    const mistakes = await query;
    return NextResponse.json({ mistakes });
  } catch (error) {
    console.error("[API /mistakes GET] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const passageId = typeof body.passage_id === "string" ? body.passage_id : null;
    const exerciseId = typeof body.exercise_id === "string" ? body.exercise_id : "";
    const exerciseModule = typeof body.module === "string" ? body.module : "practice";
    const category = typeof body.category === "string" ? body.category : "";
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const userAnswer = typeof body.user_answer === "string" ? body.user_answer : "";
    const expectedAnswer = typeof body.expected_answer === "string" ? body.expected_answer : "";
    const severity = typeof body.severity === "number" && Number.isFinite(body.severity) ? body.severity : 0.6;
    const rationale = typeof body.rationale === "string" ? body.rationale : "";

    if (!exerciseId || !category || !prompt || !expectedAnswer) {
      return NextResponse.json({ error: "Missing required mistake fields" }, { status: 400 });
    }

    const db = await getDb();
    const record = {
      id: nanoid(),
      passage_id: passageId,
      exercise_id: exerciseId,
      module: exerciseModule,
      category,
      prompt,
      user_answer: userAnswer,
      expected_answer: expectedAnswer,
      severity,
      rationale,
      created_at: new Date().toISOString(),
    };

    await db.insert(mistakeRecords).values(record);
    saveDb();

    return NextResponse.json({ mistake: record });
  } catch (error) {
    console.error("[API /mistakes POST] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Mistake ID required" }, { status: 400 });
    }

    const db = await getDb();
    await db.delete(mistakeRecords).where(eq(mistakeRecords.id, id));
    saveDb();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /mistakes DELETE] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
