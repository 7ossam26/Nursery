import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Link } from 'react-router';
import { Button, TextField, SelectField } from '../../components/controls.js';
import { Icon, type IconName } from '../../components/Icon.js';
import { NurseryScene } from '../../components/illustrations.js';
import { ThemeSwitcher } from '../../layout/ThemeProvider.js';
import { LanguageSwitcher, useInsideShell } from '../../layout/AppShell.js';
import { SessionShell } from '../../layout/SessionShell.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { catalogs, type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from './AuthProvider.js';
import { AuthError } from './client.js';
import { PayrollNavigation } from '../finance/payroll-screen.js';

function errorKey(error: unknown): MessageKey {
  return error instanceof AuthError && error.detail.messageKey in catalogs.en ? error.detail.messageKey as MessageKey : 'auth.networkError';
}
function Frame({ title, children, wide = false, lead }: { title: MessageKey; children: ReactNode; wide?: boolean; lead?: ReactNode }) {
  const { t } = useLocale(); const embedded = useInsideShell();
  const main = `landing ${wide ? 'landing--wide' : ''}`; const card = `landing__card auth-card ${wide ? 'auth-card--hub' : ''}`;
  // Inside the session shell the header already carries branding and language; the card stays.
  if (embedded) return <main className={`${main} landing--embedded`}><section className={card}>{wide && <div className="hero__decoration"><NurseryScene /></div>}<h1>{t(title)}</h1>{lead}{children}</section></main>;
  return <main className={main}><div className="landing__sky" aria-hidden="true"><NurseryScene variant="landing" /></div><div className="landing__language"><LanguageSwitcher /><ThemeSwitcher /></div><section className={card}>{wide && <div className="hero__decoration"><NurseryScene /></div>}<div className="brand-mark" aria-hidden="true">ن</div><h1>{t(title)}</h1>{lead}{children}</section></main>;
}

