import type { JICOperatorNode, JICSentence, JICVariableNode } from "./types";
import type { JICParticleReconstruction, JICSentenceCode } from "../types";

type KanbunConfidence = NonNullable<JICSentenceCode["kanbun_confidence"]>;

interface KanbunUnit {
  node: JICVariableNode;
  text: string;
  index: number;
  operators: JICOperatorNode[];
  operatorKeywords: Set<string>;
  methods: string[];
  skip: boolean;
}

interface RenderedClause {
  text: string;
  connectorAfter: "" | "而" | "而後" | "故" | "則";
  conditional: boolean;
}

interface KanbunAssessmentInput {
  original: string;
  jicCode: string;
  kanbunCore: string;
}

const HIRAGANA_RE = /[\u3040-\u309F]/;
const KATAKANA_RE = /[\u30A0-\u30FF]/;
const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF]/;
const STRUCTURAL_PUNCT_RE = /[\s\n\r「」『』、，。.!！？?・（）()[\]【】]/g;

const LEXICAL_KANBUN_MAP: Record<string, string> = {
  "私": "我",
  "わたし": "我",
  "僕": "我",
  "俺": "我",
  "あなた": "汝",
  "君": "君",
  "彼": "彼",
  "彼女": "彼女",
  "これ": "此",
  "それ": "其",
  "あれ": "彼",
  "ここ": "此処",
  "そこ": "其処",
  "あそこ": "彼処",
  "する": "為",
  "ある": "有",
  "いる": "在",
  "なる": "成",
  "できる": "能",
};

const ROLE_LABELS: Record<string, string> = {
  TOPIC: "主题",
  SUBJ: "主语",
  TARGET: "对象",
  INTO: "趋向",
  TIME: "时间",
  GIVE_TO: "受与",
  AT: "处所",
  USING: "手段",
  TOWARD: "方向",
  FROM: "起点",
  UNTIL: "终点",
  THAN: "比较",
  OF: "所属",
  ALSO: "并提",
  AND: "并列",
  WITH: "伴随",
  CAUSE: "原因",
  QUES: "疑问",
  ABOUT: "范围",
  FOR_PERSON: "立场",
  BY: "施事/手段",
  AS: "身份",
  TOWARD_ATTITUDE: "态度对象",
  REGARDING: "范围",
  IN_FORMAL: "正式处所",
  AT_FORMAL: "正式处所",
  ACCORDING: "依据",
  BASED_ON: "依据",
  THROUGH: "经由",
  AROUND: "焦点",
  ALONG_WITH: "并行动作",
  SPANNING: "跨度",
  LIMITED_TO: "限定",
};

const ROLE_REASONS: Record<string, string> = {
  TOPIC: "日语主题助词省去，用停顿保留其句位。",
  SUBJ: "主语助词省去，保留动作主体的位置。",
  TARGET: "宾语助词省去，保留谓语前的对象位置。",
  INTO: "趋向成分沿日语语序保留，必要时以文言标记补明。",
  TIME: "时间成分作为句首或句中框架保留。",
  GIVE_TO: "受与对象沿日语语序保留，可用「与」标明。",
  AT: "处所成分沿日语语序保留，主要由停顿承载。",
  USING: "手段或工具沿日语语序保留，可用「以」标明。",
  TOWARD: "方向成分沿日语语序保留，可用「至」标明。",
  FROM: "起点成分沿日语语序保留，可用「自」标明。",
  UNTIL: "终点成分沿日语语序保留，可用「至」标明。",
  THAN: "比较基准沿日语语序保留，可用「比」标明。",
  OF: "所属关系在相邻名词可判定时转为 A之B。",
  CAUSE: "原因关系压缩为文言式因果停顿，可用「故」标明。",
};

const DEMONSTRATIVE_PREFIXES = new Set(["此", "其", "彼", "何"]);

