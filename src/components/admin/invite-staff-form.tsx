"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStaffLogin, inviteStaff } from "@/lib/admin/schedule-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "therapist", label: "Therapist" },
  { value: "front_desk", label: "Front desk" },
  { value: "manager", label: "Admin (Backend Team)" },
  { value: "owner", label: "Owner" },
];

const SELECT = "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

type Mode = "create" | "invite";

/** Add a staff login: create it now with a password, or send an invite link. */
export function InviteStaffForm({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setInviteLink(null);
    setCopied(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    if (mode === "create") {
      const result = await createStaffLogin(data).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
      setLoading(false);
      if (!result.ok) return setError(result.error);
      setMessage(`Login created. They sign in at ${window.location.origin}/auth/staff-login with ${data.get("email")} and the password you set.`);
    } else {
      const result = await inviteStaff(data).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
      setLoading(false);
      if (!result.ok) return setError(result.error);
      if ("token" in result && result.token) setInviteLink(`${window.location.origin}/auth/staff-invite/${result.token}`);
      setMessage("Invite created. Send them this link. It works for 7 days.");
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex rounded-full bg-muted p-0.5 text-sm" role="radiogroup" aria-label="How to add them">
        {(
          [
            { id: "create", label: "Create login now" },
            { id: "invite", label: "Send invite link" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn("h-8 flex-1 rounded-full px-3", mode === m.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "create"
          ? "Best for staff who don't check email. You set the password and tell them in person."
          : "They open the link on their phone and choose their own password."}
      </p>

      {mode === "create" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="e.g. nok.cr@gmail.com" />
      </div>
      {mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor="password">Password (8+ characters)</Label>
          <Input id="password" name="password" type="text" minLength={8} required autoComplete="new-password" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <select id="role" name="role" required className={SELECT}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="branchId">Store (blank = all stores)</Label>
        <select id="branchId" name="branchId" className={SELECT}>
          <option value="">All stores</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-primary">{message}</p>}
      {inviteLink && (
        <div className="flex gap-2">
          <Input readOnly value={inviteLink} onFocus={(e) => e.target.select()} className="text-xs" />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(inviteLink).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : mode === "create" ? "Create login" : "Create invite link"}
      </Button>
    </form>
  );
}
