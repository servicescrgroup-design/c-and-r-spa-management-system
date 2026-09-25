import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook receiver for booking deposits. Confirmation happens here
 * (not in the browser after confirmPayment) because that's the only place
 * we can trust the payment actually succeeded — a client can lose its
 * network connection right after a successful charge.
 */
export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe is not configured on this environment yet." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await supabase
        .from("appointments")
        .update({ status: "confirmed", deposit_status: "paid" })
        .eq("deposit_payment_ref", intent.id);
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await supabase
        .from("appointments")
        .update({ deposit_status: "failed" })
        .eq("deposit_payment_ref", intent.id);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (intentId) {
        await supabase
          .from("appointments")
          .update({ deposit_status: "refunded" })
          .eq("deposit_payment_ref", intentId);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
