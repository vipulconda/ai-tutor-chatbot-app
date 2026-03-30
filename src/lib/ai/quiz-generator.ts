/**
 * Quiz Generator — Builds adaptive practice quizzes from weak topics
 *
 * Uses the student's weak topics, ability score, and board-specific
 * curriculum context to generate appropriately-difficulty questions.
 */

import type { Board, StudentProfileData } from "@/types";
import { getAbilityBand } from "./prompt-builder";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface QuizConfig {
  subject: string;
  topics: string[];
  questionCount: number;
  difficulty: "easy" | "medium" | "hard" | "adaptive";
  chapterRange?: { from: number; to: number };
  excludeTopics?: string[];
  questionPatterns?: string[];
}

export interface BoardCurriculumContext {
  board: Board | string;
  stateCode?: string;
  textbookSeries?: string;
}

export type QuizResult =
  | { ok: true; questions: QuizQuestion[] }
  | { ok: false; error: string };

const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const;
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 20;

const GROUNDED_SUBJECTS = new Set([
  "social science",
  "science",
  "history",
  "geography",
  "civics",
]);

const GROUNDED_TOPIC_SIGNALS = [
  "dynasty",
  "movement",
  "freedom struggle",
  "biography",
  "planet",
  "constitution",
  "battle",
  "kingdom",
  "chapter",
] as const;

function isMostlyDevanagari(text: string) {
  const matches = text.match(/[\u0900-\u097F]/g);
  return Boolean(matches && matches.length >= Math.max(2, text.trim().length / 3));
}

function normalizeTopicsForSubject(subject: string, topics: string[]) {
  const normalizedSubject = subject.toLowerCase().trim();

  if (normalizedSubject === "english") {
    return topics.filter((topic) => !isMostlyDevanagari(topic));
  }

  if (normalizedSubject === "hindi") {
    return topics.filter((topic) => isMostlyDevanagari(topic));
  }

  return topics;
}

