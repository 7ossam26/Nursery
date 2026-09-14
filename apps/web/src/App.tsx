import { ChildTransferScreen } from './features/finance/child-transfer-screen.js';
import { BillingScreen } from './features/finance/billing-screen.js';
import { CollectionsScreen } from './features/finance/collections-screen.js';
import { ParentPaymentsScreen } from './features/finance/parent-screen.js';
import { ExpensesScreen,TransfersScreen } from './features/finance/spending-screen.js';
import { ClosingScreen } from './features/finance/closing-screen.js';
import { CorrectionsScreen } from './features/finance/corrections-screen.js';
import { TransportScreen } from './features/finance/transport-screen.js';
import { PayrollScreen } from './features/finance/payroll-screen.js';
import { ReportsScreen } from './features/reports/screen.js';
import { ImportsScreen } from './features/imports/screen.js';
import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { useLocale } from './i18n/LocaleProvider.js';
import { AuthProvider, useAuth } from './features/auth/AuthProvider.js';
import { AccountScreen, AuthGate, LoginScreen, PasswordScreen, UnavailableScreen } from './features/auth/screens.js';
import type { AuthClient } from './features/auth/client.js';
import { OrganizationScreen } from './features/organization/screen.js';
import { BrandingProvider } from './features/licensing/BrandingProvider.js';
import { LicensingScreen, SettingsScreen } from './features/licensing/screen.js';
import { ChildrenScreen, ChildDetailScreen, GuardianChildrenScreen, GuardianChildScreen } from './features/children/screens.js';
import { LearningConfigurationScreen, TeacherLearningScreen } from './features/learning/screens.js';
import { TeacherAttendanceScreen } from './features/attendance/screens.js';
import { TeacherExamsScreen } from './features/exams/screens.js';
import { TeacherHomeworkScreen } from './features/homework/screens.js';
import { ParentLive } from './features/communication/ParentLive.js';
import { TreasuryScreen } from './features/finance/screen.js';
import { AnnouncementPublishScreen,ParentTodayScreen,ParentNoticesScreen,ParentNoticeScreen,ParentNotificationsScreen } from './features/communication/screens.js';

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
  return <><ParentLive /><Routes>
    <Route path="/login" element={<LoginScreen />} />
    <Route path="/administration/reports" element={<AuthGate><ReportsScreen/></AuthGate>} />
    <Route path="/administration/imports" element={<AuthGate><ImportsScreen/></AuthGate>} />
    <Route path="/administration/child-transfers" element={<AuthGate><ChildTransferScreen/></AuthGate>} />
    <Route path="/administration/expenses" element={<AuthGate><ExpensesScreen/></AuthGate>} />
    <Route path="/administration/transfers" element={<AuthGate><TransfersScreen/></AuthGate>} />
    <Route path="/administration/closing" element={<AuthGate><ClosingScreen/></AuthGate>} />
    <Route path="/administration/corrections" element={<AuthGate><CorrectionsScreen/></AuthGate>} />
    <Route path="/administration/transport" element={<AuthGate><TransportScreen/></AuthGate>} />
    <Route path="/administration/payroll" element={<AuthGate><PayrollScreen/></AuthGate>} />
    <Route path="/session-expired" element={<LoginScreen expired />} />
    <Route path="/" element={<AuthGate>{session?.account.kind==='GUARDIAN' ? <Navigate to="/parent/today" replace /> : <AccountScreen />}</AuthGate>} />
    <Route path="/account" element={<AuthGate><AccountScreen /></AuthGate>} />
    <Route path="/change-password" element={<AuthGate><PasswordScreen /></AuthGate>} />
    <Route path="/administration/organization" element={<AuthGate><OrganizationScreen /></AuthGate>} />
    <Route path="/administration/settings" element={<AuthGate><SettingsScreen /></AuthGate>} />
    <Route path="/administration/billing" element={<AuthGate><BillingScreen /></AuthGate>} />
    <Route path="/administration/collections" element={<AuthGate><CollectionsScreen /></AuthGate>} />
    <Route path="/administration/treasury" element={<AuthGate><TreasuryScreen /></AuthGate>} />
    <Route path="/administration/checkpoints" element={<AuthGate><LearningConfigurationScreen /></AuthGate>} />
    <Route path="/teacher/learning" element={<AuthGate><TeacherLearningScreen /></AuthGate>} />
    <Route path="/teacher/today" element={<AuthGate><TeacherAttendanceScreen /></AuthGate>} />
    <Route path="/teacher/homework" element={<AuthGate><TeacherHomeworkScreen /></AuthGate>} />
    <Route path="/teacher/exams" element={<AuthGate><TeacherExamsScreen /></AuthGate>} />
    <Route path="/teacher/activities" element={<AuthGate><TransportScreen rosterOnly /></AuthGate>} />
    <Route path="/support/licenses" element={<AuthGate><LicensingScreen /></AuthGate>} />
    <Route path="/administration/children" element={<AuthGate><ChildrenScreen /></AuthGate>} />
    <Route path="/administration/children/:id" element={<AuthGate><ChildDetailScreen /></AuthGate>} />
    <Route path="/parent/children" element={<AuthGate><GuardianChildrenScreen /></AuthGate>} />
    <Route path="/parent/children/:id" element={<AuthGate><GuardianChildScreen /></AuthGate>} />
    <Route path="/parent/today" element={<AuthGate><ParentTodayScreen /></AuthGate>} />
    <Route path="/parent/payments" element={<AuthGate><ParentPaymentsScreen /></AuthGate>} />
    <Route path="/parent/notices" element={<AuthGate><ParentNoticesScreen /></AuthGate>} />
    <Route path="/parent/notices/:id" element={<AuthGate><ParentNoticeScreen /></AuthGate>} />
    <Route path="/parent/notifications" element={<AuthGate><ParentNotificationsScreen /></AuthGate>} />
    <Route path="/administration/announcements" element={<AuthGate><AnnouncementPublishScreen /></AuthGate>} />
    {['parent', 'teacher', 'administration', 'support'].map((group) => <Route key={group} path={`/${group}/*`} element={<AuthGate><UnavailableScreen /></AuthGate>} />)}
    <Route path="/__preview/*" element={<PreviewRoute />} /><Route path="*" element={<NotFound />} />
  </Routes></>;
}
export function App({ authClient }: { authClient?: AuthClient }) {
  return <BrandingProvider><AuthProvider client={authClient}><AuthRoutes /></AuthProvider></BrandingProvider>;
}
