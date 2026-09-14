import { useEffect, useState } from 'react';
import { Button } from '../components/controls.js';
import { useLocale } from '../i18n/LocaleProvider.js';
import { subscribeToUpdates } from './register.js';

// Announces an installed new version without stealing focus; the reload happens only on request.
export function UpdateNotice() {
  const { t } = useLocale();
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => subscribeToUpdates((next) => setApply(() => next)), []);
  if (!apply) return null;
  return <div className="update-notice" role="status" aria-live="polite"><span>{t('pwa.updateReady')}</span><Button variant="secondary" onClick={apply}>{t('pwa.updateNow')}</Button></div>;
}
