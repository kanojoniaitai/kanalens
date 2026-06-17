import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";
import { nanoid } from "nanoid";
import crypto from "crypto";

const TEMPLATE_ID = "claude-curated";
const MODEL_LABEL = "claude-curated";
const DB_PATH = path.join(process.cwd(), "data", "kanalens.db");
const CURATED_PATH = path.join(process.cwd(), "data", "curated-passages.json");
const NOW = new Date().toISOString();
const APPROVED_STATUS = "approved";
const VALID_POS = new Set(["noun", "verb", "adjective", "adverb", "particle", "conjunction", "interjection", "pronoun", "auxiliary", "other"]);

function hashContent(paragraphs) {
  const text = paragraphs.map((p) => p.annotated.map((s) => s.surface).join("")).join("|");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function hasKanji(text) {
  return /[一-龯]/.test(text);
}

function flattenText(paragraphs) {
  return paragraphs.map((p) => p.annotated.map((s) => s.surface).join("")).join("\n");
}

function validatePassageShape(entry) {
  const errors = [];
  if (!entry || typeof entry !== "object") errors.push("Entry must be an object");
  if (!entry.title_ja || typeof entry.title_ja !== "string") errors.push("title_ja is required");
  if (!entry.title_en || typeof entry.title_en !== "string") errors.push("title_en is required");
  if (!Array.isArray(entry.paragraphs) || entry.paragraphs.length === 0) errors.push("paragraphs must be a non-empty array");
  if (!Array.isArray(entry.grammar_points) || entry.grammar_points.length < 1) errors.push("grammar_points must contain at least 1 item");
  if (!Array.isArray(entry.word_gloss) || entry.word_gloss.length < 5) errors.push("word_gloss must contain at least 5 items");
  if (!entry.translation || typeof entry.translation !== "string" || entry.translation.length < 20) errors.push("translation must be a non-empty, non-generic string");
  if (!entry.verification_status || entry.verification_status !== APPROVED_STATUS) errors.push("verification_status must be approved for curated imports");
  if (!entry.source_title || !entry.source_author || !entry.source_identifier || !entry.source_license) errors.push("source metadata is required");
  return errors;
}

function containsGlossWord(text, word, pos) {
  if (text.includes(word)) return true;
  if (pos === "verb") {
    const stem = word.endsWith("る") || word.endsWith("く") || word.endsWith("ぐ") || word.endsWith("す") || word.endsWith("つ") || word.endsWith("ぬ") || word.endsWith("ぶ") || word.endsWith("む") || word.endsWith("う")
      ? word.slice(0, -1)
      : word;
    return stem.length > 0 && text.includes(stem);
  }
  return false;
}

function validateSegments(entry) {
  const errors = [];
  const text = flattenText(entry.paragraphs);
  for (const [pIndex, paragraph] of entry.paragraphs.entries()) {
    if (!Array.isArray(paragraph.annotated) || paragraph.annotated.length === 0) {
      errors.push(`paragraph ${pIndex} has no annotated segments`);
      continue;
    }
    for (const [sIndex, segment] of paragraph.annotated.entries()) {
      if (typeof segment.surface !== "string" || segment.surface.length === 0) {
        errors.push(`paragraph ${pIndex} segment ${sIndex} is missing surface`);
      }
      if (typeof segment.reading !== "string" || segment.reading.length === 0) {
        errors.push(`paragraph ${pIndex} segment ${sIndex} is missing reading`);
      }
      if (segment.reading === "*") {
        errors.push(`paragraph ${pIndex} segment ${sIndex} uses placeholder reading`);
      }
      if (segment.is_kanji !== true && segment.is_kanji !== false) {
        errors.push(`paragraph ${pIndex} segment ${sIndex} is missing boolean is_kanji`);
      }
      if (segment.is_kanji === true && !hasKanji(segment.surface)) {
        errors.push(`paragraph ${pIndex} segment ${sIndex} is marked kanji but has no kanji`);
      }
      if (segment.is_kanji === true && hasKanji(segment.reading)) {
        errors.push(`paragraph ${pIndex} segment ${sIndex} reading should be kana, not kanji`);
      }
    }
  }
  for (const gloss of entry.word_gloss) {
    if (!VALID_POS.has(gloss.pos)) {
      errors.push(`invalid POS for gloss word ${gloss.word}`);
    }
    if (!gloss.reading || gloss.reading === "*" || hasKanji(gloss.reading)) {
      errors.push(`gloss reading must be kana for word ${gloss.word}`);
    }
    if (!containsGlossWord(text, gloss.word, gloss.pos)) {
      errors.push(`gloss word ${gloss.word} does not appear in passage text`);
    }
  }
  return errors;
}

function validateGrammar(entry) {
  const errors = [];
  const text = flattenText(entry.paragraphs);
  for (const grammar of entry.grammar_points) {
    if (!grammar.pattern || !grammar.explanation_en) {
      errors.push("grammar point is missing pattern or explanation");
      continue;
    }
    const normalized = String(grammar.pattern).replace(/[〜～]/g, "").replace(/[()]/g, "").trim();
    if (normalized.length > 0 && !text.includes(normalized.slice(0, Math.min(normalized.length, 2)))) {
      errors.push(`grammar point ${grammar.pattern} does not appear grounded in passage text`);
    }
  }
  return errors;
}

function loadCuratedEntries() {
  const raw = fs.readFileSync(CURATED_PATH, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error("curated-passages.json must contain an array");
  }
  return entries.map((entry, index) => {
    const shapeErrors = validatePassageShape(entry);
    const segmentErrors = shapeErrors.length === 0 ? validateSegments(entry) : [];
    const grammarErrors = shapeErrors.length === 0 ? validateGrammar(entry) : [];
    const errors = [...shapeErrors, ...segmentErrors, ...grammarErrors];
    if (errors.length > 0) {
      throw new Error(`Curated entry ${index + 1} (${entry.title_ja ?? "untitled"}) failed validation: ${errors.join("; ")}`);
    }
    const paragraphs = entry.paragraphs.map((paragraph) => ({
      text: paragraph.annotated.map((segment) => segment.surface).join(""),
      annotated: paragraph.annotated,
    }));
    return {
      id: nanoid(),
      title_ja: entry.title_ja,
      title_en: entry.title_en,
      paragraphs,
      grammar_points: entry.grammar_points,
      translation: entry.translation,
      word_gloss: entry.word_gloss,
      jic_sentences: undefined,
      jic_code: null,
      style_template_id: TEMPLATE_ID,
      llm_model: MODEL_LABEL,
      content_hash: hashContent(paragraphs),
      source_title: entry.source_title,
      source_author: entry.source_author,
      source_identifier: entry.source_identifier,
      source_license: entry.source_license,
      source_locator: entry.source_locator ?? null,
      verification_status: APPROVED_STATUS,
      review_notes: entry.review_notes ?? null,
      reviewed_at: entry.reviewed_at ?? NOW,
      created_at: NOW,
    };
  });
}

function ensurePassageColumns(db) {
  const result = db.exec("PRAGMA table_info(passages)");
  const columns = new Set((result[0]?.values ?? []).map((col) => col[1]));
  if (!columns.has("content_hash")) db.run("ALTER TABLE passages ADD COLUMN content_hash TEXT");
  if (!columns.has("jic_sentences_json")) db.run("ALTER TABLE passages ADD COLUMN jic_sentences_json TEXT");
  if (!columns.has("jic_code")) db.run("ALTER TABLE passages ADD COLUMN jic_code TEXT");
  if (!columns.has("source_title")) db.run("ALTER TABLE passages ADD COLUMN source_title TEXT");
  if (!columns.has("source_author")) db.run("ALTER TABLE passages ADD COLUMN source_author TEXT");
  if (!columns.has("source_identifier")) db.run("ALTER TABLE passages ADD COLUMN source_identifier TEXT");
  if (!columns.has("source_license")) db.run("ALTER TABLE passages ADD COLUMN source_license TEXT");
  if (!columns.has("source_locator")) db.run("ALTER TABLE passages ADD COLUMN source_locator TEXT");
  if (!columns.has("verification_status")) db.run("ALTER TABLE passages ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'approved'");
  if (!columns.has("review_notes")) db.run("ALTER TABLE passages ADD COLUMN review_notes TEXT");
  if (!columns.has("reviewed_at")) db.run("ALTER TABLE passages ADD COLUMN reviewed_at TEXT");
}

async function main() {
  const dataDir = path.dirname(DB_PATH);
  fs.mkdirSync(dataDir, { recursive: true });
  const SQL = await initSqlJs();
  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : undefined;
  const db = new SQL.Database(existing);

  db.run(`CREATE TABLE IF NOT EXISTS passages (id TEXT PRIMARY KEY, title_ja TEXT NOT NULL, title_en TEXT NOT NULL, paragraphs_json TEXT NOT NULL, grammar_points_json TEXT NOT NULL, translation TEXT NOT NULL, word_gloss_json TEXT NOT NULL, jic_sentences_json TEXT, jic_code TEXT, style_template_id TEXT, llm_model TEXT NOT NULL, content_hash TEXT, source_title TEXT, source_author TEXT, source_identifier TEXT, source_license TEXT, source_locator TEXT, verification_status TEXT NOT NULL DEFAULT 'approved', review_notes TEXT, reviewed_at TEXT, created_at TEXT NOT NULL);`);
  ensurePassageColumns(db);
  db.run(`CREATE TABLE IF NOT EXISTS style_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, prompt TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  db.run(`CREATE TABLE IF NOT EXISTS passage_cache_entries (passage_id TEXT PRIMARY KEY, style_template_id TEXT, generation_tier TEXT NOT NULL, prompt_hash TEXT NOT NULL, token_budget INTEGER NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL);`);

  db.run("INSERT OR IGNORE INTO style_templates (id, name, prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
    TEMPLATE_ID,
    "Claude Curated Library",
    "Source-backed curated Japanese passages with verified readings, grammar notes, translations, and provenance metadata.",
    0,
    NOW,
    NOW,
  ]);

  db.run("DELETE FROM passage_cache_entries WHERE style_template_id = ?", [TEMPLATE_ID]);
  db.run("DELETE FROM passages WHERE style_template_id = ?", [TEMPLATE_ID]);

  const curatedEntries = loadCuratedEntries();
  const seenHashes = new Set();
  for (const entry of curatedEntries) {
    if (seenHashes.has(entry.content_hash)) {
      throw new Error(`Duplicate curated content hash detected for ${entry.title_ja}`);
    }
    seenHashes.add(entry.content_hash);
  }

  const insertPassage = db.prepare("INSERT INTO passages (id, title_ja, title_en, paragraphs_json, grammar_points_json, translation, word_gloss_json, jic_sentences_json, jic_code, style_template_id, llm_model, content_hash, source_title, source_author, source_identifier, source_license, source_locator, verification_status, review_notes, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertCache = db.prepare("INSERT INTO passage_cache_entries (passage_id, style_template_id, generation_tier, prompt_hash, token_budget, use_count, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const promptHash = crypto.createHash("sha256").update("claude-curated:approved").digest("hex").slice(0, 12);

  for (const entry of curatedEntries) {
    insertPassage.run([
      entry.id,
      entry.title_ja,
      entry.title_en,
      JSON.stringify(entry.paragraphs),
      JSON.stringify(entry.grammar_points),
      entry.translation,
      JSON.stringify(entry.word_gloss),
      null,
      null,
      entry.style_template_id,
      entry.llm_model,
      entry.content_hash,
      entry.source_title,
      entry.source_author,
      entry.source_identifier,
      entry.source_license,
      entry.source_locator,
      entry.verification_status,
      entry.review_notes,
      entry.reviewed_at,
      entry.created_at,
    ]);
    insertCache.run([entry.id, TEMPLATE_ID, "normal", promptHash, 0, 0, null, entry.created_at]);
  }

  insertPassage.free();
  insertCache.free();
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();
  console.log(`Imported ${curatedEntries.length} approved curated passages from ${CURATED_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