const REQUIRED_MARKERS: Array<{ pattern: RegExp; markers: string[]; label: string }> = [
  { pattern: /\[(TOPIC)\]/, markers: ["，", "、"], label: "topic boundary for TOPIC" },
  { pattern: /\[(TARGET)\]/, markers: ["，", "、"], label: "target boundary for TARGET" },
  { pattern: /\.(then|while)\(\)/, markers: ["而"], label: "sequence marker for .then()/.while()" },
  { pattern: /\.after\(\)/, markers: ["後"], label: "after marker for .after()" },
  { pattern: /\[(AT|TIME|AT_FORMAL|IN_FORMAL)\]/, markers: ["於", "在", "，", "、", "之上", "之下", "之中", "之外", "之内", "之前", "之後"], label: "locative or frame marker for AT/TIME" },
  { pattern: /\[(GIVE_TO|FOR_PERSON)\]/, markers: ["為", "与", "，", "、"], label: "recipient marker for GIVE_TO" },
  { pattern: /\[(USING|BY|THROUGH)\]/, markers: ["以", "由", "，", "、"], label: "instrumental marker for USING/BY" },
  { pattern: /\[(FROM)\]/, markers: ["自", "従"], label: "source marker for FROM" },
  { pattern: /\[(THAN)\]/, markers: ["比", "較"], label: "comparison marker for THAN" },
  { pattern: /\[(TOWARD|INTO)\]/, markers: ["至", "入", "向"], label: "direction marker for TOWARD/INTO" },
  { pattern: /\[(OF)\]/, markers: ["之"], label: "possessive marker for OF" },
  { pattern: /\[(CAUSE)\]/, markers: ["故", "以"], label: "cause marker for CAUSE" },
  { pattern: /\.(not|not_formal)\(\)/, markers: ["不", "未", "無"], label: "negation marker for .not()" },
  { pattern: /\.want\(\)/, markers: ["欲"], label: "desire marker for .want()" },
  { pattern: /\.(if)\(\)/, markers: ["若", "則"], label: "condition marker for .if()" },
];

function normalizeComparable(value: string): string {
  return value.replace(STRUCTURAL_PUNCT_RE, "");
}

function stripKanaSkeleton(value: string): string {
  return normalizeComparable([...value].filter((char) => !HIRAGANA_RE.test(char) && !KATAKANA_RE.test(char)).join(""));
}

function hasKanji(value: string): boolean {
  return KANJI_RE.test(value);
}

function hasKana(value: string): boolean {
  return HIRAGANA_RE.test(value) || KATAKANA_RE.test(value);
}

function lexicalize(value: string): string {
  return LEXICAL_KANBUN_MAP[value] ?? value;
}

function normalizeNominalBase(value: string): string {
  const mapped = lexicalize(value);
  if (!hasKanji(mapped)) return mapped;
  return mapped
    .replace(/[\u3040-\u309F]+(?=[\u3400-\u4DBF\u4E00-\u9FFF])/g, "")
    .replace(/[\u3040-\u309F]+$/u, "");
}

function normalizePredicateBase(value: string): string {
  const mapped = lexicalize(value);
  if (!hasKanji(mapped)) return mapped;

  const withoutTrailingKana = mapped.replace(/[\u3040-\u309F]+$/u, "");
  const withoutSokuon = withoutTrailingKana.replace(/っ$/u, "");
  return withoutSokuon || mapped;
}

function isPredicate(unit: KanbunUnit): boolean {
  return unit.methods.length > 0 || unit.node.token.subtype === "verb_stem" || unit.node.token.subtype === "adj_stem";
}

function hasOperator(unit: KanbunUnit, keyword: string): boolean {
  return unit.operatorKeywords.has(keyword);
}

function hasAnyOperator(unit: KanbunUnit, keywords: string[]): boolean {
  return keywords.some((keyword) => hasOperator(unit, keyword));
}

function hasMethod(unit: KanbunUnit, method: string): boolean {
  return unit.methods.includes(method);
}

function hasSemanticMarker(unit: KanbunUnit): boolean {
  return renderRolePrefix(unit).length > 0 || renderRoleSuffix(unit).length > 0;
}

