import type { Passage, PassageSummary, StyleTemplate, GenerationTier, JICSentenceCode, PassageVerificationStatus } from "../types";
import { getDb, saveDb } from "../db/index";
import { passages, passageCacheEntries, styleTemplates } from "../db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { generatePassage, type GenerationOptions } from "../llm/generator";
import { hashPrompt } from "../llm/prompts";

const APPROVED_STATUS: PassageVerificationStatus = "approved";

function normalizeVerificationStatus(status: string | null | undefined): PassageVerificationStatus {
  return status === "draft" || status === "reviewed" || status === "approved" || status === "rejected"
    ? status
    : APPROVED_STATUS;
}

export async function isDuplicatePassage(contentHash: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: passages.id })
    .from(passages)
    .where(and(eq(passages.content_hash, contentHash), eq(passages.verification_status, APPROVED_STATUS)))
    .limit(1);
  return rows.length > 0;
}

export async function getPassageById(id: string): Promise<Passage | null> {
  const db = await getDb();
  const rows = await db.select().from(passages).where(eq(passages.id, id)).limit(1);
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    title_ja: row.title_ja,
    title_en: row.title_en,
    paragraphs: JSON.parse(row.paragraphs_json),
    grammar_points: JSON.parse(row.grammar_points_json),
    translation: row.translation,
    word_gloss: JSON.parse(row.word_gloss_json),
    jic_sentences: row.jic_sentences_json ? (JSON.parse(row.jic_sentences_json) as JICSentenceCode[]) : undefined,
    jic_code: row.jic_code || null,
    style_template_id: row.style_template_id,
    created_at: row.created_at,
    llm_model: row.llm_model,
    content_hash: row.content_hash,
    source_title: row.source_title,
    source_author: row.source_author,
    source_identifier: row.source_identifier,
    source_license: row.source_license,
    source_locator: row.source_locator,
    verification_status: normalizeVerificationStatus(row.verification_status),
    review_notes: row.review_notes,
    reviewed_at: row.reviewed_at,
  };
}

export interface PassageCacheMetadata {
  tier: GenerationTier;
  promptHash: string;
  tokenBudget: number;
}

export async function storePassage(passage: Passage, cacheMeta?: PassageCacheMetadata): Promise<void> {
  const db = await getDb();

  await db.insert(passages).values({
    id: passage.id,
    title_ja: passage.title_ja,
    title_en: passage.title_en,
    paragraphs_json: JSON.stringify(passage.paragraphs),
    grammar_points_json: JSON.stringify(passage.grammar_points),
    translation: passage.translation,
    word_gloss_json: JSON.stringify(passage.word_gloss),
    jic_sentences_json: passage.jic_sentences ? JSON.stringify(passage.jic_sentences) : null,
    jic_code: passage.jic_code || null,
    style_template_id: passage.style_template_id,
    llm_model: passage.llm_model,
    content_hash: passage.content_hash,
    source_title: passage.source_title,
    source_author: passage.source_author,
    source_identifier: passage.source_identifier,
    source_license: passage.source_license,
    source_locator: passage.source_locator,
    verification_status: passage.verification_status,
    review_notes: passage.review_notes,
    reviewed_at: passage.reviewed_at,
    created_at: passage.created_at,
  });


  if (cacheMeta) {
    await recordPassageCacheEntry(passage.id, cacheMeta, db);
  }

  saveDb();
}

export async function recordPassageCacheEntry(
  passageId: string,
  meta: PassageCacheMetadata,
  db?: ReturnType<typeof getDb> extends Promise<infer T> ? T : never
): Promise<void> {
  const database = db ?? await getDb();
  const now = new Date().toISOString();
  await database.insert(passageCacheEntries).values({
    passage_id: passageId,
    style_template_id: null,
    generation_tier: meta.tier,
    prompt_hash: meta.promptHash,
    token_budget: meta.tokenBudget,
    use_count: 0,
    last_used_at: null,
    created_at: now,
  }).onConflictDoNothing();
}

