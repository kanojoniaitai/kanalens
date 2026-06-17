import fs from "fs";
import path from "path";
import crypto from "crypto";
import initSqlJs from "sql.js";
import { nanoid } from "nanoid";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "kanalens.db");
const DEFAULT_PER_TOPIC = 99;
const DEFAULT_TOPIC_COUNT = 21;
const DEFAULT_TIER = "normal";
const DEFAULT_RUN_ID = "basic-material-v1";
const APPROVED_STATUS = "approved";
const MAX_RETRIES = 3;
const VALID_POS = new Set([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "particle",
  "conjunction",
  "interjection",
  "pronoun",
  "auxiliary",
  "other",
]);

const TIER_RULES = {
  short: {
    paragraphGuidance: "Write 1 short paragraph.",
    lengthGuidance: "Keep the passage concise and focused.",
    tokenHint: "Aim for a compact output with minimal filler.",
    maxTokens: 4096,
  },
  normal: {
    paragraphGuidance: "Write 1-3 paragraphs.",
    lengthGuidance: "Use balanced length with natural literary pacing.",
    tokenHint: "Prefer moderate detail without unnecessary expansion.",
    maxTokens: 8192,
  },
  long: {
    paragraphGuidance: "Write 2-4 paragraphs.",
    lengthGuidance: "Allow a longer, more immersive passage.",
    tokenHint: "Include richer description while keeping JSON valid.",
    maxTokens: 8192,
  },
};

const TOPIC_PRESETS = [
  {
    id: "seed-topic-daily-life",
    name: "日常生活",
    prompt: "Write natural Japanese prose about ordinary daily life: mornings, errands, small decisions, neighbors, chores, and quiet discoveries. Use concrete sensory details, natural dialogue, and practical vocabulary. Keep the difficulty around JLPT N3-N2 while still sounding literary rather than textbook-like.",
  },
  {
    id: "seed-topic-school-learning",
    name: "学校と学習",
    prompt: "Write a Japanese passage about school, self-study, language learning, exams, clubs, teachers, libraries, or small academic frustrations. Include realistic classroom or study details, natural speech, and reusable expressions for learners.",
  },
  {
    id: "seed-topic-work-society",
    name: "仕事と社会",
    prompt: "Write a Japanese passage about workplaces, part-time jobs, meetings, customer service, social expectations, commuting, or career choices. Use realistic modern language, restrained emotion, and vocabulary useful for adult learners.",
  },
  {
    id: "seed-topic-city-transit",
    name: "都市と移動",
    prompt: "Write atmospheric Japanese prose about urban streets, stations, trains, buses, night walks, crowds, announcements, maps, and missed connections. Include concrete sounds, signs, and movement through space.",
  },
  {
    id: "seed-topic-travel-landscape",
    name: "旅と風景",
    prompt: "Write Japanese travel prose about inns, small towns, coastlines, mountains, museums, local shops, weather, and encounters during a journey. Use vivid landscape imagery and natural dialogue without becoming a tourist brochure.",
  },
  {
    id: "seed-topic-food-kitchen",
    name: "食と台所",
    prompt: "Write a Japanese passage centered on food, cooking, shopping streets, family meals, cafes, recipes, smells, textures, or seasonal ingredients. Include practical food vocabulary and warm but not sentimental description.",
  },
  {
    id: "seed-topic-family-relationships",
    name: "家族と人間関係",
    prompt: "Write Japanese prose about family, friendship, distance, reconciliation, messages left unread, small kindnesses, and misunderstandings. Use subtle emotion, natural dialogue, and everyday relationship vocabulary.",
  },
  {
    id: "seed-topic-health-mind",
    name: "健康と心",
    prompt: "Write a Japanese passage about rest, stress, sleep, habits, illness, clinics, exercise, self-care, or mental state. Keep it grounded, humane, and suitable for language study, with useful vocabulary and natural phrasing.",
  },
  {
    id: "seed-topic-science-tech",
    name: "科学とテクノロジー",
    prompt: "Write accessible Japanese prose about technology, science news, smartphones, AI, robots, laboratories, environmental measurement, or everyday tools. Explain through scene and observation rather than abstract lecture.",
  },
  {
    id: "seed-topic-history-memory",
    name: "歴史と記憶",
    prompt: "Write Japanese prose about memory, old photographs, local history, museums, inherited objects, festivals, archives, or traces of the past in modern life. Use reflective language and concrete historical vocabulary.",
  },
  {
    id: "seed-topic-art-music",
    name: "芸術と音楽",
    prompt: "Write a Japanese passage about painting, music practice, concerts, galleries, theater, dance, craft, or the private discipline behind art. Use sensory description and vocabulary for perception, rhythm, color, and performance.",
  },
  {
    id: "seed-topic-mystery",
    name: "ミステリー",
    prompt: "Write a compact Japanese mystery or suspense scene with clues, atmosphere, withheld information, and natural dialogue. Keep it literary and readable, avoiding gore; focus on observation, inference, and tension.",
  },
  {
    id: "seed-topic-nature-seasons",
    name: "自然と季節",
    prompt: "Write Japanese prose about seasons, weather, gardens, rivers, insects, forests, flowers, typhoons, snow, or the feeling of a changing sky. Use vivid nature imagery and common seasonal vocabulary.",
  },
  {
    id: "seed-topic-news-commentary",
    name: "ニュースと評論",
    prompt: "Write a Japanese passage in a light essay or commentary style about public life, local news, social habits, media, small controversies, or community issues. Use balanced reasoning and vocabulary useful for reading articles.",
  },
  {
    id: "seed-topic-fantasy",
    name: "ファンタジー",
    prompt: "Write a Japanese fantasy scene with a clear situation, magical object, unfamiliar town, forest path, quiet danger, or mythical rule. Keep the language vivid but not archaic, with natural character dialogue.",
  },
];

