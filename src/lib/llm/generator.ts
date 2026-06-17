import type {
  StyleTemplate,
  GenerationTier,
  LLMPassageOutput,
  LLMParagraph,
  Paragraph,
  Passage,
  JICParticleReconstruction,
  JICSentenceCode,
} from "../types";
import { passageJsonSchema } from "./schema";
import { buildPassageMessages, buildJICMessages } from "./prompts";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { makeTransformerClient } from "../transformer/client";
import { compilePassage } from "../jic";
import { assessKanbunCore, buildLocalKanbunSentences } from "../jic/kanbun";

const DEEPSEEK_API_ROOT = "https://api.deepseek.com";
const DEEPSEEK_API_URL = `${DEEPSEEK_API_ROOT}/chat/completions`;
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const MAX_RETRIES = 2;
const TEMPERATURE = 0.7;
const JIC_MAX_TOKENS = 4096;
const JIC_RETRY_MAX_TOKENS = 8192;
const API_KEY_TEST_MAX_TOKENS = 80;

export function hashContent(paragraphs: Paragraph[]): string {
  const text = paragraphs.map((p) => p.annotated.map(s => s.surface).join("")).join("|");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function validateAgainstSchema(data: unknown, schema: typeof passageJsonSchema): { critical: string[]; soft: string[] } {
  const critical: string[] = [];
  const soft: string[] = [];

  if (typeof data !== "object" || data === null) {
    return { critical: ["Root must be an object"], soft: [] };
  }

  const obj = data as Record<string, unknown>;

  for (const field of schema.required) {
    if (!(field in obj)) {
      critical.push(`Missing required field: ${field}`);
    }
  }

  const allowedKeys = Object.keys(schema.properties);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      soft.push(`Additional property not allowed: ${key}`);
      delete obj[key];
    }
  }

  if (typeof obj.title_ja !== "string" || (obj.title_ja as string).length < 1) {
    critical.push("title_ja must be a non-empty string");
  }

  if (typeof obj.title_en !== "string" || (obj.title_en as string).length < 1) {
    critical.push("title_en must be a non-empty string");
  }

  if (!Array.isArray(obj.paragraphs) || obj.paragraphs.length === 0) {
    critical.push("paragraphs must be a non-empty array");
  } else if (obj.paragraphs.length > 3) {
    soft.push(`paragraphs has ${obj.paragraphs.length} items, truncating to 3`);
    obj.paragraphs = obj.paragraphs.slice(0, 3);
  }

  if (Array.isArray(obj.paragraphs)) {
    const paragraphAllowedKeys = Object.keys(schema.properties.paragraphs.items.properties);
    for (let i = 0; i < obj.paragraphs.length; i++) {
      const p = obj.paragraphs[i] as Record<string, unknown>;
      for (const key of Object.keys(p)) {
        if (!paragraphAllowedKeys.includes(key)) {
          soft.push(`paragraphs[${i}] has additional property: ${key}`);
          delete p[key];
        }
      }
      if (!Array.isArray(p.annotated) || p.annotated.length === 0) {
        critical.push(`paragraphs[${i}].annotated must be a non-empty array`);
      }
      if (Array.isArray(p.annotated)) {
        const segmentAllowedKeys = Object.keys(schema.properties.paragraphs.items.properties.annotated.items.properties);
        for (let j = 0; j < p.annotated.length; j++) {
          const seg = p.annotated[j] as Record<string, unknown>;
      for (const key of Object.keys(seg)) {
        if (!segmentAllowedKeys.includes(key)) {
          soft.push(`paragraphs[${i}].annotated[${j}] has additional property: ${key}`);
          delete seg[key];
        }
      }
          if (typeof seg.is_kanji === "string") {
            if (seg.is_kanji === "true") {
              (p.annotated as Record<string, unknown>[])[j].is_kanji = true;
            } else if (seg.is_kanji === "false") {
              (p.annotated as Record<string, unknown>[])[j].is_kanji = false;
            }
          }
          if (typeof seg.is_kanji !== "boolean" && typeof seg.is_kanji !== "string") {
            critical.push(`paragraphs[${i}].annotated[${j}].is_kanji must be boolean`);
          }
          if (typeof seg.surface !== "string" || (seg.surface as string).length === 0) {
            soft.push(`paragraphs[${i}].annotated[${j}].surface must be a non-empty string`);
          }
          if (typeof seg.reading !== "string" || (seg.reading as string).length === 0) {
            soft.push(`paragraphs[${i}].annotated[${j}].reading must be a non-empty string`);
          }
        }
      }
    }
  }

  if (!Array.isArray(obj.grammar_points) || obj.grammar_points.length === 0) {
    soft.push("grammar_points is empty");
    obj.grammar_points = [];
  } else if (obj.grammar_points.length > 5) {
    soft.push("grammar_points should have at most 5 items");
  }

  if (Array.isArray(obj.grammar_points)) {
    const gpAllowedKeys = Object.keys(schema.properties.grammar_points.items.properties);
    for (let i = 0; i < obj.grammar_points.length; i++) {
      const gp = obj.grammar_points[i] as Record<string, unknown>;
      for (const key of Object.keys(gp)) {
        if (!gpAllowedKeys.includes(key)) {
          soft.push(`grammar_points[${i}] has additional property: ${key}`);
          delete gp[key];
        }
      }
      if (typeof gp.explanation_en === "string" && gp.explanation_en.length < 10) {
        soft.push(`grammar_points[${i}].explanation_en is shorter than 10 characters`);
      }
    }
  }

  if (typeof obj.translation === "string" && obj.translation.length < 20) {
    soft.push("translation should be at least 20 characters");
  }

  if (Array.isArray(obj.word_gloss)) {
    if (obj.word_gloss.length < 5) {
      soft.push("word_gloss should have at least 5 items");
    }
    const wgAllowedKeys = Object.keys(schema.properties.word_gloss.items.properties);
    const validPos = ["noun", "verb", "adjective", "adverb", "particle", "conjunction", "interjection", "pronoun", "auxiliary", "other"];
    for (let i = 0; i < obj.word_gloss.length; i++) {
      const wg = obj.word_gloss[i] as Record<string, unknown>;
      for (const key of Object.keys(wg)) {
        if (!wgAllowedKeys.includes(key)) {
          soft.push(`word_gloss[${i}] has additional property: ${key}`);
          delete wg[key];
        }
      }
      if (typeof wg.word !== "string" || (wg.word as string).length === 0) {
        soft.push(`word_gloss[${i}].word must be a non-empty string`);
      }
      if (typeof wg.reading !== "string" || (wg.reading as string).length === 0) {
        soft.push(`word_gloss[${i}].reading must be a non-empty string`);
      }
      if (typeof wg.gloss_en !== "string" || (wg.gloss_en as string).length === 0) {
        soft.push(`word_gloss[${i}].gloss_en must be a non-empty string`);
      }
      if (wg.pos && !validPos.includes(wg.pos as string)) {
        soft.push(`word_gloss[${i}].pos invalid: ${wg.pos}`);
      }
    }
  }

  return { critical, soft };
}

