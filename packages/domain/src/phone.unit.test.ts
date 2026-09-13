import { expect, it } from 'vitest';
import { normalizeWhatsAppNumber, whatsAppLink } from './index.js';
it('normalizes Egyptian local, international and prefixed numbers to digits only', () => {
  expect(normalizeWhatsAppNumber('01000000000')).toBe('201000000000');
  expect(normalizeWhatsAppNumber('010 0000 0000')).toBe('201000000000');
  expect(normalizeWhatsAppNumber('+20 100 000 0000')).toBe('201000000000');
  expect(normalizeWhatsAppNumber('0020 100 000 0000')).toBe('201000000000');
  expect(normalizeWhatsAppNumber('201000000000')).toBe('201000000000');
  expect(normalizeWhatsAppNumber('02 2345 6789')).toBe('20223456789');
  expect(normalizeWhatsAppNumber('+44 7700 900123')).toBe('447700900123');
  expect(normalizeWhatsAppNumber('1000000000')).toBe('201000000000');
});
it('rejects values that cannot be dialed and never emits non-digits', () => {
  expect(normalizeWhatsAppNumber('abc')).toBeNull();
  expect(normalizeWhatsAppNumber('0100')).toBeNull();
  expect(normalizeWhatsAppNumber('+0 100 000 0000')).toBeNull();
  expect(normalizeWhatsAppNumber('+1234567890123456')).toBeNull();
  expect(normalizeWhatsAppNumber('0100000000;rm -rf')).toBeNull();
  expect(whatsAppLink('201000000000')).toBe('https://wa.me/201000000000');
  expect(() => whatsAppLink('wa.me/x')).toThrow(RangeError);
});
