/**
 * JIC-Lite Phase 1: Lexer (词法分析器)
 *
 * Input:  Japanese text string (kanji + kana mixed)
 * Output: Token list, each carrying (surface, category, subtype, value)
 *
 * Key rules:
 * - Kanji+kana mixed nouns → single token, value = kanji form
 * - Pure kana particles → operator tokens
 * - Verb/adj conjugation → split into stem (variable) + ending (method)
 * - Katakana loanwords → single variable token
 */

import type { JICToken, VariableSubtype, OperatorSubtype, MethodSubtype } from "./types";
import {
  CASE_PARTICLE_MAP,
  ADVERBIAL_PARTICLE_MAP,
  SENTENCE_FINAL_MAP,
  COMPOUND_PARTICLE_MAP,
  VERB_METHOD_MAP,
  lookupParticle,
} from "./dictionary";

// ─── Character Classification ────────────────────────────────

const KANJI_RE = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const HIRAGANA_RE = /[\u3040-\u309F]/;
const KATAKANA_RE = /[\u30A0-\u30FF]/;
const FULLWIDTH_NUM_RE = /[０-９]/;
const HALFWIDTH_NUM_RE = /[0-9]/;
const PUNCTUATION = new Set(["。", "、", "！", "？", "…", "・", "「", "」", "『", "』", "（", "）", "(", ")", ".", ",", "!", "?"]);

function isKanji(ch: string): boolean { return KANJI_RE.test(ch); }
function isHiragana(ch: string): boolean { return HIRAGANA_RE.test(ch); }
function isKatakana(ch: string): boolean { return KATAKANA_RE.test(ch); }
function isNumeric(ch: string): boolean { return FULLWIDTH_NUM_RE.test(ch) || HALFWIDTH_NUM_RE.test(ch); }

// ─── Known Particle Lookup ───────────────────────────────────

const ALL_PARTICLES = new Set<string>();
for (const k of Object.keys(CASE_PARTICLE_MAP)) ALL_PARTICLES.add(k);
for (const k of Object.keys(ADVERBIAL_PARTICLE_MAP)) ALL_PARTICLES.add(k);
for (const k of Object.keys(SENTENCE_FINAL_MAP)) ALL_PARTICLES.add(k);
for (const k of Object.keys(COMPOUND_PARTICLE_MAP)) ALL_PARTICLES.add(k);

// ─── Verb/Adjective Ending Patterns ─────────────────────────

/** Common verb endings to split from stems, ordered longest-first for greedy matching */
const VERB_ENDINGS: Array<{ ending: string; method: string; subtype: MethodSubtype }> = [
  // Compound endings first (longest match)
  { ending: "させられたくない", method: "causative().passive().want().not()", subtype: "voice" },
  { ending: "させられたくなかった", method: "causative().passive().want().not().past()", subtype: "voice" },
  { ending: "させられる", method: "causative().passive()", subtype: "voice" },
  { ending: "てしまう", method: "complete()", subtype: "aspect" },
  { ending: "ていた", method: "exist().past()", subtype: "aspect" },
  { ending: "ている", method: "exist()", subtype: "aspect" },
  { ending: "てある", method: "exist_intent()", subtype: "aspect" },
  { ending: "ていく", method: "go()", subtype: "aspect" },
  { ending: "てくる", method: "come()", subtype: "aspect" },
  { ending: "になると", method: "if()", subtype: "connective" },
  { ending: "んでから", method: "after()", subtype: "connective" },
  { ending: "んで", method: "then()", subtype: "connective" },
  { ending: "なくなった", method: "not().past()", subtype: "polarity" },
  { ending: "なかった", method: "not().past()", subtype: "polarity" },
  { ending: "くなった", method: "become().past()", subtype: "aspect" },
  { ending: "くなる", method: "become()", subtype: "aspect" },
  { ending: "なった", method: "become().past()", subtype: "aspect" },
  { ending: "なる", method: "become()", subtype: "aspect" },
  { ending: "んだ", method: "past()", subtype: "tense" },
  { ending: "ました", method: "polite().past()", subtype: "politeness" },
  { ending: "ません", method: "polite().not()", subtype: "politeness" },
  { ending: "させた", method: "causative().past()", subtype: "voice" },
  { ending: "せた", method: "causative().past()", subtype: "voice" },
  { ending: "られた", method: "passive().past()", subtype: "voice" },
  { ending: "れた", method: "passive().past()", subtype: "voice" },
  { ending: "させる", method: "causative()", subtype: "voice" },
  { ending: "られる", method: "passive()", subtype: "voice" },
  { ending: "かった", method: "past()", subtype: "tense" },
  { ending: "くない", method: "not()", subtype: "polarity" },
  { ending: "たい", method: "want()", subtype: "mood" },
  { ending: "た", method: "past()", subtype: "tense" },
  { ending: "て", method: "then()", subtype: "connective" },
  { ending: "ながら", method: "while()", subtype: "connective" },
  { ending: "ない", method: "not()", subtype: "polarity" },
  { ending: "れる", method: "can()", subtype: "voice" },
  { ending: "せる", method: "causative()", subtype: "voice" },
  { ending: "よう", method: "vol()", subtype: "mood" },
  { ending: "う", method: "vol()", subtype: "mood" },
  { ending: "ば", method: "if()", subtype: "connective" },
  { ending: "ます", method: "polite()", subtype: "politeness" },
  { ending: "ず", method: "not_formal()", subtype: "formal_neg" },
  { ending: "得る", method: "possible()", subtype: "possible" },
  // な-adjective endings
  { ending: "ではない", method: "not()", subtype: "polarity" },
  { ending: "だった", method: "past()", subtype: "tense" },
  { ending: "なら", method: "if()", subtype: "connective" },
  { ending: "だ", method: "is()", subtype: "tense" },
  { ending: "で", method: "then()", subtype: "connective" },
];

