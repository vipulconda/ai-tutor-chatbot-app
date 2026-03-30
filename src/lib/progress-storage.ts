"use client";

export interface QuizAttemptRecord {
  id: string;
  subject: string;
  scorePercent: number;
  correctAnswers: number;
  questionCount: number;
  topics: string[];
  createdAt: string;
}

const QUIZ_ATTEMPT_STORAGE_KEY = "quiz-attempt-history";

export function readQuizAttemptHistory(): QuizAttemptRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(QUIZ_ATTEMPT_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQuizAttempt(attempt: QuizAttemptRecord) {
  if (typeof window === "undefined") {
    return;
  }

  const existing = readQuizAttemptHistory();
  const nextAttempts = [attempt, ...existing].slice(0, 100);
  window.localStorage.setItem(QUIZ_ATTEMPT_STORAGE_KEY, JSON.stringify(nextAttempts));
}
