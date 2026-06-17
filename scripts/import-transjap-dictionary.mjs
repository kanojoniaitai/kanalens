import fs from "fs";
import path from "path";
import crypto from "crypto";
import initSqlJs from "sql.js";

const DB_PATH = process.env.KANALENS_DB_PATH || path.join(process.cwd(), "data", "kanalens.db");
const VOCAB_PATH = process.env.TRANSJAP_VOCAB_PATH || "";
const SOURCE = "TransJap vocabulary.csv";
const RUN_ID = "transjap-vocabulary-v1";
const NOW = new Date().toISOString();

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function loadEntries() {
  if (!VOCAB_PATH) {
    throw new Error("TRANSJAP_VOCAB_PATH is required to re-import external TransJap vocabulary CSV. The legacy TransJap app folder is no longer part of this workspace.");
  }
  if (!fs.existsSync(VOCAB_PATH)) {
    throw new Error(`TransJap vocabulary file not found: ${VOCAB_PATH}`);
  }
  const lines = fs.readFileSync(VOCAB_PATH, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const [header, ...data] = lines;
  if (header !== "expression,reading,meaning") {
    throw new Error(`Unexpected vocabulary.csv header: ${header}`);
  }
  let missingReadingFallbacks = 0;
  const entries = data.map((line, index) => {
    const [expression, reading, meaning] = parseCsvLine(line);
    if (!expression || !meaning) {
      throw new Error(`Invalid vocabulary row ${index + 2}: ${line}`);
    }
    const normalizedReading = reading || expression;
    if (!reading) missingReadingFallbacks += 1;
    const stable = crypto.createHash("sha1").update(`${expression}\n${normalizedReading}\n${meaning}`).digest("hex").slice(0, 16);
    return {
      id: `transjap-dict-${stable}`,
      expression,
      reading: normalizedReading,
      meaning,
      source: SOURCE,
      source_identifier: `${RUN_ID}:${String(index + 1).padStart(5, "0")}`,
    };
  });
  entries.missingReadingFallbacks = missingReadingFallbacks;
  return entries;
}

function queryValue(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let value;
  if (stmt.step()) value = Object.values(stmt.getAsObject())[0];
  stmt.free();
  return value;
}

function createTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS dictionary_entries (
    id TEXT PRIMARY KEY,
    expression TEXT NOT NULL,
    reading TEXT NOT NULL,
    meaning TEXT NOT NULL,
    source TEXT NOT NULL,
    source_identifier TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`);
  db.run("CREATE INDEX IF NOT EXISTS idx_dictionary_entries_expression ON dictionary_entries(expression)");
  db.run("CREATE INDEX IF NOT EXISTS idx_dictionary_entries_reading ON dictionary_entries(reading)");
  db.run("CREATE INDEX IF NOT EXISTS idx_dictionary_entries_meaning ON dictionary_entries(meaning)");
}

async function main() {
  const entries = loadEntries();
  const missingReadingFallbacks = entries.missingReadingFallbacks ?? 0;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const SQL = await initSqlJs();
  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : undefined;
  const db = new SQL.Database(existing);
  createTable(db);

  const upsert = db.prepare(`INSERT INTO dictionary_entries
    (id, expression, reading, meaning, source, source_identifier, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      expression = excluded.expression,
      reading = excluded.reading,
      meaning = excluded.meaning,
      source = excluded.source,
      source_identifier = excluded.source_identifier,
      updated_at = excluded.updated_at`);

  for (const entry of entries) {
    upsert.run([
      entry.id,
      entry.expression,
      entry.reading,
      entry.meaning,
      entry.source,
      entry.source_identifier,
      NOW,
      NOW,
    ]);
  }
  upsert.free();

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  const imported = Number(queryValue(db, "SELECT COUNT(*) FROM dictionary_entries WHERE source = ?", [SOURCE]) ?? 0);
  console.log(`TransJap dictionary import complete. imported=${imported}, missing_reading_fallbacks=${missingReadingFallbacks}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