// ─── Lexer ───────────────────────────────────────────────────

export function lex(input: string): JICToken[] {
  const tokens: JICToken[] = [];
  let pos = 0;
  const chars = [...input]; // Proper Unicode handling

  while (pos < chars.length) {
    const ch = chars[pos];

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\n") {
      pos++;
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(ch)) {
      pos++;
      continue;
    }

    // Try compound particle first (2+ characters)
    const compoundMatch = tryCompoundParticle(chars, pos);
    if (compoundMatch) {
      tokens.push({
        surface: compoundMatch.surface,
        category: "operator",
        subtype: "compound_particle",
        value: compoundMatch.keyword,
        position: pos,
      });
      pos += compoundMatch.surface.length;
      continue;
    }

    const demonstrativeMatch = tryDemonstrativeModifier(chars, pos);
    if (demonstrativeMatch) {
      tokens.push({
        surface: demonstrativeMatch.surface,
        category: "variable",
        subtype: "conjunctive",
        value: demonstrativeMatch.value,
        position: pos,
      });
      pos += demonstrativeMatch.surface.length;
      continue;
    }

    // Single-character particle
    if (ALL_PARTICLES.has(ch)) {
      const info = lookupParticle(ch);
      tokens.push({
        surface: ch,
        category: "operator",
        subtype: (info?.category || "case_particle") as OperatorSubtype,
        value: info?.keyword || ch,
        position: pos,
      });
      pos++;
      continue;
    }

    // Katakana run → foreign loanword variable
    if (isKatakana(ch)) {
      const start = pos;
      let reading = "";
      while (pos < chars.length && (isKatakana(chars[pos]) || chars[pos] === "ー" || chars[pos] === "・")) {
        reading += chars[pos];
        pos++;
      }
      tokens.push({
        surface: reading,
        category: "variable",
        subtype: "katakana_noun",
        value: reading,
        position: start,
        reading: katakanaToHiragana(reading),
      });
      continue;
    }

    // Number + counter
    if (isNumeric(ch)) {
      const start = pos;
      let surface = "";
      while (pos < chars.length && (isNumeric(chars[pos]) || isKanji(chars[pos]) || isHiragana(chars[pos]))) {
        surface += chars[pos];
        // Stop if we hit a particle
        if (pos > start && ALL_PARTICLES.has(chars[pos])) break;
        pos++;
      }
      tokens.push({
        surface,
        category: "variable",
        subtype: "numeral",
        value: surface,
        position: start,
      });
      continue;
    }

    // Kanji + okurigana run → potential variable or verb/adjective
    if (isKanji(ch)) {
      const start = pos;
      let surface = "";
      while (
        pos < chars.length
        && !(ALL_PARTICLES.has(chars[pos]) && !shouldKeepAdjectivalKanaInKanjiRun(surface, chars, pos))
        && !PUNCTUATION.has(chars[pos])
        && chars[pos] !== " "
      ) {
        if (pos > start && tryCompoundParticle(chars, pos)) break;
        // If we hit katakana after kanji, break (likely a new word boundary)
        if (pos > start && isKatakana(chars[pos]) && isKanji(chars[pos - 1])) break;
        surface += chars[pos];
        pos++;
      }

      while (
        pos < chars.length
        && ALL_PARTICLES.has(chars[pos])
      ) {
        const keptKana = takeParticleLikeKanaInKanjiRun(surface, chars, pos);
        if (!keptKana) break;
        surface += keptKana;
        pos += keptKana.length;
      }

      // Try to split verb/adjective endings
      const split = trySplitVerbEnding(surface, start);
      if (split) {
        tokens.push(...split);
      } else {
        // Determine variable subtype
        const subtype = classifyVariable(surface);
        tokens.push({
          surface,
          category: "variable",
          subtype,
          value: surface,
          position: start,
        });
      }
      continue;
    }

    // Pure hiragana run (could be particle, verb ending, or content word)
    if (isHiragana(ch)) {
      const start = pos;
      let surface = "";
      while (pos < chars.length && isHiragana(chars[pos]) && !ALL_PARTICLES.has(chars[pos])) {
        surface += chars[pos];
        pos++;
      }

      if (surface.length === 0) {
        // Single hiragana that IS a particle — already handled above
        pos++;
        continue;
      }

      // Check if it's a known verb/adj method
      const methodMatch = VERB_METHOD_MAP[surface];
      if (methodMatch) {
        tokens.push({
          surface,
          category: "method",
          subtype: "tense" as MethodSubtype,
          value: methodMatch.method,
          position: start,
        });
      } else {
        // Pure hiragana content word (代词, 副词, etc.)
        tokens.push({
          surface,
          category: "variable",
          subtype: "pronoun",
          value: surface,
          position: start,
        });
      }
      continue;
    }

    // Fallback: skip unknown character
    pos++;
  }

  return tokens;
}

