/**
 * JIC-Lite Operator & Method Dictionaries
 * Complete mapping tables from Section 4 & 5 of the specification.
 */

// ─── Case Particles (格助词) — Section 4.1 ──────────────────

export const CASE_PARTICLE_MAP: Record<string, { keyword: string; function: string; disambiguation?: string }> = {
  "が":   { keyword: "SUBJ",     function: "主语/存在主体" },
  "を":   { keyword: "TARGET",   function: "及物动词的直接宾语" },
  "に":   { keyword: "INTO",     function: "目的地/归着点", disambiguation: "multi" },
  "で":   { keyword: "AT",       function: "动作发生的场所", disambiguation: "multi" },
  "へ":   { keyword: "TOWARD",   function: "方向性移动目标" },
  "から": { keyword: "FROM",     function: "空间/时间起点" },
  "まで": { keyword: "UNTIL",    function: "空间/时间终点" },
  "より": { keyword: "THAN",     function: "比较基准" },
  "の":   { keyword: "OF",       function: "所属/属性" },
};

// に disambiguation variants
export const NI_VARIANTS: Record<string, { keyword: string; condition: string }> = {
  TIME:    { keyword: "TIME",    condition: "右侧变量类型为时间类" },
  INTO:    { keyword: "INTO",    condition: "右侧变量为地点且动词为移动类" },
  GIVE_TO: { keyword: "GIVE_TO", condition: "右侧变量为人/动物" },
  AT:      { keyword: "AT",      condition: "右侧变量为地点类（默认）" },
};

// で disambiguation variants
export const DE_VARIANTS: Record<string, { keyword: string; condition: string }> = {
  USING: { keyword: "USING", condition: "右侧变量为工具/语言/交通类" },
  AT:    { keyword: "AT",    condition: "右侧变量为具体地点类" },
  SCOPE: { keyword: "SCOPE", condition: "动词为完成/实现类" },
};

// ─── Adverbial Particles (副助词) — Section 4.2 ─────────────

export const ADVERBIAL_PARTICLE_MAP: Record<string, { keyword: string; function: string }> = {
  "は":     { keyword: "TOPIC",      function: "话题声明" },
  "も":     { keyword: "ALSO",       function: "并列追加" },
  "と":     { keyword: "AND",        function: "并列列举 / 共同参与者" },
  "だけ":   { keyword: "ONLY",       function: "排他限定（肯定）" },
  "しか":   { keyword: "ONLY-NEG",   function: "排他限定（否定，必须搭配 .not()）" },
  "でも":   { keyword: "EVEN",       function: "极端示例 / 不确定选择" },
  "ほど":   { keyword: "DEGREE",     function: "程度标定" },
  "くらい": { keyword: "ABOUT",      function: "大致程度/数量" },
  "ばかり": { keyword: "ONLY_FOCUS", function: "主观聚焦限定" },
  "など":   { keyword: "SUCH_AS",    function: "示例列举" },
  "こそ":   { keyword: "PRECISELY",  function: "强调锁定" },
  "さえ":   { keyword: "EVEN",       function: "极端示例" },
  "すら":   { keyword: "NOT_EVEN",   function: "书面极端" },
};

// ─── Sentence-Final Particles (终助词) — Section 4.3 ────────

export const SENTENCE_FINAL_MAP: Record<string, { keyword: string; type: string }> = {
  "か": { keyword: "QUES",         type: "疑问句" },
  "ね": { keyword: "CONFIRM",      type: "确认请求" },
  "よ": { keyword: "ASSERT",       type: "信息断言" },
  "な": { keyword: "MONOLOGUE",    type: "自言自语" },
  "わ": { keyword: "SOFT_ASSERT",  type: "柔性断言" },
  "ぞ": { keyword: "STRONG_ASSERT", type: "强断言" },
};

// ─── Compound Particles (复合助词) — Section 4.4 ────────────

export const COMPOUND_PARTICLE_MAP: Record<string, { keyword: string; function: string }> = {
  "ので":       { keyword: "CAUSE",            function: "原因・理由" },
  "について":   { keyword: "ABOUT",            function: "话题范围声明" },
  "にとって":   { keyword: "FOR_PERSON",       function: "评价立场" },
  "によって":   { keyword: "BY",               function: "手段 / 异同" },
  "として":     { keyword: "AS",               function: "角色/身份" },
  "に対して":   { keyword: "TOWARD_ATTITUDE",  function: "动作指向/态度" },
  "に関して":   { keyword: "REGARDING",        function: "正式话题" },
  "における":   { keyword: "IN_FORMAL",        function: "修饰名词的场所/领域" },
  "において":   { keyword: "AT_FORMAL",        function: "修饰动词的场所/场合" },
  "に応じて":   { keyword: "ACCORDING",        function: "根据性响应" },
  "に基づいて": { keyword: "BASED_ON",         function: "依据性声明" },
  "を通じて":   { keyword: "THROUGH",          function: "通过/整个期间" },
  "をめぐって": { keyword: "AROUND",           function: "围绕焦点" },
  "とともに":   { keyword: "ALONG_WITH",       function: "并行/伴随" },
  "にわたって": { keyword: "SPANNING",         function: "跨度/范围" },
  "に限る":     { keyword: "LIMITED_TO",       function: "排他限定" },
};

