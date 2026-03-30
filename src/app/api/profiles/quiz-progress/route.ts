import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyQuizPerformanceToProfile } from "@/lib/profile-learning";
import type { Board, StudentProfileData } from "@/types";

interface QuizProgressPayload {
  subject?: unknown;
  scorePercent?: unknown;
  questionCount?: unknown;
  topicPerformance?: unknown;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as QuizProgressPayload;
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const scorePercent =
      typeof body.scorePercent === "number" ? body.scorePercent : Number(body.scorePercent);
    const questionCount =
      typeof body.questionCount === "number" ? body.questionCount : Number(body.questionCount);
    const topicPerformance = Array.isArray(body.topicPerformance)
      ? body.topicPerformance
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const raw = entry as Record<string, unknown>;
            const topic = typeof raw.topic === "string" ? raw.topic.trim() : "";
            const correct =
              typeof raw.correct === "number" ? raw.correct : Number(raw.correct ?? 0);
            const total = typeof raw.total === "number" ? raw.total : Number(raw.total ?? 0);

            if (!topic || !Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) {
              return null;
            }

            return { topic, correct, total };
          })
          .filter((entry): entry is { topic: string; correct: number; total: number } => entry !== null)
      : [];

    if (!subject || !Number.isFinite(scorePercent) || !Number.isFinite(questionCount) || questionCount <= 0) {
      return NextResponse.json({ error: "Invalid quiz progress payload" }, { status: 400 });
    }

    const profileRaw = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (!profileRaw) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const profile: StudentProfileData = {
      ...profileRaw,
      board: profileRaw.board as Board,
      subjects: JSON.parse(profileRaw.subjects),
      weakTopics: JSON.parse(profileRaw.weakTopics),
      strongTopics: JSON.parse(profileRaw.strongTopics),
      abilityScores: JSON.parse(profileRaw.abilityScores),
    };

    const nextProgress = applyQuizPerformanceToProfile(profile, {
      subject,
      scorePercent,
      questionCount,
      topicPerformance,
    });

    const updatedProfile = await prisma.studentProfile.update({
      where: { userId: session.user.id },
      data: {
        abilityScores: JSON.stringify(nextProgress.abilityScores),
        weakTopics: JSON.stringify(nextProgress.weakTopics),
        strongTopics: JSON.stringify(nextProgress.strongTopics),
        totalSessions: nextProgress.totalSessions,
      },
    });

    return NextResponse.json({
      profile: {
        ...updatedProfile,
        board: updatedProfile.board as Board,
        subjects: JSON.parse(updatedProfile.subjects),
        weakTopics: JSON.parse(updatedProfile.weakTopics),
        strongTopics: JSON.parse(updatedProfile.strongTopics),
        abilityScores: JSON.parse(updatedProfile.abilityScores),
      },
    });
  } catch (error) {
    console.error("Quiz progress update error:", error);
    return NextResponse.json({ error: "Failed to update quiz progress" }, { status: 500 });
  }
}
