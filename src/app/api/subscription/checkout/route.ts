import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Stripe Checkout Session Creation
 * 
 * In production, this would create a Stripe Checkout Session.
 * Currently mocked for development — upgrades the user immediately.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tier } = await req.json();

    if (!["BASIC", "PRO"].includes(tier)) {
      return NextResponse.json(
        { error: "Invalid tier. Choose BASIC or PRO." },
        { status: 400 }
      );
    }

    const dailyMax = tier === "BASIC" ? 50 : 999999;

    // In production: create Stripe checkout session and redirect
    // For now: directly upgrade the subscription
    const subscription = await prisma.subscription.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        tier,
        status: "ACTIVE",
        dailyQuestionsUsed: 0,
        dailyQuestionsMax: dailyMax,
      },
      update: {
        tier,
        status: "ACTIVE",
        dailyQuestionsMax: dailyMax,
      },
    });

    return NextResponse.json({
      success: true,
      subscription: {
        tier: subscription.tier,
        status: subscription.status,
        dailyQuestionsMax: subscription.dailyQuestionsMax,
      },
      // In production, this would be a Stripe Checkout URL
      checkoutUrl: null,
      message: `Upgraded to ${tier} plan successfully! (Development mode — no payment required)`,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to process checkout" },
      { status: 500 }
    );
  }
}
