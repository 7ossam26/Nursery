export const nurseryTokens = {
  color: {
    brand: '#F13E93',
    brandSoft: '#F891BB',
    peach: '#F9D0CD',
    notice: '#FAFFCB',
    text: '#111827',
    textMuted: '#4B5563',
    surface: '#FFFFFF',
    surfaceSubtle: '#FFF9FB',
    background: '#FFF7FA',
    action: '#BE185D',
    actionHover: '#9D174D',
    success: '#166534',
    successSurface: '#DCFCE7',
    warning: '#92400E',
    warningSurface: '#FEF3C7',
    error: '#B42318',
    errorSurface: '#FEE4E2',
    info: '#1D4ED8',
    infoSurface: '#DBEAFE',
    border: '#D1D5DB',
    focus: '#7C3AED',
    support: '#312E81',
    supportSurface: '#EEF2FF'
  },
  radius: { small: '0.5rem', medium: '0.875rem', large: '1.25rem', pill: '999px' },
  shadow: { card: '0 12px 32px rgba(77, 20, 50, 0.08)', modal: '0 24px 80px rgba(17, 24, 39, 0.24)' },
  motion: { quick: '150ms', standard: '220ms' },
  size: { controlMinimum: '2.75rem', contentMaximum: '90rem' }
} as const;

type Rgb = Readonly<{ red: number; green: number; blue: number }>;

const parseHex = (color: string): Rgb | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  return {
    red: Number.parseInt(match[1].slice(0, 2), 16),
    green: Number.parseInt(match[1].slice(2, 4), 16),
    blue: Number.parseInt(match[1].slice(4, 6), 16)
  };
};

const channelLuminance = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

export const contrastRatio = (foreground: string, background: string): number => {
  const foregroundRgb = parseHex(foreground);
  const backgroundRgb = parseHex(background);
  if (!foregroundRgb || !backgroundRgb) throw new TypeError('Colors must be six-digit hexadecimal values.');
  const luminance = ({ red, green, blue }: Rgb) =>
    0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
  const lighter = Math.max(luminance(foregroundRgb), luminance(backgroundRgb));
  const darker = Math.min(luminance(foregroundRgb), luminance(backgroundRgb));
  return (lighter + 0.05) / (darker + 0.05);
};

export const validatesTextContrast = (foreground: string, background: string, largeText = false): boolean =>
  contrastRatio(foreground, background) >= (largeText ? 3 : 4.5);

export const readableForeground = (background: string): '#111827' | '#FFFFFF' => {
  const dark = nurseryTokens.color.text;
  return contrastRatio(dark, background) >= contrastRatio('#FFFFFF', background) ? dark : '#FFFFFF';
};
