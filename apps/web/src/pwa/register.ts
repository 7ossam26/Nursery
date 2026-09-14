// Production-only service worker registration with a controlled update: a newly installed worker
// waits until the person chooses to reload, so in-memory form input is never discarded by an update.
type UpdateListener = (apply: () => void) => void;
const listeners = new Set<UpdateListener>();
let pendingApply: (() => void) | null = null;

export function subscribeToUpdates(listener: UpdateListener): () => void {
  listeners.add(listener);
  if (pendingApply) listener(pendingApply);
  return () => { listeners.delete(listener); };
}

function announce(waiting: ServiceWorker, onApplied: () => void) {
  pendingApply = () => { onApplied(); waiting.postMessage({ type: 'SKIP_WAITING' }); };
  for (const listener of listeners) listener(pendingApply);
}

export function registerServiceWorker(scriptUrl = '/sw.js') {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register(scriptUrl, { scope: '/' });
        let requested = false;
        const notify = () => { if (registration.waiting && navigator.serviceWorker.controller) announce(registration.waiting, () => { requested = true; }); };
        notify();
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => { if (installing.state === 'installed') notify(); });
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (requested) window.location.reload(); });
        // A bounded update check when the app returns to the foreground; the browser also checks on navigation.
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60 * 60 * 1000) return;
          lastCheck = Date.now(); void registration.update().catch(() => undefined);
        });
      } catch {
        // The site works fully without a service worker; installation is an optional convenience.
      }
    })();
  });
}