function parseArgs(argv) {
  const args = {
    dbPath: process.env.KANALENS_DB_PATH || DEFAULT_DB_PATH,
    perTopic: Number(process.env.SEED_PER_TOPIC || DEFAULT_PER_TOPIC),
    ensureTopics: Number(process.env.SEED_TOPIC_COUNT || DEFAULT_TOPIC_COUNT),
    tier: process.env.SEED_TIER || DEFAULT_TIER,
    runId: process.env.SEED_RUN_ID || DEFAULT_RUN_ID,
    topicLimit: Number(process.env.SEED_TOPIC_LIMIT || 0),
    limitTotal: Number(process.env.SEED_LIMIT_TOTAL || 0),
    onlyTopic: process.env.SEED_ONLY_TOPIC || "",
    concurrency: Number(process.env.SEED_CONCURRENCY || 3),
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--db" && next) {
      args.dbPath = next;
      i += 1;
    } else if (arg === "--per-topic" && next) {
      args.perTopic = Number(next);
      i += 1;
    } else if (arg === "--ensure-topics" && next) {
      args.ensureTopics = Number(next);
      i += 1;
    } else if (arg === "--tier" && next) {
      args.tier = next;
      i += 1;
    } else if (arg === "--run-id" && next) {
      args.runId = next;
      i += 1;
    } else if (arg === "--topic-limit" && next) {
      args.topicLimit = Number(next);
      i += 1;
    } else if (arg === "--limit-total" && next) {
      args.limitTotal = Number(next);
      i += 1;
    } else if (arg === "--only-topic" && next) {
      args.onlyTopic = next;
      i += 1;
    } else if (arg === "--concurrency" && next) {
      args.concurrency = Number(next);
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  if (!TIER_RULES[args.tier]) {
    throw new Error(`Unsupported tier: ${args.tier}`);
  }
  if (!Number.isInteger(args.perTopic) || args.perTopic < 1) {
    throw new Error("--per-topic must be a positive integer");
  }
  if (!Number.isInteger(args.ensureTopics) || args.ensureTopics < 1) {
    throw new Error("--ensure-topics must be a positive integer");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }

  return args;
}

function loadApiKey() {
  if (process.env.DEEPSEEK_API_KEY?.trim()) return process.env.DEEPSEEK_API_KEY.trim();
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return "";
  const match = fs.readFileSync(envPath, "utf8").match(/^DEEPSEEK_API_KEY=(.+)$/m);
  return match?.[1]?.trim() || "";
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

  ensureColumn(db, "passages", "content_hash", "TEXT");
  ensureColumn(db, "passages", "jic_sentences_json", "TEXT");
  ensureColumn(db, "passages", "jic_code", "TEXT");
  ensureColumn(db, "passages", "source_title", "TEXT");
  ensureColumn(db, "passages", "source_author", "TEXT");
  ensureColumn(db, "passages", "source_identifier", "TEXT");
  ensureColumn(db, "passages", "source_license", "TEXT");
  ensureColumn(db, "passages", "source_locator", "TEXT");
  ensureColumn(db, "passages", "verification_status", "TEXT NOT NULL DEFAULT 'approved'");
  ensureColumn(db, "passages", "review_notes", "TEXT");
  ensureColumn(db, "passages", "reviewed_at", "TEXT");
  ensureColumn(db, "passage_cache_entries", "style_template_id", "TEXT");
  ensureColumn(db, "passage_cache_entries", "generation_tier", "TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn(db, "passage_cache_entries", "prompt_hash", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "passage_cache_entries", "token_budget", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "passage_cache_entries", "use_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "passage_cache_entries", "last_used_at", "TEXT");
  ensureColumn(db, "passage_cache_entries", "created_at", "TEXT NOT NULL DEFAULT ''");

  db.run("CREATE INDEX IF NOT EXISTS idx_passages_content_hash ON passages(content_hash)");
  db.run("CREATE INDEX IF NOT EXISTS idx_passages_style_template_id ON passages(style_template_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cache_prompt_hash ON passage_cache_entries(prompt_hash)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cache_template_tier ON passage_cache_entries(style_template_id, generation_tier)");
}

function ensureColumn(db, table, column, typeSql) {
  const result = db.exec(`PRAGMA table_info(${table})`);
  const columns = new Set((result[0]?.values ?? []).map((col) => col[1]));
  if (!columns.has(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  }
}

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

function ensureTopicCount(db, targetCount) {
  const now = new Date().toISOString();
  const currentCount = Number(queryValue(db, "SELECT COUNT(*) AS count FROM style_templates") ?? 0);
  const needed = Math.max(0, targetCount - currentCount);
  if (needed === 0) return 0;

  const existingIds = new Set(queryRows(db, "SELECT id FROM style_templates").map((row) => row.id));
  const existingNames = new Set(queryRows(db, "SELECT name FROM style_templates").map((row) => row.name));
  const insert = db.prepare("INSERT INTO style_templates (id, name, prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  let added = 0;
  for (const preset of TOPIC_PRESETS) {
    if (added >= needed) break;
    if (existingIds.has(preset.id) || existingNames.has(preset.name)) continue;
    insert.run([preset.id, preset.name, preset.prompt, 0, now, now]);
    added += 1;
  }
  insert.free();

  if (added < needed) {
    throw new Error(`Only added ${added} topics; need ${needed}. Add more TOPIC_PRESETS.`);
  }
  return added;
}

function getTemplates(db, args) {
  let templates = queryRows(db, "SELECT id, name, prompt, is_default, created_at FROM style_templates ORDER BY created_at, id");
  if (args.onlyTopic) {
    templates = templates.filter((template) => template.id === args.onlyTopic || template.name === args.onlyTopic);
  }
  if (args.topicLimit > 0) {
    templates = templates.slice(0, args.topicLimit);
  }
  return templates;
}

function isExplicitTemplate(template) {
  const haystack = `${template.name}\n${template.prompt}`.toLowerCase();
  return /\bnsfw\b|erotic|porno|pornographic|sexual|penetration|creampie|breeding|cock|pussy|cervix|orgasm|sex|性交|性行為|露骨|ポルノ|下品な語彙/.test(haystack);
}

function generationStylePrompt(template) {
  if (!isExplicitTemplate(template)) return template.prompt;
  return [
    "Write a mature literary Japanese passage for adult learners about attraction, secrecy, intimacy, hesitation, and emotional tension.",
    "Use refined modern prose, sensory details such as light, breath, silence, distance, clothing, warmth, and restrained dialogue.",
    "Keep it non-explicit: do not describe sexual acts, genitals, penetration, bodily fluids, orgasm, or pornographic details.",
    "The tone may be sensual and psychologically intense, but it must remain suitable as literary language-study material.",
  ].join(" ");
}

function buildPrompt(template, tier, slot, runId) {
  const rules = TIER_RULES[tier];
  const stylePrompt = generationStylePrompt(template);
  return `You are a Japanese language content generator for an intensive reading tool.

STYLE TOPIC: ${template.name}
STYLE: ${stylePrompt}

SEED SLOT: ${runId}/${template.id}/${slot}
Create a materially unique passage for this exact seed slot. Avoid repeating titles, scenes, imagery, and vocabulary from likely previous outputs.

LENGTH TIER: ${tier}
${rules.paragraphGuidance}
${rules.lengthGuidance}
${rules.tokenHint}

RULES:
- Write natural Japanese, not textbook sentences.
- Use varied sentence structures and vivid but readable imagery.
- Include 1-5 grammar points that are actually used in the passage.
- Split paragraphs into segments: kanji-containing words or phrases (is_kanji:true) and kana/punctuation runs (is_kanji:false).
- Provide hiragana furigana readings for ALL kanji-containing segments.
- translation: natural, idiomatic English.
- word_gloss: list at least 8 important content words with readings, POS, and English glosses.
- Keep explanations and glosses in English.
- Do not mention Chinese, translation from Chinese, or Chinese-native interference.
- Do not output explicit sexual content. If the topic is mature, keep it restrained and literary.

OUTPUT: A single JSON object (no markdown, no code fences):
{
  "title_ja": "string",
  "title_en": "string",
  "paragraphs": [{ "annotated": [{ "surface": "str", "reading": "str", "is_kanji": bool }] }],
  "grammar_points": [{ "pattern": "str", "explanation_en": "str" }],
  "translation": "str",
  "word_gloss": [{ "word": "str", "reading": "str", "pos": "noun|verb|adjective|adverb|particle|conjunction|interjection|pronoun|auxiliary|other", "gloss_en": "str" }]
}`;
}

function promptHash(template, tier) {
  const rules = TIER_RULES[tier];
  const appPrompt = `You are a Japanese language content generator for an intensive reading tool.

STYLE: ${template.prompt}

LENGTH TIER: ${tier}
${rules.paragraphGuidance}
${rules.lengthGuidance}
${rules.tokenHint}

RULES:
- Write natural, literary Japanese — NOT textbook sentences
- Use varied sentence structures and vivid imagery
- Include 1-5 grammar points
- Split paragraphs into segments: kanji-containing words (is_kanji:true) and kana/punctuation runs (is_kanji:false)
- Provide furigana readings for ALL kanji
- translation: natural, idiomatic English
- word_gloss: list ALL content words with readings, POS, and English glosses
- Be creative — avoid repeating similar themes or vocabulary

OUTPUT: A single JSON object (no markdown, no code fences):
{
  "title_ja": "string",
  "title_en": "string",
  "paragraphs": [{ "annotated": [{ "surface": "str", "reading": "str", "is_kanji": bool }] }],
  "grammar_points": [{ "pattern": "str", "explanation_en": "str" }],
  "translation": "str",
  "word_gloss": [{ "word": "str", "reading": "str", "pos": "noun|verb|adjective|adverb|particle|conjunction|interjection|pronoun|auxiliary|other", "gloss_en": "str" }]
}`;
  return crypto.createHash("sha256").update(appPrompt).digest("hex").slice(0, 12);
}

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]);
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    }
    throw error;
  }
}

