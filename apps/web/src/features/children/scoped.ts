import { useEffect, useRef, useState } from 'react';
import { catalogs, type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';

export const errorKey = (error: unknown): MessageKey => error instanceof AuthError && error.detail.messageKey in catalogs.en ? error.detail.messageKey as MessageKey : 'auth.networkError';
// Fresh scoped reads only. Hidden tabs/focus clear records before revalidation; failures drop
// visible data. No business records or initial passwords are persisted in browser storage.
export function useScoped<T>(path: string) {
  const auth = useAuth(); const authRef = useRef(auth); authRef.current = auth;
  const [data,setData] = useState<T | null>(null); const [error,setError] = useState<MessageKey | null>(null); const [revision,setRevision] = useState(0);
  useEffect(() => {
    let alive = true; let generation = 0; let pending = false;
    async function read() {
      if (!alive || pending || document.visibilityState === 'hidden') return; pending = true; const started = generation;
      try { const next = await auth.client.business<T>(path); if (alive && started === generation) { setData(next); setError(null); } }
      catch (caught) { if (alive && started === generation) { setData(null); setError(errorKey(caught)); authRef.current.handleError(caught); } }
      finally { pending = false; }
    }
    const focus = () => { generation++; setData(null); if (!pending) void read(); };
    setData(null); void read(); const timer = window.setInterval(() => { void read(); },5000);
    window.addEventListener('focus',focus); document.addEventListener('visibilitychange',focus);
    return () => { alive = false; generation++; clearInterval(timer); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',focus); };
  }, [auth.client,path,revision]);
  return { data,error,reload: () => setRevision((v) => v+1) };
}
