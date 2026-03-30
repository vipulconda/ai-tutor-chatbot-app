import type { StudentProfileData } from "@/types";

export interface TopicPerformance {
  topic: string;
  correct: number;
  total: number;
}

export interface QuizPerformanceUpdate {
  subject: string;
  scorePercent: number;
  questionCount: number;
  topicPerformance: TopicPerformance[];
}

const MIN_LEARNING_RATE = 8;
const MAX_LEARNING_RATE = 12;
const MIN_SCORE = 0;
const MAX_SCORE = 100;
const FULL_CONFIDENCE_AT = 20;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toUniqueTopics(topics: Iterable<string>) {
  return Array.from(
    new Set(
      Array.from(topics)
        .map((topic) => topic.trim())
        .filter(Boolean)
    )
  );
}

function getConfidenceWeightedLearningRate(questionCount: number) {
  const confidence = clamp(questionCount / FULL_CONFIDENCE_AT, 0, 1);
  return MIN_LEARNING_RATE + (MAX_LEARNING_RATE - MIN_LEARNING_RATE) * confidence;
}

function calculateNextAbilityScore(oldScore: number, scorePercent: number, questionCount: number) {
  const expectedScore = clamp(oldScore, MIN_SCORE, MAX_SCORE) / 100;
  const performanceScore = clamp(scorePercent, MIN_SCORE, MAX_SCORE) / 100;
  const learningRate = getConfidenceWeightedLearningRate(questionCount);
  const delta = learningRate * (performanceScore - expectedScore);

  return Math.round(clamp(oldScore + delta, MIN_SCORE, MAX_SCORE) * 10) / 10;
}

export function applyQuizPerformanceToProfile(
  profile: StudentProfileData,
  update: QuizPerformanceUpdate
) {
  const subjectKey = update.subject.toLowerCase();
  const previousAbility = profile.abilityScores[subjectKey] ?? 50;
  const nextAbilityScore = calculateNextAbilityScore(
    previousAbility,
    update.scorePercent,
    update.questionCount
  );

  const weakTopics = new Set(profile.weakTopics);
  const strongTopics = new Set(profile.strongTopics);

  for (const topicResult of update.topicPerformance) {
    const topic = topicResult.topic.trim();

    if (!topic || topicResult.total <= 0) {
      continue;
    }

    const topicAccuracy = topicResult.correct / topicResult.total;

    if (topicAccuracy >= 0.8) {
      strongTopics.add(topic);
      weakTopics.delete(topic);
      continue;
    }

    if (topicAccuracy <= 0.4) {
      weakTopics.add(topic);
      strongTopics.delete(topic);
      continue;
    }

    if (topicAccuracy >= 0.6) {
      weakTopics.delete(topic);
    }

    if (topicAccuracy <= 0.6) {
      strongTopics.delete(topic);
    }
  }

  return {
    abilityScores: {
      ...profile.abilityScores,
      [subjectKey]: nextAbilityScore,
    },
    weakTopics: toUniqueTopics(weakTopics).slice(0, 25),
    strongTopics: toUniqueTopics(strongTopics).slice(0, 25),
    totalSessions: profile.totalSessions + 1,
  };
}
