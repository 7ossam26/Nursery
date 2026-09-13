import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { changePasswordSchema, loginSchema, localeSchema, resetPasswordSchema, normalizeUsername } from '@nursery/contracts';
import type { AppConfig } from '../../config.js';
import { SafeError } from '../../errors.js';
import { AuthService, type Authenticated } from './service.js';
import { equalSecret, keyedHash, randomToken } from './crypto.js';

declare module 'fastify' {
  interface FastifyContextConfig { public?: boolean; allowPasswordChange?: boolean }
  interface FastifyRequest { authentication: Authenticated | null; sessionToken: string }
  interface FastifyInstance { auth: AuthService }
}
function cookieValue(request: FastifyRequest, name: string): string {
  const matches = (request.headers.cookie ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
export function installAuthentication(app: FastifyInstance, config: AppConfig) {
  const secure = new URL(config.appOrigin).protocol === 'https:';
  const sessionName = secure ? '__Host-nursery_session' : 'nursery_session';
  const loginName = secure ? '__Host-nursery_login_csrf' : 'nursery_login_csrf';
  const flags = `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  const service = new AuthService(app.database, config.installationId, config.sessionSecret);
  app.decorate('auth', service);
  app.decorateRequest('authentication', null);
  app.decorateRequest('sessionToken', '');
  const csrf = (token: string) => keyedHash(config.sessionSecret, `session-csrf:${token}`);
  const rejectCsrf = () => new SafeError('CSRF_REJECTED', 'auth.csrfRejected', false, 403);
  function respond(reply: FastifyReply, result: Authenticated & { token?: string }, currentToken = '') {
    const token = result.token ?? currentToken;
    if (result.token) reply.header('Set-Cookie', [`${sessionName}=${token}; ${flags}`, `${loginName}=; ${flags}; Max-Age=0`]);
    return { data: { account: result.account, expiresAt: result.expiresAt, idleExpiresAt: result.idleExpiresAt, csrfToken: csrf(token) } };
  }
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache')
      .header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer')
      .header('X-Frame-Options', 'DENY').header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
      .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (secure) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    request.sessionToken = cookieValue(request, sessionName);
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    if (request.headers.origin !== config.appOrigin || (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin') || request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw rejectCsrf();
    const supplied = request.headers['x-csrf-token'];
    if (typeof supplied !== 'string' || supplied.length > 256) throw rejectCsrf();
    if (request.routeOptions.url === '/api/v1/auth/login') {
      const nonce = cookieValue(request, loginName);
      const [stamp, random, signature] = nonce.split('.');
      const age = Date.now() - Number(stamp);
      if (!stamp || !random || !signature || !Number.isFinite(age) || age < 0 || age > 10 * 60_000 || !equalSecret(signature, keyedHash(config.sessionSecret, `login:${stamp}.${random}`)) || !equalSecret(nonce, supplied)) throw rejectCsrf();
    } else if (!request.sessionToken || !equalSecret(csrf(request.sessionToken), supplied)) throw rejectCsrf();
  });
  app.addHook('preHandler', async (request) => {
    if (request.routeOptions.config.public) return;
    if (!request.sessionToken) throw new SafeError('UNAUTHORIZED', 'auth.signInRequired', false, 401);
    request.authentication = await service.authenticate(request.sessionToken, request.routeOptions.config.allowPasswordChange);
  });
  app.get('/api/v1/auth/csrf', { config: { public: true } }, async (_request, reply) => {
    const content = `${Date.now()}.${randomToken()}`;
    const token = `${content}.${keyedHash(config.sessionSecret, `login:${content}`)}`;
    reply.header('Set-Cookie', `${loginName}=${token}; ${flags}; Max-Age=600`);
    return { data: { csrfToken: token } };
  });
  app.post('/api/v1/auth/login', { config: { public: true } }, async (request, reply) => {
    const raw = request.body as { username?: unknown } | null;
    await service.rateLimit(request.ip, typeof raw?.username === 'string' ? normalizeUsername(raw.username).slice(0, 256) : 'invalid');
    const input = loginSchema.parse(request.body);
    return respond(reply, await service.login(input.username, input.password, request.sessionToken));
  });
  app.get('/api/v1/auth/me', { config: { allowPasswordChange: true } }, async (request, reply) => respond(reply, request.authentication!, request.sessionToken));
  app.post('/api/v1/auth/logout', { config: { allowPasswordChange: true } }, async (request, reply) => {
    await service.logout(request.sessionToken);
    reply.header('Set-Cookie', `${sessionName}=; ${flags}; Max-Age=0`);
    return reply.code(204).send();
  });
  app.post('/api/v1/auth/rotate', async (request, reply) => respond(reply, await service.rotate(request.sessionToken)));
  app.post('/api/v1/auth/password', { config: { allowPasswordChange: true } }, async (request, reply) => {
    await service.rateLimit(request.ip, request.authentication!.account.id);
    const input = changePasswordSchema.parse(request.body);
    return respond(reply, await service.changePassword(request.sessionToken, input.currentPassword, input.newPassword));
  });
  app.patch('/api/v1/auth/locale', { config: { allowPasswordChange: true } }, async (request, reply) => {
    await service.setLocale(request.sessionToken, localeSchema.parse(request.body).locale);
    return reply.code(204).send();
  });
  app.post('/api/v1/auth/accounts/:id/reset-password', async (request) => {
    if (request.authentication!.account.kind !== 'SYSTEM') throw new SafeError('FORBIDDEN', 'auth.forbidden', false, 403);
    await service.rateLimit(request.ip, request.authentication!.account.id);
    const id = z.object({ id: z.uuid() }).parse(request.params).id;
    const { operatorPassword } = resetPasswordSchema.parse(request.body);
    return { data: { temporaryPassword: await service.resetPassword(request.sessionToken, id, operatorPassword) } };
  });
}
