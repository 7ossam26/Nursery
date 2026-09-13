import { apiErrorSchema, authResponseSchema, type ApiError, type AuthResponse } from '@nursery/contracts';

export class AuthError extends Error {
  constructor(readonly detail: ApiError) { super(detail.messageKey); }
}
export class AuthClient {
  private csrf = '';
  private revision = 0;
  constructor(private readonly transport: typeof fetch = (...args) => fetch(...args)) {}
  clear() { this.revision++; this.csrf = ''; }
  private async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const response = await this.transport(path.startsWith('/') ? path : `/api/v1/auth/${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(await response.json());
      if (parsed.success) throw new AuthError(parsed.data);
      throw new Error('Unexpected API response');
    }
    return response.status === 204 ? undefined : response.json();
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
  async reset(accountId: string, operatorPassword: string): Promise<string> {
    const result = await this.request(`accounts/${encodeURIComponent(accountId)}/reset-password`, 'POST', { operatorPassword }) as { data: { temporaryPassword: string } };
    return result.data.temporaryPassword;
  }
}
