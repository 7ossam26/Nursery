import type { ThemeTokens } from '@nursery/contracts';
import { bestForeground, contrastRatio, MINIMUM_TEXT_CONTRAST } from '@nursery/domain';

// CSS custom properties written for a stored theme. Besides the stored tokens, readable foregrounds
// and status surfaces are derived here so a Superadmin color change cannot leave white text on a
// light button or a status badge whose text fails contrast against the fixed pastel surface.
export const fixedStatusSurfaces = { success: '#DCFCE7', warning: '#FEF3C7', error: '#FEE4E2' } as const;
const themeVariableMap: Record<keyof ThemeTokens, string> = {
  brandPink: '--color-brand', softPink: '--color-brand-soft', peach: '--color-peach', paleYellow: '--color-notice',
  text: '--color-text', surface: '--color-surface', background: '--color-background', strongPinkButton: '--color-action',
  success: '--color-success', warning: '--color-warning', error: '--color-error'
};

function darken(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.round(((value >> shift) & 255) * (1 - amount))).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export function themeVariables(theme: ThemeTokens): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [token, variable] of Object.entries(themeVariableMap) as [keyof ThemeTokens, string][]) variables[variable] = theme[token];
  variables['--color-action-foreground'] = bestForeground(theme.strongPinkButton, [theme.surface, theme.text]).foreground;
  variables['--color-action-hover'] = darken(theme.strongPinkButton, 0.18);
  variables['--color-error-foreground'] = bestForeground(theme.error, [theme.surface, theme.text]).foreground;
  variables['--color-brand-foreground'] = bestForeground(theme.brandPink, [theme.text, theme.surface]).foreground;
  for (const status of ['success', 'warning', 'error'] as const) {
    const fixed = fixedStatusSurfaces[status];
    variables[`--color-${status}-surface`] = contrastRatio(theme[status], fixed) >= MINIMUM_TEXT_CONTRAST ? fixed : theme.surface;
  }
  return variables;
}
