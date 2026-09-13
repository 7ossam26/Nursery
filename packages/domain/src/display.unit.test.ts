import { describe, expect, it } from 'vitest';
import { formatCairoDate, formatDateOnly, formatEgp, parseDisplayDate, piastres } from './index.js';

describe('language-independent display helpers', () => {
  it('round-trips valid date-only values without a timezone conversion', () => {
    expect(formatDateOnly('2026-09-13')).toBe('13/09/2026');
    expect(parseDisplayDate('13/09/2026')).toBe('2026-09-13');
    expect(parseDisplayDate('31/02/2026')).toBeNull();
    expect(() => formatDateOnly('2026-02-31')).toThrow(RangeError);
  });

  it('uses the Cairo calendar date and Latin digits for instants', () => {
    expect(formatCairoDate('2026-09-12T22:30:00.000Z')).toBe('13/09/2026');
  });

  it('formats integer piastres exactly without floating point arithmetic', () => {
    expect(formatEgp(piastres(123456789012345678n))).toBe('EGP 1,234,567,890,123,456.78');
    expect(formatEgp(piastres(-5n))).toBe('-EGP 0.05');
  });
});
