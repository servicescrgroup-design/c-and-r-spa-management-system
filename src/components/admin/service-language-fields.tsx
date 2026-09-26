"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addServiceLanguage, removeServiceLanguage } from "@/lib/admin/site-content-actions";
import { MENU_LANGUAGES, MENU_LANGUAGE_BY_CODE, type ServiceTranslations } from "@/lib/i18n/languages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "+ Add language" dropdown with flags. Adding a language adds it to every
 * service's editor (and to the booking page language picker). */
export function AddLanguageMenu({ enabled }: { enabled: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const available = MENU_LANGUAGES.filter((l) => !enabled.includes(l.code));

  async function add(code: string) {
    setBusy(true);
    setError(null);
    const result = await addServiceLanguage(code);
    setBusy(false);
    setOpen(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={busy || available.length === 0}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {busy ? "Adding..." : "+ Add language"}
        <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl bg-card p-1.5 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
        >
          {available.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="menuitem"
                onClick={() => add(l.code)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="text-lg leading-none">{l.flag}</span>
                <span className="flex-1">{l.name}</span>
                <span className="text-xs text-muted-foreground">{l.native}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Name + description inputs for each enabled extra language. Field names
 * are tr_name_<code> / tr_desc_<code>, read by updateService. */
export function ServiceLanguageFields({
  enabled,
  translations,
}: {
  enabled: string[];
  translations: ServiceTranslations;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(code: string, name: string) {
    if (
      !confirm(
        `Remove ${name} from all services? Saved ${name} names stay stored and come back if you add ${name} again.`,
      )
    )
      return;
    setRemoving(code);
    await removeServiceLanguage(code);
    setRemoving(null);
    router.refresh();
  }

  return (
    <>
      {enabled.map((code) => {
        const lang = MENU_LANGUAGE_BY_CODE.get(code);
        if (!lang) return null;
        const t = translations[code] ?? {};
        return (
          <div key={code} className="space-y-3 rounded-xl bg-muted/60 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="text-lg leading-none">{lang.flag}</span>
                {lang.name}
                <span className="font-normal text-muted-foreground">{lang.native}</span>
              </p>
              <button
                type="button"
                disabled={removing === code}
                onClick={() => remove(code, lang.name)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                {removing === code ? "Removing..." : "Remove language"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`tr_name_${code}`}>Name ({lang.name})</Label>
                <Input id={`tr_name_${code}`} name={`tr_name_${code}`} defaultValue={t.name ?? ""} lang={code} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`tr_desc_${code}`}>Description ({lang.name})</Label>
                <textarea
                  id={`tr_desc_${code}`}
                  name={`tr_desc_${code}`}
                  rows={2}
                  lang={code}
                  defaultValue={t.description ?? ""}
                  className="flex w-full rounded-xl border border-border bg-card px-3.5 py-2 text-[15px]"
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
