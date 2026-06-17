export type GenerationTier = "short" | "normal" | "long";
export type PassageVerificationStatus = "draft" | "reviewed" | "approved" | "rejected";

export type PartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "particle"
  | "conjunction"
  | "interjection"
  | "pronoun"
  | "auxiliary"
  | "other";

export interface AnnotatedSegment {
  surface: string;
  reading: string;
  is_kanji: boolean;
}

export interface Paragraph {
  text: string;
  annotated: AnnotatedSegment[];
}

export interface LLMParagraph {
  annotated: AnnotatedSegment[];
}

export interface GrammarPoint {
  pattern: string;
  explanation_en: string;
}

export interface WordGloss {
  word: string;
  reading: string;
  pos: PartOfSpeech;
  gloss_en: string;
}

export interface JICSentenceCode {
  original: string;
  jic_code: string;
  kanbun_core?: string;
  particle_reconstruction?: JICParticleReconstruction[];
  insight?: string;
  kanbun_source?: "local-rule" | "llm-validated";
  kanbun_confidence?: "high" | "medium" | "low";
  kanbun_warnings?: string[];
}

export interface JICParticleReconstruction {
  surface: string;
  particle: string;
  role: string;
  reason?: string;
}

export interface TransJapPractice {
  prompt: string;
  model: string;
}

export interface TransJapReviewMetadata {
  integration?: "transjap" | string;
  schemaVersion?: number;
  corpusId?: number;
  pack?: number;
  sourceFile?: string;
  theme?: string;
  level?: string;
  targetWords?: string[];
  learnerTrap?: string;
  practice?: TransJapPractice | null;
}

export interface LLMPassageOutput {
  title_ja: string;
  title_en: string;
  paragraphs: LLMParagraph[];
  grammar_points: GrammarPoint[];
  translation: string;
  word_gloss: WordGloss[];
}

export interface Passage extends LLMPassageOutput {
  id: string;
  created_at: string;
  llm_model: string;
  style_template_id: string | null;
  content_hash: string | null;
  source_title: string | null;
  source_author: string | null;
  source_identifier: string | null;
  source_license: string | null;
  source_locator: string | null;
  verification_status: PassageVerificationStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  paragraphs: Paragraph[];
  jic_sentences?: JICSentenceCode[];
  jic_code: string | null;
}

export interface Vocabulary {
  id: string;
  word: string;
  reading: string;
  pos: PartOfSpeech;
  gloss_en: string;
  source_passage_id: string | null;
  review_count: number;
  ease_factor: number;
  next_review_at: string | null;
  last_review_at: string | null;
  created_at: string;
}

export interface StyleTemplate {
  id: string;
  name: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PassageSummary {
  id: string;
  title_ja: string;
  style_template_id: string | null;
  verification_status: PassageVerificationStatus;
  source_title: string | null;
  source_author: string | null;
  created_at: string;
}

export interface GrammarSave {
  id: string;
  pattern: string;
  explanation_en: string;
  source_passage_id: string | null;
  created_at: string;
}

export type StudyExerciseKind = "particle" | "vocabulary" | "translation" | "grammar" | "structure";

export interface MistakeRecord {
  id: string;
  passage_id: string | null;
  exercise_id: string;
  module: string;
  category: string;
  prompt: string;
  user_answer: string;
  expected_answer: string;
  severity: number;
  rationale: string;
  created_at: string;
}

export interface ReadingStat {
  id: string;
  date: string;
  passages_read: number;
  words_learned: number;
  time_spent_ms: number;
}

export interface FlashcardItem {
  vocabulary: Vocabulary;
  state: "new" | "learning" | "review" | "relearning";
}

export type SRSRating = 1 | 2 | 3 | 4 | 5;
