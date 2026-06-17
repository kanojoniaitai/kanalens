export interface TokenAnalysis {
  surface: string;
  kind: "particle" | "punctuation" | "predicate" | "content";
  role: string;
}

export interface DependencyLink {
  id: string;
  from: string;
  to: string;
  relation: string;
  rationale: string;
  weight: number;
}

export const particleRoles: Record<string, string> = {
  は: "topic / contrast frame",
  が: "subject or new-information marker",
  を: "direct object",
  に: "destination, recipient, target, time point",
  で: "location of action, means, scope",
  へ: "direction",
  と: "quotation, companion, exhaustive pair",
  の: "possession, nominal linker, modifier",
  から: "source or starting point",
  まで: "endpoint",
};

export function tokenizeJapanese(input: string): TokenAnalysis[] {
  const chunks = input
    .split(/(から|まで|ので|けど|なら|ならば|は|が|を|に|で|へ|と|の|、|。|[^\s、。はがをにでへとの]+)/)
    .filter(Boolean);

  return chunks.map((surface) => {
    if (surface === "、" || surface === "。") return { surface, kind: "punctuation", role: "boundary" };
    if (particleRoles[surface]) return { surface, kind: "particle", role: particleRoles[surface] };
    if (/ます|ました|ない|た|ている|れる|られる|せる|させる|する$/.test(surface)) {
      return { surface, kind: "predicate", role: "predicate or verb phrase" };
    }
    return { surface, kind: "content", role: "content phrase / modifier candidate" };
  });
}

function findPreviousContent(tokens: TokenAnalysis[], fromIndex: number) {
  for (let i = fromIndex - 1; i >= 0; i -= 1) {
    if (tokens[i].kind === "content" || tokens[i].kind === "predicate") return tokens[i];
  }
  return null;
}

function findNextAnchor(tokens: TokenAnalysis[], fromIndex: number) {
  for (let i = fromIndex + 1; i < tokens.length; i += 1) {
    if (tokens[i].kind === "predicate") return tokens[i];
  }
  for (let i = fromIndex + 1; i < tokens.length; i += 1) {
    if (tokens[i].kind === "content") return tokens[i];
  }
  return null;
}

export function buildDependencyLinks(tokens: TokenAnalysis[]): DependencyLink[] {
  return tokens
    .map((token, index) => {
      if (token.kind !== "particle") return null;
      const previous = findPreviousContent(tokens, index);
      const next = findNextAnchor(tokens, index);
      if (!previous || !next) return null;
      return {
        id: `${index}-${previous.surface}-${token.surface}-${next.surface}`,
        from: `${previous.surface}${token.surface}`,
        to: next.surface,
        relation: token.role,
        rationale: `${token.surface} marks ${previous.surface} as connected to ${next.surface}.`,
        weight: token.surface === "は" || token.surface === "が" || token.surface === "を" ? 0.9 : 0.72,
      };
    })
    .filter((link): link is DependencyLink => Boolean(link))
    .slice(0, 10);
}

export function scoreWordOrder(tokens: string[]) {
  const topicIndex = tokens.findIndex((token) => token.includes("は"));
  const predicateIndex = tokens.length - 1;
  const hasPredicateFinal = /ます|た|です|する|した/.test(tokens[predicateIndex] ?? "");
  const naturalness = Math.max(42, 76 + (hasPredicateFinal ? 14 : -20) + (topicIndex <= 1 ? 6 : -8));
  const focus = tokens[0]?.includes("昨日")
    ? "time frame is foregrounded"
    : tokens[0]?.includes("駅")
      ? "location is contrastively foregrounded"
      : "topic-first neutral information flow";
  return { naturalness, focus, hasPredicateFinal };
}
