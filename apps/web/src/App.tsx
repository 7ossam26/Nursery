import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';
import { LanguageSwitcher } from './layout/AppShell.js';
import { useLocale } from './i18n/LocaleProvider.js';

const DevelopmentPreview = import.meta.env.DEV
  ? lazy(() => import('./features/design-system/ComponentPreview.js').then(({ ComponentPreview }) => ({ default: ComponentPreview })))
  : null;

function Landing() {
  const { t } = useLocale();
  return <main className="landing"><div className="landing__language"><LanguageSwitcher /></div><section className="landing__card"><div className="brand-mark brand-mark--large" aria-hidden="true">ن</div><span className="eyebrow">{t('app.name')}</span><h1>{t('landing.title')}</h1><p>{t('landing.body')}</p>{import.meta.env.DEV && <Link className="button-link" to="/__preview">{t('landing.openPreview')}</Link>}</section></main>;
}

function NotFound() {
  const { t } = useLocale();
  return <main className="landing"><section className="landing__card"><h1>{t('state.emptyTitle')}</h1><p>{t('state.emptyBody')}</p><Link to="/">{t('common.back')}</Link></section></main>;
}

function PreviewRoute() {
  const { t } = useLocale();
  if (!DevelopmentPreview) return <NotFound />;
  return <Suspense fallback={<main className="landing" role="status">{t('state.loading')}</main>}><DevelopmentPreview /></Suspense>;
}

export function App() {
  return <Routes><Route path="/" element={<Landing />} /><Route path="/__preview/*" element={<PreviewRoute />} /><Route path="*" element={<NotFound />} /></Routes>;
}