function normalizeSentenceKey(value: string): string {
  return value.replace(/[\s\n\r「」『』、，,.]/g, "");
}

function validateJICEnrichmentOutput(
  value: unknown,
  sourceSentences: Array<{ original: string; jic_code: string }>,
): { result: JICSentenceCode[] | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { result: null, errors: ["JIC output root must be an object"] };
  }

  const obj = value as Record<string, unknown>;
  const rawSentences = Array.isArray(obj.jic_sentences) ? obj.jic_sentences : null;
  if (!rawSentences || rawSentences.length === 0) {
    return { result: null, errors: ["jic_sentences must be a non-empty array"] };
  }

  const keyed = new Map<string, Record<string, unknown>>();
  rawSentences.forEach((item) => {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (typeof record.original === "string") {
        keyed.set(normalizeSentenceKey(record.original), record);
      }
    }
  });

  const result: JICSentenceCode[] = [];

  for (let index = 0; index < sourceSentences.length; index++) {
    const source = sourceSentences[index];
    const candidate = keyed.get(normalizeSentenceKey(source.original))
      ?? (rawSentences[index] && typeof rawSentences[index] === "object" ? rawSentences[index] as Record<string, unknown> : null);

    if (!candidate) {
      errors.push(`Missing JIC enrichment for sentence ${index + 1}`);
      continue;
    }

    const original = typeof candidate.original === "string" ? candidate.original.trim() : "";
    if (original && normalizeSentenceKey(original) !== normalizeSentenceKey(source.original)) {
      errors.push(`jic_sentences[${index}].original does not match source sentence ${index + 1}`);
    }

    const kanbunCore = typeof candidate.kanbun_core === "string" ? candidate.kanbun_core.trim() : "";
    if (!kanbunCore) {
      errors.push(`jic_sentences[${index}].kanbun_core must be a non-empty string`);
    } else {
      const qualityIssues = assessKanbunCore({
        original: source.original,
        jicCode: source.jic_code,
        kanbunCore,
      });
      for (const issue of qualityIssues) {
        errors.push(`jic_sentences[${index}].kanbun_core ${issue}`);
      }
    }

    if (!Array.isArray(candidate.particle_reconstruction)) {
      errors.push(`jic_sentences[${index}].particle_reconstruction must be an array`);
      continue;
    }

    const particleReconstruction: JICParticleReconstruction[] = [];
    candidate.particle_reconstruction.forEach((entry, entryIndex) => {
      if (!entry || typeof entry !== "object") {
        errors.push(`jic_sentences[${index}].particle_reconstruction[${entryIndex}] must be an object`);
        return;
      }

      const item = entry as Record<string, unknown>;
      const surface = typeof item.surface === "string" ? item.surface.trim() : "";
      const particle = typeof item.particle === "string" ? item.particle.trim() : "";
      const role = typeof item.role === "string" ? item.role.trim() : "";
      const reason = typeof item.reason === "string" ? item.reason.trim() : undefined;

      if (!surface) errors.push(`jic_sentences[${index}].particle_reconstruction[${entryIndex}].surface must be non-empty`);
      if (!particle) errors.push(`jic_sentences[${index}].particle_reconstruction[${entryIndex}].particle must be non-empty`);
      if (!role) errors.push(`jic_sentences[${index}].particle_reconstruction[${entryIndex}].role must be non-empty`);

      if (surface && particle && role) {
        particleReconstruction.push({ surface, particle, role, ...(reason ? { reason } : {}) });
      }
    });

    const insight = typeof candidate.insight === "string" ? candidate.insight.trim() : "";

    result.push({
      original: source.original,
      jic_code: source.jic_code,
      kanbun_core: kanbunCore,
      particle_reconstruction: particleReconstruction,
      ...(insight ? { insight } : {}),
      kanbun_source: "llm-validated",
      kanbun_confidence: "high",
    });
  }

  if (sourceSentences.length !== rawSentences.length) {
    errors.push(`Expected ${sourceSentences.length} JIC sentences, received ${rawSentences.length}`);
  }

  return errors.length > 0 ? { result: null, errors } : { result, errors: [] };
}