// ─── Helpers ─────────────────────────────────────────────────

function tryCompoundParticle(chars: string[], pos: number): { surface: string; keyword: string } | null {
  // Try longest match first (up to 5 characters)
  for (let len = 5; len >= 2; len--) {
    if (pos + len > chars.length) continue;
    const candidate = chars.slice(pos, pos + len).join("");
    const info = lookupParticle(candidate);
    if (info) {
      return { surface: candidate, keyword: info.keyword };
    }
  }
  return null;
}

function tryDemonstrativeModifier(chars: string[], pos: number): { surface: string; value: string } | null {
  const surface = chars.slice(pos, pos + 2).join("");
  const valueMap: Record<string, string> = {
    "この": "此",
    "その": "其",
    "あの": "彼",
    "どの": "何",
  };
  const value = valueMap[surface];
  if (!value) return null;
  return isKanji(chars[pos + 2] ?? "") ? { surface, value } : null;
}

function shouldKeepAdjectivalKanaInKanjiRun(surface: string, chars: string[], pos: number): boolean {
  if (!surface || !isHiragana(chars[pos])) return false;
  let kanaTail = "";
  let cursor = pos;
  while (cursor < chars.length && isHiragana(chars[cursor]) && !PUNCTUATION.has(chars[cursor]) && chars[cursor] !== " ") {
    kanaTail += chars[cursor];
    cursor++;
  }
  const next = chars[cursor];
  if (!next || !isKanji(next)) return false;
  return kanaTail === "な" || kanaTail === "かな";
}

function findCompoundParticleOffset(value: string): number {
  let best = -1;
  for (const particle of Object.keys(COMPOUND_PARTICLE_MAP)) {
    const offset = value.indexOf(particle);
    if (offset > 0 && (best === -1 || offset < best)) best = offset;
  }
  return best;
}

function takeParticleLikeKanaInKanjiRun(surface: string, chars: string[], pos: number): string | null {
  if (!surface || !isHiragana(chars[pos])) return null;
  let kanaTail = "";
  let cursor = pos;
  while (cursor < chars.length && isHiragana(chars[cursor]) && !PUNCTUATION.has(chars[cursor]) && chars[cursor] !== " ") {
    kanaTail += chars[cursor];
    cursor++;
  }
  if (lookupParticle(kanaTail)) return null;
  const compoundOffset = findCompoundParticleOffset(kanaTail);
  const candidateTail = compoundOffset > 0 ? kanaTail.slice(0, compoundOffset) : kanaTail;
  if (!candidateTail) return null;
  if (lookupParticle(candidateTail)) return null;
  const truncatedCandidate = surface + candidateTail;
  if (VERB_ENDINGS.some(({ ending }) => truncatedCandidate.endsWith(ending) && truncatedCandidate.length > ending.length)) {
    return candidateTail;
  }
  if (compoundOffset > 0) return null;
  const candidate = surface + kanaTail;
  if (VERB_ENDINGS.some(({ ending }) => candidate.endsWith(ending) && candidate.length > ending.length)) {
    return kanaTail;
  }
  return null;
}

function trySplitVerbEnding(surface: string, basePos: number): JICToken[] | null {
  // Try each known ending pattern (longest first)
  for (const { ending, method, subtype } of VERB_ENDINGS) {
    if (surface.endsWith(ending) && surface.length > ending.length) {
      const stem = surface.slice(0, surface.length - ending.length);
      if (stem.length === 0) continue;

      const tokens: JICToken[] = [];

      // Stem is a variable (verb stem)
      tokens.push({
        surface: stem,
        category: "variable",
        subtype: "verb_stem",
        value: stem,
        position: basePos,
      });

      // Each method in the chain
      const methods = method.split(".").filter(Boolean).map(m => m.replace("()", ""));
      for (const m of methods) {
        tokens.push({
          surface: ending,
          category: "method",
          subtype: subtype,
          value: m,
          position: basePos + stem.length,
        });
      }

      return tokens;
    }
  }
  return null;
}

function classifyVariable(surface: string): VariableSubtype {
  const hasKanji = [...surface].some(isKanji);
  const hasHiragana = [...surface].some(isHiragana);

  if (hasKanji && hasHiragana) {
    // Could be kanji+noun or verb stem — heuristic
    return "kanji_noun";
  }
  if (hasKanji) {
    return "pure_kanji_noun";
  }
  return "pronoun";
}

function katakanaToHiragana(katakana: string): string {
  return [...katakana].map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) {
      return String.fromCharCode(code - 0x60);
    }
    return ch;
  }).join("");
}