function hasKanji(text) {
  return /[一-龯]/.test(text);
}

function containsJapanese(text) {
  return /[ぁ-んァ-ン一-龯]/.test(text);
}

function validateAndNormalize(raw) {
  const errors = [];
  const obj = raw && typeof raw === "object" ? raw : {};

  if (typeof obj.title_ja !== "string" || !obj.title_ja.trim()) errors.push("title_ja must be non-empty");
  if (typeof obj.title_en !== "string" || !obj.title_en.trim()) errors.push("title_en must be non-empty");
  if (!Array.isArray(obj.paragraphs) || obj.paragraphs.length === 0) errors.push("paragraphs must be non-empty");
  if (!Array.isArray(obj.grammar_points) || obj.grammar_points.length === 0) errors.push("grammar_points must be non-empty");
  if (typeof obj.translation !== "string" || obj.translation.length < 20) errors.push("translation must be at least 20 characters");
  if (!Array.isArray(obj.word_gloss) || obj.word_gloss.length < 5) errors.push("word_gloss must have at least 5 items");
  if (errors.length > 0) return { errors, passage: null };

  const paragraphs = obj.paragraphs.slice(0, 3).map((paragraph, pIndex) => {
    const annotated = Array.isArray(paragraph?.annotated) ? paragraph.annotated : [];
    if (annotated.length === 0) errors.push(`paragraphs[${pIndex}].annotated must be non-empty`);
    const normalizedSegments = annotated.map((segment, sIndex) => {
      const surface = typeof segment?.surface === "string" ? segment.surface : "";
      const reading = typeof segment?.reading === "string" ? segment.reading : "";
      let isKanji = segment?.is_kanji;
      if (isKanji === "true") isKanji = true;
      if (isKanji === "false") isKanji = false;
      if (!surface) errors.push(`paragraphs[${pIndex}].annotated[${sIndex}].surface missing`);
      if (!reading) errors.push(`paragraphs[${pIndex}].annotated[${sIndex}].reading missing`);
      if (typeof isKanji !== "boolean") errors.push(`paragraphs[${pIndex}].annotated[${sIndex}].is_kanji must be boolean`);
      if (isKanji === true && !hasKanji(surface)) errors.push(`paragraphs[${pIndex}].annotated[${sIndex}] marked kanji but surface has none`);
      if (isKanji === true && hasKanji(reading)) errors.push(`paragraphs[${pIndex}].annotated[${sIndex}].reading must be kana`);
      return { surface, reading, is_kanji: Boolean(isKanji) };
    });
    return {
      text: normalizedSegments.map((segment) => segment.surface).join(""),
      annotated: normalizedSegments,
    };
  });

  const fullText = paragraphs.map((paragraph) => paragraph.text).join("\n");
  if (!containsJapanese(fullText)) errors.push("passage text must contain Japanese");

  const grammarPoints = obj.grammar_points.slice(0, 5).map((point, index) => {
    const pattern = typeof point?.pattern === "string" ? point.pattern : "";
    const explanation = typeof point?.explanation_en === "string" ? point.explanation_en : "";
    if (!pattern) errors.push(`grammar_points[${index}].pattern missing`);
    if (explanation.length < 10) errors.push(`grammar_points[${index}].explanation_en too short`);
    return { pattern, explanation_en: explanation };
  });

  const wordGloss = obj.word_gloss.map((word, index) => {
    const item = {
      word: typeof word?.word === "string" ? word.word : "",
      reading: typeof word?.reading === "string" ? word.reading : "",
      pos: VALID_POS.has(word?.pos) ? word.pos : "other",
      gloss_en: typeof word?.gloss_en === "string" ? word.gloss_en : "",
    };
    if (!item.word) errors.push(`word_gloss[${index}].word missing`);
    if (!item.reading || hasKanji(item.reading)) errors.push(`word_gloss[${index}].reading must be kana`);
    if (!item.gloss_en) errors.push(`word_gloss[${index}].gloss_en missing`);
    return item;
  }).filter((word) => word.word && word.reading && word.gloss_en);

  return {
    errors,
    passage: errors.length > 0 ? null : {
      title_ja: obj.title_ja.trim(),
      title_en: obj.title_en.trim(),
      paragraphs,
      grammar_points: grammarPoints,
      translation: obj.translation,
      word_gloss: wordGloss,
    },
  };
}

