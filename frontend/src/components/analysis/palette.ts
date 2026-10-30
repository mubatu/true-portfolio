// Validated categorical palette (dataviz reference, CVD-checked), used in
// fixed order; light and dark steps are chosen per surface.
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];

/**
 * One color per key, following the key (alphabetical order), never its
 * rank by size, so an item keeps its color across charts. Beyond the
 * palette the colors repeat; callers that can group the rest ("Other")
 * should do so first.
 */
export function categoricalColors(keys: string[], theme: 'light' | 'dark'): Map<string, string> {
  const palette = theme === 'dark' ? SERIES_DARK : SERIES_LIGHT;
  return new Map([...keys].sort((a, b) => a.localeCompare(b)).map((k, i) => [k, palette[i % palette.length]]));
}
