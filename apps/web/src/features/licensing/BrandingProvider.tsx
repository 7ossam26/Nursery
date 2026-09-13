import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Branding } from '@nursery/contracts';
import { AuthClient } from '../auth/client.js';

// Maps stored theme tokens onto the CSS custom properties every screen already renders with.
const themeVariableMap: Record<keyof Branding['theme'], string> = {
  brandPink: '--color-brand', softPink: '--color-brand-soft', peach: '--color-peach', paleYellow: '--color-notice',
  text: '--color-text', surface: '--color-surface', background: '--color-background', strongPinkButton: '--color-action',
  success: '--color-success', warning: '--color-warning', error: '--color-error'
};
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
    for (const [token, variable] of Object.entries(themeVariableMap) as [keyof Branding['theme'], string][]) root.style.setProperty(variable, branding.theme[token]);
    document.title = branding.name;
  }, [branding]);
  return <Context.Provider value={branding}>{children}</Context.Provider>;
}
export function useBranding(): Branding | null { return useContext(Context); }
