import type { Vocabulary, GrammarSave } from "../types";

export function exportVocabularyToMarkdown(vocabularies: Vocabulary[]): string {
  const lines: string[] = [];
  lines.push("# KanaLens — Vocabulary");
  lines.push(`\n*Exported on ${new Date().toISOString().split("T")[0]}*\n`);
  lines.push("| Word | Reading | POS | Gloss |");
  lines.push("|------|---------|-----|-------|");
  for (const v of vocabularies) {
    lines.push(`| ${v.word} | ${v.reading} | ${v.pos} | ${v.gloss_en} |`);
  }
  lines.push(`\n*Exported from KanaLens · ${new Date().toISOString().split("T")[0]}*`);
  return lines.join("\n");
}

export function exportVocabularyToJson(vocabularies: Vocabulary[]): string {
  return JSON.stringify(vocabularies, null, 2);
}

export function exportGrammarToMarkdown(grammars: GrammarSave[]): string {
  const lines: string[] = [];
  lines.push("# KanaLens — Grammar Points");
  lines.push(`\n*Exported on ${new Date().toISOString().split("T")[0]}*\n`);
  for (const g of grammars) {
    lines.push(`- **${g.pattern}**: ${g.explanation_en}`);
  }
  lines.push(`\n*Exported from KanaLens · ${new Date().toISOString().split("T")[0]}*`);
  return lines.join("\n");
}

export function exportGrammarToJson(grammars: GrammarSave[]): string {
  return JSON.stringify(grammars, null, 2);
}
