import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes } from 'react-router';
import { useLocale } from './i18n/LocaleProvider.js';
import { AuthProvider, useAuth } from './features/auth/AuthProvider.js';
import { AccountScreen, AuthGate, LoginScreen, PasswordScreen, UnavailableScreen } from './features/auth/screens.js';
import type { AuthClient } from './features/auth/client.js';
import { OrganizationScreen } from './features/organization/screen.js';
import { BrandingProvider } from './features/licensing/BrandingProvider.js';
import { LicensingScreen, SettingsScreen } from './features/licensing/screen.js';
import { ChildrenScreen, ChildDetailScreen, GuardianChildrenScreen, GuardianChildScreen } from './features/children/screens.js';

const DevelopmentPreview = import.meta.env.DEV
  ? lazy(() => import('./features/design-system/ComponentPreview.js').then(({ ComponentPreview }) => ({ default: ComponentPreview })))
  : null;

function NotFound() {
  const { t } = useLocale();
  return <main className="landing"><section className="landing__card"><h1>{t('state.emptyTitle')}</h1><p>{t('state.emptyBody')}</p><Link to="/">{t('common.back')}</Link></section></main>;
}

function PreviewRoute() {
  const { t } = useLocale();
  if (!DevelopmentPreview) return <NotFound />;
  return <Suspense fallback={<main className="landing" role="status">{t('state.loading')}</main>}><DevelopmentPreview /></Suspense>;
}

function AuthRoutes() {
  const { session } = useAuth(); const { setLocale } = useLocale();
  const userLocale = session?.account.locale;
  useEffect(() => { if (userLocale) setLocale(userLocale); }, [userLocale, setLocale]);
  return <Routes>
    <Route path="/login" element={<LoginScreen />} />
    <Route path="/session-expired" element={<LoginScreen expired />} />
    <Route path="/" element={<AuthGate><AccountScreen /></AuthGate>} />
    <Route path="/account" element={<AuthGate><AccountScreen /></AuthGate>} />
    <Route path="/change-password" element={<AuthGate><PasswordScreen /></AuthGate>} />
    <Route path="/administration/organization" element={<AuthGate><OrganizationScreen /></AuthGate>} />
    <Route path="/administration/settings" element={<AuthGate><SettingsScreen /></AuthGate>} />
    <Route path="/support/licenses" element={<AuthGate><LicensingScreen /></AuthGate>} />
    <Route path="/administration/children" element={<AuthGate><ChildrenScreen /></AuthGate>} />
    <Route path="/administration/children/:id" element={<AuthGate><ChildDetailScreen /></AuthGate>} />
    <Route path="/parent/children" element={<AuthGate><GuardianChildrenScreen /></AuthGate>} />
    <Route path="/parent/children/:id" element={<AuthGate><GuardianChildScreen /></AuthGate>} />
    {['parent', 'teacher', 'administration', 'support'].map((group) => <Route key={group} path={`/${group}/*`} element={<AuthGate><UnavailableScreen /></AuthGate>} />)}
    <Route path="/__preview/*" element={<PreviewRoute />} /><Route path="*" element={<NotFound />} />
  </Routes>;
}
export function App({ authClient }: { authClient?: AuthClient }) {
  return <BrandingProvider><AuthProvider client={authClient}><AuthRoutes /></AuthProvider></BrandingProvider>;
}