function buildUnits(sentence: JICSentence, warnings: string[]): KanbunUnit[] {
  const units = sentence.nodes
    .filter((node): node is JICVariableNode => node.type === "variable")
    .map((node, index): KanbunUnit => {
      const methods = node.methods.map((method) => method.token.value);
      const predicateLike = methods.length > 0 || node.token.subtype === "verb_stem" || node.token.subtype === "adj_stem";
      const text = predicateLike
        ? normalizePredicateBase(node.token.value)
        : normalizeNominalBase(node.token.value);

      return {
        node,
        text,
        index,
        operators: node.operators,
        operatorKeywords: new Set(node.operators.map((operator) => operator.token.value)),
        methods,
        skip: false,
      };
    });

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (DEMONSTRATIVE_PREFIXES.has(unit.text) && unit.operators.length === 0) {
      const next = units.slice(index + 1).find((candidate) => !candidate.skip);
      if (next) {
        next.text = `${unit.text}${next.text}`;
        unit.skip = true;
      }
    }
    if (hasOperator(unit, "OF")) {
      const next = units.slice(index + 1).find((candidate) => !candidate.skip);
      if (next) {
        next.text = `${unit.text}之${next.text}`;
        unit.skip = true;
      } else {
        warnings.push(`Possessive の on "${unit.node.token.value}" has no following noun to attach.`);
      }
    }
  }

  return units.filter((unit) => !unit.skip);
}

function splitClauses(units: KanbunUnit[]): KanbunUnit[][] {
  const clauses: KanbunUnit[][] = [];
  let current: KanbunUnit[] = [];

  for (const unit of units) {
    current.push(unit);
    if (
      isPredicate(unit)
      && (hasMethod(unit, "then") || hasMethod(unit, "while") || hasMethod(unit, "after") || hasMethod(unit, "if") || hasOperator(unit, "CAUSE"))
    ) {
      clauses.push(current);
      current = [];
    }
  }

  if (current.length > 0) clauses.push(current);
  return clauses;
}

function renderPredicate(unit: KanbunUnit): string {
  const isNegated = hasMethod(unit, "not") || hasMethod(unit, "not_formal");
  const isPast = hasMethod(unit, "past");
  let prefix = "";

  if (isNegated) {
    prefix += isPast ? "未" : "不";
  }
  if (hasMethod(unit, "want")) {
    prefix += "欲";
  }
  if (hasMethod(unit, "can") || hasMethod(unit, "possible")) {
    prefix += "能";
  }
  if (hasMethod(unit, "passive")) {
    prefix += "被";
  }
  if (hasMethod(unit, "causative")) {
    prefix += "使";
  }
  if (hasMethod(unit, "complete")) {
    prefix += "已";
  }

  let suffix = "";
  if (hasMethod(unit, "exist")) suffix += "居";
  if (hasMethod(unit, "exist_intent")) suffix += "有";

  return `${prefix}${unit.text}${suffix}`;
}

function renderAdverbialPrefix(unit: KanbunUnit): string {
  if (hasAnyOperator(unit, ["ONLY", "ONLY_FOCUS", "LIMITED_TO"])) return "唯";
  if (hasAnyOperator(unit, ["EVEN", "NOT_EVEN"])) return "亦";
  if (hasOperator(unit, "PRECISELY")) return "正";
  return "";
}

function renderAdverbialSuffix(unit: KanbunUnit): string {
  if (hasOperator(unit, "ALSO")) return "亦";
  return "";
}

function renderRolePrefix(unit: KanbunUnit): string {
  if (hasAnyOperator(unit, ["ABOUT", "REGARDING", "AROUND"])) return "関";
  if (hasAnyOperator(unit, ["ACCORDING", "BASED_ON"])) return "拠";
  if (hasOperator(unit, "AS")) return "為";
  return "";
}

function renderRoleSuffix(unit: KanbunUnit): string {
  if (hasAnyOperator(unit, ["AT", "AT_FORMAL", "IN_FORMAL"])) {
    if (/之(?:上|下|中|外|内|前|後|横|隣|左|右)$/.test(unit.text)) return "";
    return "於";
  }
  if (hasOperator(unit, "GIVE_TO")) return "与";
  if (hasOperator(unit, "FOR_PERSON")) return "為";
  if (hasAnyOperator(unit, ["USING", "BY", "THROUGH"])) return "以";
  if (hasOperator(unit, "FROM")) return "自";
  if (hasOperator(unit, "THAN")) return "比";
  if (hasOperator(unit, "UNTIL")) return "至";
  if (hasAnyOperator(unit, ["TOWARD", "INTO", "TOWARD_ATTITUDE"])) return "至";
  if (hasAnyOperator(unit, ["AND", "WITH", "ALONG_WITH"])) return "与";
  return "";
}

