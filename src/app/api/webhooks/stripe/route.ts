import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Stripe webhook receiver. Signature verification and event handling
 * (payment_intent.succeeded -> confirm POS/booking payment, charge.refunded
 * -> reconcile refund) are implemented in Phase 5 once Stripe is connected.
 */
export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe is not configured on this environment yet." },
      { status: 503 },
    );
  }

  await request.text();
  return NextResponse.json({ received: true });
}