function hashContent(paragraphs) {
  const text = paragraphs.map((p) => p.annotated.map((s) => s.surface).join("")).join("|");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function sourceIdentifier(runId, templateId, slot) {
  return `${runId}:${templateId}:${String(slot).padStart(3, "0")}`;
}

function existingSeedSlots(db, runId, templateId) {
  const prefix = `${runId}:${templateId}:%`;
  const rows = queryRows(db, "SELECT source_identifier FROM passages WHERE source_identifier LIKE ?", [prefix]);
  const slots = new Set();
  for (const row of rows) {
    const match = String(row.source_identifier).match(/:(\d{3})$/);
    if (match) slots.add(Number(match[1]));
  }
  return slots;
}

function contentHashExists(db, contentHash) {
  return Number(queryValue(db, "SELECT COUNT(*) AS count FROM passages WHERE content_hash = ? AND verification_status = ?", [contentHash, APPROVED_STATUS]) ?? 0) > 0;
}

async function requestPassage(apiKey, template, tier, slot, runId, retryNote) {
  const prompt = `${buildPrompt(template, tier, slot, runId)}${retryNote ? `\n\nRetry note: ${retryNote}` : ""}`;
  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a Japanese language content generator. Always respond with valid JSON only. No markdown, no code fences.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.72,
      max_tokens: TIER_RULES[tier].maxTokens,
      response_format: { type: "json_object" },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from DeepSeek");
  return parseJson(content);
}

async function generateOne(apiKey, db, template, args, slot) {
  let lastErrors = [];
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const retryNote = lastErrors.length > 0
      ? `Previous attempt failed: ${lastErrors.slice(0, 6).join("; ")}. Fix these issues.`
      : "";
    try {
      const raw = await requestPassage(apiKey, template, args.tier, slot, args.runId, retryNote);
      const { errors, passage } = validateAndNormalize(raw);
      if (errors.length > 0 || !passage) {
        lastErrors = errors;
        continue;
      }
      const contentHash = hashContent(passage.paragraphs);
      if (contentHashExists(db, contentHash)) {
        lastErrors = ["duplicate content hash; create a materially different scene and vocabulary set"];
        continue;
      }
      return { passage, contentHash };
    } catch (error) {
      lastErrors = [(error instanceof Error ? error.message : String(error))];
    }
  }
  throw new Error(lastErrors.join("; ") || "unknown generation error");
}

