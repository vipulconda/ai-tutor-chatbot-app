import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe Webhook Handler
 * 
 * In production, this verifies the Stripe webhook signature and processes
 * subscription events (checkout completed, payment failed, cancelled, etc.)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    // In production:
    // const event = stripe.webhooks.constructEvent(
    //   body,
    //   signature,
    //   process.env.STRIPE_WEBHOOK_SECRET!
    // );

    // Mock event parsing for development
    let event;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        // Handle successful checkout:
        // 1. Look up the customer by stripeCustomerId
        // 2. Update their subscription tier based on the price ID
        // 3. Set dailyQuestionsMax according to tier
        console.log("Checkout completed:", event.data?.object?.customer);
        break;
      }

      case "invoice.payment_succeeded": {
        // Renewal payment succeeded — extend currentPeriodEnd
        console.log("Payment succeeded:", event.data?.object?.customer);
        break;
      }

      case "invoice.payment_failed": {
        // Payment failed — mark subscription as PAST_DUE
        console.log("Payment failed:", event.data?.object?.customer);
        break;
      }

      case "customer.subscription.deleted": {
        // Subscription cancelled — downgrade to FREE
        console.log("Subscription cancelled:", event.data?.object?.customer);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
