import { z } from 'zod';

// NFKC, outer whitespace removal, then locale-independent lowercase. Internal whitespace is rejected.
export const normalizeUsername = (value: string): string => value.normalize('NFKC').trim().toLowerCase();
export const usernameSchema = z.string().max(256).transform(normalizeUsername).pipe(z.string().min(3).max(64).regex(/^[\p{L}\p{N}._-]+$/u));
export const passwordSchema = z.string().min(15).max(128);