function mergeJICEnrichment(localResults: JICSentenceCode[], llmResults: JICSentenceCode[]): JICSentenceCode[] {
  return localResults.map((localSentence, index) => {
    const targetKey = normalizeSentenceKey(localSentence.original);
    const llmSentence = llmResults.find((item) => normalizeSentenceKey(item.original) === targetKey) ?? llmResults[index];
    if (!llmSentence) return localSentence;

    const llmCore = llmSentence.kanbun_core?.trim() ?? "";
    const llmQualityIssues = llmCore
      ? assessKanbunCore({
          original: localSentence.original,
          jicCode: localSentence.jic_code,
          kanbunCore: llmCore,
        })
      : ["kanbun_core is empty"];
    const canAdoptLLMCore = localSentence.kanbun_confidence !== "high" && llmQualityIssues.length === 0;

    return {
      ...localSentence,
      kanbun_core: canAdoptLLMCore ? llmCore : localSentence.kanbun_core,
      insight: llmSentence.insight || localSentence.insight,
      kanbun_source: canAdoptLLMCore ? "llm-validated" : "local-rule",
      kanbun_confidence: canAdoptLLMCore && localSentence.kanbun_confidence === "low" ? "medium" : localSentence.kanbun_confidence,
      kanbun_warnings: canAdoptLLMCore
        ? [...(localSentence.kanbun_warnings ?? []), "LLM Kanbun core adopted only after passing the local quality gate."]
        : localSentence.kanbun_warnings,
    };
  });
}

