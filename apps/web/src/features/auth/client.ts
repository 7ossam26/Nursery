import { apiErrorSchema, authResponseSchema, type ApiError, type AuthResponse } from '@nursery/contracts';
import { connectivity } from '../connectivity/bus.js';

export class AuthError extends Error {
  constructor(readonly detail: ApiError) { super(detail.messageKey); }
}
// The request never reached the API or no usable response came back (offline, proxy/gateway
// failure, aborted socket). Callers treat it as an unknown outcome, never as a business result.
export class NetworkError extends Error {
  constructor(cause?: unknown) { super('auth.networkError', { cause }); this.name = 'NetworkError'; }
}
const gatewayStatuses = [502, 503, 504];
export class AuthClient {
  private csrf = '';
  private revision = 0;
  constructor(private readonly transport: typeof fetch = (...args) => fetch(...args),private readonly liveTransport?: () => EventSource) {}
  parentLive(): EventSource | null { return this.liveTransport ? this.liveTransport() : typeof EventSource==='undefined' ? null : new EventSource('/api/v1/parent/live',{ withCredentials: true }); }
  clear() { this.revision++; this.csrf = ''; }
  // Every API call passes here so connection problems are observed in one place.
  private async send(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try { response = await this.transport(path, init); }
    catch (caught) { connectivity.offline(); throw new NetworkError(caught); }
    if (gatewayStatuses.includes(response.status)) { connectivity.offline(); throw new NetworkError(response.status); }
    connectivity.online();
    return response;
  }
  private async failure(response: Response): Promise<Error> {
    let parsed: ReturnType<typeof apiErrorSchema.safeParse> | null = null;
    try { parsed = apiErrorSchema.safeParse(await response.json()); } catch (caught) { return new NetworkError(caught); }
    return parsed.success ? new AuthError(parsed.data) : new Error('Unexpected API response');
  }
  private async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const response = await this.send(path.startsWith('/') ? path : `/api/v1/auth/${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw await this.failure(response);
    try { return response.status === 204 ? undefined : await response.json(); }
    catch (caught) { connectivity.offline(); throw new NetworkError(caught); }
  }
  // Public reachability probe used by the connection-problem dialog; it carries no session data.
  async health(): Promise<boolean> {
    try { const response = await this.send('/api/v1/health', { method: 'GET', credentials: 'omit', cache: 'no-store' }); return response.ok; }
    catch { return false; }
  }
  private accept(result: unknown): AuthResponse['data'] {
    const { data } = authResponseSchema.parse(result); this.csrf = data.csrfToken; return data;
  }
  async current() {
    const startedAt = this.revision; const result = await this.request('me');
    if (startedAt !== this.revision) throw new Error('Superseded session response');
    return this.accept(result);
  }
  async login(username: string, password: string) {
    this.revision++;
    const pre = await this.request('csrf') as { data: { csrfToken: string } };
    this.csrf = pre.data.csrfToken;
    return this.accept(await this.request('login', 'POST', { username, password }));
  }
  async logout() { await this.request('logout', 'POST', {}); this.clear(); }
  async changePassword(currentPassword: string, newPassword: string) { this.revision++; return this.accept(await this.request('password', 'POST', { currentPassword, newPassword })); }
  async rotate() { this.revision++; return this.accept(await this.request('rotate', 'POST', {})); }
  async locale(locale: 'en' | 'ar-EG') { await this.request('locale', 'PATCH', { locale }); }
  async organization<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const result = await this.request(`/api/v1/organization/${path}`, method, body) as { data: T };
    return result.data;
  }
  async licensing<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const result = await this.request(`/api/v1/licensing/${path}`, method, body) as { data: T };
    // Lifecycle endpoints deliberately return 204; an empty successful response is not a network failure.
    return result === undefined ? undefined as T : result.data;
  }
  async business<T>(path: string,method = 'GET',body?: unknown): Promise<T> {
    const result = await this.request(`/api/v1/${path}`,method,body) as { data: T }; return result.data;
  }
  async downloadReport(id:string) {
    const revision=this.revision;
    const response=await this.send(`/api/v1/reports/exports/${encodeURIComponent(id)}/download`,{method:'GET',credentials:'same-origin',cache:'no-store'});
    if(!response.ok) throw await this.failure(response);
    if(response.status===202)return null;
    const bytes=await response.blob();if(revision!==this.revision)throw new Error('Superseded session response');return bytes;
  }
  // Authenticated attachment download (templates); the response is never cached or persisted by the app.
  async downloadFile(path:string) {
    const revision=this.revision;
    const response=await this.send(`/api/v1/${path}`,{method:'GET',credentials:'same-origin',cache:'no-store'});
    if(!response.ok) throw await this.failure(response);
    const bytes=await response.blob();if(revision!==this.revision)throw new Error('Superseded session response');
    const filename=/filename="([^"]+)"/.exec(response.headers.get('content-disposition')??'')?.[1]??'download';return {bytes,filename};
  }
  // Public and unauthenticated: safe to call before sign-in so the login screen reflects nursery branding.
  async branding<T>(): Promise<T> {
    const result = await this.request('/api/v1/licensing/branding') as { data: T };
    return result.data;
  }
  async reset(accountId: string, operatorPassword: string): Promise<string> {
    const result = await this.request(`accounts/${encodeURIComponent(accountId)}/reset-password`, 'POST', { operatorPassword }) as { data: { temporaryPassword: string } };
    return result.data.temporaryPassword;
  }
}
