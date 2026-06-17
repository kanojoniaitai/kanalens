import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/index";
import { styleTemplates, passages } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { generatePassageStream, resolveTierTokenBudget } from "@/lib/llm/generator";
import { hashPrompt } from "@/lib/llm/prompts";
import { storePassage, isDuplicatePassage, getCachedPassageForTier, getPassageById, type PassageCacheMetadata } from "@/lib/pool/manager";
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

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { style_template_id, exclude_ids, generation_tier } = body;
  const tier: GenerationTier = VALID_TIERS.has(generation_tier) ? generation_tier as GenerationTier : "normal";
  const apiKey = request.headers.get("x-api-key") || process.env.DEEPSEEK_API_KEY || "";

  if (!apiKey) {
    return new Response(sseEvent("error", { error: "API key required" }), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (!closed) {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        }
      };
      const closeSafe = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      try {
        send("stage", { stage: "connecting" });

        let template: StyleTemplate | null = null;
        if (style_template_id) {
          const db = await getDb();
          const rows = await db.select().from(styleTemplates).where(eq(styleTemplates.id, style_template_id)).limit(1);
          if (rows.length > 0) template = rows[0] as StyleTemplate;
        }
        if (!template) {
          const db = await getDb();
          const defaultRows = await db.select().from(styleTemplates).limit(1);
          if (defaultRows.length > 0) template = defaultRows[0] as StyleTemplate;
        }
        if (!template) {
          send("error", { error: "No style template found" });
          closeSafe();
          return;
        }

        const excludeIds = (exclude_ids as string[]) || [];
        const cached = await getCachedPassageForTier(template, tier, excludeIds);
        if (cached) {
          send("stage", { stage: "cache_hit" });
          send("result", { passage: cached });
          closeSafe();
          warmPoolAsync(template.id, apiKey, tier);
          return;
        }

        const legacyExclude = excludeIds.length > 0
          ? sql`AND ${passages.id} NOT IN (${sql.join(excludeIds.map((id: string) => sql`${id}`), sql`, `)})`
          : sql``;
        const db = await getDb();
        const legacyRows = await db
          .select({ id: passages.id })
          .from(passages)
          .where(sql`${passages.style_template_id} = ${template.id} ${legacyExclude}`)
          .orderBy(sql`RANDOM()`)
          .limit(1);
        if (legacyRows.length > 0) {
          const legacyPassage = await getPassageById(legacyRows[0].id);
          if (legacyPassage) {
            send("stage", { stage: "cache_hit" });
            send("result", { passage: legacyPassage });
            closeSafe();
            warmPoolAsync(template.id, apiKey, tier);
            return;
          }
        }

        const promptHash = hashPrompt(template, tier);
        const tokenBudget = resolveTierTokenBudget(tier, 1);
        const cacheMeta: PassageCacheMetadata = { tier, promptHash, tokenBudget };

        await generatePassageStream(template, apiKey, {
          onStage(stage, attempt, errors) {
            send("stage", { stage, attempt, errors });
          },
          onToken(text) {
            send("token", { text });
          },
          async onResult(passage) {
            const isDup = passage.content_hash
              ? await isDuplicatePassage(passage.content_hash)
              : false;
            if (isDup) {
              return false;
            }
            const approvedPassage = withApprovedDefaults(passage);
            await storePassage(approvedPassage, cacheMeta);
            send("stage", { stage: "done" });
            send("result", { passage: approvedPassage });
            closeSafe();
            warmPoolAsync(template!.id, apiKey, tier);
            return true;
          },
          onError(error) {
            send("error", { error });
            closeSafe();
          },
        }, { tier });
      } catch (error) {
        send("error", { error: (error as Error).message });
        closeSafe();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function warmPoolAsync(templateId: string, apiKey: string, tier: GenerationTier) {
  setTimeout(async () => {
    try {
      const { warmPool } = await import("@/lib/pool/manager");
      await warmPool(templateId, apiKey, tier);
    } catch (err) {
      console.warn("[WarmPool] Background warm failed:", err);
    }
  }, 1000);
}
