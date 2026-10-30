import type { CSSProperties } from 'react';

/**
 * Shared look of the analysis tables (per-stock P/L, dividends): they
 * scroll inside a fixed height within their panel, so long histories don't push the
 * rest of the page down, with the header row stuck to its top and the
 * totals row to its bottom.
 */
export const TABLE_SCROLL_CLASS = 'overflow-auto max-h-[28rem]';

/** The translucent muted header tint, laid over the card so rows scrolling
 * under a sticky header don't show through. */
export const HEAD_BG: CSSProperties = {
  background: 'linear-gradient(hsl(var(--muted) / 0.5), hsl(var(--muted) / 0.5)) hsl(var(--card))',
};
// Above the sticky first column of the body (z-10).
export const HEAD_CELL_CLASS = 'sticky top-0 z-20 px-3 py-3 text-xs font-medium whitespace-nowrap';

/**
 * The totals row, stuck to the bottom: every cell sticky and opaque so
 * rows scroll under it. Its top rule is an inset shadow, since a collapsed
 * table border stays behind when the cell sticks. A cell that is also
 * stuck to the left takes ``FOOT_CORNER_STYLE`` to sit above both.
 */
export const FOOT_ROW_CLASS =
  'font-semibold [&>*]:sticky [&>*]:bottom-0 [&>*]:z-20 [&>*]:bg-muted [&>*]:shadow-[inset_0_2px_0_hsl(var(--border))]';
export const FOOT_CORNER_STYLE: CSSProperties = { zIndex: 30 };
