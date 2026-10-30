import type { CSSProperties } from 'react';

/**
 * Shared look of the analysis tables (per-stock P/L, dividends): a card
 * that scrolls inside a fixed height, so long histories don't push the
 * rest of the page down, with the header row stuck to its top.
 */
export const TABLE_CARD_CLASS = 'rounded-2xl border overflow-hidden';
export const TABLE_CARD_STYLE: CSSProperties = {
  borderColor: 'hsl(var(--border))',
  backgroundColor: 'hsl(var(--card))',
};
export const TABLE_SCROLL_CLASS = 'overflow-auto max-h-[28rem]';

/** The translucent muted header tint, laid over the card so rows scrolling
 * under a sticky header don't show through. */
export const HEAD_BG: CSSProperties = {
  background: 'linear-gradient(hsl(var(--muted) / 0.5), hsl(var(--muted) / 0.5)) hsl(var(--card))',
};
// Above the sticky first column of the body (z-10).
export const HEAD_CELL_CLASS = 'sticky top-0 z-20 px-3 py-3 text-xs font-medium whitespace-nowrap';
