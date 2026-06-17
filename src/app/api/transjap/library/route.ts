import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { dictionaryEntries, passages } from "@/lib/db/schema";

const TEMPLATE_ID = "transjap-corpus";
const DICTIONARY_SOURCE = "TransJap vocabulary.csv";
const APPROVED_STATUS = "approved";
const MAX_PASSAGE_LIMIT = 80;
const MAX_DICTIONARY_LIMIT = 80;
const MAX_QUERY_LENGTH = 200;

interface TransJapMetadata {
  integration?: string;
  corpusId?: number;
  pack?: number;
  sourceFile?: string;
  theme?: string;
  level?: string;
  targetWords?: string[];
  learnerTrap?: string;
  practice?: {
    prompt?: string;
    model?: string;
  } | null;
}

interface PassageRow {
  id: string;
  title_ja: string;
  title_en: string;
  translation: string;
  paragraphs_json: string;
  grammar_points_json: string;
  word_gloss_json: string;
  source_title: string | null;
  source_locator: string | null;
  review_notes: string | null;
  created_at: string;
}

function clampLimit(value: string | null, fallback: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parsePack(value: string | null): number | null {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMetadata(reviewNotes: string | null): TransJapMetadata | null {
  if (!reviewNotes) return null;
  try {
    const parsed = JSON.parse(reviewNotes) as TransJapMetadata;
    return parsed?.integration === "transjap" ? parsed : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function targetWords(metadata: TransJapMetadata | null): string[] {
  return Array.isArray(metadata?.targetWords)
    ? metadata.targetWords.filter((word): word is string => typeof word === "string")
    : [];
}

function practicePrompt(metadata: TransJapMetadata | null): string {
  return metadata?.practice && typeof metadata.practice === "object"
    ? stringValue(metadata.practice.prompt)
    : "";
}

function practiceModel(metadata: TransJapMetadata | null): string {
  return metadata?.practice && typeof metadata.practice === "object"
    ? stringValue(metadata.practice.model)
    : "";
}

function safeJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function textFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => textFromUnknown(item));
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  return [
    textFromUnknown(record.text),
    textFromUnknown(record.surface),
    textFromUnknown(record.reading),
    textFromUnknown(record.pattern),
    textFromUnknown(record.explanation_en),
    textFromUnknown(record.word),
    textFromUnknown(record.gloss_en),
    textFromUnknown(record.pos),
  ].flat();
}

function readableJsonText(value: string): string {
  return textFromUnknown(safeJsonArray(value)).join(" ");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function textMatches(value: string, query: string): boolean {
  if (!query) return true;
  return normalize(value).includes(normalize(query));
}

function passageHaystack(row: PassageRow, metadata: TransJapMetadata | null): string {
  return [
    row.id,
    row.title_ja,
    row.title_en,
    row.translation,
    readableJsonText(row.paragraphs_json),
    readableJsonText(row.grammar_points_json),
    readableJsonText(row.word_gloss_json),
    row.source_title ?? "",
    row.source_locator ?? "",
    stringValue(metadata?.theme),
    stringValue(metadata?.level),
    stringValue(metadata?.learnerTrap),
    stringValue(metadata?.sourceFile),
    practicePrompt(metadata),
    practiceModel(metadata),
    ...targetWords(metadata),
  ].join(" ");
}

function passageScore(row: PassageRow, metadata: TransJapMetadata | null, query: string): number {
  if (!query) return numberValue(metadata?.corpusId) ?? 0;
  const normalizedQuery = normalize(query);
  let score = 0;
  if (row.id.toLowerCase() === normalizedQuery) score += 160;
  if (String(numberValue(metadata?.corpusId) ?? "") === normalizedQuery) score += 140;
  if (normalize(row.title_ja).includes(normalizedQuery)) score += 90;
  if (normalize(row.title_en).includes(normalizedQuery)) score += 80;
  if (targetWords(metadata).some((word) => normalize(word).includes(normalizedQuery))) score += 70;
  if (normalize(stringValue(metadata?.theme)).includes(normalizedQuery)) score += 55;
  if (readableJsonText(row.paragraphs_json).includes(query)) score += 45;
  if (normalize(row.translation).includes(normalizedQuery)) score += 30;
  if (normalize(passageHaystack(row, metadata)).includes(normalizedQuery)) score += 10;
  return score;
}

function passagePreview(row: PassageRow): string {
  const paragraphs = safeJsonArray(row.paragraphs_json);
  const text = paragraphs
    .map((item) => typeof item === "object" && item && "text" in item ? String((item as { text?: unknown }).text ?? "") : "")
    .join(" ")
    .trim();
  return text.length > 130 ? `${text.slice(0, 130)}...` : text;
}

function metadataSummary(rows: { metadata: TransJapMetadata | null }[]) {
  const packs = new Set<number>();
  const levels = new Set<string>();

  for (const row of rows) {
    const pack = numberValue(row.metadata?.pack);
    const level = stringValue(row.metadata?.level);
    if (pack !== null) packs.add(pack);
    if (level) levels.add(level);
  }

  return {
    packs: [...packs].sort((a, b) => a - b),
    levels: [...levels].sort(),
  };
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q")?.trim() ?? "").slice(0, MAX_QUERY_LENGTH);
    const pack = parsePack(searchParams.get("pack"));
    const level = searchParams.get("level")?.trim() ?? "";
    const passageLimit = clampLimit(searchParams.get("passage_limit"), 24, MAX_PASSAGE_LIMIT);
    const dictionaryLimit = clampLimit(searchParams.get("dictionary_limit"), 24, MAX_DICTIONARY_LIMIT);

    const db = await getDb();

    const passageRows = await db
      .select({
        id: passages.id,
        title_ja: passages.title_ja,
        title_en: passages.title_en,
        translation: passages.translation,
        paragraphs_json: passages.paragraphs_json,
        grammar_points_json: passages.grammar_points_json,
        word_gloss_json: passages.word_gloss_json,
        source_title: passages.source_title,
        source_locator: passages.source_locator,
        review_notes: passages.review_notes,
        created_at: passages.created_at,
      })
      .from(passages)
      .where(and(eq(passages.style_template_id, TEMPLATE_ID), eq(passages.verification_status, APPROVED_STATUS)))
      .orderBy(desc(passages.created_at));

    const hydratedPassages = passageRows.map((row) => ({
      row,
      metadata: parseMetadata(row.review_notes),
    }));

    const filteredPassages = hydratedPassages
      .filter(({ row, metadata }) => {
        if (pack !== null && numberValue(metadata?.pack) !== pack) return false;
        if (level && stringValue(metadata?.level) !== level) return false;
        return textMatches(passageHaystack(row, metadata), query);
      })
      .map((item) => ({
        ...item,
        score: passageScore(item.row, item.metadata, query),
      }))
      .sort((a, b) => b.score - a.score || (numberValue(a.metadata?.corpusId) ?? 0) - (numberValue(b.metadata?.corpusId) ?? 0));

    const like = likePattern(query);
    const dictionaryWhere = query
      ? sql`${dictionaryEntries.source} = ${DICTIONARY_SOURCE} AND (${dictionaryEntries.expression} LIKE ${like} ESCAPE ${"\\"} OR ${dictionaryEntries.reading} LIKE ${like} ESCAPE ${"\\"} OR ${dictionaryEntries.meaning} LIKE ${like} ESCAPE ${"\\"})`
      : eq(dictionaryEntries.source, DICTIONARY_SOURCE);

    const dictionary = await db
      .select({
        id: dictionaryEntries.id,
        expression: dictionaryEntries.expression,
        reading: dictionaryEntries.reading,
        meaning: dictionaryEntries.meaning,
        source: dictionaryEntries.source,
      })
      .from(dictionaryEntries)
      .where(dictionaryWhere)
      .limit(dictionaryLimit);

    const totalDictionaryRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.source, DICTIONARY_SOURCE));

    return NextResponse.json({
      summary: {
        passages_total: hydratedPassages.length,
        passages_filtered: filteredPassages.length,
        dictionary_total: totalDictionaryRows[0]?.count ?? 0,
        ...metadataSummary(hydratedPassages),
      },
      passages: filteredPassages.slice(0, passageLimit).map(({ row, metadata }) => ({
        id: row.id,
        title_ja: row.title_ja,
        title_en: row.title_en,
        source_title: row.source_title,
        source_locator: row.source_locator,
        created_at: row.created_at,
        preview: passagePreview(row),
        metadata: {
          corpusId: numberValue(metadata?.corpusId),
          pack: numberValue(metadata?.pack),
          theme: stringValue(metadata?.theme),
          level: stringValue(metadata?.level),
          targetWords: targetWords(metadata),
          learnerTrap: stringValue(metadata?.learnerTrap),
          practicePrompt: practicePrompt(metadata),
        },
      })),
      dictionary,
    });
  } catch (error) {
    console.error("[API /transjap/library] Error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