function insertPassage(db, template, args, slot, generated) {
  const now = new Date().toISOString();
  const id = nanoid();
  const sourceId = sourceIdentifier(args.runId, template.id, slot);
  const insertPassageStmt = db.prepare("INSERT INTO passages (id, title_ja, title_en, paragraphs_json, grammar_points_json, translation, word_gloss_json, jic_sentences_json, jic_code, style_template_id, llm_model, content_hash, source_title, source_author, source_identifier, source_license, source_locator, verification_status, review_notes, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  insertPassageStmt.run([
    id,
    generated.passage.title_ja,
    generated.passage.title_en,
    JSON.stringify(generated.passage.paragraphs),
    JSON.stringify(generated.passage.grammar_points),
    generated.passage.translation,
    JSON.stringify(generated.passage.word_gloss),
    null,
    null,
    template.id,
    DEEPSEEK_MODEL,
    generated.contentHash,
    `Bulk seed: ${template.name}`,
    "DeepSeek generated, KanaLens validated",
    sourceId,
    "Generated seed material for local language study",
    null,
    APPROVED_STATUS,
    isExplicitTemplate(template) ? "Generated from a non-explicit mature-literary substitute prompt for safety." : null,
    now,
    now,
  ]);
  insertPassageStmt.free();

  const insertCacheStmt = db.prepare("INSERT OR IGNORE INTO passage_cache_entries (passage_id, style_template_id, generation_tier, prompt_hash, token_budget, use_count, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  insertCacheStmt.run([id, template.id, args.tier, promptHash(template, args.tier), TIER_RULES[args.tier].maxTokens, 0, null, now]);
  insertCacheStmt.free();
}

