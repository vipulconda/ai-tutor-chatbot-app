import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({
    profile: {
      ...profile,
      subjects: JSON.parse(profile.subjects),
      weakTopics: JSON.parse(profile.weakTopics),
      strongTopics: JSON.parse(profile.strongTopics),
      abilityScores: JSON.parse(profile.abilityScores),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { grade, board, preferredLang, subjects } = await req.json();

    const profile = await prisma.studentProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        grade: parseInt(grade),
        board,
        preferredLang: preferredLang || "English",
        subjects: JSON.stringify(subjects || []),
        weakTopics: "[]",
        strongTopics: "[]",
        abilityScores: JSON.stringify(
          Object.fromEntries((subjects || []).map((s: string) => [s.toLowerCase(), 50]))
        ),
      },
      update: {
        grade: parseInt(grade),
        board,
        preferredLang: preferredLang || "English",
        subjects: JSON.stringify(subjects || []),
      },
    });

    return NextResponse.json({
      profile: {
        ...profile,
        subjects: JSON.parse(profile.subjects),
        weakTopics: JSON.parse(profile.weakTopics),
        strongTopics: JSON.parse(profile.strongTopics),
        abilityScores: JSON.parse(profile.abilityScores),
      },
    });
  } catch (error) {
    console.error("Profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
