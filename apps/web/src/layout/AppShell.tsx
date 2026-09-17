import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { Icon } from '../components/Icon.js';
import { BlocksArt, ShellBackdrop } from '../components/illustrations.js';
import { useLocale } from '../i18n/LocaleProvider.js';
import { useBranding } from '../features/licensing/BrandingProvider.js';
import { ThemeSwitcher } from './ThemeProvider.js';
import { visibleGroups, type NavigationContext, type NavigationGroup, type NavigationItem, type ShellRole } from './navigation.js';

const roleLabelKeys = {
  parent: 'role.parent',
  teacher: 'role.teacher',
  administration: 'role.administration',
  support: 'role.support'
} as const;

export const SIDEBAR_STORAGE_KEY = 'nursery.sidebar';

// Screens rendered inside a shell must not repeat the shell's landmarks (header, navigation, language).
const ShellContext = createContext(false);
export const useInsideShell = () => useContext(ShellContext);

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return <div className="language-switcher" role="group" aria-label={t('language.label')}>
    <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>{t('language.english')}</button>
    <button type="button" aria-pressed={locale === 'ar-EG'} onClick={() => setLocale('ar-EG')}>{t('language.arabic')}</button>
  </div>;
}

function Navigation({ role, mobile = false, pathPrefix = '', context }: Readonly<{ role: ShellRole; mobile?: boolean; pathPrefix?: string; context?: NavigationContext }>) {
  const { t } = useLocale();
  return <nav className="shell-navigation" aria-label={t(mobile ? 'nav.mobile' : 'nav.main')}>
    {visibleGroups(role, context).map((group) => <div className={`navigation-group ${group.support ? 'navigation-group--support' : ''}`} key={group.labelKey}>
      <h2>{t(group.labelKey)}</h2>
      {/* data-label drives the collapsed-sidebar tooltip; the link keeps its visible label as its
          accessible name, so a collapsed icon is never unlabelled for assistive technology. */}
      <ul>{group.items.map((item) => <li key={item.path}><NavLink to={`${pathPrefix}${item.path}`} data-label={t(item.labelKey)} className={({ isActive }) => isActive ? 'active' : undefined}><Icon name={item.icon} /><span>{t(item.labelKey)}</span></NavLink></li>)}</ul>
    </div>)}
  </nav>;
}

// Location within the current session's own navigation. Nothing here invents a destination: every
// entry comes from the same visibleGroups() the sidebar renders, so it can only show a permitted route.
function Breadcrumbs({ groups, pathPrefix }: Readonly<{ groups: readonly NavigationGroup[]; pathPrefix: string }>) {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const match = useMemo(() => {
    let best: Readonly<{ group: NavigationGroup; labelKey: NavigationItem['labelKey']; path: string }> | null = null;
    for (const group of groups) for (const item of group.items) {
      const target = `${pathPrefix}${item.path}`;
      if (pathname !== target && !pathname.startsWith(`${target}/`)) continue;
      if (!best || target.length > best.path.length) best = { group, labelKey: item.labelKey, path: target };
    }
    return best;
  }, [groups, pathname, pathPrefix]);
  if (!match) return null;
  return <nav className="shell-breadcrumbs" aria-label={t('shell.breadcrumb')}>
    <ol>
      <li><Link to={`${pathPrefix}/`}>{t('shell.home')}</Link></li>
      <li><Icon name="chevron" /><span>{t(match.group.labelKey)}</span></li>
      <li><Icon name="chevron" /><span aria-current="page">{t(match.labelKey)}</span></li>
    </ol>
  </nav>;
}

// Destination search over the signed-in account's own navigation. It adds no searchable entity and
// no route: the option list is exactly what the sidebar already shows.
function CommandPalette({ groups, pathPrefix, open, onClose }: Readonly<{ groups: readonly NavigationGroup[]; pathPrefix: string; open: boolean; onClose: () => void }>) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const options = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ path: `${pathPrefix}${item.path}`, label: t(item.labelKey), group: t(group.labelKey), icon: item.icon }))),
    [groups, pathPrefix, t]
  );
  const needle = query.trim().toLocaleLowerCase();
  const matches = needle ? options.filter((option) => option.label.toLocaleLowerCase().includes(needle)) : options;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Scripted DOM environments may lack the dialog API; the attribute keeps the content reachable.
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      setQuery(''); setActive(0); inputRef.current?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    }
  }, [open]);

  function choose(path: string) { onClose(); navigate(path); }

  return <dialog
    className="palette"
    ref={dialogRef}
    aria-label={t('search.title')}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    {open && <>
      <div className="palette__field">
        <Icon name="search" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0))); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
            else if (event.key === 'Enter' && matches[active]) { event.preventDefault(); choose(matches[active].path); }
          }}
        />
      </div>
      {matches.length === 0
        ? <p className="palette__empty">{t('search.empty')}</p>
        : <ul className="palette__results" aria-label={t('search.results')}>
          {matches.map((option, index) => <li key={option.path}>
            <button type="button" className={`palette__option ${index === active ? 'palette__option--active' : ''}`} onClick={() => choose(option.path)}>
              <Icon name={option.icon} />{option.label}<small>{option.group}</small>
            </button>
          </li>)}
        </ul>}
    </>}
  </dialog>;
}

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
};

