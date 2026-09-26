"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEARCH_INDEX } from "@/lib/admin/search-index";
import { cn } from "@/lib/utils";

export function AdminSearch({
  autoFocus,
  onNavigate,
  large,
}: {
  autoFocus?: boolean;
  onNavigate?: () => void;
  large?: boolean;
} = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(
      (item) => item.label.toLowerCase().includes(q) || item.keywords?.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  function go(href: string) {
    router.push(href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    onNavigate?.();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      onNavigate?.();
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[activeIndex].href);
    }
  }

  return (
    <div className={cn("relative w-full", !large && "max-w-xs")}>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={cn(
          "pointer-events-none absolute text-muted-foreground",
          large ? "left-0 top-3.5 size-5" : "left-3 top-1/2 size-3.5 -translate-y-1/2",
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="7" cy="7" r="5" />
        <path d="m11 11 3.5 3.5" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        aria-label="Search the back office"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Search the back office..."
        className={cn(
          "w-full placeholder:text-muted-foreground focus-visible:outline-none",
          large
            ? "h-12 border-0 bg-transparent pl-9 text-2xl font-semibold tracking-tight"
            : "h-8 rounded-full bg-muted pl-8 pr-3 text-[13px] focus-visible:ring-4 focus-visible:ring-ring/20",
        )}
      />
      {open && results.length > 0 && (
        <ul
          className={cn(
            "z-20 max-h-80 overflow-y-auto",
            large
              ? "mt-4 space-y-0.5"
              : "absolute left-0 right-0 top-10 rounded-2xl bg-card p-1.5 shadow-xl ring-1 ring-black/5",
          )}
        >
          {results.map((item, i) => (
            <li key={item.href + item.label}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item.href)}
                className={cn(
                  "block w-full rounded-xl px-3 py-2 text-left",
                  large ? "text-[15px]" : "text-sm",
                  i === activeIndex ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
