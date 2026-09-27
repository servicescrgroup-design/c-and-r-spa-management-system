"use client";

import { useState } from "react";

const BASE = "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium";
const BUTTON = `${BASE} bg-white ring-1 ring-black/10 hover:bg-[#f5f5f7]`;
const PRIMARY = `${BASE} bg-[#1f7a35] text-white hover:bg-[#1a6b2e]`;

export function DepositCardActions({ summary, mapUrl }: { summary: string; mapUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  function link() {
    return window.location.href;
  }

  async function share() {
    const text = `${summary}\n${link()}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Deposit card", text: summary, url: link() });
        return;
      } catch {
        // Closed the share sheet; fall through to copying.
      }
    }
    await copy(text);
  }

  async function copy(text = link()) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", text);
    }
  }

  function open(url: string) {
    window.open(url, "_blank", "noopener");
  }

  const message = () => encodeURIComponent(`${summary}\n${link()}`);

  return (
    <div className="space-y-2 print:hidden">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => window.print()} className={PRIMARY}>
          Print / Save as PDF
        </button>
        <button type="button" onClick={share} className={BUTTON}>
          Send to customer
        </button>
        <button type="button" onClick={() => open(`https://line.me/R/share?text=${message()}`)} className={BUTTON}>
          Send by LINE
        </button>
        <button type="button" onClick={() => open(`https://wa.me/?text=${message()}`)} className={BUTTON}>
          Send by WhatsApp
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = `mailto:?subject=${encodeURIComponent("Your C&R Thai Massage deposit card")}&body=${message()}`;
          }}
          className={BUTTON}
        >
          Send by email
        </button>
        <button type="button" onClick={() => copy()} className={BUTTON}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {mapUrl && (
        <a href={mapUrl} target="_blank" rel="noreferrer" className="block text-center text-sm text-[#1f7a35] hover:underline">
          Directions to the store
        </a>
      )}
      <p className="text-center text-xs text-[#6e6e73]">
        To save a PDF, choose &quot;Save as PDF&quot; as the printer.
      </p>
    </div>
  );
}
