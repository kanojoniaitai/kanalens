/**
 * JIC-Lite: Main Compiler Entry Point
 *
 * Three-phase pipeline: Lexer → Parser → Code Generation
 * Plus: LLM-assisted compilation (the hybrid approach)
 */

import { lex } from "./lexer";
import { parse } from "./parser";
import type { JICCompilationResult, JICSentence, JICWarning, JICSentenceOutput } from "./types";

export { lex } from "./lexer";
export { parse } from "./parser";
export * from "./types";
export * from "./dictionary";

/**
 * Compile a single Japanese sentence into JIC-Lite intermediate code.
 */
export function compileSentence(sentence: string): JICSentence {
  const tokens = lex(sentence);
  return parse(tokens, sentence);
}

/**
 * Compile a full Japanese passage (multiple sentences) into JIC-Lite.
 * Splits on 。 and compiles each sentence independently.
 */
export function compilePassage(text: string): JICCompilationResult {
  // Split on Japanese period, preserving sentence boundaries
  const rawSentences = text
    .split(/(?<=[。！？])/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const sentences: JICSentence[] = [];
  const allWarnings: JICWarning[] = [];

  for (const raw of rawSentences) {
    const result = compileSentence(raw);
    sentences.push(result);
    allWarnings.push(...result.warnings);
  }

  const fullCode = sentences.map(s => s.compiled).join("\n");

  return {
    sentences,
    fullCode,
    warnings: allWarnings,
  };
}

/**
 * Compile JIC output from LLM-annotated data.
 * The LLM can directly produce JIC-Lite code as part of its output,
 * bypassing the local lexer/parser for sentences it has already analyzed.
 */
export function compileFromLLMOutput(sentences: JICSentenceOutput[]): {
  fullCode: string;
  warnings: JICWarning[];
} {
  const warnings: JICWarning[] = [];

  // Validate LLM-generated JIC code
  for (const sent of sentences) {
    // Check that variables are not translated
    for (const tok of sent.tokens) {
      if (tok.category === "variable") {
        // Variable should retain kanji/katakana form
        const hasLatin = /[a-zA-Z]/.test(tok.value);
        if (hasLatin) {
          warnings.push({
            code: "E010" as JICWarning["code"],
            message: `AMBIGUOUS_PARTICLE: Variable "${tok.value}" contains Latin characters — may violate Iron Rule 1.`,
            autoFixed: false,
          });
        }
      }
    }
  }

  const fullCode = sentences.map(s => s.jic_code).join("\n");

  return { fullCode, warnings };
}

/**
 * Quick utility: compile a single sentence and return just the code string.
 */
export function toJIC(sentence: string): string {
  return compileSentence(sentence).compiled;
}
