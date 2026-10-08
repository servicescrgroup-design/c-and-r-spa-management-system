/**
 * One password rule for every staff, owner and business login. Used in the
 * browser (instant feedback) and again on the server (the real check).
 */

export const PASSWORD_MIN = 9;

export const PASSWORD_HINT =
  "At least 9 characters with letters and numbers. Avoid the shop name and 123. A phrase like green-mango-river-42 works well.";

// Words that make a password easy to guess for a spa in Chiang Mai.
const GUESSABLE = [
  "password",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "candr",
  "crgroup",
  "massage",
  "chiangmai",
  "thaimassage",
  "spa123",
];

const SEQUENCES = ["0123", "1234", "2345", "3456", "4567", "5678", "6789", "9876", "4321", "abcd", "1111", "0000"];

/** Why a password isn't good enough, or null when it's fine. */
export function passwordProblem(password: string, context: { email?: string | null; names?: (string | null | undefined)[] } = {}): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  const plain = password.toLowerCase().replace(/[^a-z0-9]/g, "");
  const word = GUESSABLE.find((w) => plain.includes(w));
  if (word) return `Leave out “${word}”. Shop names and common words are the first things people guess.`;
  if (SEQUENCES.some((s) => plain.includes(s))) return "Leave out runs like 1234 or 0000.";
  if (new Set(password).size < 5) return "Use more different characters.";
  const personal = [context.email?.split("@")[0], ...(context.names ?? [])]
    .map((v) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((v) => v.length >= 4);
  if (personal.some((p) => plain.includes(p))) return "Don't use your name or email in the password.";
  // A long passphrase is strong on its own; shorter ones need letters and numbers.
  if (password.length < 16 && !(/[a-z]/i.test(password) && /\d/.test(password))) return "Mix letters and numbers, or use a phrase of 16+ characters.";
  return null;
}
