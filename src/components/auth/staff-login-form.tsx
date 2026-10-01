"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StaffLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setLoading(false);
      setError(signInError?.message ?? "Sign in failed.");
      return;
    }

    // A new owner who confirmed their email but hasn't created the business yet.
    const { data: staffRow } = await supabase.from("staff").select("id").eq("id", data.user.id).maybeSingle();
    if (!staffRow) {
      setLoading(false);
      if (data.user.user_metadata?.signup_kind === "business") {
        router.push("/start");
        router.refresh();
        return;
      }
      await supabase.auth.signOut();
      setError("This login isn't a staff account. Customers sign in on their spa's booking page.");
      return;
    }

    const { data: roleRows } = await supabase
      .from("staff_branch_roles")
      .select("role")
      .eq("staff_id", data.user.id)
      .in("role", ["owner", "manager", "front_desk"]);

    const roles = new Set((roleRows ?? []).map((r) => r.role));
    const destination = roles.has("owner") || roles.has("manager") ? "/admin" : roles.has("front_desk") ? "/pos" : "/therapist";

    setLoading(false);
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
