import fs from "fs";
import path from "path";
import crypto from "crypto";
import initSqlJs from "sql.js";

const DB_PATH = process.env.KANALENS_DB_PATH || path.join(process.cwd(), "data", "kanalens.db");
const CORPUS_PATH = process.env.TRANSJAP_CORPUS_PATH || "";
const TEMPLATE_ID = "transjap-corpus";
const MODEL_LABEL = "transjap-hand-authored-v1";
const RUN_ID = "transjap-reading-corpus-v1";
const APPROVED_STATUS = "approved";
const NOW = new Date().toISOString();

function queryRows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryValue(db, sql, params = []) {
  const rows = queryRows(db, sql, params);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

function ensureColumn(db, table, name, definition) {
  const info = db.exec(`PRAGMA table_info(${table})`);
  const columns = new Set((info[0]?.values ?? []).map((row) => row[1]));
  if (!columns.has(name)) db.run(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function createTables(db) {
  db.run(`CREATE TABLE IF NOT EXISTS passages (
    id TEXT PRIMARY KEY,
    title_ja TEXT NOT NULL,
    title_en TEXT NOT NULL,
    paragraphs_json TEXT NOT NULL,
    grammar_points_json TEXT NOT NULL,
    translation TEXT NOT NULL,
    word_gloss_json TEXT NOT NULL,
    jic_sentences_json TEXT,
    jic_code TEXT,
    style_template_id TEXT,
    llm_model TEXT NOT NULL,
    content_hash TEXT,
    source_title TEXT,
    source_author TEXT,
    source_identifier TEXT,
    source_license TEXT,
    source_locator TEXT,
    verification_status TEXT NOT NULL DEFAULT 'approved',
    review_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );`);

  ensureColumn(db, "passages", "content_hash", "content_hash TEXT");
  ensureColumn(db, "passages", "jic_sentences_json", "jic_sentences_json TEXT");
  ensureColumn(db, "passages", "jic_code", "jic_code TEXT");
  ensureColumn(db, "passages", "source_title", "source_title TEXT");
  ensureColumn(db, "passages", "source_author", "source_author TEXT");
  ensureColumn(db, "passages", "source_identifier", "source_identifier TEXT");
  ensureColumn(db, "passages", "source_license", "source_license TEXT");
  ensureColumn(db, "passages", "source_locator", "source_locator TEXT");
  ensureColumn(db, "passages", "verification_status", "verification_status TEXT NOT NULL DEFAULT 'approved'");
  ensureColumn(db, "passages", "review_notes", "review_notes TEXT");
  ensureColumn(db, "passages", "reviewed_at", "reviewed_at TEXT");

  db.run(`CREATE TABLE IF NOT EXISTS style_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS passage_cache_entries (
    passage_id TEXT PRIMARY KEY,
    style_template_id TEXT,
    generation_tier TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    token_budget INTEGER NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL
  );`);

  db.run("CREATE INDEX IF NOT EXISTS idx_passages_source_identifier ON passages(source_identifier)");
  db.run("CREATE INDEX IF NOT EXISTS idx_passages_style_template_id ON passages(style_template_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cache_template_tier ON passage_cache_entries(style_template_id, generation_tier)");
}

function decodeHtml(text) {
  return String(text)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(text) {
  return decodeHtml(String(text).replace(/<rt>.*?<\/rt>/gs, "").replace(/<[^>]+>/g, ""));
}

function hasKanji(text) {
  return /[一-龯]/.test(text);
}

function pushPlainSegment(segments, text) {
  const surface = stripTags(text);
  if (!surface) return;
  segments.push({ surface, reading: surface, is_kanji: false });
}

function rubySegments(readingHtml, fallbackText) {
  const html = String(readingHtml ?? "");
  const segments = [];
  const rubyPattern = /<ruby>(.*?)<rt>(.*?)<\/rt><\/ruby>/gis;
  let cursor = 0;
  let match;

  while ((match = rubyPattern.exec(html))) {
    pushPlainSegment(segments, html.slice(cursor, match.index));
    const surface = stripTags(match[1]);
    const reading = stripTags(match[2]);
    if (surface) {
      segments.push({
        surface,
        reading: reading || surface,
        is_kanji: hasKanji(surface),
      });
    }
    cursor = match.index + match[0].length;
  }

  pushPlainSegment(segments, html.slice(cursor));
  const joined = segments.map((segment) => segment.surface).join("");
  if (segments.length === 0 || (fallbackText && joined !== fallbackText)) {
    return [{ surface: fallbackText, reading: fallbackText, is_kanji: false }];
  }
  return segments;
}

function grammarPattern(note, index) {
  const backtick = String(note).match(/`([^`]+)`/);
  if (backtick?.[1]) return backtick[1].trim().slice(0, 48);
  const japanese = String(note).match(/[〜～ぁ-んァ-ヶ一-龯][^,.;:：。)]*/);
  if (japanese?.[0]) return japanese[0].trim().slice(0, 48);
  return `Reading note ${index + 1}`;
}

function titleJa(item) {
  const words = Array.isArray(item.targetWords) ? item.targetWords.filter((word) => /[ぁ-んァ-ヶ一-龯]/.test(word)) : [];
  if (words.length >= 2) return `${words[0]}と${words[1]}の読解`;
  if (words.length === 1) return `${words[0]}の読解`;
  return "日本語読解";
}

function passageId(item) {
  return `transjap-${String(item.id).padStart(4, "0")}`;
}

function sourceIdentifier(item) {
  return `${RUN_ID}:${String(item.id).padStart(4, "0")}`;
}

function contentHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function normalizeCorpusItem(item) {
  const id = passageId(item);
  const annotated = rubySegments(item.reading, item.readingPlain);
  const paragraphs = [{ text: item.readingPlain, annotated }];
  const grammarPoints = (Array.isArray(item.grammarNotes) ? item.grammarNotes : []).map((note, index) => ({
    pattern: grammarPattern(note, index),
    explanation_en: String(note).replace(/`/g, ""),
  }));
  const wordGloss = (Array.isArray(item.vocabulary) ? item.vocabulary : []).map((entry) => ({
    word: String(entry.word ?? ""),
    reading: String(entry.reading ?? ""),
    pos: "other",
    gloss_en: `${entry.meaning ?? ""}${entry.naturalUse ? `; natural use: ${entry.naturalUse}` : ""}`,
  })).filter((entry) => entry.word && entry.reading && entry.gloss_en);
  const reviewNotes = JSON.stringify({
    integration: "transjap",
    schemaVersion: 1,
    corpusId: item.id,
    pack: item.pack,
    sourceFile: item.sourceFile,
    theme: item.theme,
    level: item.level,
    targetWords: item.targetWords ?? [],
    learnerTrap: item.learnerTrap ?? "",
    practice: item.practice ?? null,
  });

  return {
    id,
    title_ja: titleJa(item),
    title_en: String(item.title ?? `TransJap Passage ${item.id}`),
    paragraphs,
    grammar_points: grammarPoints,
    translation: String(item.translation ?? ""),
    word_gloss: wordGloss,
    style_template_id: TEMPLATE_ID,
    llm_model: MODEL_LABEL,
    content_hash: contentHash(item.readingPlain),
    source_title: `TransJap Reading Corpus Pack ${item.pack}`,
    source_author: "TransJap local learning materials",
    source_identifier: sourceIdentifier(item),
    source_license: "Imported local learning material",
    source_locator: `${item.sourceFile}#${item.id}`,
    verification_status: APPROVED_STATUS,
    review_notes: reviewNotes,
    reviewed_at: NOW,
    created_at: NOW,
  };
}

