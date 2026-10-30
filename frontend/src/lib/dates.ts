// Calendar dates travel as ISO "yyyy-mm-dd" strings. Never round-trip them
// through UTC (`new Date("2026-10-30")`, `toISOString()`): near midnight in
// Türkiye that shifts the day.

/** Local Date at midnight for an ISO calendar date. */
export const parseIsoDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** Today's calendar date in the user's time zone, as yyyy-mm-dd. */
export const todayIso = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