type AppShellProps = Readonly<{ role: ShellRole; children: ReactNode; pathPrefix?: string; context?: NavigationContext }>;

export function AppShell({ role, children, pathPrefix = '', context }: AppShellProps) {
  const { t } = useLocale();
  const branding = useBranding();
  const groups = visibleGroups(role, context);
  const supportArea = role === 'support' || groups.some((group) => group.support);
  // Expanded by default: an icon-only rail is an explicit, reversible choice, never the starting state.
  const [collapsed, setCollapsed] = useState<boolean>(() => (typeof window === 'undefined' ? false : readCollapsed()));
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toggleCollapsed = useCallback(() => setCollapsed((previous) => {
    const next = !previous;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // A blocked storage API must not prevent collapsing the menu for this session.
    }
    return next;
  }), []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  return <ShellContext.Provider value={true}><div className={collapsed ? `app-shell app-shell--${role} app-shell--collapsed` : `app-shell app-shell--${role}`}>
    <a className="skip-link" href="#main-content">{t('common.skipToContent')}</a>
    {/* One faint sky behind every destination, so each screen reads as the same nursery. */}
    <ShellBackdrop />
    <header className="shell-header">
      <div className="brand-mark" aria-hidden="true">ن</div>
      <div className="shell-header__title"><strong>{branding?.name ?? t('app.name')}</strong><span>{t(roleLabelKeys[role])}</span></div>
      <div className="shell-header__actions">
        {/* The visible label is hidden by CSS on narrow screens, so the accessible name comes from
            aria-label and stays stable. It must also stay distinct from every screen's own Search
            button, or an index-based query would pick this one up instead. */}
        <button type="button" className="shell-search" aria-label={t('search.open')} onClick={() => setPaletteOpen(true)}>
          <Icon name="search" /><span className="shell-search__label" aria-hidden="true">{t('search.open')}</span><kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        <span className="shell-header__divider" aria-hidden="true" />
        <LanguageSwitcher />
        <ThemeSwitcher />
        <Link className="account-button" to={`${pathPrefix}/account`} aria-label={t('shell.account')}><Icon name="more" /></Link>
      </div>
    </header>
    <aside className="shell-sidebar">
      <button type="button" className="shell-sidebar__collapse" aria-expanded={!collapsed} onClick={toggleCollapsed}>
        <Icon name="panel" /><span>{t(collapsed ? 'shell.expand' : 'shell.collapse')}</span>
      </button>
      <Navigation role={role} pathPrefix={pathPrefix} context={context} />
      {supportArea && <div className="support-badge"><Icon name="support" /><strong>{t('support.distinct')}</strong><span>{t('support.description')}</span></div>}
      {!supportArea && <div className="shell-sidebar__art" aria-hidden="true"><BlocksArt /></div>}
    </aside>
    {/* Each screen renders its own single <main>; the shell only positions it. */}
    <div className="shell-main" id="main-content" tabIndex={-1}><Breadcrumbs groups={groups} pathPrefix={pathPrefix} />{children}</div>
    {(role === 'parent' || role === 'teacher') && <div className="shell-bottom-navigation"><Navigation role={role} mobile pathPrefix={pathPrefix} context={context} /></div>}
    <CommandPalette groups={groups} pathPrefix={pathPrefix} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
  </div></ShellContext.Provider>;
}

type RoleShellProps = Readonly<{ children: ReactNode; pathPrefix?: string }>;
export const ParentShell = (props: RoleShellProps) => <AppShell role="parent" {...props} />;
export const TeacherShell = (props: RoleShellProps) => <AppShell role="teacher" {...props} />;
export const AdministrationShell = (props: RoleShellProps) => <AppShell role="administration" {...props} />;
export const SupportShell = (props: RoleShellProps) => <AppShell role="support" {...props} />;