function renderUnit(unit: KanbunUnit): string {
  const adverbialPrefix = renderAdverbialPrefix(unit);
  const adverbialSuffix = renderAdverbialSuffix(unit);
  if (isPredicate(unit)) return `${adverbialPrefix}${renderPredicate(unit)}${adverbialSuffix}`;
  const prefix = renderRolePrefix(unit);
  const suffix = renderRoleSuffix(unit);
  return `${adverbialPrefix}${prefix}${unit.text}${suffix}${adverbialSuffix}`;
}

function hasLaterPredicate(clause: KanbunUnit[], index: number): boolean {
  return clause.slice(index + 1).some(isPredicate);
}

function shouldPlaceCommaAfter(unit: KanbunUnit, next: KanbunUnit | undefined, clause: KanbunUnit[], index: number): boolean {
  if (!next) return false;
  if (hasOperator(unit, "TOPIC")) return true;
  if (hasOperator(unit, "ALSO") && !isPredicate(next)) return true;
  if (hasOperator(unit, "TIME") || (unit.operators.length === 0 && index === 0 && !isPredicate(next))) return true;
  if (hasOperator(unit, "TARGET") && hasLaterPredicate(clause, index)) return true;
  if (hasSemanticMarker(unit) && !isPredicate(next)) return true;
  return false;
}

function renderClause(clause: KanbunUnit[], warnings: string[]): RenderedClause {
  const predicate = [...clause].reverse().find(isPredicate);
  const connectorAfter = predicate && hasMethod(predicate, "then")
    ? "而"
    : predicate && hasMethod(predicate, "while")
      ? "而"
      : predicate && hasMethod(predicate, "after")
        ? "而後"
        : predicate && hasOperator(predicate, "CAUSE")
          ? "故"
          : predicate && hasMethod(predicate, "if")
            ? "則"
            : "";

  const predicateCount = clause.filter(isPredicate).length;
  if (predicateCount > 1 && !connectorAfter) {
    warnings.push("Multiple predicates appeared in one clause without an explicit local connector.");
  }

  return {
    text: clause.reduce((line, unit, index) => {
      const rendered = renderUnit(unit);
      if (!rendered) return line;
      const next = clause[index + 1];
      return `${line}${rendered}${shouldPlaceCommaAfter(unit, next, clause, index) ? "，" : ""}`;
    }, ""),
    connectorAfter,
    conditional: Boolean(predicate && hasMethod(predicate, "if")),
  };
}

function buildParticleReconstruction(sentence: JICSentence): JICParticleReconstruction[] {
  const items: JICParticleReconstruction[] = [];
  const variables = sentence.nodes.filter((node): node is JICVariableNode => node.type === "variable");

  for (const node of variables) {
    for (const operator of node.operators) {
      const keyword = operator.token.value;
      const role = ROLE_LABELS[keyword] ?? keyword.toLowerCase();
      items.push({
        surface: node.token.value,
        particle: operator.token.surface,
        role,
        reason: ROLE_REASONS[keyword] ?? "This Japanese link is omitted or compressed in the Kanbun skeleton.",
      });
    }

    for (const method of node.methods) {
      if (method.token.value === "then") {
        items.push({
          surface: node.token.value,
          particle: "て",
          role: "sequence",
          reason: "The connective verb form is compressed into 而 between event clauses.",
        });
      }
      if (method.token.value === "while") {
        items.push({
          surface: node.token.value,
          particle: "ながら",
          role: "simultaneous action",
          reason: "The simultaneous-action ending is compressed into a light 而 connection.",
        });
      }
      if (method.token.value === "after") {
        items.push({
          surface: node.token.value,
          particle: "てから",
          role: "after",
          reason: "The after-doing link is compressed into 而後 before the next event.",
        });
      }
      if (method.token.value === "if") {
        items.push({
          surface: node.token.value,
          particle: "ば",
          role: "condition",
          reason: "The conditional ending becomes a 若/則 relation in the Kanbun skeleton.",
        });
      }
      if (method.token.value === "not" || method.token.value === "not_formal") {
        items.push({
          surface: node.token.value,
          particle: "ない",
          role: "negation",
          reason: "Japanese negation is represented by 不 or 未 in the Kanbun skeleton.",
        });
      }
      if (method.token.value === "want") {
        items.push({
          surface: node.token.value,
          particle: "たい",
          role: "desire",
          reason: "The desire ending is represented by 欲 before the predicate.",
        });
      }
    }
  }

  return items;
}

