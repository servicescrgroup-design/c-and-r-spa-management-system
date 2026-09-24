import "server-only";
import Stripe from "stripe";
import {
  PaymentsNotConfiguredError,
  type PaymentIntentResult,
  type PaymentProvider,
  type PaymentResult,
  type RefundResult,
} from "../provider";

let cachedClient: Stripe | null = null;

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new PaymentsNotConfiguredError("Stripe");
  }
  if (!cachedClient) {
    cachedClient = new Stripe(key);
  }
  return cachedClient;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

class StripeProvider implements PaymentProvider {
  readonly name = "stripe";

  async createPaymentIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntentResult> {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      metadata,
      automatic_payment_methods: { enabled: true },
    });
    if (!intent.client_secret) {
      throw new Error("Stripe did not return a client secret");
    }
    return { clientSecret: intent.client_secret, providerRef: intent.id };
  }

  async confirmPayment(providerRef: string): Promise<PaymentResult> {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(providerRef);
    const status: PaymentResult["status"] =
      intent.status === "succeeded"
        ? "succeeded"
        : intent.status === "canceled"
          ? "failed"
          : "pending";
    return { status, providerRef: intent.id };
  }

  async refund(providerRef: string, amountCents: number): Promise<RefundResult> {
    const stripe = getStripeClient();
    const refund = await stripe.refunds.create({
      payment_intent: providerRef,
      amount: amountCents,
    });
    const status: RefundResult["status"] =
      refund.status === "succeeded"
        ? "succeeded"
        : refund.status === "failed"
          ? "failed"
          : "pending";
    return { status, providerRef: refund.id };
  }
}

const stripeProvider = new StripeProvider();

export function getStripeProvider(): PaymentProvider {
  return stripeProvider;
}
