"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBusiness } from "@/lib/auth/business-actions";
import { PASSWORD_HINT, PASSWORD_MIN, passwordProblem } from "@/lib/auth/password-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Defaults = { businessName?: string; storeName?: string; firstName?: string; lastName?: string; phone?: string };

/**
 * New business sign-up. With `signedIn`, the login already exists (the owner
 * confirmed their email and signed in), so only the business is created.
 */
export function BusinessSignupForm({ signedIn = false, defaults = {} }: { signedIn?: boolean; defaults?: Defaults }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(defaults.businessName ?? "");
  const [storeName, setStoreName] = useState(defaults.storeName ?? "");
  const [firstName, setFirstName] = useState(defaults.firstName ?? "");
  const [lastName, setLastName] = useState(defaults.lastName ?? "");
  const [phone, setPhone] = useState(defaults.phone ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sampleMenu, setSampleMenu] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function finish() {
    const result = await createBusiness({ businessName, storeName, firstName, lastName, phone, sampleMenu }).catch(() => ({
      ok: false as const,
      error: "Couldn't create your business. Try again.",
    }));
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }
    router.push("/admin/get-started");
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!businessName.trim() || !storeName.trim() || !firstName.trim()) {
      setError("Fill in your business name, first store and your name.");
      return;
    }
    setLoading(true);

    if (signedIn) return finish();

    const problem = passwordProblem(password, { email, names: [firstName, lastName, businessName] });
    if (problem) {
      setLoading(false);
      setError(problem);
      return;
    }
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Marks this as an owner sign-up, so no customer record is made, and
        // keeps the details for /start if the email has to be confirmed first.
        data: {
          signup_kind: "business",
          business_name: businessName.trim(),
          store_name: storeName.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/start`,
      },
    });
    if (signUpError) {
      setLoading(false);
      setError(
        signUpError.message.toLowerCase().includes("registered")
          ? "That email already has a login. Log in instead."
          : signUpError.message,
      );
      return;
    }
    if (!data.session) {
      setLoading(false);
      setCheckEmail(true);
      return;
    }
    await finish();
  }

  if (checkEmail) {
    return (
      <div className="space-y-2 rounded-2xl bg-primary/10 p-5">
        <p className="font-medium">Check {email} for a confirmation link.</p>
        <p className="text-sm text-muted-foreground">
          Open it on this device. You&apos;ll come back here to finish setting up {businessName.trim()}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input id="businessName" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Lotus Thai Massage" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="storeName">First store</Label>
        <Input id="storeName" required value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. Old Town" />
        <p className="text-xs text-muted-foreground">You can add more stores later.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="firstName">Your first name</Label>
          <Input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {!signedIn && (
        <>
          <div className="space-y-2">
            <Label htmlFor="email">Email (your login)</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
          </div>
        </>
      )}
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={sampleMenu} onChange={(e) => setSampleMenu(e.target.checked)} className="mt-0.5 size-4" />
        <span>
          Start with a sample menu (Thai, foot and oil massage with example prices). You can change or delete it any time.
        </span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Setting up..." : signedIn ? "Create my business" : "Create my account"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Your business starts empty and private. No other business can see your sales, staff or customers.
      </p>
    </form>
  );
}
