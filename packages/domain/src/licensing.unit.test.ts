import { describe, expect, it } from 'vitest';
import { addIsoDays, bestForeground, cairoIsoDate, contrastRatio, subscriptionAccessStatus } from './index.js';

describe('subscription date boundaries use Cairo calendar dates', () => {
  it('adds days across month/year and leap-year boundaries in UTC calendar terms', () => {
    expect(addIsoDays('2026-01-28', 7)).toBe('2026-02-04');
    expect(addIsoDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => addIsoDays('2026-02-30', 1)).toThrow(RangeError);
  });
  it('reports the Cairo calendar date independent of UTC offset', () => {
    expect(cairoIsoDate('2026-09-12T22:30:00.000Z')).toBe('2026-09-13');
    expect(cairoIsoDate('2026-09-12T20:00:00.000Z')).toBe('2026-09-12');
  });
  it('is active through valid_until inclusive, in grace afterward, then suspended', () => {
    expect(subscriptionAccessStatus('2026-06-30', '2026-06-30', 7)).toBe('ACTIVE');
    expect(subscriptionAccessStatus('2026-07-01', '2026-06-30', 7)).toBe('GRACE');
    expect(subscriptionAccessStatus('2026-07-07', '2026-06-30', 7)).toBe('GRACE');
    expect(subscriptionAccessStatus('2026-07-08', '2026-06-30', 7)).toBe('SUSPENDED');
  });
});

describe('WCAG contrast helpers', () => {
  it('matches the documented worked examples', () => {
    expect(contrastRatio('#111827', '#F13E93')).toBeCloseTo(4.94, 1);
    expect(contrastRatio('#FFFFFF', '#BE185D')).toBeCloseTo(6.04, 1);
    expect(contrastRatio('#FFFFFF', '#F13E93')).toBeCloseTo(3.59, 1);
  });
  it('is symmetric and rejects malformed colors', () => {
    expect(contrastRatio('#111827', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#111827'));
    expect(() => contrastRatio('not-a-color', '#FFFFFF')).toThrow(RangeError);
  });
  it('picks whichever candidate foreground reads best on a background', () => {
    expect(bestForeground('#F13E93', ['#FFFFFF', '#111827']).foreground).toBe('#111827');
    expect(bestForeground('#111827', ['#FFFFFF', '#111827']).foreground).toBe('#FFFFFF');
  });
});
