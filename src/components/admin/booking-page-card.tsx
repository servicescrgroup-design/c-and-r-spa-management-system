"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateBookingText } from "@/lib/admin/site-content-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The business's public booking link, plus the words under its name. */
export function BookingPageCard({ slug, tagline, intro }: { slug: string; tagline: string | null; intro: string | null }) {
  const router = useRouter();
  const [line1, setLine1] = useState(tagline ?? "");
  const [line2, setLine2] = useState(intro ?? "");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const path = `/b/${slug}`;

  async function save() {
    setBusy(true);
    setMessage(null);
    const result = await updateBookingText({ tagline: line1, intro: line2 }).catch(() => ({ ok: false as const, error: "Couldn't save." }));
    setBusy(false);
    setMessage(result.ok ? "Saved." : result.error);
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-muted px-3 py-2 text-sm" data-no-translate>
          {path}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${path}`).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={path} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
          Open
        </a>
      </div>
      <p className="text-xs text-muted-foreground">Put this link in your Google Maps listing, Facebook page and LINE profile.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tagline">Tagline</Label>
          <Input id="tagline" value={line1} maxLength={80} onChange={(e) => setLine1(e.target.value)} placeholder="e.g. Relax further." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="intro">One line about you</Label>
          <Input id="intro" value={line2} maxLength={200} onChange={(e) => setLine2(e.target.value)} placeholder="e.g. Thai massage near Tha Phae Gate." />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          {busy ? "Saving..." : "Save"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}
