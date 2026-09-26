"use client";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { code: "en", label: "EN", title: "English" },
  { code: "th", label: "ไทย", title: "ภาษาไทย" },
] as const;

function saveLocale(code: "en" | "th") {
  document.cookie = `ui_locale=${code}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

/** EN / ไทย switch for the staff side. Saves the choice for a year and
 * reloads so every page renders in the chosen language. */
export function LanguageToggle({ locale }: { locale: "en" | "th" }) {
  function choose(code: "en" | "th") {
    if (code === locale) return;
    saveLocale(code);
  }

  return (
    <div role="group" aria-label="Language" data-no-translate className="flex shrink-0 rounded-full bg-muted p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          type="button"
          title={o.title}
          aria-pressed={locale === o.code}
          onClick={() => choose(o.code)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[12px] transition-colors",
            locale === o.code
              ? "bg-card font-medium text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
              : "text-foreground/60 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
