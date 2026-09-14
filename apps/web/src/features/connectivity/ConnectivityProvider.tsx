import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/controls.js';
import { Icon } from '../../components/Icon.js';
import { Modal } from '../../components/Modal.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { useAuth } from '../auth/AuthProvider.js';
import { connectivity, type ConnectivityState } from './bus.js';

type ConnectivityValue = Readonly<{ offline: boolean; retry: () => Promise<boolean> }>;
const Context = createContext<ConnectivityValue>({ offline: false, retry: async () => true });

// Online-only product: a connection problem opens one clear modal, keeps every entered value in
// component memory, blocks new writes and re-reads fresh data once the API answers again.
// Nothing is queued and no operation is resubmitted under a new ID.
export function ConnectivityProvider({ children }: Readonly<{ children: ReactNode }>) {
  const auth = useAuth(); const { t } = useLocale();
  const [state, setState] = useState<ConnectivityState>(connectivity.state);
  const [open, setOpen] = useState(false); const [checking, setChecking] = useState(false); const [restored, setRestored] = useState(0);
  const checkingRef = useRef(false);
  const retry = useCallback(async () => {
    if (checkingRef.current) return false;
    checkingRef.current = true; setChecking(true);
    try {
      const reachable = await auth.client.health();
      if (reachable) { connectivity.online(); setOpen(false); setRestored((v) => v + 1); window.dispatchEvent(new Event('nursery:reconnect')); }
      return reachable;
    } finally { checkingRef.current = false; setChecking(false); }
  }, [auth.client]);
  useEffect(() => {
    const unsubscribe = connectivity.subscribe((next) => { setState(next); if (next === 'offline') setOpen(true); });
    const browserOffline = () => connectivity.offline();
    const browserOnline = () => { void retry(); };
    window.addEventListener('offline', browserOffline); window.addEventListener('online', browserOnline);
    return () => { unsubscribe(); window.removeEventListener('offline', browserOffline); window.removeEventListener('online', browserOnline); };
  }, [retry]);
  useEffect(() => { if (state === 'online' && open) { setOpen(false); } }, [state, open]);
  return <Context.Provider value={{ offline: state === 'offline', retry }}>
    {state === 'offline' && !open && <div className="stale-notice" role="status"><Icon name="warning" /><span>{t('network.stale')}</span><Button variant="secondary" disabled={checking} onClick={() => { void retry(); }}>{t('network.retry')}</Button></div>}
    {children}
    <Modal open={open} title={t('network.title')} closeLabel={t('common.close')} onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t('network.keepEditing')}</Button><Button icon="arrow" disabled={checking} onClick={() => { void retry(); }}>{t(checking ? 'auth.working' : 'network.retry')}</Button></>}>
      <p>{t('network.body')}</p><p>{t('network.preserved')}</p><p>{t('network.noQueue')}</p>
    </Modal>
    {restored > 0 && <div role="status" aria-live="polite" className="visually-hidden"><span key={restored}>{t('network.restored')}</span></div>}
  </Context.Provider>;
}
export const useConnectivity = () => useContext(Context);