export function selectQuizTopicsForSubject(subject: string, topics: string[]) {
  const cleanedTopics = topics
    .map((topic) => topic.trim())
    .filter(Boolean);

  return normalizeTopicsForSubject(subject, cleanedTopics);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function isValidDifficulty(value: unknown): value is "easy" | "medium" | "hard" {
  return VALID_DIFFICULTIES.includes(value as "easy" | "medium" | "hard");
}

export function shouldUseGroundedQuizGeneration(subject: string, topics: string[]) {
  const normalizedSubject = subject.toLowerCase().trim();

  const isFactualSubject = [...GROUNDED_SUBJECTS].some((entry) =>
    normalizedSubject.includes(entry)
  );
  if (isFactualSubject) {
    return true;
  }

  const normalizedTopics = topics.map((topic) => topic.toLowerCase());
  return GROUNDED_TOPIC_SIGNALS.some((signal) =>
    normalizedTopics.some((topic) => topic.includes(signal))
  );
}

export function getAdaptiveDifficulty(
  band: "Beginner" | "Developing" | "Proficient" | "Advanced"
) {
  const map: Record<string, string> = {
    Beginner: "easy",
    Developing: "medium",
    Proficient: "medium-hard",
    Advanced: "hard",
  };

  return map[band] ?? "medium";
}

export function getBoardGuidance(ctx: BoardCurriculumContext) {
  const board = ctx.board.toUpperCase();

  if (board === "CBSE") {
    return [
      "Follow NCERT textbook structure and terminology closely.",
      "Include a mix of standard MCQs and HOTS-style questions where appropriate.",
      "Use the standard school-exam MCQ format: one correct option and three plausible distractors.",
      ctx.textbookSeries ? `Textbook series: ${ctx.textbookSeries}.` : "Default textbook: NCERT.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (board === "ICSE") {
    return [
      "Follow the CISCE syllabus and keep questions slightly more analytical and application-based.",
      "For Science, allow Physics, Chemistry, and Biology terminology when appropriate.",
      "For English, reflect an ICSE-style literature and language emphasis.",
      ctx.textbookSeries ? `Textbook series: ${ctx.textbookSeries}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (board === "STATE" && ctx.stateCode) {
    return [
      `Follow the ${ctx.stateCode} State Board prescribed syllabus.`,
      "Align question style and vocabulary with state board exam patterns.",
      ctx.textbookSeries
        ? `Textbook series: ${ctx.textbookSeries}.`
        : "Use the standard state board textbook.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return "Follow the standard Indian school curriculum for the selected board and grade.";
}

function getQuizLanguageInstruction(profile: StudentProfileData, subject: string) {
  const normalizedSubject = subject.toLowerCase().trim();

  if (normalizedSubject === "english") {
    return "Write the entire quiz in English only. Every question, option, explanation, and topic label must be in clear school-level English. Do not use Hindi or any other language.";
  }

  if (normalizedSubject === "hindi") {
    return "Write the entire quiz in Hindi only. Every question, option, explanation, and topic label must be in natural school-level Hindi written in Devanagari script. Do not switch to English except where absolutely required by the syllabus.";
  }

  if (profile.preferredLang.toLowerCase() === "hindi") {
    return "Prefer simple Hindi for explanations when possible, but keep official textbook terms accurate.";
  }

  return "Write the entire quiz in English unless the subject itself requires another language.";
}

export function buildQuizPrompt(profile: StudentProfileData, config: QuizConfig): string {
  const subjectAlignedTopics = selectQuizTopicsForSubject(config.subject, config.topics);
  const safeCount = clamp(config.questionCount, MIN_QUESTIONS, MAX_QUESTIONS);
  const abilityScore = profile.abilityScores[config.subject.toLowerCase()] ?? 50;
  const band = getAbilityBand(abilityScore);
  const difficultyGuide =
    config.difficulty === "adaptive"
      ? getAdaptiveDifficulty(band)
      : config.difficulty;

  const topicList =
    subjectAlignedTopics.length > 0
      ? subjectAlignedTopics.join(", ")
      : `General topics for Grade ${profile.grade} ${config.subject}`;

  const boardGuidance = getBoardGuidance({
    board: profile.board,
  });
  const languageInstruction = getQuizLanguageInstruction(profile, config.subject);

  const chapterConstraint = config.chapterRange
    ? `Only generate questions from Chapters ${config.chapterRange.from}-${config.chapterRange.to}. Do not use content from other chapters.`
    : "";

  const excludeConstraint =
    config.excludeTopics && config.excludeTopics.length > 0
      ? `Do NOT ask about these topics: ${config.excludeTopics.join(", ")}.`
      : "";

  const patternConstraint =
    config.questionPatterns && config.questionPatterns.length > 0
      ? `Preferred question formats: ${config.questionPatterns.join(", ")}.`
      : "Use standard MCQ format.";

  return `You are an expert quiz generator for Indian school students.

## Student context
- Grade: ${profile.grade}
- Board: ${profile.board}
- Subject: ${config.subject}
- Topics: ${topicList}
- Difficulty: ${difficultyGuide}
- Ability: ${band} (score: ${abilityScore.toFixed(0)}/100)

## Board-specific instructions
${boardGuidance}
${languageInstruction}
${chapterConstraint}
${excludeConstraint}
${patternConstraint}

## Generation rules
1. Generate exactly ${safeCount} questions.
2. Each question must have exactly 4 options.
3. Exactly one option must be correct.
4. Provide a brief explanation in 1-2 sentences.
5. Stay strictly within the Grade ${profile.grade} ${profile.board} syllabus.
6. Use Indian context and examples where relevant.
7. Mix conceptual, application, and factual questions.
8. Vary difficulty slightly within the "${difficultyGuide}" band.
9. Distractors must be plausible. Avoid obviously wrong options.
10. Do not ask beyond-school-level trivia.
11. If external facts are available, use them only to improve factual correctness while staying curriculum-aligned.
12. Keep the output language exactly as instructed above. Do not mix languages.

## Output format
Respond ONLY with a valid JSON array. No markdown fences, no preamble, and no trailing text.

Each element must match this schema exactly:
{
  "question": string,
  "options": string[4],
  "correctIndex": 0 | 1 | 2 | 3,
  "explanation": string,
  "topic": string,
  "difficulty": "easy" | "medium" | "hard"
}

Example:
[
  {
    "question": "What is the value of x in 2x + 4 = 10?",
    "options": ["2", "3", "4", "5"],
    "correctIndex": 1,
    "explanation": "2x + 4 = 10, so 2x = 6 and x = 3.",
    "topic": "Linear Equations",
    "difficulty": "easy"
  }
]`;
}

export function parseQuizResponse(rawResponse: string, fallbackTopics: string[]): QuizResult {
  let parsed: unknown;
  const trimmed = rawResponse.trim();

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\[[\s\S]*\]/);
    if (!match) {
      return { ok: false, error: "LLM response contained no JSON array." };
    }

    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { ok: false, error: "Failed to parse extracted JSON array from the model response." };
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: "Parsed quiz response is not a non-empty array." };
  }

  const defaultTopic = fallbackTopics[0] ?? "General";
  const questions: QuizQuestion[] = parsed.map((entry, index) => {
    const item = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};

    const options =
      Array.isArray(item.options) && item.options.length === 4
        ? item.options.map(String)
        : ["Option A", "Option B", "Option C", "Option D"];

    const correctIndex =
      typeof item.correctIndex === "number" &&
      Number.isInteger(item.correctIndex) &&
      item.correctIndex >= 0 &&
      item.correctIndex <= 3
        ? item.correctIndex
        : 0;

    return {
      id: `q-${Date.now()}-${index}`,
      question:
        typeof item.question === "string" && item.question.trim().length > 0
          ? item.question.trim()
          : `Question ${index + 1}`,
      options,
      correctIndex,
      explanation:
        typeof item.explanation === "string" && item.explanation.trim().length > 0
          ? item.explanation.trim()
          : "No explanation provided.",
      topic:
        typeof item.topic === "string" && item.topic.trim().length > 0
          ? item.topic.trim()
          : defaultTopic,
      difficulty: isValidDifficulty(item.difficulty) ? item.difficulty : "medium",
    };
  });

  return { ok: true, questions };
}

export function getFallbackQuestions(topics: string[]): QuizQuestion[] {
  const fallbackTopic = topics.find((topic) => topic.trim().length > 0) || "General";

  return [
    {
      id: `fallback-${Date.now()}`,
      question: "Which option best describes a valid quiz fallback state?",
      options: [
        "The quiz generator had trouble, so you should try again.",
        "All four options are always correct.",
        "A placeholder question should be treated as a real test.",
        "The quiz cannot be retried."
      ],
      correctIndex: 0,
      explanation: "This is a temporary fallback item shown only when quiz generation fails. Retrying should load a normal quiz.",
      topic: fallbackTopic,
      difficulty: "easy",
    },
  ];
}