function confidenceFor(units: KanbunUnit[], warnings: string[], qualityIssues: string[]): KanbunConfidence {
  if (qualityIssues.length > 0) return "low";
  if (warnings.length > 0) return "medium";
  if (units.some((unit) => hasKana(unit.text) && !hasKanji(unit.text))) return "medium";
  return "high";
}

export function assessKanbunCore({ original, jicCode, kanbunCore }: KanbunAssessmentInput): string[] {
  const issues: string[] = [];
  const normalizedCore = normalizeComparable(kanbunCore);
  const visibleCore = kanbunCore.replace(/\s/g, "");
  const stripped = stripKanaSkeleton(original);
  const needsStructure = REQUIRED_MARKERS.some((rule) => rule.pattern.test(jicCode)) || /\[TARGET\]/.test(jicCode);

  if (!normalizedCore) {
    issues.push("kanbun_core is empty");
  }
  if (needsStructure && stripped && visibleCore === stripped) {
    issues.push("kanbun_core looks like kana-stripping instead of a structural Kanbun adaptation");
  }
  for (const rule of REQUIRED_MARKERS) {
    if (rule.pattern.test(jicCode) && !rule.markers.some((marker) => kanbunCore.includes(marker))) {
      issues.push(`kanbun_core is missing ${rule.label}`);
    }
  }

  return issues;
}

export function isReusableKanbunSentence(sentence: JICSentenceCode): boolean {
  if (!sentence.kanbun_core?.trim()) return false;
  if (!Array.isArray(sentence.particle_reconstruction)) return false;
  if (sentence.kanbun_source !== "local-rule" && sentence.kanbun_source !== "llm-validated") return false;
  return assessKanbunCore({
    original: sentence.original,
    jicCode: sentence.jic_code,
    kanbunCore: sentence.kanbun_core,
  }).length === 0;
}

export function buildLocalKanbunSentence(sentence: JICSentence): JICSentenceCode {
  const warnings: string[] = [];
  const units = buildUnits(sentence, warnings);
  const clauses = splitClauses(units);
  const renderedClauses = clauses.map((clause) => renderClause(clause, warnings));
  let kanbunCore = "";

  for (let index = 0; index < renderedClauses.length; index += 1) {
    const clause = renderedClauses[index];
    const text = clause.conditional ? `若${clause.text}` : clause.text;
    kanbunCore += text;
    if (index < renderedClauses.length - 1) {
      kanbunCore += clause.connectorAfter ? `。${clause.connectorAfter}` : "。";
    } else {
      kanbunCore += "。";
    }
  }

  const qualityIssues = assessKanbunCore({
    original: sentence.original,
    jicCode: sentence.compiled,
    kanbunCore,
  });
  const allWarnings = [...warnings, ...qualityIssues];

  return {
    original: sentence.original,
    jic_code: sentence.compiled,
    kanbun_core: kanbunCore,
    particle_reconstruction: buildParticleReconstruction(sentence),
    insight: allWarnings.length > 0
      ? "本地文言骨架采用保守策略；带提示的结构仍需复核。"
      : "本地文言骨架保留日语语序，并将助词关系压缩为停顿与文言标记。",
    kanbun_source: "local-rule",
    kanbun_confidence: confidenceFor(units, warnings, qualityIssues),
    kanbun_warnings: allWarnings,
  };
}

export function buildLocalKanbunSentences(sentences: JICSentence[]): JICSentenceCode[] {
  return sentences.map(buildLocalKanbunSentence);
}