// One destination in the signed-in hub. The `to` stays a literal JSX attribute on every call site so
// the static route-vs-link regression in layout/navigation.unit.test.ts keeps checking these targets.
const hubTone: Partial<Record<IconName, string>> = { children: 'pink', home: 'sun', calendar: 'sky', bell: 'sun', wallet: 'mint', finance: 'mint', star: 'lavender', classroom: 'sky', learning: 'lavender', overview: 'cyan', settings: 'lavender', staff: 'mint', support: 'lavender' };
function HubLink({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return <Link className={`quick-action quick-action--${hubTone[icon] ?? 'pink'}`} to={to}>
    <span className="quick-action__icon"><Icon name={icon} /></span>
    <span className="quick-action__text"><strong>{label}</strong></span>
    <Icon name="chevron" className="icon--chevron" />
  </Link>;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth(); const { t } = useLocale();
  if (auth.loading) return <Frame title="auth.signIn"><p role="status">{t('state.loading')}</p></Frame>;
  if (auth.blocked) return <Frame title="auth.contactNursery"><p role="alert">{auth.publicMessage || t('auth.contactNursery')}</p><Button onClick={auth.signedOut}>{t('auth.backToLogin')}</Button></Frame>;
  if (auth.suspended) return <Frame title="licensing.suspendedTitle"><p role="alert">{t('licensing.suspendedBody')}</p><Button onClick={auth.signedOut}>{t('auth.backToLogin')}</Button></Frame>;
  if (!auth.session) return <Navigate to={auth.expired ? '/session-expired' : '/login'} replace />;
  if (auth.session.account.mustChangePassword) return <PasswordScreen forced />;
  return <SessionShell>{children}</SessionShell>;
}
export function LoginScreen({ expired = false }: { expired?: boolean }) {
  const auth = useAuth(); const { t } = useLocale();
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [publicMessage, setPublicMessage] = useState('');
  if (auth.session) return <Navigate to="/account" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setPublicMessage('');
    try { auth.accept(await auth.client.login(username, password)); }
    catch (caught) { setError(errorKey(caught)); if (caught instanceof AuthError) setPublicMessage(caught.detail.publicMessage ?? ''); }
    finally { setPassword(''); setBusy(false); }
  }
  return <Frame title={expired ? 'auth.sessionExpired' : 'auth.signIn'}><p>{t('auth.recoveryHelp')}</p>
    <form onSubmit={submit} aria-busy={busy}>
      {error && <p role="alert">{t(error)}</p>}{publicMessage && <p role="alert">{publicMessage}</p>}
      <TextField label={t('auth.username')} name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={64} />
      <TextField label={t('auth.password')} name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} />
      <Button type="submit" disabled={busy}>{t(busy ? 'auth.working' : 'auth.signIn')}</Button>
    </form>{import.meta.env.DEV && <Link className="button button--ghost" to="/__preview">{t('landing.openPreview')}</Link>}
  </Frame>;
}
export function PasswordScreen({ forced = false }: { forced?: boolean }) {
  const auth = useAuth(); const { t } = useLocale();
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirmation, setConfirmation] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [done, setDone] = useState(false);
  if (done) return <Navigate to="/account" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    if (next !== confirmation) { setError('auth.passwordMismatch'); return; }
    setBusy(true);
    try { auth.accept(await auth.client.changePassword(current, next)); setDone(true); }
    catch (caught) { auth.handleError(caught); setError(errorKey(caught)); }
    finally { setCurrent(''); setNext(''); setConfirmation(''); setBusy(false); }
  }
  return <Frame title="auth.changePassword"><p>{t(forced ? 'auth.passwordRequired' : 'auth.passwordHelp')}</p><form onSubmit={submit} aria-busy={busy}>
    {error && <p role="alert">{t(error)}</p>}
    <TextField label={t('auth.currentPassword')} type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={(event) => setCurrent(event.target.value)} />
    <TextField label={t('auth.newPassword')} hint={t('auth.passwordHelp')} type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={next} onChange={(event) => setNext(event.target.value)} />
    <TextField label={t('auth.confirmPassword')} type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
    <Button type="submit" disabled={busy}>{t(busy ? 'auth.working' : 'auth.changePassword')}</Button>
  </form>{!forced && <Link className="button button--secondary" to="/account">{t('common.back')}</Link>}<LogoutButton /></Frame>;
}
function LogoutButton() {
  const auth = useAuth(); const { t } = useLocale(); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  return <>{error && <p role="alert">{t(error)}</p>}<Button variant="secondary" disabled={busy} onClick={async () => {
    setBusy(true); setError(null);
    try { await auth.client.logout(); auth.signedOut(); } catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } finally { setBusy(false); }
  }}>{t('auth.logout')}</Button></>;
}
function ResetForm() {
  const auth = useAuth(); const { t } = useLocale(); const [accountId, setAccountId] = useState(''); const [operatorPassword, setPassword] = useState(''); const [temporary, setTemporary] = useState(''); const [error, setError] = useState<MessageKey | null>(null); const [busy, setBusy] = useState(false);
  return <section className="auth-reset"><h2>{t('auth.resetTitle')}</h2><p>{t('auth.resetHelp')}</p>
    <form aria-busy={busy} onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null); setTemporary('');
      try { setTemporary(await auth.client.reset(accountId, operatorPassword)); }
      catch (caught) { auth.handleError(caught); setError(errorKey(caught)); }
      finally { setPassword(''); setBusy(false); }
    }}>
      {error && <p role="alert">{t(error)}</p>}
      <TextField label={t('auth.accountId')} required value={accountId} onChange={(event) => setAccountId(event.target.value)} />
      <TextField label={t('auth.operatorPassword')} required type="password" autoComplete="current-password" maxLength={128} value={operatorPassword} onChange={(event) => setPassword(event.target.value)} />
      <Button type="submit" disabled={busy}>{t(busy ? 'auth.working' : 'auth.resetAction')}</Button>
    </form>{temporary && <div role="status"><p>{t('auth.temporaryWarning')}</p><code className="auth-temporary" dir="ltr">{temporary}</code><Button variant="secondary" onClick={() => setTemporary('')}>{t('auth.dismissSecret')}</Button></div>}
  </section>;
}
export function AccountScreen() {
  const auth = useAuth(); const { t, setLocale } = useLocale(); const [error, setError] = useState<MessageKey | null>(null); const [busy, setBusy] = useState(false);
  // The capability expressions below are the ones this screen already used, kept verbatim: this is a
  // presentation change only, so the set of destinations an account can see is exactly as before.
  const account = auth.session!.account; const capabilities = account.capabilities;
  const branchWideFinance = capabilities.includes('finance.read') && (account.kind === 'SYSTEM' || account.scope?.mode === 'BRANCH');
  return <Frame title="auth.account" wide lead={<><p className="hero__lead">{t('home.welcome', { name: account.username })}</p><p>{t('home.subtitle')}</p></>}>
    {account.licenseStatus === 'GRACE' && <p className="stale-notice" role="status"><Icon name="warning" />{t('licensing.graceWarning')}</p>}

    <section className="hub-section" aria-labelledby="hub-account">
      <h2 id="hub-account">{t('home.account')}</h2>
      <p>{account.username}</p><p>{t('auth.accountReady')}</p>
      {error && <p role="alert">{t(error)}</p>}
      <SelectField label={t('auth.savedLanguage')} disabled={busy} value={account.locale} onChange={async (event) => {
        const locale = event.target.value as 'en' | 'ar-EG'; setBusy(true); setError(null);
        try { await auth.client.locale(locale); auth.accept(await auth.client.current()); setLocale(locale); }
        catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } finally { setBusy(false); }
      }}><option value="en">English</option><option value="ar-EG">العربية</option></SelectField>
      <div className="button-row"><Link className="button button--secondary" to="/change-password">{t('auth.changePassword')}</Link><LogoutButton /></div>
    </section>

    <section className="hub-section" aria-labelledby="hub-sections">
      <h2 id="hub-sections">{t('home.quickActions')}</h2>
      <p className="hub-section__help">{t('home.quickActionsHelp')}</p>
      <div className="quick-actions">
        {account.kind==='GUARDIAN' && <><HubLink to="/parent/today" label={t('hub.today')} icon="home" /><HubLink to="/parent/children" label={t('children.title')} icon="children" /></>}
        {capabilities.includes('announcements.manage') && <HubLink to="/administration/announcements" label={t('hub.publish')} icon="bell" />}
        {capabilities.some(c=>['finance.read','children.read','learning.read','transport.read','activities.read','incidents.read','documents.manage'].includes(c)) && <HubLink to="/administration/reports" label={t('reports.title')} icon="overview" />}
        {capabilities.includes('imports.commit') && <HubLink to="/administration/imports" label={t('imports.title')} icon="staff" />}
        {capabilities.includes('finance.read') && <HubLink to="/administration/billing" label={t('billing.title')} icon="finance" />}
        {capabilities.includes('finance.read') && <HubLink to="/administration/collections" label={t('collections.title')} icon="wallet" />}
        {(capabilities.includes('transport.read')||capabilities.includes('transport.manage')) && <HubLink to="/administration/transport" label={t('transport.title')} icon="calendar" />}
        {(capabilities.includes('activities.read')||capabilities.includes('activities.manage')) && <HubLink to="/teacher/activities" label={t('transport.rosterTitle')} icon="star" />}
        {branchWideFinance && <HubLink to="/administration/treasury" label={t('finance.title')} icon="finance" />}
        {branchWideFinance && <PayrollNavigation/>}
        {capabilities.includes('learning.configure') && <HubLink to="/administration/checkpoints" label={t('learning.configuration')} icon="settings" />}
        {capabilities.includes('learning.read') && <><HubLink to="/teacher/today" label={t('attendance.title')} icon="calendar" /><HubLink to="/teacher/homework" label={t('homework.title')} icon="classroom" /><HubLink to="/teacher/exams" label={t('exams.title')} icon="star" /><HubLink to="/teacher/learning" label={t('learning.title')} icon="learning" /></>}
        {capabilities.includes('children.read') && <HubLink to="/administration/children" label={t('children.title')} icon="children" />}
        {capabilities.includes('organization.read') && <HubLink to="/administration/organization" label={t('organization.title')} icon="classroom" />}
        {(['branding.manage', 'modules.manage', 'users.manage_staff', 'users.create_parent', 'parents.block'] as const).some((key) => capabilities.includes(key)) && <HubLink to="/administration/settings" label={t('licensing.settingsTitle')} icon="settings" />}
        {(['licensing.manage', 'seats.release', 'support.access'] as const).some((key) => capabilities.includes(key)) && <HubLink to="/support/licenses" label={t('licensing.title')} icon="support" />}
      </div>
    </section>

    {capabilities.includes('accounts.reset_password') && <ResetForm />}
  </Frame>;
}
export function UnavailableScreen() { const { t } = useLocale(); return <Frame title="state.noPermissionTitle"><p>{t('state.noPermissionBody')}</p><Link className="button button--secondary" to="/account">{t('auth.account')}</Link></Frame>; }
