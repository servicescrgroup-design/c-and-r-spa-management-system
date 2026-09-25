"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function DepositForm({ onSuccess, payLabel }: { onSuccess: () => void; payLabel: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try another card.");
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={!stripe || submitting}>
        {submitting ? "..." : payLabel}
      </Button>
    </form>
  );
}

export function DepositCheckout({
  clientSecret,
  onSuccess,
  payLabel,
}: {
  clientSecret: string;
  onSuccess: () => void;
  payLabel: string;
}) {
  if (!stripePromise) {
    return (
      <p className="text-sm text-destructive">
        Online card payments aren&apos;t configured yet. Please contact the front desk to secure your booking.
      </p>
    );
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <DepositForm onSuccess={onSuccess} payLabel={payLabel} />
    </Elements>
  );
}