export async function getCachedPassageForTier(
  template: StyleTemplate,
  tier: GenerationTier,
  excludeIds: string[]
): Promise<Passage | null> {
  const db = await getDb();
  const promptHash = hashPrompt(template, tier);

  const excludeClause = excludeIds && excludeIds.length > 0
    ? sql`AND ${passages.id} NOT IN (${sql.join(excludeIds.map((id: string) => sql`${id}`), sql`, `)})`
    : sql``;

  const rows = await db
    .select({ id: passages.id })
    .from(passageCacheEntries)
    .innerJoin(passages, eq(passageCacheEntries.passage_id, passages.id))
    .where(sql`${passageCacheEntries.generation_tier} = ${tier} AND ${passageCacheEntries.prompt_hash} = ${promptHash} AND ${passages.verification_status} = ${APPROVED_STATUS} ${excludeClause}`)
    .orderBy(passageCacheEntries.use_count, sql`RANDOM()`)
    .limit(1);

  if (rows.length > 0) {
    await touchPassageCacheEntry(rows[0].id, db);
    return getPassageById(rows[0].id);
  }

  return null;
}

export async function touchPassageCacheEntry(
  passageId: string,
  db?: ReturnType<typeof getDb> extends Promise<infer T> ? T : never
): Promise<void> {
  const database = db ?? await getDb();
  const now = new Date().toISOString();
  await database.update(passageCacheEntries)
    .set({ use_count: sql`${passageCacheEntries.use_count} + 1`, last_used_at: now })
    .where(eq(passageCacheEntries.passage_id, passageId));
}

export async function updatePassageJIC(id: string, jicSentences: JICSentenceCode[]): Promise<void> {
  const db = await getDb();
  const jicCode = jicSentences.map(s => s.jic_code).join("\n");
  await db.update(passages)
    .set({
      jic_sentences_json: JSON.stringify(jicSentences),
      jic_code: jicCode,
    })
    .where(eq(passages.id, id));
  saveDb();
}

