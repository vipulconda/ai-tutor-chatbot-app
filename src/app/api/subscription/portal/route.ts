import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Stripe Customer Portal
 * 
 * In production, this would redirect to Stripe's Customer Portal.
 * Currently mocked for development.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // In production: create a Stripe portal session and return the URL
  // const portalSession = await stripe.billingPortal.sessions.create({
  //   customer: subscription.stripeCustomerId,
  //   return_url: `${process.env.NEXTAUTH_URL}/settings`,
  // });

  return NextResponse.json({
    url: "/settings",
    message: "Stripe Customer Portal is not configured yet. Manage your plan from Settings.",
  });
}
