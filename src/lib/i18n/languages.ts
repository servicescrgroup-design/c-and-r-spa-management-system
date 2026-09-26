/** Languages the service menu can be translated into, beyond English and
 * Thai (which have their own columns). Flags are emoji so they need no
 * image assets. */
export type MenuLanguage = { code: string; name: string; native: string; flag: string };

export const MENU_LANGUAGES: MenuLanguage[] = [
  { code: "zh", name: "Chinese", native: "中文", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "ru", name: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "nl", name: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "sv", name: "Swedish", native: "Svenska", flag: "🇸🇪" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "he", name: "Hebrew", native: "עברית", flag: "🇮🇱" },
  { code: "ar", name: "Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "lo", name: "Lao", native: "ລາວ", flag: "🇱🇦" },
  { code: "my", name: "Burmese", native: "မြန်မာ", flag: "🇲🇲" },
];

export const MENU_LANGUAGE_BY_CODE = new Map(MENU_LANGUAGES.map((l) => [l.code, l]));

export type ServiceTranslations = Record<string, { name?: string; description?: string }>;

/** Narrow the jsonb column to a usable shape without trusting its contents. */
export function parseServiceTranslations(value: unknown): ServiceTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ServiceTranslations = {};
  for (const [code, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!MENU_LANGUAGE_BY_CODE.has(code) || !entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    out[code] = {
      name: typeof e.name === "string" ? e.name : undefined,
      description: typeof e.description === "string" ? e.description : undefined,
    };
  }
  return out;
}
