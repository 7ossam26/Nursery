import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../features/auth/AuthProvider.js';
import { useScoped } from '../features/children/scoped.js';
import { AppShell, type ShellMode } from './AppShell.js';
import { shellRoleFor, type SessionAccount } from './navigation.js';

// Parent payments appear only when finance is enabled and a linked child grants finance access;
// the server decides this, so the shell reads the same options the payments screen uses.
function ParentSessionShell({ account, children, mode }: Readonly<{ account: SessionAccount; children: ReactNode; mode: ShellMode }>) {
  const finance = useScoped<{ enabled: boolean; children: { id: string }[] }>('parent/payment-options');
  return <AppShell role="parent" mode={mode} context={{ account, parentFinance: !!finance.data?.children.length }}>{children}</AppShell>;
}

export function SessionShell({ children }: Readonly<{ children: ReactNode }>) {
  const { session } = useAuth();
  const { pathname } = useLocation();
  if (!session) return children;
  const role = shellRoleFor(session.account);
  const mode: ShellMode = pathname === '/support' || pathname.startsWith('/support/') ? 'support' : 'standard';
  if (role === 'parent') return <ParentSessionShell account={session.account} mode={mode}>{children}</ParentSessionShell>;
  return <AppShell role={role} mode={mode} context={{ account: session.account, parentFinance: false }}>{children}</AppShell>;
}
