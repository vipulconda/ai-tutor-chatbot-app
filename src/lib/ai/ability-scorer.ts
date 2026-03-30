/**
 * Adaptive Ability Scoring System
 * 
 * Score is a float from 0–100, computed per subject.
 * Formula: newScore = oldScore + α × (performance - expected)
 * 
 * Performance factors:
 *   - accuracy (0-1):  40% weight
 *   - hint independence: 30% weight  (1 - hintRatio)
 *   - speed factor:     20% weight
 *   - session depth:    10% weight
 */

export interface SessionPerformance {
  questionsAttempted: number;
  correctAnswers: number;
  hintsUsed: number;
  totalHintsAvailable: number;
  avgResponseTimeSec: number;
  messageCount: number;
}

const LEARNING_RATE = 5.0;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

export function calculateNewAbilityScore(
  oldScore: number,
  performance: SessionPerformance
): number {
  if (performance.questionsAttempted === 0) return oldScore;

  // Accuracy: proportion of correct answers
  const accuracy = performance.correctAnswers / performance.questionsAttempted;

  // Hint independence: lower is better (used fewer hints)
  const hintRatio =
    performance.totalHintsAvailable > 0
      ? performance.hintsUsed / performance.totalHintsAvailable
      : 0;
  const hintIndependence = 1 - hintRatio;

  // Speed factor: normalized (faster = higher, capped at 1)
  // Baseline: 60 seconds per question for "average" speed
  const avgTimePerQuestion =
    performance.avgResponseTimeSec / Math.max(performance.questionsAttempted, 1);
  const speedFactor = Math.min(1, 60 / Math.max(avgTimePerQuestion, 10));

  // Session depth: more messages = deeper engagement (capped at 1)
  const depth = Math.min(1, performance.messageCount / 20);

  // Weighted performance score
  const performanceScore =
    accuracy * 0.4 +
    hintIndependence * 0.3 +
    speedFactor * 0.2 +
    depth * 0.1;

  // Expected performance based on current ability
  const expected = oldScore / 100;

  // Update score
  const delta = LEARNING_RATE * (performanceScore - expected);
  const newScore = Math.min(MAX_SCORE, Math.max(MIN_SCORE, oldScore + delta));

  return Math.round(newScore * 10) / 10; // 1 decimal place
}

export function identifyWeakTopics(
  conversationTopics: { topic: string; score: number }[]
): string[] {
  return conversationTopics
    .filter((t) => t.score < 50)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((t) => t.topic);
}

export function identifyStrongTopics(
  conversationTopics: { topic: string; score: number }[]
): string[] {
  return conversationTopics
    .filter((t) => t.score >= 75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((t) => t.topic);
}
