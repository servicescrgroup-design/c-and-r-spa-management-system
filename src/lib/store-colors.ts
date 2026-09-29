// Store brand colours: each store's tabs, badges and chart bars use its own
// colour, and anything combining stores uses a gradient of all of them.

export type BrandedStore = { id: string; name: string; brand_color?: string | null };

export const FALLBACK_STORE_COLOR = "#6e6e73";

export function storeColor(store: BrandedStore | undefined | null): string {
  return store?.brand_color || FALLBACK_STORE_COLOR;
}

/** A hex colour at the given opacity, for light tinted backgrounds. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Left-to-right blend of the stores' colours, optionally faded. */
export function storesGradient(stores: BrandedStore[], alpha = 1): string {
  const colors = stores.map(storeColor);
  if (colors.length === 0) return FALLBACK_STORE_COLOR;
  if (colors.length === 1) return alpha === 1 ? colors[0] : tint(colors[0], alpha);
  return `linear-gradient(90deg, ${colors.map((c) => (alpha === 1 ? c : tint(c, alpha))).join(", ")})`;
}
