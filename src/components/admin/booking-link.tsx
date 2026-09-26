"use client";

import { useState } from "react";

export function BookingLink({ slug }: { slug: string }) {
  const [origin] = useState<string | null>(() => (typeof window === "undefined" ? null : window.location.origin));
  const [copied, setCopied] = useState(false);

  const path = `/book/${slug}`;
  const fullUrl = origin ? `${origin}${path}` : path;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context); the link is
      // still shown and clickable, so there's always a fallback.
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <a href={path} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
        {fullUrl}
      </a>
      <button
        type="button"
        onClick={copyLink}
        className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
