import { drizzle } from "drizzle-orm/sql-js";
import initSqlJs, { Database } from "sql.js";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle> | null = null;
let sqlDb: Database | null = null;

function getDbPath() {
  const configuredDir = process.env.KANALENS_DATA_DIR;
  const dataDir = configuredDir
    ? path.resolve(configuredDir)
    : path.join(process.cwd(), "data");

  return path.join(dataDir, "kanalens.db");
}

export async function getDb() {
  if (db) return db;

  const dbPath = getDbPath();
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  let buf: Buffer | undefined;
  if (fs.existsSync(dbPath)) {
    buf = fs.readFileSync(dbPath);
  }

  sqlDb = new SQL.Database(buf);

  sqlDb.run("PRAGMA journal_mode=WAL;");
  sqlDb.run("PRAGMA synchronous=NORMAL;");

  db = drizzle(sqlDb, { schema });

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS passages (
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
    );
  `);

  const passageCols = sqlDb.exec("PRAGMA table_info(passages)") as { values: (string | number | null | Uint8Array)[][] }[];
  const hasContentHash = passageCols[0]?.values?.some((col) => col[1] === "content_hash");
  if (!hasContentHash) {
    sqlDb.run("ALTER TABLE passages ADD COLUMN content_hash TEXT");
  }
  const hasJicSentencesJson = passageCols[0]?.values?.some((col) => col[1] === "jic_sentences_json");
  if (!hasJicSentencesJson) {
    sqlDb.run("ALTER TABLE passages ADD COLUMN jic_sentences_json TEXT");
  }
  const hasJicCode = passageCols[0]?.values?.some((col) => col[1] === "jic_code");
  if (!hasJicCode) {
    sqlDb.run("ALTER TABLE passages ADD COLUMN jic_code TEXT");
  }
  const hasSourceTitle = passageCols[0]?.values?.some((col) => col[1] === "source_title");
  if (!hasSourceTitle) {
    sqlDb.run("ALTER TABLE passages ADD COLUMN source_title TEXT");
    sqlDb.run("ALTER TABLE passages ADD COLUMN source_author TEXT");
    sqlDb.run("ALTER TABLE passages ADD COLUMN source_identifier TEXT");
    sqlDb.run("ALTER TABLE passages ADD COLUMN source_license TEXT");
    sqlDb.run("ALTER TABLE passages ADD COLUMN source_locator TEXT");
    sqlDb.run("ALTER TABLE passages ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'approved'");
    sqlDb.run("ALTER TABLE passages ADD COLUMN review_notes TEXT");
    sqlDb.run("ALTER TABLE passages ADD COLUMN reviewed_at TEXT");
  }

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS vocabularies (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      reading TEXT NOT NULL,
      pos TEXT NOT NULL,
      gloss_en TEXT NOT NULL,
      source_passage_id TEXT,
      review_count INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      next_review_at TEXT,
      last_review_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const vocabCols = sqlDb.exec("PRAGMA table_info(vocabularies)") as { values: (string | number | null | Uint8Array)[][] }[];
  const hasReviewCount = vocabCols[0]?.values?.some((col) => col[1] === "review_count");
  if (!hasReviewCount) {
    sqlDb.run("ALTER TABLE vocabularies ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0");
    sqlDb.run("ALTER TABLE vocabularies ADD COLUMN ease_factor REAL NOT NULL DEFAULT 2.5");
    sqlDb.run("ALTER TABLE vocabularies ADD COLUMN next_review_at TEXT");
    sqlDb.run("ALTER TABLE vocabularies ADD COLUMN last_review_at TEXT");
  }

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS dictionary_entries (
      id TEXT PRIMARY KEY,
      expression TEXT NOT NULL,
      reading TEXT NOT NULL,
      meaning TEXT NOT NULL,
      source TEXT NOT NULL,
      source_identifier TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS style_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS grammars (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      explanation_en TEXT NOT NULL,
      source_passage_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS reading_stats (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      passages_read INTEGER NOT NULL DEFAULT 0,
      words_learned INTEGER NOT NULL DEFAULT 0,
      time_spent_ms INTEGER NOT NULL DEFAULT 0
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS mistake_records (
      id TEXT PRIMARY KEY,
      passage_id TEXT,
      exercise_id TEXT NOT NULL,
      module TEXT NOT NULL,
      category TEXT NOT NULL,
      prompt TEXT NOT NULL,
      user_answer TEXT NOT NULL,
      expected_answer TEXT NOT NULL,
      severity REAL NOT NULL,
      rationale TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS passage_cache_entries (
      passage_id TEXT PRIMARY KEY,
      style_template_id TEXT,
      generation_tier TEXT NOT NULL,
      prompt_hash TEXT NOT NULL,
      token_budget INTEGER NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const cacheCols = sqlDb.exec("PRAGMA table_info(passage_cache_entries)") as { values: (string | number | null | Uint8Array)[][] }[];
  const hasGenerationTier = cacheCols[0]?.values?.some((col) => col[1] === "generation_tier");
  if (!hasGenerationTier) {
    sqlDb.run("ALTER TABLE passage_cache_entries ADD COLUMN generation_tier TEXT NOT NULL DEFAULT 'normal'");
    sqlDb.run("ALTER TABLE passage_cache_entries ADD COLUMN prompt_hash TEXT NOT NULL DEFAULT ''");
    sqlDb.run("ALTER TABLE passage_cache_entries ADD COLUMN token_budget INTEGER NOT NULL DEFAULT 0");
    sqlDb.run("ALTER TABLE passage_cache_entries ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0");
    sqlDb.run("ALTER TABLE passage_cache_entries ADD COLUMN last_used_at TEXT");
    sqlDb.run("ALTER TABLE passage_cache_entries ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
  }

  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_cache_template_tier ON passage_cache_entries(style_template_id, generation_tier)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_cache_prompt_hash ON passage_cache_entries(prompt_hash)");

  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_passages_content_hash ON passages(content_hash)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_passages_style_template_id ON passages(style_template_id)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_vocabularies_word ON vocabularies(word)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_vocabularies_next_review_at ON vocabularies(next_review_at)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_dictionary_entries_expression ON dictionary_entries(expression)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_dictionary_entries_reading ON dictionary_entries(reading)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_dictionary_entries_meaning ON dictionary_entries(meaning)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_reading_stats_date ON reading_stats(date)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_mistake_records_created_at ON mistake_records(created_at)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_mistake_records_passage_id ON mistake_records(passage_id)");
  sqlDb.run("CREATE INDEX IF NOT EXISTS idx_mistake_records_category ON mistake_records(category)");

  const existingTemplates = sqlDb.exec("SELECT id FROM style_templates WHERE is_default = 1");
  if (existingTemplates.length === 0) {
    const now = new Date().toISOString();
    sqlDb.run(
      `INSERT INTO style_templates (id, name, prompt, is_default, created_at, updated_at) VALUES ('default', '文学随想', '写一段文学性的日语段落——可以是小说场景、人物内心独白或简短故事。使用文学修辞、生动意象和自然对话。避免教科书式的简单句。', 1, '${now}', '${now}')`
    );
  }

  saveDb();
  return db;
}

export function saveDb() {
  if (!sqlDb) return;
  const dbPath = getDbPath();
  const data = sqlDb.export();
  const buffer = Buffer.from(data);
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(dbPath, buffer);
}

export function getRawDb(): Database | null {
  return sqlDb;
}
