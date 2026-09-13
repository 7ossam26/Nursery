import { describe, expect, it } from 'vitest';
import { contrastRatio, nurseryTokens, readableForeground, validatesTextContrast } from './index.js';

describe('theme contrast validation', () => {
  it('rejects white normal text on brand pink and accepts the dark foreground', () => {
    expect(contrastRatio('#FFFFFF', nurseryTokens.color.brand)).toBeCloseTo(3.59, 1);
    expect(validatesTextContrast('#FFFFFF', nurseryTokens.color.brand)).toBe(false);
    expect(validatesTextContrast(nurseryTokens.color.text, nurseryTokens.color.brand)).toBe(true);
    expect(readableForeground(nurseryTokens.color.brand)).toBe('#111827');
  });

  it('accepts white text on the strong action token', () => {
    expect(validatesTextContrast('#FFFFFF', nurseryTokens.color.action)).toBe(true);
    expect(readableForeground(nurseryTokens.color.action)).toBe('#FFFFFF');
  });

  it.each([
    [nurseryTokens.color.success, nurseryTokens.color.successSurface],
    [nurseryTokens.color.warning, nurseryTokens.color.warningSurface],
    [nurseryTokens.color.error, nurseryTokens.color.errorSurface],
    [nurseryTokens.color.info, nurseryTokens.color.infoSurface],
    [nurseryTokens.color.support, nurseryTokens.color.supportSurface],
    [nurseryTokens.color.focus, nurseryTokens.color.surface]
  ])('keeps semantic foreground %s readable on %s', (foreground, background) => {
    expect(validatesTextContrast(foreground, background)).toBe(true);
  });

  it('rejects unsafe color input', () => {
    expect(() => contrastRatio('pink', '#FFFFFF')).toThrow(TypeError);
  });
});