// ─── Verb Methods (动词方法) — Section 5.2 ──────────────────

export const VERB_METHOD_MAP: Record<string, { method: string; function: string }> = {
  "ない":       { method: "not",           function: "否定" },
  "ません":     { method: "polite",        function: "礼貌体否定" },
  "ます":       { method: "polite",        function: "礼貌体" },
  "た":         { method: "past",          function: "过去" },
  "て":         { method: "then",          function: "中缀连接" },
  "たい":       { method: "want",          function: "意愿" },
  "れる":       { method: "can",           function: "可能(五段)/被动" },
  "られる":     { method: "passive",       function: "被动(一段)/可能" },
  "せる":       { method: "causative",     function: "使役(五段)" },
  "させる":     { method: "causative",     function: "使役(一段)" },
  "う":         { method: "vol",           function: "意志/劝诱" },
  "よう":       { method: "vol",           function: "意志/劝诱" },
  "ば":         { method: "if",            function: "条件假定" },
  "ている":     { method: "exist",         function: "进行/状态" },
  "てある":     { method: "exist_intent",  function: "有意结果状态" },
  "てしまう":   { method: "complete",      function: "完成/遗憾" },
  "ていく":     { method: "go",            function: "远离变化" },
  "てくる":     { method: "come",          function: "靠近变化" },
  "ず":         { method: "not_formal",    function: "书面否定" },
  "得る":       { method: "possible",      function: "可能性" },
};

// ─── Adjective Methods (形容词方法) — Section 5.3 ───────────

export const I_ADJ_METHOD_MAP: Record<string, { method: string; function: string }> = {
  "い":       { method: "is",          function: "肯定断言" },
  "くない":   { method: "not",         function: "否定" },
  "かった":   { method: "past",        function: "过去" },
  "くなかった": { method: "not+past",  function: "过去否定" },
  "くて":     { method: "then",        function: "中缀连接" },
  "ければ":   { method: "if",          function: "条件假定" },
  "さ":       { method: "nominalize",  function: "名词化" },
  "そうだ":   { method: "seems",       function: "样态" },
};

export const NA_ADJ_METHOD_MAP: Record<string, { method: string; function: string }> = {
  "だ":       { method: "is",          function: "肯定断言" },
  "ではない": { method: "not",         function: "否定" },
  "だった":   { method: "past",        function: "过去" },
  "で":       { method: "then",        function: "中缀连接" },
  "なら":     { method: "if",          function: "条件假定" },
  "さ":       { method: "nominalize",  function: "名词化" },
};

// ─── Honorific Methods (敬语方法) — Section 5.4 ─────────────

export const HONORIFIC_MAP: Record<string, { method: string; function: string }> = {
  "hon":     { method: "hon", function: "尊敬语 — 抬高动作主体" },
  "hum":     { method: "hum", function: "谦让语 — 贬低自身" },
  "polite":  { method: "polite", function: "丁宁语 — 礼貌（无尊卑）" },
};

/** Irregular verb honorific replacements — Section 5.4 */
export const IRREGULAR_HONORIFIC: Record<string, { hon: string; hum: string }> = {
  "する":       { hon: "なさる",       hum: "いたす" },
  "言う":       { hon: "おっしゃる",   hum: "申し上げる" },
  "行く":       { hon: "いらっしゃる", hum: "参る" },
  "来る":       { hon: "いらっしゃる", hum: "参る" },
  "見る":       { hon: "ご覧になる",   hum: "拝見する" },
  "食べる":     { hon: "召し上がる",   hum: "いただく" },
  "飲む":       { hon: "召し上がる",   hum: "いただく" },
  "いる":       { hon: "いらっしゃる", hum: "おる" },
  "知る":       { hon: "ご存知だ",     hum: "存じ上げる" },
};

// ─── Particle Stack Rules (Section 6.1) ──────────────────────

/** Allowed particle combinations */
export const ALLOWED_STACKS: Record<string, string[]> = {
  "には": ["INTO", "TOPIC"],
  "では": ["AT", "TOPIC"],
  "にも": ["INTO", "ALSO"],
  "だけは": ["ONLY", "TOPIC"],
};

