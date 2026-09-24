"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Phone sign-in/sign-up: Supabase has no way to text someone a real account
 * password, so this uses its actual mechanism for this — a one-time code
 * sent by SMS that acts as the password for that single sign-in. The same
 * flow creates a new account on first use or signs an existing one in.
 * Requires a phone/SMS provider (e.g. Twilio) configured in the Supabase
 * dashboard under Authentication > Providers > Phone before it can send
 * anything.
 */
export function PhoneAuthForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setStep("code");
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.push("/account");
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter the code we texted to {phone}.
        </p>
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Verifying..." : "Verify & continue"}
        </Button>
        <button
          type="button"
          onClick={() => setStep("phone")}
          className="w-full text-center text-sm text-muted-foreground hover:underline"
        >
          Use a different number
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendCode} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+1 555 555 5555"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Sending..." : "Text me a code"}
      </Button>
    </form>
  );
}
