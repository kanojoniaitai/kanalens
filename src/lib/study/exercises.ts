import type { Passage, TransJapReviewMetadata } from "@/lib/types";
import { particleRoles, tokenizeJapanese } from "./japanese";

export type StudyExerciseKind = "particle" | "vocabulary" | "translation" | "grammar" | "structure";

export interface StudyExercise {
  id: string;
  passageId: string;
  kind: StudyExerciseKind;
  category: string;
  label: string;
  prompt: string;
  expectedAnswer: string;
  rationale: string;
  sourceJapanese?: string;
  sourceEnglish?: string;
  choices?: string[];
}

export interface ExerciseCheck {
  correct: boolean;
  expectedAnswer: string;
  rationale: string;
  comparison: string;
}

export interface WeaknessSummary {
  label: string;
  count: number;
  severity: number;
  latest: string;
}

const particleChoices: Record<string, string[]> = {
  は: ["は", "が", "を", "に"],
  が: ["が", "は", "を", "で"],
  を: ["を", "が", "に", "で"],
  に: ["に", "で", "へ", "を"],
  で: ["で", "に", "を", "から"],
  へ: ["へ", "に", "で", "を"],
  と: ["と", "に", "で", "を"],
  の: ["の", "が", "を", "に"],
  から: ["から", "まで", "に", "で"],
  まで: ["まで", "から", "に", "へ"],
};

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function normalizeAnswer(input: string) {
  return input.trim().replace(/[。．.、,\s]/g, "").toLowerCase();
}

