import { describe, expect, it } from 'vitest';
import { catalogs, directionForLocale, translate } from './catalogs.js';
import { resolveInitialLocale } from './LocaleProvider.js';

describe('bilingual catalogs', () => {
  it('keeps identical message keys in English and Egyptian Arabic', () => {
    expect(Object.keys(catalogs['ar-EG']).sort()).toEqual(Object.keys(catalogs.en).sort());
  });

  it('resolves a user preference before a local preference and sets direction', () => {
    expect(resolveInitialLocale('ar-EG', 'en')).toBe('ar-EG');
    expect(resolveInitialLocale(null, 'ar-EG')).toBe('ar-EG');
    expect(resolveInitialLocale('unsupported', 'unsupported')).toBe('en');
    expect(directionForLocale('ar-EG')).toBe('rtl');
    expect(directionForLocale('en')).toBe('ltr');
  });

  it('changes translated display copy without translating a stored business value', () => {
    const storedStatus = 'paid';
    expect(translate('en', 'status.paid')).toBe('Paid');
    expect(translate('ar-EG', 'status.paid')).toBe('تم السداد');
    expect(storedStatus).toBe('paid');
  });
});
