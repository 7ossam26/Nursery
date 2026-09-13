import type { IconName } from '../components/Icon.js';
import type { MessageKey } from '../i18n/catalogs.js';

export type ShellRole = 'parent' | 'teacher' | 'administration' | 'support';
export type NavigationItem = Readonly<{ path: string; labelKey: MessageKey; icon: IconName }>;
export type NavigationGroup = Readonly<{ labelKey: MessageKey; items: readonly NavigationItem[] }>;

export const navigationByRole: Readonly<Record<ShellRole, readonly NavigationGroup[]>> = {
  parent: [{ labelKey: 'nav.main', items: [
    { path: '/parent/home', labelKey: 'nav.home', icon: 'home' },
    { path: '/parent/children', labelKey: 'nav.children', icon: 'children' },
    { path: '/parent/payments', labelKey: 'nav.payments', icon: 'wallet' },
    { path: '/parent/notifications', labelKey: 'nav.notifications', icon: 'bell' },
    { path: '/parent/more', labelKey: 'nav.more', icon: 'more' }
  ] }],
  teacher: [{ labelKey: 'nav.groupDaily', items: [
    { path: '/teacher/today', labelKey: 'nav.today', icon: 'calendar' },
    { path: '/teacher/classrooms', labelKey: 'nav.classrooms', icon: 'classroom' },
    { path: '/teacher/learning', labelKey: 'nav.learning', icon: 'learning' },
    { path: '/teacher/notifications', labelKey: 'nav.notifications', icon: 'bell' },
    { path: '/teacher/more', labelKey: 'nav.more', icon: 'more' }
  ] }],
  administration: [
    { labelKey: 'nav.groupDaily', items: [
      { path: '/administration/overview', labelKey: 'nav.overview', icon: 'overview' },
      { path: '/administration/notifications', labelKey: 'nav.notifications', icon: 'bell' }
    ] },
    { labelKey: 'nav.groupManage', items: [
      { path: '/administration/children', labelKey: 'nav.allChildren', icon: 'children' },
      { path: '/administration/classrooms', labelKey: 'nav.classrooms', icon: 'classroom' },
      { path: '/administration/finance', labelKey: 'nav.finance', icon: 'finance' },
      { path: '/administration/staff', labelKey: 'nav.staff', icon: 'staff' },
      { path: '/administration/more', labelKey: 'nav.more', icon: 'more' }
    ] }
  ],
  support: [{ labelKey: 'nav.groupSupport', items: [
    { path: '/support/overview', labelKey: 'nav.support', icon: 'support' },
    { path: '/support/installation', labelKey: 'nav.installation', icon: 'settings' },
    { path: '/support/licenses', labelKey: 'nav.licenses', icon: 'wallet' }
  ] }]
};
