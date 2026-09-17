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
  // Dark-theme neutrals and semantic inks. These are fixed values rather than derivations of the
  // Superadmin brand, so a branding change can never push dark-mode text below MINIMUM_TEXT_CONTRAST.
  // The brand still reaches dark mode through decorative gradients, glows and the brand mark.
  dark: {
    canvas: '#070B18',
    raised: '#0F1729',
    sunken: '#0A101F',
    overlay: '#131C31',
    inkStrong: '#E8EEFC',
    inkMuted: '#A9B6D4',
    inkSubtle: '#8593B4',
    lineSubtle: '#1E2A45',
    lineStrong: '#314063',
    lineControl: '#5A6B92',
    success: '#4ADE80',
    successSurface: '#10251A',
    warning: '#FBBF24',
    warningSurface: '#2A1F06',
    error: '#FCA5A5',
    errorSurface: '#2B1113',
    info: '#93C5FD',
    infoSurface: '#0E1E38',
    support: '#C7D2FE',
    supportSurface: '#161B3A'
  },
  // Supporting accents. The `*Ink` values are the readable text variants for light surfaces; the
  // plain values are the readable text variants for dark surfaces and the shared decorative hues.
  accent: { cyan: '#4FD8EB', cyanInk: '#0E7490', violet: '#A78BFA', violetInk: '#7C3AED', magenta: '#F891BB', magentaInk: '#BE185D' },
  // Light-mode control boundary that reaches the 3:1 non-text contrast target on white.
  lineControl: '#7C8698',
  space: { '1': '0.25rem', '2': '0.5rem', '3': '0.75rem', '4': '1rem', '5': '1.5rem', '6': '2rem', '7': '3rem', '8': '4rem' },
  duration: { instant: '90ms', quick: '150ms', standard: '220ms', slow: '320ms' },
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
