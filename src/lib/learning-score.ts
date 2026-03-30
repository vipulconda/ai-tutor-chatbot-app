import type { StudentProfileData } from "@/types";
import type { QuizAttemptRecord } from "@/lib/progress-storage";

interface ConversationLike {
  subject: string;
  updatedAt: string;
}

export interface LearningScoreBreakdown {
  score: number;
  averageAbility: number;
  recentQuizAverage: number | null;
  subjectCoverage: number;
  consistencyScore: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function calculateStreak(activityDates: string[]) {
  const uniqueDays = new Set(activityDates.map((date) => date.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (uniqueDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function computeLearningScore(
  profile: StudentProfileData,
  quizAttempts: QuizAttemptRecord[],
  conversations: ConversationLike[]
): LearningScoreBreakdown {
  const abilityValues = Object.values(profile.abilityScores);
  const averageAbility =
    abilityValues.length > 0
      ? abilityValues.reduce((sum, value) => sum + value, 0) / abilityValues.length
      : 50;

  const recentQuizAttempts = [...quizAttempts]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);
  const recentQuizAverage =
    recentQuizAttempts.length > 0
      ? recentQuizAttempts.reduce((sum, attempt) => sum + attempt.scorePercent, 0) /
        recentQuizAttempts.length
      : null;

  const practicedSubjects = new Set([
    ...quizAttempts.map((attempt) => attempt.subject),
    ...conversations.map((conversation) => conversation.subject),
  ]);
  const subjectCoverage =
    profile.subjects.length > 0
      ? (practicedSubjects.size / profile.subjects.length) * 100
      : 0;

  const activityDates = [
    ...quizAttempts.map((attempt) => attempt.createdAt),
    ...conversations.map((conversation) => conversation.updatedAt),
  ];
  const streak = calculateStreak(activityDates);
  const consistencyScore = clamp((streak / 7) * 100, 0, 100);

  const score =
    recentQuizAverage !== null
      ? averageAbility * 0.45 +
        recentQuizAverage * 0.3 +
        subjectCoverage * 0.15 +
        consistencyScore * 0.1
      : averageAbility * 0.7 + subjectCoverage * 0.2 + consistencyScore * 0.1;

  return {
    score: roundToOneDecimal(clamp(score, 0, 100)),
    averageAbility: roundToOneDecimal(averageAbility),
    recentQuizAverage:
      recentQuizAverage !== null ? roundToOneDecimal(recentQuizAverage) : null,
    subjectCoverage: roundToOneDecimal(clamp(subjectCoverage, 0, 100)),
    consistencyScore: roundToOneDecimal(consistencyScore),
  };
}
