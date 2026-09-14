import { useEffect, useRef, useState } from 'react';
import { catalogs, type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError, NetworkError } from '../auth/client.js';

export const errorKey = (error: unknown): MessageKey => error instanceof AuthError && error.detail.messageKey in catalogs.en ? error.detail.messageKey as MessageKey : 'auth.networkError';
// Fresh scoped reads only. Hidden tabs/focus clear records before revalidation; authorization
// failures drop visible data. A connection problem keeps the last in-memory record (flagged stale)
// so a half-completed form is not unmounted; nothing is written to browser storage.
export function useScoped<T>(path: string) {
  const auth = useAuth(); const authRef = useRef(auth); authRef.current = auth;
  const [record,setRecord] = useState<{ path: string;value: T } | null>(null); const [error,setError] = useState<MessageKey | null>(null); const [stale,setStale] = useState(false); const [revision,setRevision] = useState(0);
  useEffect(() => {
    let alive = true; let generation = 0; let pending = false; let queued = false;
    async function read() {
      if (!alive || pending || document.visibilityState === 'hidden') return; pending = true; const started = generation;
      try { const next = await auth.client.business<T>(path); if (alive && started === generation) { setRecord({ path,value: next }); setError(null); setStale(false); } }
      catch (caught) { if (alive && started === generation) { if (caught instanceof NetworkError) { setStale(true); setError((current) => current ?? errorKey(caught)); } else { setRecord(null); setStale(false); setError(errorKey(caught)); } authRef.current.handleError(caught); } }
      finally { pending = false; if (queued && alive) { queued=false; void read(); } }
    }
    const focus = () => { generation++; setRecord(null); setStale(false); if (pending) queued=true; else void read(); };
    // After a connection returns, re-read without dropping the stale record so open forms stay mounted.
    const reconnect = () => { generation++; if (pending) queued=true; else void read(); };
    setRecord(null); setStale(false); void read(); const timer = window.setInterval(() => { void read(); },5000);
    window.addEventListener('focus',focus); document.addEventListener('visibilitychange',focus);
    window.addEventListener('nursery:scope-refresh',focus); window.addEventListener('nursery:reconnect',reconnect);
    return () => { alive = false; generation++; clearInterval(timer); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',focus); window.removeEventListener('nursery:scope-refresh',focus); window.removeEventListener('nursery:reconnect',reconnect); };
  }, [auth.client,path,revision]);
  return { data: record?.path===path ? record.value : null,error,stale,reload: () => setRevision((v) => v+1) };
}
