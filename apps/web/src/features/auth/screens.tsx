import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Link } from 'react-router';
import { Button, TextField, SelectField } from '../../components/controls.js';
import { LanguageSwitcher } from '../../layout/AppShell.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { catalogs, type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from './AuthProvider.js';
import { AuthError } from './client.js';

function errorKey(error: unknown): MessageKey {
  return error instanceof AuthError && error.detail.messageKey in catalogs.en ? error.detail.messageKey as MessageKey : 'auth.networkError';
}
function Frame({ title, children }: { title: MessageKey; children: ReactNode }) {
  const { t } = useLocale();
  return <main className="landing"><div className="landing__language"><LanguageSwitcher /></div><section className="landing__card auth-card"><div className="brand-mark" aria-hidden="true">ن</div><h1>{t(title)}</h1>{children}</section></main>;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth(); const { t } = useLocale();
  if (auth.loading) return <Frame title="auth.signIn"><p role="status">{t('state.loading')}</p></Frame>;
  if (auth.blocked) return <Frame title="auth.contactNursery"><p role="alert">{auth.publicMessage || t('auth.contactNursery')}</p><Button onClick={auth.signedOut}>{t('auth.backToLogin')}</Button></Frame>;
  if (auth.suspended) return <Frame title="licensing.suspendedTitle"><p role="alert">{t('licensing.suspendedBody')}</p><Button onClick={auth.signedOut}>{t('auth.backToLogin')}</Button></Frame>;
  if (!auth.session) return <Navigate to={auth.expired ? '/session-expired' : '/login'} replace />;
  if (auth.session.account.mustChangePassword) return <PasswordScreen forced />;
  return children;
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
    </form>{import.meta.env.DEV && <Link to="/__preview">{t('landing.openPreview')}</Link>}
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
  </form>{!forced && <Link to="/account">{t('common.back')}</Link>}<LogoutButton /></Frame>;
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
  return <Frame title="auth.account"><p>{auth.session!.account.username}</p><p>{t('auth.accountReady')}</p>
    {error && <p role="alert">{t(error)}</p>}
    <SelectField label={t('auth.savedLanguage')} disabled={busy} value={auth.session!.account.locale} onChange={async (event) => {
      const locale = event.target.value as 'en' | 'ar-EG'; setBusy(true); setError(null);
      try { await auth.client.locale(locale); auth.accept(await auth.client.current()); setLocale(locale); }
      catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } finally { setBusy(false); }
    }}><option value="en">English</option><option value="ar-EG">العربية</option></SelectField>
    <Link to="/change-password">{t('auth.changePassword')}</Link><LogoutButton />
    {auth.session!.account.kind==='GUARDIAN' && <><Link to="/parent/today">{t('hub.today')}</Link><Link to="/parent/children">{t('children.title')}</Link></>}
    {auth.session!.account.capabilities.includes('announcements.manage') && <Link to="/administration/announcements">{t('hub.publish')}</Link>}
    {auth.session!.account.capabilities.includes('finance.read') && <Link to="/administration/billing">{t('billing.title')}</Link>}
    {auth.session!.account.capabilities.includes('finance.read') && (auth.session!.account.kind==='SYSTEM'||auth.session!.account.scope?.mode==='BRANCH') && <Link to="/administration/treasury">{t('finance.title')}</Link>}
    {auth.session!.account.capabilities.includes('learning.configure') && <Link to="/administration/checkpoints">{t('learning.configuration')}</Link>}
    {auth.session!.account.capabilities.includes('learning.read') && <><Link to="/teacher/today">{t('attendance.title')}</Link><Link to="/teacher/homework">{t('homework.title')}</Link><Link to="/teacher/exams">{t('exams.title')}</Link><Link to="/teacher/learning">{t('learning.title')}</Link></>}
    {auth.session!.account.capabilities.includes('children.read') && <Link to="/administration/children">{t('children.title')}</Link>}
    {auth.session!.account.capabilities.includes('organization.read') && <Link to="/administration/organization">{t('organization.title')}</Link>}
    {(['branding.manage', 'modules.manage', 'users.manage_staff', 'users.create_parent', 'parents.block'] as const).some((key) => auth.session!.account.capabilities.includes(key)) && <Link to="/administration/settings">{t('licensing.settingsTitle')}</Link>}
    {(['licensing.manage', 'seats.release', 'support.access'] as const).some((key) => auth.session!.account.capabilities.includes(key)) && <Link to="/support/licenses">{t('licensing.title')}</Link>}
    {auth.session!.account.capabilities.includes('accounts.reset_password') && <ResetForm />}
    {auth.session!.account.licenseStatus === 'GRACE' && <p role="status">{t('licensing.graceWarning')}</p>}
  </Frame>;
}
export function UnavailableScreen() { const { t } = useLocale(); return <Frame title="state.noPermissionTitle"><p>{t('state.noPermissionBody')}</p><Link to="/account">{t('auth.account')}</Link></Frame>; }