function saveDb(db, dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function printCounts(db, runId) {
  const counts = queryRows(db, `SELECT style_templates.name AS name, COUNT(passages.id) AS total,
    SUM(CASE WHEN passages.source_identifier LIKE ? THEN 1 ELSE 0 END) AS seeded
    FROM style_templates
    LEFT JOIN passages ON passages.style_template_id = style_templates.id AND passages.verification_status = 'approved'
    GROUP BY style_templates.id, style_templates.name
    ORDER BY style_templates.created_at, style_templates.id`, [`${runId}:%`]);
  for (const row of counts) {
    console.log(`${row.name}: total=${row.total ?? 0} seeded_this_run=${row.seeded ?? 0}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = loadApiKey();
  if (!apiKey && !args.dryRun) {
    throw new Error("Missing DEEPSEEK_API_KEY. Set it in the environment or .env.local.");
  }

  const SQL = await initSqlJs();
  const existing = fs.existsSync(args.dbPath) ? fs.readFileSync(args.dbPath) : undefined;
  const db = new SQL.Database(existing);
  createTables(db);

  const addedTopics = ensureTopicCount(db, args.ensureTopics);
  if (addedTopics > 0) {
    saveDb(db, args.dbPath);
    console.log(`Added ${addedTopics} style templates to reach ${args.ensureTopics} topics.`);
  }

  const templates = getTemplates(db, args);
  if (templates.length === 0) {
    throw new Error("No templates selected.");
  }

  console.log(`Selected ${templates.length} topics. Target: add ${args.perTopic} passages/topic for run ${args.runId}. Concurrency=${args.concurrency}.`);
  if (args.dryRun) {
    printCounts(db, args.runId);
    db.close();
    return;
  }

  let inserted = 0;
  let failed = 0;

  for (const template of templates) {
    const slots = existingSeedSlots(db, args.runId, template.id);
    const explicitNote = isExplicitTemplate(template) ? " safe-substitute" : "";
    console.log(`\n[Topic] ${template.name} (${template.id}) existing_seed_slots=${slots.size}${explicitNote}`);

    const pendingSlots = [];
    for (let slot = 1; slot <= args.perTopic; slot += 1) {
      if (!slots.has(slot)) pendingSlots.push(slot);
    }
    let cursor = 0;
    let launched = 0;
    const effectiveConcurrency = args.limitTotal > 0 ? 1 : Math.min(args.concurrency, pendingSlots.length);

    async function worker() {
      while (cursor < pendingSlots.length) {
        if (args.limitTotal > 0 && launched >= args.limitTotal) return;
        const slot = pendingSlots[cursor];
        cursor += 1;
        launched += 1;
      const label = `${template.name} ${slot}/${args.perTopic}`;
      try {
        const generated = await generateOne(apiKey, db, template, args, slot);
        insertPassage(db, template, args, slot, generated);
        inserted += 1;
        slots.add(slot);
        saveDb(db, args.dbPath);
        console.log(`[OK] ${label}: ${generated.passage.title_ja}`);
      } catch (error) {
        failed += 1;
        console.warn(`[FAIL] ${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    }

    await Promise.all(Array.from({ length: effectiveConcurrency }, () => worker()));

    if (args.limitTotal > 0 && inserted >= args.limitTotal) {
      saveDb(db, args.dbPath);
      console.log(`Limit reached. Inserted ${inserted}, failed ${failed}.`);
      printCounts(db, args.runId);
      db.close();
      return;
    }
  }

  saveDb(db, args.dbPath);
  console.log(`\nDone. Inserted ${inserted}, failed ${failed}.`);
  printCounts(db, args.runId);
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
