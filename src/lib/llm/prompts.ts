import type { GenerationTier, StyleTemplate } from "../types";
import crypto from "crypto";

interface JICPromptSentence {
  original: string;
  jic_code: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const TIER_RULES: Record<GenerationTier, string> = {
  short: "LENGTH TIER: short. Write 1 short paragraph. Keep it concise and focused with minimal filler.",
  normal: "LENGTH TIER: normal. Write 1-3 paragraphs with balanced length and natural literary pacing.",
  long: "LENGTH TIER: long. Write 2-4 paragraphs. Allow a longer, immersive passage with richer description.",
};

/**
 * Static system prompt for passage generation.
 *
 * This string is byte-identical for every passage call (draft, repair, warm-pool),
 * so DeepSeek's automatic prefix cache serves it as a cache hit. All variable
 * content (style brief, tier, repair errors) is pushed to the user turns that
 * follow, so the cacheable prefix is never invalidated. Do NOT interpolate
 * anything into this constant.
 */
export const PASSAGE_SYSTEM = `You are a Japanese language content generator for an intensive reading tool.
Always respond with a single valid JSON object only. No markdown, no code fences, no commentary.

WORKFLOW — plan first, then write, in one response:
1. Fill the "plan" field first: silently design one coherent scene (theme, mood, setting), a small reusable grammar cluster, and 1-3 paragraph beats.
2. Write natural, literary Japanese that executes that plan — NOT textbook sentences.
3. Obey the JSON schema exactly. Self-check before responding; do not rely on post-processing.

RULES:
- Use varied sentence structures and vivid imagery; keep the passage tightly focused on one scene and tonal arc.
- Keep the paragraph count within the requested length tier.
- Split each paragraph into segments: kanji-containing words (is_kanji:true) and kana/punctuation runs (is_kanji:false).
- Provide hiragana furigana readings for ALL kanji segments.
- Include 1-5 grammar points that are concrete and actually used in the passage.
- translation: natural, idiomatic English of the whole passage.
- word_gloss: list the major content words with reading, POS, and English gloss.
- Be creative — avoid repeating overused beginner themes or vocabulary.
- Keep every JSON field present, even when an array is short, and keep all strings valid JSON.

SELF-CHECK BEFORE YOU REPLY:
- Does the title match the planned scene and mood?
- Is the paragraph count within the tier limit?
- Does every annotated segment include surface, reading, and is_kanji?
- Are grammar_points concrete and actually used?
- Does word_gloss cover the major content words?
- Is the output a single JSON object with no trailing commentary?

OUTPUT — a single JSON object with exactly these fields:
{
  "plan": {
    "theme": "string",
    "mood": "string",
    "setting": "string",
    "grammar_targets": ["string"],
    "beats": ["string"]
  },
  "title_ja": "string",
  "title_en": "string",
  "paragraphs": [{ "annotated": [{ "surface": "str", "reading": "str", "is_kanji": bool }] }],
  "grammar_points": [{ "pattern": "str", "explanation_en": "str" }],
  "translation": "str",
  "word_gloss": [{ "word": "str", "reading": "str", "pos": "noun|verb|adjective|adverb|particle|conjunction|interjection|pronoun|auxiliary|other", "gloss_en": "str" }]
}`;

/** Variable user turn for passage generation. Only this part changes per request. */
function buildPassageBrief(template: StyleTemplate, tier: GenerationTier, retryNote?: string): string {
  const note = retryNote?.trim() ? `\n\nADDITIONAL CONSTRAINT:\n${retryNote.trim()}` : "";
  return `STYLE: ${template.prompt}

${TIER_RULES[tier]}${note}`;
}

export interface PassageMessageOptions {
  retryNote?: string;
  repairErrors?: string[];
  previousOutput?: string;
}

/**
 * Build the message array for a passage generation call.
 *
 * Layout is cache-optimized: [static system] + [variable brief] (+ [repair turns]).
 * Repairs append the previous (invalid) output and the error list as trailing
 * turns so the static system + brief prefix stays a cache hit across attempts.
 */
export function buildPassageMessages(
  template: StyleTemplate,
  tier: GenerationTier,
  options?: PassageMessageOptions,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: PASSAGE_SYSTEM },
    { role: "user", content: buildPassageBrief(template, tier, options?.retryNote) },
  ];

  const errors = options?.repairErrors ?? [];
  if (errors.length > 0) {
    if (options?.previousOutput?.trim()) {
      messages.push({ role: "assistant", content: options.previousOutput });
    }
    messages.push({
      role: "user",
      content: `That output failed validation. Fix these errors and return ONLY one corrected JSON object:\n${errors
        .map((error, index) => `${index + 1}. ${error}`)
        .join("\n")}`,
    });
  }

  return messages;
}

/**
 * Cache/dedup key for a (template, tier) pair. Hashes only the variable brief —
 * the static system prompt is identical across templates, so it carries no
 * distinguishing information.
 */
