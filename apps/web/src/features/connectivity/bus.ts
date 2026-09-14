// Framework-free connectivity state shared by the API client and the connection-problem UI.
// It records the last observed transport outcome only; nothing is queued or persisted.
export type ConnectivityState = 'online' | 'offline';
type Listener = (state: ConnectivityState) => void;
const listeners = new Set<Listener>();
let current: ConnectivityState = 'online';

function set(next: ConnectivityState) {
  if (current === next) return;
  current = next;
  for (const listener of [...listeners]) listener(next);
}

export const connectivity = {
  get state() { return current; },
  offline() { set('offline'); },
  online() { set('online'); },
  subscribe(listener: Listener): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
  // Test-only reset between scripted scenarios.
  reset() { current = 'online'; listeners.clear(); }
};