function parseJsonContent<T>(content: string, context: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]) as T;

    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as T;
    }

    throw new Error(`Failed to parse ${context} output as JSON: ${(error as Error).message}`);
  }
}

const TIER_TOKEN_BUDGETS: Record<GenerationTier, { base: number; retry: number; cap: number }> = {
  short: { base: 6144, retry: 8192, cap: 8192 },
  normal: { base: 8192, retry: 8192, cap: 8192 },
  long: { base: 8192, retry: 8192, cap: 8192 },
};

export function resolveTierTokenBudget(tier: GenerationTier, attempt: number): number {
  const b = TIER_TOKEN_BUDGETS[tier];
  return attempt <= 1 ? b.base : Math.min(b.retry, b.cap);
}

export function convertToPassage(parsed: LLMPassageOutput, templateId: string): Passage {
  const paragraphs: Paragraph[] = (parsed.paragraphs as LLMParagraph[]).map(p => ({
    text: p.annotated.map(s => s.surface).join(""),
    annotated: p.annotated,
  }));

  return {
    id: nanoid(),
    title_ja: parsed.title_ja,
    title_en: parsed.title_en,
    paragraphs,
    grammar_points: parsed.grammar_points,
    translation: parsed.translation,
    word_gloss: parsed.word_gloss,
    jic_sentences: undefined,
    jic_code: null,
    style_template_id: templateId,
    created_at: new Date().toISOString(),
    llm_model: DEEPSEEK_MODEL,
    content_hash: hashContent(paragraphs),
    source_title: null,
    source_author: null,
    source_identifier: null,
    source_license: null,
    source_locator: null,
    verification_status: "approved",
    review_notes: null,
    reviewed_at: null,
  };
}

export interface GenerationOptions {
  tier?: GenerationTier;
  retryNote?: string;
}

export async function generatePassage(
  template: StyleTemplate,
  apiKey: string,
  options?: GenerationOptions
): Promise<Passage> {
  const tier = options?.tier ?? "normal";
  const client = makeTransformerClient({
    apiKey,
    model: DEEPSEEK_MODEL,
    baseURL: DEEPSEEK_API_ROOT,
  });
  let lastErrors: string[] = [];
  let previousOutput = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const messages = buildPassageMessages(template, tier, {
        retryNote: options?.retryNote,
        repairErrors: attempt === 1 ? [] : lastErrors,
        previousOutput: attempt === 1 ? undefined : previousOutput,
      });
      const parsed = await client.json({
        messages,
        temperature: TEMPERATURE,
        maxTokens: resolveTierTokenBudget(tier, attempt),
      }) as LLMPassageOutput;
      previousOutput = JSON.stringify(parsed);

      const validation = validateAgainstSchema(parsed, passageJsonSchema);
      if (validation.critical.length === 0) {
        if (validation.soft.length > 0) {
          console.warn(`[LLM] Soft validation issues (tolerated):`, validation.soft);
        }
        return convertToPassage(parsed, template.id);
      }

      lastErrors = validation.critical;
      console.warn(`[LLM] Attempt ${attempt}/${MAX_RETRIES} failed validation:`, validation.critical);
    } catch (error) {
      console.error(`[LLM] Attempt ${attempt}/${MAX_RETRIES} error:`, error);
      lastErrors = [(error as Error).message];
    }
  }

  throw new Error(`LLM generation failed after ${MAX_RETRIES} retries. Last errors: ${lastErrors.join("; ")}`);
}

