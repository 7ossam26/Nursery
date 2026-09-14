import { useEffect,useRef,useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider.js';
import { useLocale } from '../../i18n/LocaleProvider.js';

export function refreshParentScope() { window.dispatchEvent(new Event('nursery:scope-refresh')); }
export function ParentLive() {
  const auth=useAuth(); const latest=useRef(auth); latest.current=auth; const { pathname }=useLocation();
  const { t }=useLocale(); const [update,setUpdate]=useState(0);
  const accountId=auth.session?.account.kind==='GUARDIAN' && pathname.startsWith('/parent/') ? auth.session.account.id : null;
  useEffect(() => {
    if (!accountId) return;
    let alive=true; let stream: EventSource | null=null; let timer: number | undefined; let retry=0;
    const clear=() => { stream?.close(); stream=null; window.clearTimeout(timer); };
    const connect=() => {
      if (!alive || document.visibilityState==='hidden') return;
      stream=latest.current.client.parentLive(); if (!stream) return;
      stream.addEventListener('snapshot',() => { retry=0; refreshParentScope(); });
      stream.addEventListener('invalidate',() => { refreshParentScope(); setUpdate((v) => v+1); });
      const reconnect=() => { clear(); if (alive) timer=window.setTimeout(connect,Math.min(10000,1000*2**Math.min(retry++,4))); };
      stream.addEventListener('reconnect',reconnect);
      stream.addEventListener('revoked',() => {
        clear(); refreshParentScope();
        void latest.current.client.current().then(() => { if (alive) timer=window.setTimeout(connect,1000); }).catch((caught) => { if (alive) latest.current.handleError(caught); });
      });
      stream.onerror=() => { refreshParentScope(); reconnect(); };
    };
    const focus=() => { clear(); refreshParentScope(); connect(); };
    connect(); window.addEventListener('focus',focus); document.addEventListener('visibilitychange',focus);
    return () => { alive=false; clear(); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',focus); };
  },[accountId,auth.client]);
  return accountId && update>0 ? <div role="status" aria-live="polite" className="visually-hidden"><span key={update}>{t('hub.updated')}</span></div> : null;
}