export function hashPrompt(template: StyleTemplate, tier: GenerationTier): string {
  return crypto
    .createHash("sha256")
    .update(buildPassageBrief(template, tier))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Static system prompt for JIC-Han enrichment. Byte-identical per call so it
 * caches as a prefix; the sentence list goes in the trailing user turn.
 */
export const JIC_SYSTEM = `You are the JIC-Han enrichment stage of a Japanese intensive-reading workflow.
Always respond with a single valid JSON object only. No markdown, no code fences.

The local JIC compiler has ALREADY produced authoritative JIC-Lite code.
Do NOT rewrite that code. Your job is only to add the no-particle Kanbun / 文言骨架 layer and the learner reconstruction hints.

The teaching idea:
- JIC-Lite makes Japanese particles visible.
- Kanbun Core removes Japanese particles while preserving Japanese word order.
- JIC English labels are not shown; their function is rendered as punctuation and sparse Kanbun markers.
- The learner then reconstructs which particles the Japanese sentence needs.

Examples:
- 私は友達に手紙を書きました
  given_jic_code: 私 [TOPIC] 友達 [GIVE_TO] 手紙 [TARGET] 書く.polite().past()
  kanbun_core: 我，友与，手紙，書。
- 昨日、学校で勉強しました
  given_jic_code: 昨日 学校 [AT] 勉強する.polite().past()
  kanbun_core: 昨日，学校於勉強。
- 彼は月を見て、故郷を思った
  given_jic_code: 彼 [TOPIC] 月 [TARGET] 見る.then() 故郷 [TARGET] 思う.past()
  kanbun_core: 彼，月，見。而故郷，思。
- 雨が降ったので、道が暗くなった
  given_jic_code: 雨 [SUBJ] 降る.past() [CAUSE] 道 [SUBJ] 暗い.become().past()
  kanbun_core: 雨降。故道暗。

Rules for kanbun_core:
- Use a compact Kanbun-style skeleton in JAPANESE ORDER, not modern Chinese translation and not Chinese SVO reordering.
- Keep Japanese kanji vocabulary when it is natural and useful for recognition.
- Remove Japanese particles such as は, が, を, に, で, へ, と, の.
- Use punctuation sparingly. TOPIC and TARGET usually need a comma boundary; SUBJ can often attach directly to the predicate.
- Prefer compact postfix Kanbun markers over extra commas when a JIC label is case-like: 学校於, 友与, 日本語以, 東京自, 大阪至, 魚比.
- Omit 於 after self-locating compounds such as 机之上, 部屋之中, 橋之下.
- Use minimal classical function words only when needed: 而 for sequence, 而後 for after, 故 for cause, 以 for means, 与 for recipient, 為 for purpose/viewpoint, 自/至 for from/until/toward, 比 for より, 不/未 for negation, 欲 for desire, 亦 for も, 唯 for だけ, 被 for passive, 使 for causative, 居/有 for continuing state.
- Do NOT turn 月，見 into 見月 or 手紙，書 into 書手紙. Keep the Japanese order from given_jic_code.
- Do not add explanatory prose inside kanbun_core.
- Prefer a readable particle-erased Japanese-order skeleton over elegant literary translation.
- If the sentence is kana-heavy, produce the closest compact semantic skeleton using available kanji or short classical phrasing.

Rules for particle_reconstruction:
- List the important omitted particles or particle-like links the learner should reconstruct from the Kanbun Core.
- surface: the Japanese word or predicate connected by the particle.
- particle: the original Japanese particle/link, such as は, が, を, に, で, て, ので, から.
- role: a short English role label such as topic, subject, target, location, sequence, cause, recipient.
- reason: one concise English explanation of why that particle/link is needed.

OUTPUT — a single JSON object:
{
  "jic_sentences": [
    {
      "original": "exact Japanese sentence",
      "kanbun_core": "zero-particle Kanbun Core skeleton",
      "particle_reconstruction": [
        { "surface": "Japanese word or predicate", "particle": "Japanese particle/link", "role": "short role", "reason": "concise explanation" }
      ],
      "insight": "one concise English sentence about what survives when the particles disappear"
    }
  ]
}`;

/** Build the JIC enrichment message array: static system + sentence list in the tail. */
export function buildJICMessages(sentences: JICPromptSentence[], repairErrors: string[] = []): ChatMessage[] {
  const list = sentences
    .map((sentence, index) => `${index + 1}. original: ${sentence.original}\n   given_jic_code: ${sentence.jic_code}`)
    .join("\n");

  const repair = repairErrors.length > 0
    ? `\n\nFix these validation errors and return ONLY the corrected JSON object:\n${repairErrors
        .map((error, index) => `${index + 1}. ${error}`)
        .join("\n")}`
    : "";

  return [
    { role: "system", content: JIC_SYSTEM },
    { role: "user", content: `Sentence list:\n${list}${repair}` },
  ];
}
