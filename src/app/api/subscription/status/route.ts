import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  if (!subscription) {
    // Create default free subscription
    const newSub = await prisma.subscription.create({
      data: {
        userId: session.user.id,
        tier: "FREE",
        status: "ACTIVE",
        dailyQuestionsUsed: 0,
        dailyQuestionsMax: 10,
      },
    });

    return NextResponse.json({
      subscription: {
        id: newSub.id,
        userId: newSub.userId,
        tier: newSub.tier,
        status: newSub.status,
        dailyQuestionsUsed: newSub.dailyQuestionsUsed,
        dailyQuestionsMax: newSub.dailyQuestionsMax,
      },
    });
  }

  // Reset daily count if new day
  const now = new Date();
  const lastReset = new Date(subscription.dailyResetAt);
  if (now.toDateString() !== lastReset.toDateString()) {
    await prisma.subscription.update({
      where: { userId: session.user.id },
      data: { dailyQuestionsUsed: 0, dailyResetAt: now },
    });
    subscription.dailyQuestionsUsed = 0;
  }

  return NextResponse.json({
    subscription: {
      id: subscription.id,
      userId: subscription.userId,
      tier: subscription.tier,
      status: subscription.status,
      dailyQuestionsUsed: subscription.dailyQuestionsUsed,
      dailyQuestionsMax: subscription.dailyQuestionsMax,
    },
  });
}
