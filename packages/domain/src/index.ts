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
