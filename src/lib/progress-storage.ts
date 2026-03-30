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

/**
 * Build a user-scoped localStorage key so quiz history
 * never leaks across accounts on the same browser.
 */
function getStorageKey(userId?: string): string {
  const base = "quiz-attempt-history";
  return userId ? `${base}:${userId}` : base;
}

export function readQuizAttemptHistory(userId?: string): QuizAttemptRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(userId));
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQuizAttempt(attempt: QuizAttemptRecord, userId?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const key = getStorageKey(userId);
  const existing = readQuizAttemptHistory(userId);
  const nextAttempts = [attempt, ...existing].slice(0, 100);
  window.localStorage.setItem(key, JSON.stringify(nextAttempts));
}

/**
 * Remove all quiz data for the current user from localStorage.
 * Called on sign-out to prevent data leaking to the next user.
 */
export function clearQuizAttemptHistory(userId?: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getStorageKey(userId));
}