/** Forbidden combinations — will trigger E001 */
export const FORBIDDEN_STACKS = {
  caseCase: "Two case particles on the same variable",
  mutualAdverbial: "Mutually exclusive adverbial particles",
};

// ─── Conditional Disambiguation (Section 6.3.3) ──────────────

export const CONDITIONAL_MAP: Record<string, { keyword: string; function: string }> = {
  "と":   { keyword: "TRIGGER_WHEN",  function: "自然法则/机械必然后果" },
  "なら": { keyword: "GIVEN_THAT",    function: "对方刚说的话或提出的话题" },
  "ば":   { keyword: "IF_AND_ONLY_IF", function: "只要满足条件就一定成立" },
  "たら": { keyword: "IF",            function: "默认条件（以上皆否）" },
};

// ─── Error Definitions (Section 6.4) ─────────────────────────

export const ERROR_DEFINITIONS: Record<string, { name: string; trigger: string; strategy: string }> = {
  E001: { name: "CASE_COLLISION",           trigger: "两个格助词叠加于同一变量",           strategy: "移除多余的格助词，保留句法上正确的那个" },
  E002: { name: "OP_ORDER_CONFLICT",        trigger: "副助词置于格助词之前",               strategy: "自动调整为格助词+副助词顺序" },
  E003: { name: "CHAIN_ORDER_VIOLATION",    trigger: "方法链顺序违反5.1的层级约束",        strategy: "自动重排为目标顺序" },
  E004: { name: "ONLY_NEG_MISMATCH",        trigger: "[ONLY-NEG] 但句中无 .not()",        strategy: "标记错误，提示需要否定谓语" },
  E005: { name: "WANT_MUST_CONFLICT",       trigger: ".want() 和强制义务宏同时出现",       strategy: "保留最高优先级的方法" },
  E006: { name: "DOUBLE_NEG",               trigger: ".not() 两次叠加",                    strategy: "移除一层" },
  E007: { name: "KEIGO_CONFLICT",           trigger: ".hon() 和 .hum() 同时出现",          strategy: "仅保留一个" },
  E008: { name: "QUES_TOPIC_CONFLICT",      trigger: "疑问词与 [TOPIC] 同时出现",          strategy: "自动将 [TOPIC] 降格为 [SUBJ]" },
  E009: { name: "CONDITIONAL_PROHIBITIVE",  trigger: "と后接意志/命令表达",                strategy: "自动切换为たら形式" },
  E010: { name: "AMBIGUOUS_PARTICLE",       trigger: "多态助词无法消歧",                   strategy: "保留最可能的标签，并附加 [?] 标记" },
};

// ─── Helper: Lookup all particles (combined) ─────────────────

export function lookupParticle(surface: string): { keyword: string; category: string } | null {
  // Check compound first (longer match priority)
  if (COMPOUND_PARTICLE_MAP[surface]) {
    return { keyword: COMPOUND_PARTICLE_MAP[surface].keyword, category: "compound_particle" };
  }
  if (CASE_PARTICLE_MAP[surface]) {
    return { keyword: CASE_PARTICLE_MAP[surface].keyword, category: "case_particle" };
  }
  if (ADVERBIAL_PARTICLE_MAP[surface]) {
    return { keyword: ADVERBIAL_PARTICLE_MAP[surface].keyword, category: "adverbial_particle" };
  }
  if (SENTENCE_FINAL_MAP[surface]) {
    return { keyword: SENTENCE_FINAL_MAP[surface].keyword, category: "sentence_final" };
  }
  return null;
}

/** Semantic category hints for に/で disambiguation */
export const SEMANTIC_CATEGORIES = {
  TIME_WORDS: new Set(["時", "分", "曜日", "日", "月", "年", "朝", "昼", "夜", "午前", "午後", "今日", "明日", "昨日", "毎日", "週末"]),
  LOCATION_WORDS: new Set(["学校", "家", "駅", "店", "公園", "会社", "部屋", "町", "村", "都市", "日本", "東京", "大阪", "京都", "上", "下", "中", "外", "前", "後ろ", "横", "隣", "右", "左"]),
  PERSON_WORDS: new Set(["先生", "学生", "生徒", "友達", "友人", "母", "父", "彼", "彼女", "子供", "人", "客", "男", "女", "私", "僕", "俺", "君", "あなた"]),
  TOOL_WORDS: new Set(["電話", "電車", "バス", "車", "英語", "日本語", "ペン", "箸", "コンピューター"]),
  MOTION_VERBS: new Set(["行く", "来る", "帰る", "着く", "入る", "出る", "走る", "歩く", "飛ぶ", "泳ぐ"]),
  INTERACTION_VERBS: new Set(["あげる", "くれる", "もらう", "言う", "教える", "貸す", "借りる", "聞く", "話す"]),
};
