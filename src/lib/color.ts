/** White text on a dark background, dark text on a light one — relative
 * luminance (WCAG formula), not just "is it a dark-sounding color". */
export function contrastTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#1a1a1a";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.4 ? "#1a1a1a" : "#ffffff";
}

export const PRESET_COLORS = [
  // Pastels
  "#eaf3ec",
  "#f5efe3",
  "#f0e9f2",
  "#e8eef5",
  "#f6e9e6",
  // Vivid / hard colors
  "#2f6b4f",
  "#8a5a2f",
  "#3a5a8a",
  "#7a3b56",
  "#1f2937",
];
