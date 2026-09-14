import type { ReactNode } from 'react';
import { useAuth } from '../features/auth/AuthProvider.js';
import { useScoped } from '../features/children/scoped.js';
import { AppShell } from './AppShell.js';
import { shellRoleFor, type SessionAccount } from './navigation.js';

// Parent payments appear only when finance is enabled and a linked child grants finance access;
// the server decides this, so the shell reads the same options the payments screen uses.
function ParentSessionShell({ account, children }: Readonly<{ account: SessionAccount; children: ReactNode }>) {
  const finance = useScoped<{ enabled: boolean; children: { id: string }[] }>('parent/payment-options');
  return <AppShell role="parent" context={{ account, parentFinance: !!finance.data?.children.length }}>{children}</AppShell>;
}

export function SessionShell({ children }: Readonly<{ children: ReactNode }>) {
  const { session } = useAuth();
  if (!session) return children;
  const role = shellRoleFor(session.account);
  if (role === 'parent') return <ParentSessionShell account={session.account}>{children}</ParentSessionShell>;
  return <AppShell role={role} context={{ account: session.account, parentFinance: false }}>{children}</AppShell>;
}
