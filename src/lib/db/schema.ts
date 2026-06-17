import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const passages = sqliteTable("passages", {
  id: text("id").primaryKey(),
  title_ja: text("title_ja").notNull(),
  title_en: text("title_en").notNull(),
  paragraphs_json: text("paragraphs_json").notNull(),
  grammar_points_json: text("grammar_points_json").notNull(),
  translation: text("translation").notNull(),
  word_gloss_json: text("word_gloss_json").notNull(),
  jic_sentences_json: text("jic_sentences_json"),
  jic_code: text("jic_code"),
  style_template_id: text("style_template_id"),
  llm_model: text("llm_model").notNull(),
  content_hash: text("content_hash"),
  source_title: text("source_title"),
  source_author: text("source_author"),
  source_identifier: text("source_identifier"),
  source_license: text("source_license"),
  source_locator: text("source_locator"),
  verification_status: text("verification_status").notNull().default("approved"),
  review_notes: text("review_notes"),
  reviewed_at: text("reviewed_at"),
  created_at: text("created_at").notNull(),
});

export const passageCacheEntries = sqliteTable("passage_cache_entries", {
  passage_id: text("passage_id").primaryKey(),
  style_template_id: text("style_template_id"),
  generation_tier: text("generation_tier").notNull(),
  prompt_hash: text("prompt_hash").notNull(),
  token_budget: integer("token_budget").notNull(),
  use_count: integer("use_count").notNull().default(0),
  last_used_at: text("last_used_at"),
  created_at: text("created_at").notNull(),
});

export const vocabularies = sqliteTable("vocabularies", {
  id: text("id").primaryKey(),
  word: text("word").notNull(),
  reading: text("reading").notNull(),
  pos: text("pos").notNull(),
  gloss_en: text("gloss_en").notNull(),
  source_passage_id: text("source_passage_id"),
  review_count: integer("review_count").notNull().default(0),
  ease_factor: real("ease_factor").notNull().default(2.5),
  next_review_at: text("next_review_at"),
  last_review_at: text("last_review_at"),
  created_at: text("created_at").notNull(),
});

export const dictionaryEntries = sqliteTable("dictionary_entries", {
  id: text("id").primaryKey(),
  expression: text("expression").notNull(),
  reading: text("reading").notNull(),
  meaning: text("meaning").notNull(),
  source: text("source").notNull(),
  source_identifier: text("source_identifier"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const styleTemplates = sqliteTable("style_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  is_default: integer("is_default", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const grammars = sqliteTable("grammars", {
  id: text("id").primaryKey(),
  pattern: text("pattern").notNull(),
  explanation_en: text("explanation_en").notNull(),
  source_passage_id: text("source_passage_id"),
  created_at: text("created_at").notNull(),
});

export const readingStats = sqliteTable("reading_stats", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  passages_read: integer("passages_read").notNull().default(0),
  words_learned: integer("words_learned").notNull().default(0),
  time_spent_ms: integer("time_spent_ms").notNull().default(0),
});

export const mistakeRecords = sqliteTable("mistake_records", {
  id: text("id").primaryKey(),
  passage_id: text("passage_id"),
  exercise_id: text("exercise_id").notNull(),
  module: text("module").notNull(),
  category: text("category").notNull(),
  prompt: text("prompt").notNull(),
  user_answer: text("user_answer").notNull(),
  expected_answer: text("expected_answer").notNull(),
  severity: real("severity").notNull(),
  rationale: text("rationale").notNull(),
  created_at: text("created_at").notNull(),
});
