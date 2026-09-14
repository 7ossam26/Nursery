import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Branding } from '@nursery/contracts';
import { AuthClient } from '../auth/client.js';
import { themeVariables } from './theme.js';
const Context = createContext<Branding | null>(null);
const defaultClient = new AuthClient();

export function BrandingProvider({ children, client = defaultClient }: Readonly<{ children: ReactNode; client?: AuthClient }>) {
  const [branding, setBranding] = useState<Branding | null>(null);
  useEffect(() => {
    let alive = true;
    void client.branding<Branding>().then((next) => { if (alive) setBranding(next); }).catch(() => undefined);
    return () => { alive = false; };
  }, [client]);
  useEffect(() => {
    if (!branding) return;
    const root = document.documentElement;
    for (const [variable, value] of Object.entries(themeVariables(branding.theme))) root.style.setProperty(variable, value);
    document.title = branding.name;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.theme.brandPink);
  }, [branding]);
  return <Context.Provider value={branding}>{children}</Context.Provider>;
}
export function useBranding(): Branding | null { return useContext(Context); }
