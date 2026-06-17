import { NextRequest, NextResponse } from "next/server";
import { getRandomPassage, getPassageById, getPassageHistory, listPassagesByTemplate, storePassage } from "@/lib/pool/manager";
import { generatePassage, type GenerationOptions } from "@/lib/llm/generator";
import { hashPrompt } from "@/lib/llm/prompts";
import { getDb, saveDb } from "@/lib/db/index";
import { styleTemplates, passages, passageCacheEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { StyleTemplate, GenerationTier, Passage } from "@/lib/types";

const VALID_TIERS = new Set<string>(["short", "normal", "long"]);
const APPROVED_STATUS = "approved";

function withApprovedDefaults(passage: Passage): Passage {
  return {
    ...passage,
    source_title: passage.source_title ?? null,
    source_author: passage.source_author ?? null,
    source_identifier: passage.source_identifier ?? null,
    source_license: passage.source_license ?? null,
    source_locator: passage.source_locator ?? null,
    verification_status: passage.verification_status ?? APPROVED_STATUS,
    review_notes: passage.review_notes ?? null,
    reviewed_at: passage.reviewed_at ?? null,
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const styleTemplateId = searchParams.get("style_template_id");
    const history = searchParams.get("history");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const generate = searchParams.get("generate");
    const tierParam = searchParams.get("generation_tier");
    const tier: GenerationTier = VALID_TIERS.has(tierParam ?? "") ? tierParam as GenerationTier : "normal";
    const excludeIdsHeader = request.headers.get("x-exclude-ids") || "";
    const excludeIds = excludeIdsHeader ? excludeIdsHeader.split(",").filter(Boolean) : undefined;

    const apiKey = request.headers.get("x-api-key") || process.env.DEEPSEEK_API_KEY || "";

    if (history) {
      const result = await getPassageHistory(page, 20);
      return NextResponse.json(result);
    }

    const list = searchParams.get("list");

    if (list) {
      const result = await listPassagesByTemplate(styleTemplateId || undefined);
      return NextResponse.json({ passages: result });
    }

    if (id) {
      const passage = await getPassageById(id);
      if (!passage) {
        return NextResponse.json({ error: "Passage not found" }, { status: 404 });
      }
      return NextResponse.json({ passage });
    }

    if (generate) {
      let template: StyleTemplate | null = null;
      if (styleTemplateId) {
        const db = await getDb();
        const rows = await db.select().from(styleTemplates).where(eq(styleTemplates.id, styleTemplateId)).limit(1);
        if (rows.length > 0) {
          template = rows[0] as StyleTemplate;
        }
      }

      if (!template) {
        const db = await getDb();
        const defaultRows = await db.select().from(styleTemplates).limit(1);
        if (defaultRows.length > 0) {
          template = defaultRows[0] as StyleTemplate;
        }
      }

      if (!template) {
        return NextResponse.json({ error: "No style template found" }, { status: 400 });
      }

      if (!apiKey) {
        return NextResponse.json({ error: "API key required for generation" }, { status: 400 });
      }

      const genOpts: GenerationOptions = { tier };
      const passage = withApprovedDefaults(await generatePassage(template, apiKey, genOpts));
      const promptHash = hashPrompt(template, tier);
      await storePassage(passage, { tier, promptHash, tokenBudget: 0 });
      return NextResponse.json({ passage });
    }

    let template: StyleTemplate | null = null;
    if (styleTemplateId) {
      const db = await getDb();
      const rows = await db.select().from(styleTemplates).where(eq(styleTemplates.id, styleTemplateId)).limit(1);
      if (rows.length > 0) {
        template = rows[0] as StyleTemplate;
      }
    }

    const passage = await getRandomPassage(template, apiKey, excludeIds);
    if (!passage) {
      return NextResponse.json(
        { error: "No passages available. Please generate some first." },
        { status: 404 }
      );
    }

    return NextResponse.json({ passage });
  } catch (error) {
    console.error("[API /passage] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Passage ID required" }, { status: 400 });
    }

    const db = await getDb();
    await db.delete(passageCacheEntries).where(eq(passageCacheEntries.passage_id, id));
    await db.delete(passages).where(eq(passages.id, id));
    saveDb();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /passage DELETE] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
