/**
 * JIC-Lite: Japanese Intermediate Compiler — Lite Edition
 * Type definitions for the three-phase compilation pipeline.
 *
 * Core philosophy: Logic before form. Syntax transparency. Variables retain kanji. Operators in English.
 */

// ─── Token Types ───────────────────────────────────────────────

export type TokenCategory = "variable" | "operator" | "method";

export type VariableSubtype =
  | "kanji_noun"       // 漢字+假名混合名词: 友達, 勉強
  | "pure_kanji_noun"  // 纯汉字名词: 私, 日本
  | "katakana_noun"    // 外来语片假名: プレゼント
  | "verb_stem"        // 动词词干: 食べ, 書
  | "adj_stem"         // 形容词词干: 美味し, 高
  | "pronoun"          // 代词: 彼, これ
  | "numeral"          // 数词: 3時, 10分
  | "adverbial_noun"   // 副词性名词: 今日, 全部
  | "conjunctive"      // 接续词: しかし, そして
  | "interjection";    // 感动词: ああ, はい

export type OperatorSubtype =
  | "case_particle"      // 格助词: が, を, に, で, へ, から, まで, より, の
  | "adverbial_particle" // 副助词: は, も, と, だけ, しか, でも, ほど, くらい, ばかり, など, こそ, さえ, すら
  | "sentence_final"     // 终助词: か, ね, よ, な, わ, ぞ
  | "compound_particle"; // 复合助词: について, にとって, によって, として, etc.

export type MethodSubtype =
  | "tense"       // 时态: .past()
  | "polarity"    // 极性: .not()
  | "voice"       // 语态: .passive(), .causative(), .can()
  | "mood"        // 情态: .want(), .vol()
  | "connective"  // 连接: .then(), .if()
  | "politeness"  // 语体: .polite()
  | "honorific"   // 敬语: .hon(), .hum()
  | "aspect"      // 体: .exist(), .exist_intent(), .complete(), .go(), .come()
  | "nominalize"  // 名词化: .nominalize()
  | "seems"       // 样态: .seems()
  | "possible"    // 可能性: .possible()
  | "formal_neg"; // 书面否定: .not_formal()

// ─── Token ────────────────────────────────────────────────────

export interface JICToken {
  /** Original Japanese surface form */
  surface: string;
  /** Token category */
  category: TokenCategory;
  /** Sub-type within the category */
  subtype: VariableSubtype | OperatorSubtype | MethodSubtype;
  /** For variables: the variable name (retained kanji form); for operators: the English keyword; for methods: the method name */
  value: string;
  /** Position in the original sentence */
  position: number;
  /** Hiragana reading (for variables) */
  reading?: string;
  /** Lemma/dictionary form (for verbs/adjectives) */
  lemma?: string;
}

// ─── Syntax Tree ──────────────────────────────────────────────

export interface JICVariableNode {
  type: "variable";
  token: JICToken;
  /** Attached operators (particles bound to this variable) */
  operators: JICOperatorNode[];
  /** Attached methods (conjugation chain bound to this variable) */
  methods: JICMethodNode[];
}

export interface JICOperatorNode {
  type: "operator";
  token: JICToken;
  /** The variable this operator binds to */
  boundTo: JICVariableNode | null;
}

export interface JICMethodNode {
  type: "method";
  token: JICToken;
  /** The variable this method attaches to */
  boundTo: JICVariableNode | null;
}

export type JICNode = JICVariableNode | JICOperatorNode | JICMethodNode;

export interface JICSentence {
  /** Ordered list of nodes representing the sentence */
  nodes: JICNode[];
  /** The original Japanese sentence */
  original: string;
  /** The compiled JIC-Lite intermediate code */
  compiled: string;
  /** Any warnings during compilation */
  warnings: JICWarning[];
}

// ─── Method Chain Layer Order (Section 5.1) ─────────────────

/**
 * Method chain MUST follow this strict layer order (inner → outer):
 * 5. Polarity:    .not()           — innermost, first applied
 * 4. Voice:       .passive() / .causative() / .can()
 * 3. Mood:        .want() / .vol()
 * 2. Connective:  .then() / .if()
 * 1. Tense/Polite: .past() / .polite()  — outermost, last applied
 */
export const METHOD_CHAIN_ORDER: Record<MethodSubtype, number> = {
  polarity: 5,
  voice: 4,
  mood: 3,
  connective: 2,
  tense: 1,
  politeness: 1,
  honorific: 0,
  aspect: 2,
  nominalize: 6,
  seems: 6,
  possible: 4,
  formal_neg: 5,
};

// ─── Errors & Warnings ────────────────────────────────────────

export type JICErrorCode =
  | "E001" // CASE_COLLISION
  | "E002" // OP_ORDER_CONFLICT
  | "E003" // CHAIN_ORDER_VIOLATION
  | "E004" // ONLY_NEG_MISMATCH
  | "E005" // WANT_MUST_CONFLICT
  | "E006" // DOUBLE_NEG
  | "E007" // KEIGO_CONFLICT
  | "E008" // QUES_TOPIC_CONFLICT
  | "E009" // CONDITIONAL_PROHIBITIVE
  | "E010"; // AMBIGUOUS_PARTICLE

export interface JICWarning {
  code: JICErrorCode;
  message: string;
  position?: number;
  autoFixed: boolean;
}

export interface JICCompilationResult {
  sentences: JICSentence[];
  fullCode: string;
  warnings: JICWarning[];
}

// ─── LLM Integration Types ────────────────────────────────────

export interface JICSentenceOutput {
  original: string;
  jic_code: string;
  tokens: Array<{
    surface: string;
    category: TokenCategory;
    value: string;
    reading?: string;
  }>;
}

export interface JICPassageOutput {
  sentences: JICSentenceOutput[];
}