export interface StreamCallbacks {
  onStage: (stage: string, attempt?: number, errors?: string[]) => void;
  onToken: (text: string) => void;
  onResult: (passage: Passage) => Promise<boolean>;
  onError: (error: string) => void;
}

export async function generatePassageStream(
  template: StyleTemplate,
  apiKey: string,
  callbacks: StreamCallbacks,
  options?: GenerationOptions
): Promise<void> {
  const tier = options?.tier ?? "normal";
  let lastErrors: string[] = [];
  let previousOutput = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const messages = buildPassageMessages(template, tier, {
        retryNote: options?.retryNote,
        repairErrors: attempt === 1 ? [] : lastErrors,
        previousOutput: attempt === 1 ? undefined : previousOutput,
      });
      callbacks.onStage(attempt === 1 ? "drafting" : "repairing", attempt, attempt === 1 ? undefined : lastErrors);

      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          temperature: TEMPERATURE,
          max_tokens: resolveTierTokenBudget(tier, attempt),
          response_format: { type: "json_object" },
          stream: true,
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
      }

      let fullContent = "";
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const chunk = JSON.parse(dataStr);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                callbacks.onToken(delta);
              }
            } catch {
            }
          }
        }
      }

      callbacks.onStage("validating", attempt);
      previousOutput = fullContent;

      const parsed = parseJsonContent<LLMPassageOutput>(fullContent, "passage generation");

      const validation = validateAgainstSchema(parsed, passageJsonSchema);
      if (validation.critical.length === 0) {
        const passage = convertToPassage(parsed, template.id);
        callbacks.onStage("saving");
        const accepted = await callbacks.onResult(passage);
        if (accepted) return;
        lastErrors = ["Previous output was a duplicate of cached content. Create a materially different passage with a different title, scene, and vocabulary mix."];
        callbacks.onStage("repairing", attempt + 1, lastErrors);
      } else {
        lastErrors = validation.critical;
        callbacks.onStage("repairing", attempt + 1, validation.critical);
      }
    } catch (error) {
      lastErrors = [(error as Error).message];
      callbacks.onStage("repairing", attempt + 1, lastErrors);
    }
  }

  callbacks.onError(`Generation failed after ${MAX_RETRIES} retries`);
}

export async function generateJIC(
  passageText: string,
  apiKey?: string
): Promise<JICSentenceCode[]> {
  const compilation = compilePassage(passageText);
  const localResults = buildLocalKanbunSentences(compilation.sentences);
  const sourceSentences = compilation.sentences.map((sentence) => ({
    original: sentence.original,
    jic_code: sentence.compiled,
  }));

  if (sourceSentences.length === 0) {
    throw new Error("No sentences available for JIC enrichment");
  }

  if (!apiKey?.trim()) {
    return localResults;
  }

  const client = makeTransformerClient({
    apiKey,
    model: DEEPSEEK_MODEL,
    baseURL: DEEPSEEK_API_ROOT,
  });
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const parsed = await client.json({
        messages: buildJICMessages(sourceSentences, attempt === 1 ? [] : lastErrors),
        temperature: 0.25,
        maxTokens: attempt === 1 ? JIC_MAX_TOKENS : JIC_RETRY_MAX_TOKENS,
      });

      const validation = validateJICEnrichmentOutput(parsed, sourceSentences);
      if (validation.result) {
        return mergeJICEnrichment(localResults, validation.result);
      }

      lastErrors = validation.errors;
      throw new Error(validation.errors.join("; "));
    } catch (error) {
      console.error(`[JIC] Attempt ${attempt}/${MAX_RETRIES} error:`, error);
      lastErrors = [(error as Error).message];
      if (attempt === MAX_RETRIES) {
        console.warn(`[JIC] Falling back to local Kanbun adapter after ${MAX_RETRIES} failed LLM attempts: ${lastErrors.join("; ")}`);
        return localResults;
      }
    }
  }

  return localResults;
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: API_KEY_TEST_MAX_TOKENS,
      }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
