"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PASSWORD_HINT, PASSWORD_MIN, passwordProblem } from "@/lib/auth/password-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Choose a new password after opening a reset link. */
export function ResetPasswordForm({ email }: { email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const problem = passwordProblem(password, { email });
    if (problem) return setError(problem);
    if (password !== confirm) return setError("The two passwords don't match.");

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(
        /same|different/i.test(updateError.message)
          ? "Choose a password you haven't used for this account before."
          : updateError.message,
      );
      return;
    }
    // Anyone still signed in with the old password is signed out.
    await supabase.auth.signOut({ scope: "others" });

    const { data: { user } } = await supabase.auth.getUser();
    const { data: roles } = user
      ? await supabase.from("staff_branch_roles").select("role").eq("staff_id", user.id)
      : { data: [] };
    const set = new Set((roles ?? []).map((r) => r.role));
    setLoading(false);
    router.push(
      set.has("owner") || set.has("manager") ? "/admin" : set.has("front_desk") ? "/pos" : set.has("therapist") ? "/therapist" : "/account",
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {email && (
        <p className="text-sm text-muted-foreground">
          New password for <span className="font-medium text-foreground">{email}</span>
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Type it again</Label>
        <Input
          id="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show what I typed
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : "Save new password"}
      </Button>
    </form>
  );
}
