import "server-only";
import { cookies } from "next/headers";

export type UiLocale = "en" | "th";

export const UI_LOCALE_COOKIE = "ui_locale";

/** The staff interface language, chosen with the EN / ไทย switch. Until
 * someone picks one, `fallback` applies (Thai for the therapist app). */
export async function getUiLocale(fallback: UiLocale = "en"): Promise<UiLocale> {
  const value = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
  return value === "th" ? "th" : value === "en" ? "en" : fallback;
}
