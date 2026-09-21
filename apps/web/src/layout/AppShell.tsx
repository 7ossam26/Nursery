import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { Icon } from '../components/Icon.js';
import { ShellBackdrop } from '../components/illustrations.js';
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

export type ShellMode = 'standard' | 'support';

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

function Navigation({ role, mobile = false, pathPrefix = '', context, onNavigate }: Readonly<{
  role: ShellRole;
  mobile?: boolean;
  pathPrefix?: string;
  context?: NavigationContext;
  onNavigate?: () => void;
}>) {
  const { t } = useLocale();
  return <nav className="shell-navigation" aria-label={t(mobile ? 'nav.mobile' : 'nav.main')}>
    {visibleGroups(role, context).map((group) => <div className={`navigation-group ${group.support ? 'navigation-group--support' : ''}`} key={group.labelKey}>
      <h2>{t(group.labelKey)}</h2>
      <ul>{group.items.map((item) => <li key={item.path}><NavLink to={`${pathPrefix}${item.path}`} data-label={t(item.labelKey)} onClick={onNavigate} className={({ isActive }) => isActive ? 'active' : undefined}><Icon name={item.icon} /><span>{t(item.labelKey)}</span></NavLink></li>)}</ul>
    </div>)}
  </nav>;
}

// Location within the current session's own navigation. Nothing here invents a destination: every
// entry comes from the same visibleGroups() used by the shell and command palette.
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

function useSupportBreakpoint(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setNarrow(query.matches);
    update();
    if (typeof query.addEventListener === 'function') query.addEventListener('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return narrow;
}

type AppShellProps = Readonly<{
  role: ShellRole;
  children: ReactNode;
  pathPrefix?: string;
  context?: NavigationContext;
  mode?: ShellMode;
}>;

export function AppShell({ role, children, pathPrefix = '', context, mode = 'standard' }: AppShellProps) {
  const { t } = useLocale();
  const branding = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationRole: ShellRole = mode === 'support' ? 'support' : role;
  const groups = visibleGroups(navigationRole, context);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [supportDrawerOpen, setSupportDrawerOpen] = useState(false);
  const supportNarrow = useSupportBreakpoint();
  const supportMenuRef = useRef<HTMLButtonElement>(null);
  const supportSidebarRef = useRef<HTMLElement>(null);
  const previousDrawerOpen = useRef(false);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => { setSupportDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!supportNarrow || !supportDrawerOpen) return;
    supportSidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSupportDrawerOpen(false); }
      if (event.key === 'Tab') {
        const focusable = [...(supportSidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])];
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [supportDrawerOpen, supportNarrow]);

  useEffect(() => {
    if (previousDrawerOpen.current && !supportDrawerOpen && supportNarrow) supportMenuRef.current?.focus();
    previousDrawerOpen.current = supportDrawerOpen;
  }, [supportDrawerOpen, supportNarrow]);

  const homePath = `${pathPrefix}/`;
  const showBack = location.pathname !== homePath;

  return <ShellContext.Provider value={true}><div className={`app-shell app-shell--${role} app-shell--${mode}`}>
    <a className="skip-link" href="#main-content">{t('common.skipToContent')}</a>
    <ShellBackdrop />
    <header className="shell-header">
      <div className="shell-header__start">
        {mode === 'support' && <button
          ref={supportMenuRef}
          type="button"
          className="shell-header__control support-menu-button"
          aria-label={t('shell.openSupportMenu')}
          aria-controls="support-sidebar"
          aria-expanded={supportDrawerOpen}
          onClick={() => setSupportDrawerOpen(true)}
        ><Icon name="panel" /><span>{t('shell.menu')}</span></button>}
        {showBack && <button type="button" className="shell-header__control" aria-label={t('shell.back')} onClick={() => navigate(-1)}><Icon name="back" /><span>{t('common.back')}</span></button>}
        <Link className="shell-header__control" to={homePath} aria-label={t('shell.home')}><Icon name="home" /><span>{t('shell.home')}</span></Link>
      </div>

      <Link className="shell-brand" to={homePath} aria-label={branding?.name ?? t('app.name')}>
        <span className="brand-mark" aria-hidden="true">ن</span>
        <span className="shell-brand__copy"><strong>{branding?.name ?? t('app.name')}</strong><small>{t(roleLabelKeys[navigationRole])}</small></span>
      </Link>

      <div className="shell-header__actions">
        <button type="button" className="shell-search" aria-label={t('search.open')} onClick={() => setPaletteOpen(true)}>
          <Icon name="search" /><span className="shell-search__label" aria-hidden="true">{t('search.open')}</span><kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        <span className="shell-header__divider" aria-hidden="true" />
        <LanguageSwitcher />
        <ThemeSwitcher />
        <Link className="account-button" to={`${pathPrefix}/account`} aria-label={t('shell.account')}><Icon name="user" /></Link>
      </div>
    </header>

    {mode === 'support' && <>
      <button type="button" className={`support-sidebar__backdrop ${supportDrawerOpen ? 'is-open' : ''}`} aria-label={t('shell.closeSupportMenu')} onClick={() => setSupportDrawerOpen(false)} tabIndex={supportDrawerOpen ? 0 : -1} />
      <aside
        id="support-sidebar"
        ref={supportSidebarRef}
        className={`shell-sidebar support-sidebar ${supportDrawerOpen ? 'is-open' : ''}`}
        aria-label={t('nav.support')}
        role={supportNarrow ? 'dialog' : undefined}
        aria-modal={supportNarrow && supportDrawerOpen ? true : undefined}
        aria-hidden={supportNarrow && !supportDrawerOpen ? true : undefined}
      >
        <div className="support-sidebar__brand">
          <span className="brand-mark" aria-hidden="true">ن</span>
          <span><strong>{branding?.name ?? t('app.name')}</strong><small>{t('role.support')}</small></span>
          <button type="button" className="support-sidebar__close" aria-label={t('shell.closeSupportMenu')} onClick={() => setSupportDrawerOpen(false)}><Icon name="close" /></button>
        </div>
        <Navigation role="support" pathPrefix={pathPrefix} context={context} onNavigate={() => setSupportDrawerOpen(false)} />
        <div className="support-badge"><Icon name="support" /><strong>{t('support.distinct')}</strong><span>{t('support.description')}</span></div>
      </aside>
    </>}

    <div className="shell-main" id="main-content" tabIndex={-1}><Breadcrumbs groups={groups} pathPrefix={pathPrefix} />{children}</div>
    {(role === 'parent' || role === 'teacher') && mode === 'standard' && <div className="shell-bottom-navigation"><Navigation role={role} mobile pathPrefix={pathPrefix} context={context} /></div>}
    <CommandPalette groups={groups} pathPrefix={pathPrefix} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
  </div></ShellContext.Provider>;
}

type RoleShellProps = Readonly<{ children: ReactNode; pathPrefix?: string }>;
export const ParentShell = (props: RoleShellProps) => <AppShell role="parent" {...props} />;
export const TeacherShell = (props: RoleShellProps) => <AppShell role="teacher" {...props} />;
export const AdministrationShell = (props: RoleShellProps) => <AppShell role="administration" {...props} />;
export const SupportShell = (props: RoleShellProps) => <AppShell role="support" mode="support" {...props} />;
