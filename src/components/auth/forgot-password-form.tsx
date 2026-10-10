"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Ask for a reset link by email. Same message whether or not the email has an account. */
export function ForgotPasswordForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      // Rate limits are the only error worth showing; never say whether the email exists.
      if (resetError.status === 429 || /rate|seconds/i.test(resetError.message)) {
        setError("Too many requests. Wait a minute and try again.");
        return;
      }
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-2 rounded-2xl bg-primary/10 p-4 text-sm">
        <p className="font-medium">Check your email.</p>
        <p className="text-muted-foreground">
          If {email.trim()} has an account, a reset link is on its way. Open it on this same phone or computer. It works
          once and expires in 1 hour. Check Spam if you don&apos;t see it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
