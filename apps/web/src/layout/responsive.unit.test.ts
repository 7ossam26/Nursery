import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nurseryTokens } from '@nursery/ui';
import { navigationByRole } from './navigation.js';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('responsive and motion contracts', () => {
  it.each([
    { width: 360, direction: 'ltr', query: '@media (max-width: 767px)' },
    { width: 360, direction: 'rtl', query: '@media (max-width: 767px)' },
    { width: 768, direction: 'ltr', query: '@media (min-width: 768px) and (max-width: 1023px)' },
    { width: 768, direction: 'rtl', query: '@media (min-width: 768px) and (max-width: 1023px)' },
    { width: 1280, direction: 'ltr', query: '.app-shell { min-height: 100vh' },
    { width: 1280, direction: 'rtl', query: '.app-shell { min-height: 100vh' }
  ])('defines a $direction layout contract for $width px', ({ direction, query }) => {
    expect(styles).toContain(query);
    expect(styles).toContain('minmax(0, 1fr)');
    expect(styles).toContain('overflow-x: clip');
    expect(styles).toContain(direction === 'rtl' ? '[dir="rtl"]' : 'inset-inline');
  });

  it('provides visible focus, minimum controls, table mobile cards, and reduced motion', () => {
    expect(styles).toContain(':focus-visible');
    expect(styles).toContain('--control-minimum: 2.75rem');
    expect(styles).toContain('.responsive-table__cards { display: grid');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps the CSS custom properties aligned with the shared semantic color tokens', () => {
    for (const color of Object.values(nurseryTokens.color)) expect(styles.toLowerCase()).toContain(color.toLowerCase());
  });

  it('keeps narrow parent and teacher primary navigation to five labeled destinations', () => {
    expect(navigationByRole.parent.flatMap((group) => group.items)).toHaveLength(5);
    expect(navigationByRole.teacher.flatMap((group) => group.items)).toHaveLength(5);
    for (const role of ['parent', 'teacher'] as const) {
      expect(navigationByRole[role].flatMap((group) => group.items).every((item) => item.labelKey && item.icon)).toBe(true);
    }
  });
});
