import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = req.nextUrl.searchParams.get("subject");

  const conversations = await prisma.conversation.findMany({
    where: {
      userId: session.user.id,
      ...(subject ? { subject } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      subject: true,
      topic: true,
      tokenCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subject, topic } = await req.json();

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      subject,
      topic: topic || null,
      messages: "[]",
      tokenCount: 0,
    },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
