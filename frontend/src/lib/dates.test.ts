import { describe, expect, it } from 'vitest';
import { addDaysIso } from './dates';

describe('addDaysIso', () => {
  it('shifts across month and year ends', () => {
    expect(addDaysIso('2026-10-30', -1)).toBe('2026-10-29');
    expect(addDaysIso('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is not moved by daylight saving changes', () => {
    // Europe-wide DST ends on 2026-10-25; the shift must stay one calendar day.
    expect(addDaysIso('2026-10-26', -1)).toBe('2026-10-25');
    expect(addDaysIso('2026-03-30', -1)).toBe('2026-03-29');
  });
});
