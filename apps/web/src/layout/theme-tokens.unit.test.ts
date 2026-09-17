import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, nurseryTokens } from '@nursery/ui';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const dark = nurseryTokens.dark;

// The end-to-end suites run axe with the color-contrast rule disabled, so no automated check can catch
// a dark-mode contrast regression. The dark palette is therefore fixed rather than derived from the
// Superadmin brand, and this file is what proves it stays readable.
describe('dark appearance tokens', () => {
  it('keeps every dark surface and ink pair in the stylesheet', () => {
    for (const value of Object.values(dark)) expect(styles.toLowerCase()).toContain(value.toLowerCase());
    for (const value of Object.values(nurseryTokens.accent)) expect(styles.toLowerCase()).toContain(value.toLowerCase());
    expect(styles.toLowerCase()).toContain(nurseryTokens.lineControl.toLowerCase());
  });

  it.each([
    ['strong ink on the canvas', dark.inkStrong, dark.canvas],
    ['strong ink on a raised surface', dark.inkStrong, dark.raised],
    ['strong ink on a sunken surface', dark.inkStrong, dark.sunken],
    ['strong ink on an overlay', dark.inkStrong, dark.overlay],
    ['muted ink on the canvas', dark.inkMuted, dark.canvas],
    ['muted ink on a raised surface', dark.inkMuted, dark.raised],
    ['subtle ink on the canvas', dark.inkSubtle, dark.canvas],
    ['subtle ink on a raised surface', dark.inkSubtle, dark.raised],
    ['success badge', dark.success, dark.successSurface],
    ['success text on a raised surface', dark.success, dark.raised],
    ['warning badge', dark.warning, dark.warningSurface],
    ['warning text on a raised surface', dark.warning, dark.raised],
    ['error badge', dark.error, dark.errorSurface],
    ['error text on a raised surface', dark.error, dark.raised],
    ['info badge', dark.info, dark.infoSurface],
    ['support badge', dark.support, dark.supportSurface],
    ['cyan accent on a raised surface', nurseryTokens.accent.cyan, dark.raised],
    ['violet accent on a raised surface', nurseryTokens.accent.violet, dark.raised],
    ['magenta accent on a raised surface', nurseryTokens.accent.magenta, dark.raised]
  ])('%s reaches 4.5:1', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light control boundary on a white surface', nurseryTokens.lineControl, nurseryTokens.color.surface],
    ['dark control boundary on a raised surface', dark.lineControl, dark.raised]
  ])('%s reaches the 3:1 non-text target', (_label, line, surface) => {
    expect(contrastRatio(line, surface)).toBeGreaterThanOrEqual(3);
  });

  it('declares the dark palette for both the device preference and an explicit choice', () => {
    // The media query is what makes the first paint correct without a script, which the app's CSP
    // (script-src 'self', no 'unsafe-inline') would otherwise block.
    expect(styles).toContain('@media (prefers-color-scheme: dark)');
    expect(styles).toContain(':root:not([data-theme="light"])');
    expect(styles).toContain(':root[data-theme="dark"]');

    const body = (selector: string) => styles.slice(styles.indexOf(selector)).match(/\{([\s\S]*?)\n\s*\}/)![1];
    const declared = (selector: string) => new Set([...body(selector).matchAll(/(--[\w-]+):/g)].map((match) => match[1]));
    expect([...declared(':root[data-theme="dark"]')].sort()).toEqual([...declared(':root:not([data-theme="light"])')].sort());
  });

  it('never redefines a branded token per theme, because BrandingProvider writes those inline', () => {
    // An inline style on the root element outranks any rule here, so a theme that redefined --color-*
    // would be silently ignored the moment branding loaded. Dark mode owns the derived layer instead.
    for (const selector of [':root[data-theme="dark"]', ':root:not([data-theme="light"])']) {
      const body = styles.slice(styles.indexOf(selector)).match(/\{([\s\S]*?)\n\s*\}/)![1];
      expect([...body.matchAll(/(--color-[\w-]+):/g)].map((match) => match[1])).toEqual([]);
    }
  });
});