function validatePassage(passage) {
  const errors = [];
  if (!passage.id || !passage.title_ja || !passage.title_en) errors.push("missing title or id");
  if (!passage.translation || passage.translation.length < 20) errors.push("translation is too short");
  if (!Array.isArray(passage.paragraphs) || passage.paragraphs.length !== 1) errors.push("expected one paragraph");
  if (!Array.isArray(passage.paragraphs[0]?.annotated) || passage.paragraphs[0].annotated.length === 0) errors.push("missing annotated segments");
  if (passage.paragraphs[0]?.text !== passage.paragraphs[0]?.annotated.map((segment) => segment.surface).join("")) errors.push("annotated text mismatch");
  if (!Array.isArray(passage.word_gloss) || passage.word_gloss.length === 0) errors.push("missing word gloss");
  if (!Array.isArray(passage.grammar_points) || passage.grammar_points.length === 0) errors.push("missing grammar points");
  return errors;
}

function upsertPassage(db, passage) {
  const exists = Number(queryValue(db, "SELECT COUNT(*) AS count FROM passages WHERE id = ?", [passage.id]) ?? 0) > 0;
  const values = [
    passage.title_ja,
    passage.title_en,
    JSON.stringify(passage.paragraphs),
    JSON.stringify(passage.grammar_points),
    passage.translation,
    JSON.stringify(passage.word_gloss),
    null,
    null,
    passage.style_template_id,
    passage.llm_model,
    passage.content_hash,
    passage.source_title,
    passage.source_author,
    passage.source_identifier,
    passage.source_license,
    passage.source_locator,
    passage.verification_status,
    passage.review_notes,
    passage.reviewed_at,
  ];

  if (exists) {
    db.run(`UPDATE passages SET
      title_ja = ?,
      title_en = ?,
      paragraphs_json = ?,
      grammar_points_json = ?,
      translation = ?,
      word_gloss_json = ?,
      jic_sentences_json = ?,
      jic_code = ?,
      style_template_id = ?,
      llm_model = ?,
      content_hash = ?,
      source_title = ?,
      source_author = ?,
      source_identifier = ?,
      source_license = ?,
      source_locator = ?,
      verification_status = ?,
      review_notes = ?,
      reviewed_at = ?
      WHERE id = ?`, [...values, passage.id]);
    return "updated";
  }

  db.run(`INSERT INTO passages (
    title_ja, title_en, paragraphs_json, grammar_points_json, translation, word_gloss_json,
    jic_sentences_json, jic_code, style_template_id, llm_model, content_hash,
    source_title, source_author, source_identifier, source_license, source_locator,
    verification_status, review_notes, reviewed_at, id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...values, passage.id, passage.created_at]);
  return "inserted";
}

async function main() {
  if (!CORPUS_PATH) {
    throw new Error("TRANSJAP_CORPUS_PATH is required to re-import external TransJap corpus JSON. The legacy TransJap app folder is no longer part of this workspace.");
  }
  if (!fs.existsSync(CORPUS_PATH)) {
    throw new Error(`TransJap corpus not found: ${CORPUS_PATH}`);
  }

  const payload = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) throw new Error("TransJap corpus has no items");

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const SQL = await initSqlJs();
  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : undefined;
  const db = new SQL.Database(existing);
  createTables(db);

  db.run("INSERT OR IGNORE INTO style_templates (id, name, prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
    TEMPLATE_ID,
    "TransJap Corpus",
    "Hand-authored TransJap reading corpus with translations, target vocabulary, grammar notes, learner traps, and practice prompts.",
    0,
    NOW,
    NOW,
  ]);
  db.run("UPDATE style_templates SET name = ?, prompt = ?, updated_at = ? WHERE id = ?", [
    "TransJap Corpus",
    "Hand-authored TransJap reading corpus with translations, target vocabulary, grammar notes, learner traps, and practice prompts.",
    NOW,
    TEMPLATE_ID,
  ]);

  const promptHash = crypto.createHash("sha256").update(`${RUN_ID}:normal`).digest("hex").slice(0, 12);
  let inserted = 0;
  let updated = 0;
  const failures = [];
  const seenIds = new Set();

  for (const item of items) {
    const passage = normalizeCorpusItem(item);
    if (seenIds.has(passage.id)) failures.push(`${passage.id}: duplicate corpus id`);
    seenIds.add(passage.id);
    const errors = validatePassage(passage);
    if (errors.length > 0) {
      failures.push(`${passage.id}: ${errors.join("; ")}`);
      continue;
    }
    const result = upsertPassage(db, passage);
    if (result === "inserted") inserted += 1;
    if (result === "updated") updated += 1;
    db.run("INSERT OR IGNORE INTO passage_cache_entries (passage_id, style_template_id, generation_tier, prompt_hash, token_budget, use_count, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
      passage.id,
      TEMPLATE_ID,
      "normal",
      promptHash,
      0,
      0,
      null,
      NOW,
    ]);
  }

  if (failures.length > 0) {
    throw new Error(`Import validation failed for ${failures.length} item(s):\n${failures.slice(0, 20).join("\n")}`);
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  const imported = Number(queryValue(db, "SELECT COUNT(*) AS count FROM passages WHERE source_identifier LIKE ?", [`${RUN_ID}:%`]) ?? 0);
  const cached = Number(queryValue(db, `SELECT COUNT(*) AS count
    FROM passage_cache_entries
    JOIN passages ON passages.id = passage_cache_entries.passage_id
    WHERE passages.source_identifier LIKE ?`, [`${RUN_ID}:%`]) ?? 0);

  console.log(`TransJap corpus import complete. inserted=${inserted}, updated=${updated}, imported=${imported}, cache=${cached}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
