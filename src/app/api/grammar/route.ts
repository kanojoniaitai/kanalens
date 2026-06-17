import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db/index";
import { grammars } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;

    const db = await getDb();
    const result = await db
      .select()
      .from(grammars)
      .orderBy(grammars.created_at)
      .limit(limit)
      .offset(offset);

    const totalRows = await db.select({ count: sql<number>`count(*)` }).from(grammars);
    const total = totalRows[0]?.count ?? 0;

    return NextResponse.json({ grammars: result, total });
  } catch (error) {
    console.error("[API /grammar GET] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pattern, explanation_en, source_passage_id } = body;

    if (!pattern || !explanation_en) {
      return NextResponse.json(
        { error: "Missing required fields: pattern, explanation_en" },
        { status: 400 }
      );
    }

    const db = await getDb();

    const existing = await db
      .select()
      .from(grammars)
      .where(eq(grammars.pattern, pattern))
      .limit(1);

    if (existing.length > 0) {
      if (source_passage_id) {
        await db.update(grammars).set({ source_passage_id }).where(eq(grammars.id, existing[0].id));
        saveDb();
        const updated = await db.select().from(grammars).where(eq(grammars.id, existing[0].id)).limit(1);
        return NextResponse.json({ grammar: updated[0], updated: true });
      }
      return NextResponse.json({ grammar: existing[0], updated: true });
    }

    const now = new Date().toISOString();
    const id = nanoid();

    await db.insert(grammars).values({
      id,
      pattern,
      explanation_en,
      source_passage_id: source_passage_id ?? null,
      created_at: now,
    });
    saveDb();

    const grammar = await db.select().from(grammars).where(eq(grammars.id, id)).limit(1);
    return NextResponse.json({ grammar: grammar[0] });
  } catch (error) {
    console.error("[API /grammar POST] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Grammar ID required" }, { status: 400 });
    }

    const db = await getDb();
    await db.delete(grammars).where(eq(grammars.id, id));
    saveDb();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /grammar DELETE] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
