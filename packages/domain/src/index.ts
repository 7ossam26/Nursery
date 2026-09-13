export type Piastres = bigint & { readonly __brand: 'Piastres' };
export const piastres = (value: bigint): Piastres => value as Piastres;
export const addPiastres = (...values: readonly Piastres[]): Piastres => piastres(values.reduce((sum, value) => sum + value, 0n));
export const toPiastresJson = (value: Piastres): string => value.toString();

export const BUSINESS_TIME_ZONE = 'Africa/Cairo' as const;

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const isCalendarDate = (year: number, month: number, day: number): boolean => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
};

export const formatDateOnly = (isoDate: string): string => {
  const match = ISO_DATE_ONLY.exec(isoDate);
  if (!match || !isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    throw new RangeError('Expected a valid ISO date-only value (yyyy-MM-dd).');
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
};

export const parseDisplayDate = (displayDate: string): string | null => {
  const match = DISPLAY_DATE.exec(displayDate.trim());
  if (!match || !isCalendarDate(Number(match[3]), Number(match[2]), Number(match[1]))) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

export const formatCairoDate = (instant: Date | string | number): string => {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError('Expected a valid instant.');
  const parts = new Intl.DateTimeFormat('en-GB-u-nu-latn', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('day')}/${value('month')}/${value('year')}`;
};

export const formatEgp = (value: Piastres): string => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const pounds = absolute / 100n;
  const remainder = (absolute % 100n).toString().padStart(2, '0');
  const groupedPounds = pounds.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}EGP ${groupedPounds}.${remainder}`;
};

// ISO date-only (yyyy-MM-dd) strings compare correctly with plain string comparison.
export const cairoIsoDate = (instant: Date | string | number = new Date()): string => {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError('Expected a valid instant.');
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

export const addIsoDays = (isoDate: string, days: number): string => {
  const match = ISO_DATE_ONLY.exec(isoDate);
  if (!match || !isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) throw new RangeError('Expected a valid ISO date-only value (yyyy-MM-dd).');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}`.padStart(4, '0') + '-' + `${date.getUTCMonth() + 1}`.padStart(2, '0') + '-' + `${date.getUTCDate()}`.padStart(2, '0');
};

export type SubscriptionAccessStatus = 'ACTIVE' | 'GRACE' | 'SUSPENDED';
// Pure Cairo-date boundary: valid_until is inclusive, grace extends access, then normal use is suspended.
export const subscriptionAccessStatus = (today: string, validUntil: string, graceDays: number): SubscriptionAccessStatus => {
  if (today <= validUntil) return 'ACTIVE';
  return today <= addIsoDays(validUntil, graceDays) ? 'GRACE' : 'SUSPENDED';
};

const srgbChannel = (value: number): number => {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};
const relativeLuminance = (hex: string): number => {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) throw new RangeError('Expected a 6-digit hex color.');
  const value = match[1];
  const r = srgbChannel(parseInt(value.slice(0, 2), 16));
  const g = srgbChannel(parseInt(value.slice(2, 4), 16));
  const b = srgbChannel(parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// WCAG 2.x contrast ratio between two sRGB hex colors, order-independent.
export const contrastRatio = (hexA: string, hexB: string): number => {
  const a = relativeLuminance(hexA) + 0.05;
  const b = relativeLuminance(hexB) + 0.05;
  return a > b ? a / b : b / a;
};
export const MINIMUM_TEXT_CONTRAST = 4.5;
// Picks whichever candidate foreground reads best on a background, for derived button/badge text.
export const bestForeground = (background: string, candidates: readonly string[]): { foreground: string; ratio: number } => {
  if (candidates.length === 0) throw new RangeError('At least one candidate foreground is required.');
  return candidates.map((foreground) => ({ foreground, ratio: contrastRatio(foreground, background) })).sort((a, b) => b.ratio - a.ratio)[0];
};

// WhatsApp deep links need digits only. Egyptian local numbers start with 0 (mobile 01x, landline area codes);
// a leading '+' or '00' marks an explicit international prefix. Returns null when digits cannot form a valid number.
export const normalizeWhatsAppNumber = (mobile: string, defaultCountryCode = '20'): string | null => {
  const trimmed = mobile.trim();
  if (!/^\+?[0-9 ()-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = defaultCountryCode + digits.slice(1);
    else if (!digits.startsWith(defaultCountryCode)) digits = defaultCountryCode + digits;
  }
  return digits.length >= 8 && digits.length <= 15 && !digits.startsWith('0') ? digits : null;
};
export const whatsAppLink = (normalizedNumber: string): string => {
  if (!/^[1-9][0-9]{7,14}$/.test(normalizedNumber)) throw new RangeError('Expected a normalized WhatsApp number.');
  return `https://wa.me/${normalizedNumber}`;
};
