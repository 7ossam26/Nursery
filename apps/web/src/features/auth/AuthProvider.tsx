import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse } from '@nursery/contracts';
import { AuthClient, AuthError } from './client.js';

type AuthState = { session: AuthResponse['data'] | null; loading: boolean; expired: boolean; publicMessage?: string; blocked: boolean; suspended: boolean };
type AuthContextValue = AuthState & { client: AuthClient; accept: (session: AuthResponse['data']) => void; signedOut: () => void; handleError: (error: unknown) => void };
const Context = createContext<AuthContextValue | null>(null);
const defaultClient = new AuthClient();
const empty: AuthState = { session: null, loading: false, expired: false, blocked: false, suspended: false };
const recognizedCodes = ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCOUNT_BLOCKED', 'ACCOUNT_DISABLED', 'LICENSE_SUSPENDED'];
// Same-origin tabs are told to revalidate their session after a sign-in, sign-out or revocation.
// The message carries no session data: each tab asks the API and drops its own in-memory state.
export const SESSION_CHANNEL = 'nursery-session';
export const SESSION_CLEARED_EVENT = 'nursery:session-cleared';
function signedOutState(code: string, publicMessage?: string): AuthState {
  return { ...empty, expired: code === 'SESSION_EXPIRED', blocked: code === 'ACCOUNT_BLOCKED' || code === 'ACCOUNT_DISABLED', suspended: code === 'LICENSE_SUSPENDED', publicMessage };
}
function openChannel(): BroadcastChannel | null {
  try { return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL); } catch { return null; }
}
export function AuthProvider({ children, client = defaultClient }: { children: ReactNode; client?: AuthClient }) {
  const [state, setState] = useState<AuthState>({ ...empty, loading: true });
  const revision = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const notifyTabs = () => { try { channel.current?.postMessage({ type: 'revalidate' }); } catch { /* channel closed */ } };
  // Application-controlled data lives in component state under the session; announcing the clear
  // lets long-lived listeners (live streams, object URLs) release anything they still hold.
  const cleared = (next: AuthState) => { revision.current++; client.clear(); setState(next); window.dispatchEvent(new Event(SESSION_CLEARED_EVENT)); };
  function handleError(error: unknown) {
    if (!(error instanceof AuthError)) return;
    if (recognizedCodes.includes(error.detail.code)) { cleared(signedOutState(error.detail.code, error.detail.publicMessage)); notifyTabs(); }
  }
  const revalidate = useCallback(() => {
    const startedAt = ++revision.current;
    void client.current().then((session) => { if (revision.current === startedAt) setState({ ...empty, session }); }).catch((error: unknown) => {
      if (revision.current !== startedAt) return;
      if (error instanceof AuthError && recognizedCodes.includes(error.detail.code)) { client.clear(); setState(signedOutState(error.detail.code, error.detail.publicMessage)); window.dispatchEvent(new Event(SESSION_CLEARED_EVENT)); }
      else if (error instanceof AuthError) setState({ ...empty });
      // A connection problem keeps the current state; the connectivity dialog handles it.
    });
  }, [client]);
  useEffect(() => {
    let alive = true; const startedAt = revision.current;
    void client.current().then((session) => { if (alive && revision.current === startedAt) setState({ ...empty, session }); }).catch((error: unknown) => {
      if (!alive || revision.current !== startedAt) return;
      if (error instanceof AuthError && recognizedCodes.includes(error.detail.code)) { client.clear(); setState(signedOutState(error.detail.code, error.detail.publicMessage)); }
      else setState({ ...empty });
    });
    return () => { alive = false; };
  }, [client]);
  useEffect(() => {
    channel.current = openChannel();
    const onMessage = (event: MessageEvent) => { if (event.data?.type === 'revalidate') revalidate(); };
    channel.current?.addEventListener('message', onMessage);
    // A page restored from the back/forward cache must not show a session that ended meanwhile.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) revalidate(); };
    window.addEventListener('pageshow', onPageShow);
    return () => { channel.current?.removeEventListener('message', onMessage); channel.current?.close(); channel.current = null; window.removeEventListener('pageshow', onPageShow); };
  }, [revalidate]);
  useEffect(() => {
    if (!state.session) return;
    const deadline = Math.min(Date.parse(state.session.expiresAt), Date.parse(state.session.idleExpiresAt));
    const timer = window.setTimeout(() => { cleared({ ...empty, expired: true }); }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.session, client]);
  return <Context.Provider value={{ ...state, client, accept: (session) => { revision.current++; setState({ ...empty, session }); notifyTabs(); }, signedOut: () => { cleared(empty); notifyTabs(); }, handleError }}>{children}</Context.Provider>;
}
export function useAuth() { const auth = useContext(Context); if (!auth) throw new Error('AuthProvider required'); return auth; }
