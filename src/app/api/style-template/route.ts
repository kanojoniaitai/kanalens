import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db/index";
import { styleTemplates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.select().from(styleTemplates);
    return NextResponse.json({ templates: result });
  } catch (error) {
    console.error("[API /style-template GET] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, prompt } = body;

    if (!name || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: name, prompt" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const id = nanoid();

    await db.insert(styleTemplates).values({
      id,
      name,
      prompt,
      is_default: false,
      created_at: now,
      updated_at: now,
    });
    saveDb();

    const template = await db.select().from(styleTemplates).where(eq(styleTemplates.id, id)).limit(1);
    return NextResponse.json({ template: template[0] });
  } catch (error) {
    console.error("[API /style-template POST] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Template ID required" }, { status: 400 });
    }

    const body = await request.json();
    const { name, prompt } = body;

    const db = await getDb();

    const existing = await db.select().from(styleTemplates).where(eq(styleTemplates.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await db
      .update(styleTemplates)
      .set({
        ...(name !== undefined && { name }),
        ...(prompt !== undefined && { prompt }),
        updated_at: new Date().toISOString(),
      })
      .where(eq(styleTemplates.id, id));
    saveDb();

    const template = await db.select().from(styleTemplates).where(eq(styleTemplates.id, id)).limit(1);
    return NextResponse.json({ template: template[0] });
  } catch (error) {
    console.error("[API /style-template PUT] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Template ID required" }, { status: 400 });
    }

    const db = await getDb();

    const existing = await db.select().from(styleTemplates).where(eq(styleTemplates.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing[0].is_default) {
      return NextResponse.json({ error: "Cannot delete default template" }, { status: 400 });
    }

    await db.delete(styleTemplates).where(eq(styleTemplates.id, id));
    saveDb();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /style-template DELETE] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
