import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR', 'NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'DATABASE_UNAVAILABLE', 'INTERNAL_ERROR',
  'IDEMPOTENCY_CONFLICT', 'STALE_VERSION', 'INVALID_CREDENTIALS', 'SESSION_EXPIRED', 'ACCOUNT_BLOCKED',
  'ACCOUNT_DISABLED', 'PASSWORD_CHANGE_REQUIRED', 'CSRF_REJECTED', 'RATE_LIMITED', 'BOOTSTRAP_COMPLETE'
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  messageKey: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string(),
  retryable: z.boolean(),
  publicMessage: z.string().max(500).optional()
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({ status: z.literal('ok'), requestId: z.string() });
export const readinessSchema = z.object({ status: z.enum(['ready', 'not_ready']), requestId: z.string() });
export type ActorContext = Readonly<{ actorId: string; installationId: string; capabilities: readonly string[] }>;

// NFKC, outer whitespace removal, then locale-independent lowercase. Internal whitespace is rejected.
export const normalizeUsername = (value: string): string => value.normalize('NFKC').trim().toLowerCase();
export const usernameSchema = z.string().max(256).transform(normalizeUsername).pipe(z.string().min(3).max(64).regex(/^[\p{L}\p{N}._-]+$/u));
export const passwordSchema = z.string().min(15).max(128);
export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict();
export const resetPasswordSchema = z.object({ operatorPassword: z.string().min(1).max(128) }).strict();
export const localeSchema = z.object({ locale: z.enum(['en', 'ar-EG']) }).strict();
export const currentAccountSchema = z.object({
  id: z.uuid(), username: z.string(), kind: z.enum(['SYSTEM', 'STAFF', 'GUARDIAN']),
  locale: z.enum(['en', 'ar-EG']), mustChangePassword: z.boolean(),
  capabilities: z.array(z.string()), policyReady: z.literal(false)
});
export type CurrentAccount = z.infer<typeof currentAccountSchema>;
export const authResponseSchema = z.object({ data: z.object({ account: currentAccountSchema, csrfToken: z.string(), expiresAt: z.iso.datetime(), idleExpiresAt: z.iso.datetime() }) });
export type AuthResponse = z.infer<typeof authResponseSchema>;
