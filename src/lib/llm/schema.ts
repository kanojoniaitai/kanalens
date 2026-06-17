export const passageJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "JapanesePassage",
  type: "object",
  required: [
    "title_ja",
    "title_en",
    "paragraphs",
    "grammar_points",
    "translation",
    "word_gloss",
  ],
  additionalProperties: false,
  properties: {
    plan: {
      type: "object",
      description: "Silent generation plan filled before writing. Not surfaced to the learner.",
      additionalProperties: false,
      properties: {
        theme: { type: "string" },
        mood: { type: "string" },
        setting: { type: "string" },
        grammar_targets: { type: "array", items: { type: "string" } },
        beats: { type: "array", items: { type: "string" } },
      },
    },
    title_ja: {
      type: "string",
      minLength: 1,
      maxLength: 100,
      description: "Japanese title — literary and evocative",
    },
    title_en: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      description: "English translation of the title",
    },
    paragraphs: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      description: "1-3 paragraphs of literary Japanese with furigana annotations",
      items: {
        type: "object",
        required: ["annotated"],
        additionalProperties: false,
        properties: {
          annotated: {
            type: "array",
            description: "Split paragraph into segments: kanji-containing words (is_kanji:true) and kana/punctuation runs (is_kanji:false). Provide furigana readings for ALL kanji.",
            items: {
              type: "object",
              required: ["surface", "reading", "is_kanji"],
              additionalProperties: false,
              properties: {
                surface: {
                  type: "string",
                  description: "The text as it appears in the passage",
                },
                reading: {
                  type: "string",
                  description: "Hiragana reading for this segment",
                },
                is_kanji: {
                  type: "boolean",
                  description: "true if this segment contains kanji characters",
                },
              },
            },
          },
        },
      },
    },
    grammar_points: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      description: "1-5 grammar patterns used in the passage",
      items: {
        type: "object",
        required: ["pattern", "explanation_en"],
        additionalProperties: false,
        properties: {
          pattern: {
            type: "string",
            description: "The grammar pattern (e.g. 〜ばかりではなく)",
          },
          explanation_en: {
            type: "string",
            minLength: 10,
            description: "English explanation of the grammar pattern, at least 10 characters",
          },
        },
      },
    },
    translation: {
      type: "string",
      minLength: 20,
      description: "Natural, idiomatic English translation of the entire passage",
    },
    word_gloss: {
      type: "array",
      minItems: 5,
      description: "List ALL content words (nouns, verbs, adjectives, adverbs) with readings, POS, and English glosses",
      items: {
        type: "object",
        required: ["word", "reading", "pos", "gloss_en"],
        additionalProperties: false,
        properties: {
          word: {
            type: "string",
            description: "The word as it appears in the passage",
          },
          reading: {
            type: "string",
            description: "Hiragana reading of the word",
          },
          pos: {
            type: "string",
            enum: [
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
            ],
            description: "Part of speech",
          },
          gloss_en: {
            type: "string",
            description: "English meaning/translation of the word",
          },
        },
      },
    },
  },
} as const;

export const jicJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "JICOutput",
  type: "object",
  required: ["jic_sentences"],
  additionalProperties: false,
  properties: {
    jic_sentences: {
      type: "array",
      minItems: 1,
      description: "JIC-Han enrichment output for each sentence",
      items: {
        type: "object",
        required: ["original", "kanbun_core", "particle_reconstruction"],
        additionalProperties: false,
        properties: {
          original: {
            type: "string",
            description: "The original Japanese sentence",
          },
          kanbun_core: {
            type: "string",
            description: "The zero-particle kanbun-style semantic skeleton",
          },
          particle_reconstruction: {
            type: "array",
            items: {
              type: "object",
              required: ["surface", "particle", "role"],
              additionalProperties: false,
              properties: {
                surface: { type: "string" },
                particle: { type: "string" },
                role: { type: "string" },
                reason: { type: "string" },
              },
            },
          },
          insight: {
            type: "string",
            description: "One concise learning insight about the stripped sentence",
          },
        },
      },
    },
  },
} as const;
