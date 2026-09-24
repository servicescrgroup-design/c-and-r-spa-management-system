export type PaymentIntentResult = {
  clientSecret: string;
  providerRef: string;
};

export type PaymentResult = {
  status: "succeeded" | "pending" | "failed";
  providerRef: string;
};

export type RefundResult = {
  status: "succeeded" | "pending" | "failed";
  providerRef: string;
};

export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntentResult>;
  confirmPayment(providerRef: string): Promise<PaymentResult>;
  refund(providerRef: string, amountCents: number): Promise<RefundResult>;
}

export class PaymentsNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} is not configured yet. Set the required environment variables.`);
    this.name = "PaymentsNotConfiguredError";
  }
}

export async function getPaymentProvider(): Promise<PaymentProvider> {
  // Dynamically imported so an unconfigured Stripe key doesn't break routes
  // that never touch card payments (cash-only POS flows, non-deposit bookings).
  const { getStripeProvider } = await import("./stripe/provider");
  return getStripeProvider();
}
