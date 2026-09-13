import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse } from '@nursery/contracts';
import { AuthClient, AuthError } from './client.js';

type AuthState = { session: AuthResponse['data'] | null; loading: boolean; expired: boolean; publicMessage?: string; blocked: boolean };
type AuthContextValue = AuthState & { client: AuthClient; accept: (session: AuthResponse['data']) => void; signedOut: () => void; handleError: (error: unknown) => void };
const Context = createContext<AuthContextValue | null>(null);
const defaultClient = new AuthClient();
const empty: AuthState = { session: null, loading: false, expired: false, blocked: false };
export function AuthProvider({ children, client = defaultClient }: { children: ReactNode; client?: AuthClient }) {
  const [state, setState] = useState<AuthState>({ ...empty, loading: true });
  const revision = useRef(0);
  function handleError(error: unknown) {
    if (!(error instanceof AuthError)) return;
    if (['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCOUNT_BLOCKED', 'ACCOUNT_DISABLED'].includes(error.detail.code)) {
      revision.current++; client.clear();
      setState({ ...empty, expired: error.detail.code === 'SESSION_EXPIRED', blocked: ['ACCOUNT_BLOCKED', 'ACCOUNT_DISABLED'].includes(error.detail.code), publicMessage: error.detail.publicMessage });
    }
  }
  useEffect(() => {
    let alive = true; const startedAt = revision.current;
    void client.current().then((session) => { if (alive && revision.current === startedAt) setState({ ...empty, session }); }).catch((error: unknown) => {
      if (!alive || revision.current !== startedAt) return;
      if (error instanceof AuthError && ['UNAUTHORIZED', 'SESSION_EXPIRED', 'ACCOUNT_BLOCKED', 'ACCOUNT_DISABLED'].includes(error.detail.code)) {
        client.clear(); setState({ ...empty, expired: error.detail.code === 'SESSION_EXPIRED', blocked: ['ACCOUNT_BLOCKED', 'ACCOUNT_DISABLED'].includes(error.detail.code), publicMessage: error.detail.publicMessage });
      } else setState({ ...empty });
    });
    return () => { alive = false; };
  }, [client]);
  useEffect(() => {
    if (!state.session) return;
    const deadline = Math.min(Date.parse(state.session.expiresAt), Date.parse(state.session.idleExpiresAt));
    const timer = window.setTimeout(() => { client.clear(); setState({ ...empty, expired: true }); }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state.session, client]);
  return <Context.Provider value={{ ...state, client, accept: (session) => { revision.current++; setState({ ...empty, session }); }, signedOut: () => { revision.current++; client.clear(); setState(empty); }, handleError }}>{children}</Context.Provider>;
}
export function useAuth() { const auth = useContext(Context); if (!auth) throw new Error('AuthProvider required'); return auth; }
