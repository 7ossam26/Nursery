import type { AuthResponse } from '@nursery/contracts';
import type { IconName } from '../components/Icon.js';
import type { MessageKey } from '../i18n/catalogs.js';

export type ShellRole = 'parent' | 'teacher' | 'administration' | 'support';
export type SessionAccount = AuthResponse['data']['account'];
// Server-known facts the navigation may depend on. Hiding a destination is a convenience only:
// every route and API call re-checks the same capability, scope and module rules on the server.
export type NavigationContext = Readonly<{ account: SessionAccount; parentFinance: boolean }>;
export type NavigationItem = Readonly<{ path: string; labelKey: MessageKey; icon: IconName; when?: (context: NavigationContext) => boolean }>;
export type NavigationGroup = Readonly<{ labelKey: MessageKey; items: readonly NavigationItem[]; support?: boolean }>;

const any = (...capabilities: string[]) => ({ account }: NavigationContext) => capabilities.some((key) => account.capabilities.includes(key));
const branchWide = ({ account }: NavigationContext) => account.capabilities.includes('finance.read') && (account.kind === 'SYSTEM' || account.scope?.mode === 'BRANCH');
export const reportCapabilities = ['finance.read', 'children.read', 'learning.read', 'transport.read', 'activities.read', 'incidents.read', 'documents.manage'];
export const settingsCapabilities = ['branding.manage', 'modules.manage', 'users.manage_staff', 'users.create_parent', 'parents.block'];
export const supportCapabilities = ['licensing.manage', 'seats.release', 'support.access'];

export const navigationByRole: Readonly<Record<ShellRole, readonly NavigationGroup[]>> = {
  parent: [{ labelKey: 'nav.main', items: [
    { path: '/parent/today', labelKey: 'nav.today', icon: 'home' },
    { path: '/parent/children', labelKey: 'nav.children', icon: 'children' },
    { path: '/parent/payments', labelKey: 'nav.payments', icon: 'wallet', when: ({ parentFinance }) => parentFinance },
    { path: '/parent/notifications', labelKey: 'nav.notifications', icon: 'bell' },
    { path: '/account', labelKey: 'nav.more', icon: 'more' }
  ] }],
  teacher: [{ labelKey: 'nav.groupDaily', items: [
    { path: '/teacher/today', labelKey: 'nav.today', icon: 'calendar', when: any('learning.read') },
    { path: '/teacher/learning', labelKey: 'nav.learning', icon: 'learning', when: any('learning.read') },
    { path: '/teacher/homework', labelKey: 'nav.homework', icon: 'classroom', when: any('learning.read') },
    { path: '/teacher/exams', labelKey: 'nav.exams', icon: 'star', when: any('learning.read') },
    { path: '/account', labelKey: 'nav.more', icon: 'more' }
  ] }],
  administration: [
    { labelKey: 'nav.groupDaily', items: [
      { path: '/administration/children', labelKey: 'nav.allChildren', icon: 'children', when: any('children.read') },
      { path: '/teacher/today', labelKey: 'nav.today', icon: 'calendar', when: any('learning.read') },
      { path: '/administration/announcements', labelKey: 'nav.announcements', icon: 'bell', when: any('announcements.manage') },
      { path: '/administration/reports', labelKey: 'nav.reports', icon: 'overview', when: any(...reportCapabilities) }
    ] },
    { labelKey: 'nav.groupFinance', items: [
      { path: '/administration/collections', labelKey: 'nav.collections', icon: 'wallet', when: any('finance.read') },
      { path: '/administration/billing', labelKey: 'nav.billing', icon: 'finance', when: any('finance.read') },
      { path: '/administration/treasury', labelKey: 'nav.treasury', icon: 'finance', when: branchWide }
    ] },
    { labelKey: 'nav.groupManage', items: [
      { path: '/administration/organization', labelKey: 'nav.organization', icon: 'classroom', when: any('organization.read') },
      { path: '/administration/settings', labelKey: 'nav.settings', icon: 'settings', when: any(...settingsCapabilities) },
      { path: '/administration/imports', labelKey: 'nav.imports', icon: 'staff', when: any('imports.commit') },
      { path: '/account', labelKey: 'nav.more', icon: 'more' }
    ] },
    { labelKey: 'nav.groupSupport', support: true, items: [
      { path: '/support/licenses', labelKey: 'nav.licenses', icon: 'support', when: any(...supportCapabilities) }
    ] }
  ],
  support: [{ labelKey: 'nav.groupSupport', support: true, items: [
    { path: '/support/licenses', labelKey: 'nav.licenses', icon: 'support', when: any(...supportCapabilities) },
    { path: '/administration/settings', labelKey: 'nav.settings', icon: 'settings', when: any(...settingsCapabilities) },
    { path: '/account', labelKey: 'nav.more', icon: 'more' }
  ] }]
};

// Persona for the signed-in account. Classroom-scoped staff get the teacher shell; branch-wide and
// system accounts get the administration shell, where the support area is a separately labeled group.
export function shellRoleFor(account: SessionAccount): ShellRole {
  if (account.kind === 'GUARDIAN') return 'parent';
  if (account.kind === 'STAFF' && account.scope?.mode === 'CLASSROOM') return 'teacher';
  return 'administration';
}

export function visibleGroups(role: ShellRole, context?: NavigationContext): readonly NavigationGroup[] {
  return navigationByRole[role]
    .map((group) => ({ ...group, items: context ? group.items.filter((item) => !item.when || item.when(context)) : group.items }))
    .filter((group) => group.items.length > 0);
}
