import "server-only";
import { cookies } from "next/headers";

export type UiLocale = "en" | "th";

export const UI_LOCALE_COOKIE = "ui_locale";

/** The staff interface language, chosen with the EN / ไทย switch. */
export async function getUiLocale(): Promise<UiLocale> {
  const value = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
  return value === "th" ? "th" : "en";
}
