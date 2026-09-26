"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SEARCH_INDEX } from "@/lib/admin/search-index";
import { cn } from "@/lib/utils";

export function AdminSearch() {
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
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative w-full max-w-xs">
      <input
        ref={inputRef}
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
        className="h-9 w-full rounded-full border border-border bg-background px-3.5 text-sm"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-10 z-20 max-h-80 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          {results.map((item, i) => (
            <li key={item.href + item.label}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item.href)}
                className={cn(
                  "block w-full rounded-lg px-3 py-2 text-left text-sm",
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