function cleanNote(note: string) {
  return note.replace(/`/g, "");
}

function maskFirstOccurrence(text: string, target: string) {
  const index = text.indexOf(target);
  if (index < 0) return text;
  return `${text.slice(0, index)}__${text.slice(index + target.length)}`;
}

function sentenceContaining(text: string, target: string) {
  const sentence = text
    .split("。")
    .map((item) => item.trim())
    .find((item) => item.includes(target));
  return sentence ? `${sentence}。` : text;
}

export function passagePlainText(passage: Passage): string {
  return passage.paragraphs
    .map((paragraph) => paragraph.text || paragraph.annotated.map((segment) => segment.surface).join(""))
    .join("");
}

function parseTransJapMetadata(reviewNotes: string | null): TransJapReviewMetadata | null {
  if (!reviewNotes) return null;
  try {
    const parsed = JSON.parse(reviewNotes) as TransJapReviewMetadata;
    return parsed?.integration === "transjap" ? parsed : null;
  } catch {
    return null;
  }
}

export function buildStudyExercises(passage: Passage): StudyExercise[] {
  const readingPlain = passagePlainText(passage);
  const metadata = parseTransJapMetadata(passage.review_notes);
  const tokens = tokenizeJapanese(readingPlain);

  const particleExercises = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.kind === "particle")
    .slice(0, 5)
    .map(({ token, index }) => {
      const source = sentenceContaining(readingPlain, token.surface);
      return {
        id: `${passage.id}:particle:${index}`,
        passageId: passage.id,
        kind: "particle" as const,
        category: `particle:${token.surface}`,
        label: `Particle ${token.surface}`,
        prompt: maskFirstOccurrence(source, token.surface),
        expectedAnswer: token.surface,
        rationale: `${token.surface}: ${particleRoles[token.surface] ?? token.role}. ${metadata?.learnerTrap ?? "Compare the marked phrase with the predicate it connects to."}`,
        sourceJapanese: source,
        sourceEnglish: passage.translation,
        choices: unique([...(particleChoices[token.surface] ?? [token.surface, "は", "が", "を"]), token.surface]).slice(0, 4),
      };
    });

  const vocabularyExercises = passage.word_gloss.slice(0, 5).map((item, index) => {
    const source = sentenceContaining(readingPlain, item.word);
    return {
      id: `${passage.id}:vocabulary:${index}`,
      passageId: passage.id,
      kind: "vocabulary" as const,
      category: "vocabulary recall",
      label: `Vocabulary ${item.word}`,
      prompt: `Meaning: ${item.gloss_en}. Context: ${maskFirstOccurrence(source, item.word)}`,
      expectedAnswer: item.word,
      rationale: `${item.word} (${item.reading}) appears in this reading as ${item.gloss_en}.`,
      sourceJapanese: source,
      sourceEnglish: passage.translation,
    };
  });

  const translationExercise: StudyExercise | null = metadata?.practice?.prompt || metadata?.practice?.model
    ? {
        id: `${passage.id}:translation:0`,
        passageId: passage.id,
        kind: "translation",
        category: "natural expression",
        label: "Natural Japanese",
        prompt: metadata.practice?.prompt ?? "Rewrite the core idea naturally in Japanese.",
        expectedAnswer: metadata.practice?.model ?? readingPlain.split("。")[0] ?? readingPlain,
        rationale: `Model expression: ${metadata.practice?.model ?? "Use the passage as the model."} Compare word order, omitted context, and register instead of translating word for word.`,
        sourceJapanese: metadata.practice?.model ?? readingPlain,
        sourceEnglish: metadata.practice?.prompt ?? passage.translation,
      }
    : passage.translation
      ? {
          id: `${passage.id}:translation:0`,
          passageId: passage.id,
          kind: "translation",
          category: "natural expression",
          label: "Natural Japanese",
          prompt: `Render the first idea naturally in Japanese: ${passage.translation.split(".")[0]}.`,
          expectedAnswer: readingPlain.split("。")[0] ? `${readingPlain.split("。")[0]}。` : readingPlain,
          rationale: "Use the original reading as a model for natural word order, omission, and register.",
          sourceJapanese: readingPlain,
          sourceEnglish: passage.translation,
        }
      : null;

  const grammarExercises = passage.grammar_points.slice(0, 3).map((item, index) => ({
    id: `${passage.id}:grammar:${index}`,
    passageId: passage.id,
    kind: "grammar" as const,
    category: "grammar note",
    label: `Grammar ${item.pattern}`,
    prompt: `Explain what this pattern does: ${cleanNote(item.pattern)}`,
    expectedAnswer: cleanNote(item.explanation_en),
    rationale: cleanNote(item.explanation_en),
    sourceJapanese: readingPlain,
    sourceEnglish: passage.translation,
  }));

  return [
    ...particleExercises,
    ...vocabularyExercises,
    ...(translationExercise ? [translationExercise] : []),
    ...grammarExercises,
  ];
}

export function checkStudyExercise(exercise: StudyExercise, answer: string): ExerciseCheck {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedExpected = normalizeAnswer(exercise.expectedAnswer);
  const correct =
    normalizedAnswer === normalizedExpected
    || (exercise.kind === "translation" && normalizedAnswer.length > 1 && normalizedExpected.includes(normalizedAnswer))
    || (exercise.kind === "grammar" && normalizedAnswer.length > 8 && normalizeAnswer(exercise.rationale).includes(normalizedAnswer.slice(0, 16)));

  return {
    correct,
    expectedAnswer: exercise.expectedAnswer,
    rationale: exercise.rationale,
    comparison: correct
      ? "Your answer matches the target for this retrieval item."
      : `Compare your answer with the model. Your answer: ${answer || "(empty)"}.`,
  };
}

export function severityForExercise(exercise: StudyExercise): number {
  if (exercise.kind === "translation") return 0.9;
  if (exercise.kind === "particle") return 0.82;
  if (exercise.kind === "grammar") return 0.72;
  return 0.62;
}

export function summarizeWeaknesses(
  mistakes: { category: string; severity: number; created_at: string }[],
): WeaknessSummary[] {
  const groups = new Map<string, WeaknessSummary>();
  mistakes.forEach((mistake) => {
    const current = groups.get(mistake.category) ?? {
      label: mistake.category,
      count: 0,
      severity: 0,
      latest: mistake.created_at,
    };
    current.count += 1;
    current.severity = Math.max(current.severity, mistake.severity);
    current.latest = mistake.created_at > current.latest ? mistake.created_at : current.latest;
    groups.set(mistake.category, current);
  });

  return [...groups.values()]
    .sort((a, b) => b.count * b.severity - a.count * a.severity || b.latest.localeCompare(a.latest))
    .slice(0, 6);
}
