// Track requests before the TCP connection reaches Fastify. A server-side
// counter alone can be zero while an unmounted DOM read is still connecting.
const pendingByOrigin = new Map<string, Set<Promise<unknown>>>();

export function trackHttpRequest<T>(origin: string, request: Promise<T>): Promise<T> {
  const pending = pendingByOrigin.get(origin) ?? new Set<Promise<unknown>>();
  pendingByOrigin.set(origin, pending);
  pending.add(request);
  return request.finally(() => {
    pending.delete(request);
    if (!pending.size) pendingByOrigin.delete(origin);
  });
}

// Call after React cleanup, before closing the API/database. This only waits;
// it does not replace responses, retry requests, or conceal server failures.
export async function drainHttpRequests(origin: string): Promise<void> {
  do {
    await Promise.allSettled([...(pendingByOrigin.get(origin) ?? [])]);
    await new Promise<void>(resolve => setImmediate(resolve));
  } while (pendingByOrigin.get(origin)?.size);
}
