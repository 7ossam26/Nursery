import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes } from 'react-router';
import { useLocale } from './i18n/LocaleProvider.js';
import { AuthProvider, useAuth } from './features/auth/AuthProvider.js';
import { AccountScreen, AuthGate, LoginScreen, PasswordScreen, UnavailableScreen } from './features/auth/screens.js';
import type { AuthClient } from './features/auth/client.js';

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
    {['parent', 'teacher', 'administration', 'support'].map((group) => <Route key={group} path={`/${group}/*`} element={<AuthGate><UnavailableScreen /></AuthGate>} />)}
    <Route path="/__preview/*" element={<PreviewRoute />} /><Route path="*" element={<NotFound />} />
  </Routes>;
}
export function App({ authClient }: { authClient?: AuthClient }) {
  return <AuthProvider client={authClient}><AuthRoutes /></AuthProvider>;
}
