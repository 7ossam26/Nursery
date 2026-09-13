import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR', 'NOT_FOUND', 'UNAUTHORIZED', 'FORBIDDEN', 'DATABASE_UNAVAILABLE', 'INTERNAL_ERROR',
  'IDEMPOTENCY_CONFLICT', 'STALE_VERSION'
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  messageKey: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string(),
  retryable: z.boolean()
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({ status: z.literal('ok'), requestId: z.string() });
export const readinessSchema = z.object({ status: z.enum(['ready', 'not_ready']), requestId: z.string() });
export type ActorContext = Readonly<{ actorId: string; installationId: string; capabilities: readonly string[] }>;
