import { AuthClient } from '../../apps/web/src/features/auth/client.js';
// Real TCP API adapter supplies the cookie/origin behavior jsdom lacks; no browser automation.
export function httpClient(origin: string, appOrigin: string) {
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
  return new AuthClient(transport);
}
