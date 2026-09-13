import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Icon } from '../components/Icon.js';
import { useLocale } from '../i18n/LocaleProvider.js';
import { useBranding } from '../features/licensing/BrandingProvider.js';
import { navigationByRole, type ShellRole } from './navigation.js';

const roleLabelKeys = {
  parent: 'role.parent',
  teacher: 'role.teacher',
  administration: 'role.administration',
  support: 'role.support'
} as const;

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return <div className="language-switcher" role="group" aria-label={t('language.label')}>
    <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>{t('language.english')}</button>
    <button type="button" aria-pressed={locale === 'ar-EG'} onClick={() => setLocale('ar-EG')}>{t('language.arabic')}</button>
  </div>;
}

function Navigation({ role, mobile = false, pathPrefix = '' }: Readonly<{ role: ShellRole; mobile?: boolean; pathPrefix?: string }>) {
  const { t } = useLocale();
  return <nav className="shell-navigation" aria-label={t(mobile ? 'nav.mobile' : 'nav.main')}>
    {navigationByRole[role].map((group) => <div className="navigation-group" key={group.labelKey}>
      <h2>{t(group.labelKey)}</h2>
      <ul>{group.items.map((item) => <li key={item.path}><NavLink to={`${pathPrefix}${item.path}`} className={({ isActive }) => isActive ? 'active' : undefined}><Icon name={item.icon} /><span>{t(item.labelKey)}</span></NavLink></li>)}</ul>
    </div>)}
  </nav>;
}

type AppShellProps = Readonly<{ role: ShellRole; children: ReactNode; pathPrefix?: string }>;

export function AppShell({ role, children, pathPrefix = '' }: AppShellProps) {
  const { t } = useLocale();
  const branding = useBranding();
  return <div className={`app-shell app-shell--${role}`}>
    <a className="skip-link" href="#main-content">{t('common.skipToContent')}</a>
    <header className="shell-header">
      <div className="brand-mark" aria-hidden="true">ن</div>
      <div className="shell-header__title"><strong>{branding?.name ?? t('app.name')}</strong><span>{t(roleLabelKeys[role])}</span></div>
      <LanguageSwitcher />
      <button className="account-button" type="button" aria-label={t('shell.account')}><Icon name="more" /></button>
    </header>
    <aside className="shell-sidebar"><Navigation role={role} pathPrefix={pathPrefix} />{role === 'support' && <div className="support-badge"><Icon name="support" /><strong>{t('support.distinct')}</strong><span>{t('support.description')}</span></div>}</aside>
    <main className="shell-main" id="main-content" tabIndex={-1}>{children}</main>
    {(role === 'parent' || role === 'teacher') && <div className="shell-bottom-navigation"><Navigation role={role} mobile pathPrefix={pathPrefix} /></div>}
  </div>;
}

type RoleShellProps = Readonly<{ children: ReactNode; pathPrefix?: string }>;
export const ParentShell = (props: RoleShellProps) => <AppShell role="parent" {...props} />;
export const TeacherShell = (props: RoleShellProps) => <AppShell role="teacher" {...props} />;
export const AdministrationShell = (props: RoleShellProps) => <AppShell role="administration" {...props} />;
export const SupportShell = (props: RoleShellProps) => <AppShell role="support" {...props} />;
