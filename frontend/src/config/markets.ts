/**
 * Market configurations
 * Add new markets here as your app expands
 */

export type Market = 'BIST' | 'TEFAS';

export interface MarketConfig {
  value: Market;
  label: string;
  currency: string;    // ISO 4217 currency code
  country: string;     // For future use (flags, etc.)
  suffix: string;      // yfinance exchange suffix (e.g. '.IS' for Istanbul)
  /** Prices come from uploaded files (TEFAS Excel), not Yahoo. */
  uploadedPrices?: boolean;
}

export const MARKETS: MarketConfig[] = [
  { 
    value: 'BIST', 
    label: 'BIST (Borsa İstanbul)', 
    currency: 'TRY',
    country: 'TR',
    suffix: '.IS',
  },
  {
    value: 'TEFAS',
    label: 'TEFAS (Yatırım fonları)',
    currency: 'TRY',
    country: 'TR',
    suffix: '.TEFAS',
    uploadedPrices: true,
  },
  // Future markets:
  // { value: 'NYSE', label: 'NYSE (New York Stock Exchange)', currency: 'USD', country: 'US', suffix: '' },
  // { value: 'NASDAQ', label: 'NASDAQ', currency: 'USD', country: 'US', suffix: '' },
];

/**
 * Get currency code for a market
 */
export const getMarketCurrency = (marketCode: string): string => {
  const market = MARKETS.find((m) => m.value === marketCode);
  return market?.currency || 'TRY';
};

/**
 * Get market config by value
 */
export const getMarketConfig = (marketCode: string): MarketConfig | undefined => {
  return MARKETS.find((m) => m.value === marketCode);
};

/** True for markets whose prices the user uploads (TEFAS funds). */
export const hasUploadedPrices = (marketCode: string): boolean =>
  Boolean(getMarketConfig(marketCode)?.uploadedPrices);

/**
 * Get the yfinance suffix for a market (e.g. '.IS' for BIST)
 */
export const getMarketSuffix = (marketCode: string): string => {
  const market = MARKETS.find((m) => m.value === marketCode);
  return market?.suffix || '';
};

/**
 * Append the exchange suffix to a ticker for storage/yfinance usage
 * e.g. ('THYAO', 'BIST') => 'THYAO.IS'
 */
export const toFullTicker = (ticker: string, marketCode: string): string => {
  const suffix = getMarketSuffix(marketCode);
  // Don't double-append if suffix already present
  if (suffix && ticker.endsWith(suffix)) return ticker;
  return `${ticker}${suffix}`;
};

/**
 * Strip the exchange suffix from a ticker for display
 * e.g. 'THYAO.IS' => 'THYAO'
 */
export const toDisplayTicker = (ticker: string, marketCode: string): string => {
  const suffix = getMarketSuffix(marketCode);
  if (suffix && ticker.endsWith(suffix)) {
    return ticker.slice(0, -suffix.length);
  }
  return ticker;
};
