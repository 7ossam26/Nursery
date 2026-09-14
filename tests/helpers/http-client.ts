import { AuthClient } from '../../apps/web/src/features/auth/client.js';
// Real TCP API adapter supplies the cookie/origin behavior jsdom lacks; no browser automation.
export function httpClient(origin: string, appOrigin: string,live=false) {
  const jar = new Map<string,string>();
  const transport: typeof fetch = async (path,options = {}) => {
    const headers = new Headers(options.headers);
    headers.set('cookie',[...jar].map(([name,value]) => `${name}=${value}`).join('; '));
    if (options.method !== 'GET') headers.set('origin',appOrigin);
    const response = await fetch(`${origin}${String(path)}`,{ ...options,headers });
    for (const entry of response.headers.getSetCookie()) {
      const [pair] = entry.split(';'); const split = pair.indexOf('='); const name = pair.slice(0,split); const value = pair.slice(split+1);
      if (value) jar.set(name,value); else jar.delete(name);
    }
    return response;
  };
  // Script-only EventSource adapter consumes the actual authenticated HTTP stream.
  // The production implementation uses the browser's native EventSource.
  const open=() => {
    class TcpEvents extends EventTarget {
      private abort=new AbortController(); private closed=false;
      onerror: ((event: Event) => unknown) | null=null;
      constructor() { super(); void this.read(); }
      close() { this.closed=true; this.abort.abort(); }
      private async read() {
        try {
          const response=await transport('/api/v1/parent/live',{ method: 'GET',signal: this.abort.signal });
          if (!response.ok) throw new Error('Live handshake rejected');
          const reader=response.body!.getReader(); const decoder=new TextDecoder(); let buffer='';
          while (!this.closed) {
            const chunk=await reader.read(); if (chunk.done) break; buffer+=decoder.decode(chunk.value,{ stream: true });
            let boundary: number;
            while ((boundary=buffer.indexOf('\n\n'))>=0) {
              const frame=buffer.slice(0,boundary); buffer=buffer.slice(boundary+2);
              const name=/^event: (.+)$/m.exec(frame)?.[1]; const data=/^data: (.+)$/m.exec(frame)?.[1];
              if (name && !this.closed) this.dispatchEvent(new MessageEvent(name,{ data }));
            }
          }
          if (!this.closed) this.onerror?.(new Event('error'));
        } catch { if (!this.closed) this.onerror?.(new Event('error')); }
      }
    }
    return new TcpEvents() as unknown as EventSource;
  };
  return new AuthClient(transport,live ? open : undefined);
}
