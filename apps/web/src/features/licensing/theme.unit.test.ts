import { describe, expect, it } from 'vitest';
import { defaultTheme, validateThemeContrast } from '@nursery/contracts';
import { contrastRatio, MINIMUM_TEXT_CONTRAST } from '@nursery/domain';
import { nurseryTokens } from '@nursery/ui';
import { fixedStatusSurfaces, themeVariables } from './theme.js';

// A35: the default token pairs every screen renders with must read at normal-text contrast.
describe('theme contrast and derived foregrounds', () => {
  const c = nurseryTokens.color;
  it.each([
    ['text on surface', c.text, c.surface], ['text on background', c.text, c.background], ['text on subtle surface', c.text, c.surfaceSubtle],
    ['text on peach', c.text, c.peach], ['text on notice', c.text, c.notice], ['text on soft pink', c.text, c.brandSoft], ['text on brand', c.text, c.brand],
    ['muted text on surface', c.textMuted, c.surface], ['muted text on background', c.textMuted, c.background],
    ['white on action', '#FFFFFF', c.action], ['white on action hover', '#FFFFFF', c.actionHover], ['action link on surface', c.action, c.surface],
    ['success badge', c.success, c.successSurface], ['warning badge', c.warning, c.warningSurface], ['error badge', c.error, c.errorSurface], ['info badge', c.info, c.infoSurface],
    ['white on error button', '#FFFFFF', c.error], ['support on support surface', c.support, c.supportSurface], ['white on support', '#FFFFFF', c.support],
    ['error text on surface', c.error, c.surface], ['success text on surface', c.success, c.surface], ['warning text on surface', c.warning, c.surface]
  ])('%s reaches 4.5:1', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
  });

  it('keeps white button text and the fixed status surfaces for the default theme', () => {
    const variables = themeVariables(defaultTheme);
    expect(variables['--color-action']).toBe(defaultTheme.strongPinkButton);
    expect(variables['--color-action-foreground']).toBe('#FFFFFF');
    expect(variables['--color-error-foreground']).toBe('#FFFFFF');
    expect(variables['--color-brand-foreground']).toBe(defaultTheme.text);
    for (const status of ['success', 'warning', 'error'] as const) expect(variables[`--color-${status}-surface`]).toBe(fixedStatusSurfaces[status]);
    expect(contrastRatio(variables['--color-action-hover'], '#FFFFFF')).toBeGreaterThan(contrastRatio(defaultTheme.strongPinkButton, '#FFFFFF'));
  });

  it('switches to dark button text and plain status surfaces when a valid theme change would break them', () => {
    // Light button and mid-tone statuses pass the server gate (readable on the surface) but not on white/pastel.
    const theme = { ...defaultTheme, strongPinkButton: '#F9D0CD', success: '#38863F', warning: '#8A5A00', error: '#C0392B' };
    expect(validateThemeContrast(theme)).toEqual([]);
    const variables = themeVariables(theme);
    expect(variables['--color-action-foreground']).toBe(defaultTheme.text);
    expect(contrastRatio(variables['--color-action-foreground'], theme.strongPinkButton)).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
    for (const status of ['success', 'warning', 'error'] as const) {
      expect(contrastRatio(theme[status], variables[`--color-${status}-surface`])).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
    }
    expect(variables['--color-success-surface']).toBe(theme.surface);
  });
});
