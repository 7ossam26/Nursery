import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { navigationByRole, shellRoleFor, visibleGroups, type SessionAccount } from './navigation.js';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const account = (overrides: Partial<SessionAccount>): SessionAccount => ({ id: '00000000-0000-4000-8000-000000000001', username: 'synthetic', kind: 'STAFF', locale: 'en', mustChangePassword: false, capabilities: [], policyReady: true, ...overrides });
const paths = (role: Parameters<typeof visibleGroups>[0], context: Parameters<typeof visibleGroups>[1]) => visibleGroups(role, context).flatMap((group) => group.items.map((item) => item.path));

describe('session shell navigation', () => {
  it('chooses the persona from account kind and scope, never from a role name', () => {
    expect(shellRoleFor(account({ kind: 'GUARDIAN' }))).toBe('parent');
    expect(shellRoleFor(account({ kind: 'STAFF', scope: { revision: 1, mode: 'CLASSROOM', branchIds: [], classroomIds: [] } }))).toBe('teacher');
    expect(shellRoleFor(account({ kind: 'STAFF', scope: { revision: 1, mode: 'BRANCH', branchIds: [], classroomIds: [] } }))).toBe('administration');
    expect(shellRoleFor(account({ kind: 'SYSTEM' }))).toBe('administration');
  });

  it('hides destinations the session cannot use and keeps parent/teacher strips to five labeled items', () => {
    const parent = account({ kind: 'GUARDIAN' });
    expect(paths('parent', { account: parent, parentFinance: false })).toEqual(['/parent/today', '/parent/children', '/parent/notifications', '/account']);
    expect(paths('parent', { account: parent, parentFinance: true })).toHaveLength(5);
    const teacher = account({ capabilities: ['learning.read', 'learning.publish'], scope: { revision: 1, mode: 'CLASSROOM', branchIds: [], classroomIds: [] } });
    expect(paths('teacher', { account: teacher, parentFinance: false })).toEqual(['/teacher/today', '/teacher/learning', '/teacher/homework', '/teacher/exams', '/account']);
    expect(paths('administration', { account: teacher, parentFinance: false })).toEqual(['/teacher/today', '/administration/reports', '/account']);
    const classroomFinance = account({ capabilities: ['finance.read'], scope: { revision: 1, mode: 'CLASSROOM', branchIds: [], classroomIds: [] } });
    expect(paths('administration', { account: classroomFinance, parentFinance: false })).not.toContain('/administration/treasury');
    const system = account({ kind: 'SYSTEM', capabilities: ['finance.read', 'children.read', 'organization.read', 'licensing.manage', 'branding.manage'] });
    const groups = visibleGroups('administration', { account: system, parentFinance: false });
    expect(groups.find((group) => group.support)?.items.map((item) => item.path)).toEqual(['/support/licenses']);
    expect(paths('administration', { account: system, parentFinance: false })).toContain('/administration/treasury');
    expect(visibleGroups('administration', { account: account({}), parentFinance: false }).some((group) => group.support)).toBe(false);
    for (const role of ['parent', 'teacher', 'administration', 'support'] as const) for (const item of navigationByRole[role].flatMap((group) => group.items)) expect(item.labelKey && item.icon).toBeTruthy();
  });

  it('keeps the narrow-screen contracts for the shell, dialog, notices and reduced motion', () => {
    expect(styles).toContain('.modal { width: min(34rem, calc(100% - 2rem))');
    expect(styles).toContain('.shell-main { grid-area: main; min-width: 0');
    expect(styles).toContain('.shell-bottom-navigation .navigation-group ul { grid-template-columns: repeat(5, minmax(0, 1fr))');
    expect(styles).toContain('.app-shell--parent { font-size: 1.125rem; }');
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; \}/);
    expect(styles).toContain('.stale-notice');
    expect(styles).toContain('.update-notice');
    expect(styles).toContain('--color-action-foreground');
  });
});

describe('every static navigation link resolves to a registered route (regression: N25-01)', () => {
  it('keeps every literal Link/breadcrumb target pointed at a route App.tsx actually registers', () => {
    const appTsxPath = fileURLToPath(new URL('../App.tsx', import.meta.url));
    const appSource = readFileSync(appTsxPath, 'utf8');
    const registeredRoutes = [...appSource.matchAll(/<Route\s+[^>]*path="([^"]+)"/g)].map((match) => match[1]);
    // Sanity check that the extraction actually found the real route table, not an empty/broken regex.
    expect(registeredRoutes.length).toBeGreaterThan(20);
    expect(registeredRoutes).toContain('/administration/treasury');
    const matchesRoute = (target: string) => registeredRoutes.some((route) => {
      if (route === target) return true;
      if (route.endsWith('/*')) { const prefix = route.slice(0, -2); return target === prefix || target.startsWith(`${prefix}/`); }
      return false;
    });
    function collectTsxFiles(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...collectTsxFiles(full));
        else if (entry.name.endsWith('.tsx')) out.push(full);
      }
      return out;
    }
    const featuresDir = fileURLToPath(new URL('../features', import.meta.url));
    const offenders: string[] = [];
    for (const file of [...collectTsxFiles(featuresDir), appTsxPath]) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bto="(\/[^"]*)"/g)) if (!matchesRoute(match[1])) offenders.push(`${file}: ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });
});