export async function getRandomPassage(
  template?: StyleTemplate | null,
  apiKey?: string,
  excludeIds?: string[],
  tier: GenerationTier = "normal"
): Promise<Passage | null> {
  const db = await getDb();

  let candidates;
  const excludeClause = excludeIds && excludeIds.length > 0
    ? sql`AND ${passages.id} NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`, `)})`
    : sql``;

  if (template) {
    candidates = await db
      .select()
      .from(passages)
      .where(sql`${passages.style_template_id} = ${template.id} AND ${passages.verification_status} = ${APPROVED_STATUS} ${excludeClause}`)
      .orderBy(sql`RANDOM()`)
      .limit(1);
  } else {
    if (excludeIds && excludeIds.length > 0) {
      candidates = await db
        .select()
        .from(passages)
        .where(sql`${passages.verification_status} = ${APPROVED_STATUS} AND ${passages.id} NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(sql`RANDOM()`)
        .limit(1);
    } else {
      candidates = await db
        .select()
        .from(passages)
        .where(eq(passages.verification_status, APPROVED_STATUS))
        .orderBy(sql`RANDOM()`)
        .limit(1);
    }
  }

  if (candidates.length > 0) {
    return await getPassageById(candidates[0].id);
  }

  if (apiKey && template) {
    console.log("[Pool] No unread passages in DB, generating one synchronously...");
    const promptHash = hashPrompt(template, tier);
    for (let retry = 0; retry < 2; retry++) {
      try {
        const genOpts: GenerationOptions = { tier, retryNote: retry > 0 ? "Previous output was a duplicate. Please create a materially different passage." : undefined };
        const passage = await generatePassage(template, apiKey, genOpts);
        if (passage.content_hash && await isDuplicatePassage(passage.content_hash)) {
          console.warn("[Pool] Generated passage was duplicate, retrying...");
          continue;
        }
        const approvedPassage: Passage = {
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
        await storePassage(approvedPassage, { tier, promptHash, tokenBudget: 0 });
        console.log("[Pool] Generation complete, serving passage.");
        return approvedPassage;
      } catch (err) {
        console.error("[Pool] Synchronous generation failed:", err);
        return null;
      }
    }
    return null;
  }

  return null;
}

const POOL_MIN_SIZE = 3;
const TIER_MIN_SIZES: Record<GenerationTier, number> = { short: 3, normal: 3, long: 2 };
const warmingLocks = new Map<string, boolean>();

function warmingKey(templateId: string, tier: GenerationTier): string {
  return `${templateId}:${tier}`;
}

export async function warmPool(templateId: string, apiKey: string, tier: GenerationTier = "normal"): Promise<void> {
  const key = warmingKey(templateId, tier);
  if (warmingLocks.get(key)) return;
  warmingLocks.set(key, true);

  try {
    const db = await getDb();
    const minSize = TIER_MIN_SIZES[tier] ?? POOL_MIN_SIZE;

    const templateRows = await db
      .select()
      .from(styleTemplates)
      .where(eq(styleTemplates.id, templateId))
      .limit(1);

    if (templateRows.length === 0) return;

    const template = templateRows[0] as StyleTemplate;
    const promptHash = hashPrompt(template, tier);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(passageCacheEntries)
      .where(and(
        eq(passageCacheEntries.generation_tier, tier),
        eq(passageCacheEntries.prompt_hash, promptHash)
      ));
    const count = countResult[0]?.count ?? 0;

    if (count < minSize) {
      const needed = minSize - count;
      for (let i = 0; i < needed; i++) {
        try {
          const genOpts: GenerationOptions = { tier };
          const passage = await generatePassage(template, apiKey, genOpts);
          await storePassage({
            ...passage,
            source_title: null,
            source_author: null,
            source_identifier: null,
            source_license: null,
            source_locator: null,
            verification_status: "approved",
            review_notes: null,
            reviewed_at: null,
          }, { tier, promptHash, tokenBudget: 0 });
          console.log(`[Warmer] Background generation ${i + 1}/${needed} complete (tier=${tier})`);
        } catch (err) {
          console.warn("[Warmer] Background generation failed:", err);
        }
      }
    }
  } finally {
    warmingLocks.set(key, false);
  }
}

export async function getPassageHistory(page: number = 1, limit: number = 20) {
  const db = await getDb();
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(passages)
    .where(eq(passages.verification_status, APPROVED_STATUS))
    .orderBy(desc(passages.created_at))
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(passages)
    .where(eq(passages.verification_status, APPROVED_STATUS));
  const total = totalRows[0]?.count ?? 0;

  const passageList: Passage[] = rows.map((row) => ({
    id: row.id,
    title_ja: row.title_ja,
    title_en: row.title_en,
    paragraphs: JSON.parse(row.paragraphs_json),
    grammar_points: JSON.parse(row.grammar_points_json),
    translation: row.translation,
    word_gloss: JSON.parse(row.word_gloss_json),
    jic_sentences: row.jic_sentences_json ? (JSON.parse(row.jic_sentences_json) as JICSentenceCode[]) : undefined,
    jic_code: row.jic_code || null,
    style_template_id: row.style_template_id,
    created_at: row.created_at,
    llm_model: row.llm_model,
    content_hash: row.content_hash,
    source_title: row.source_title,
    source_author: row.source_author,
    source_identifier: row.source_identifier,
    source_license: row.source_license,
    source_locator: row.source_locator,
    verification_status: normalizeVerificationStatus(row.verification_status),
    review_notes: row.review_notes,
    reviewed_at: row.reviewed_at,
  }));

  return { passages: passageList, total };
}

export async function listPassagesByTemplate(styleTemplateId?: string | null): Promise<PassageSummary[]> {
  const db = await getDb();

  let rows;
  if (styleTemplateId) {
    rows = await db
      .select({
        id: passages.id,
        title_ja: passages.title_ja,
        style_template_id: passages.style_template_id,
        verification_status: passages.verification_status,
        source_title: passages.source_title,
        source_author: passages.source_author,
        created_at: passages.created_at,
      })
      .from(passages)
      .where(and(eq(passages.style_template_id, styleTemplateId), eq(passages.verification_status, APPROVED_STATUS)))
      .orderBy(desc(passages.created_at));
  } else {
    rows = await db
      .select({
        id: passages.id,
        title_ja: passages.title_ja,
        style_template_id: passages.style_template_id,
        verification_status: passages.verification_status,
        source_title: passages.source_title,
        source_author: passages.source_author,
        created_at: passages.created_at,
      })
      .from(passages)
      .where(eq(passages.verification_status, APPROVED_STATUS))
      .orderBy(desc(passages.created_at));
  }

  return rows.map((row) => ({
    id: row.id,
    title_ja: row.title_ja,
    style_template_id: row.style_template_id,
    verification_status: normalizeVerificationStatus(row.verification_status),
    source_title: row.source_title,
    source_author: row.source_author,
    created_at: row.created_at,
  }));
}
