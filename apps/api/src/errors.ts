import type { ErrorCode } from '@nursery/contracts';

export class SafeError extends Error {
  constructor(readonly code: ErrorCode, readonly messageKey: string, readonly retryable = false, readonly statusCode = 500, readonly publicMessage?: string) { super(messageKey); }
}
