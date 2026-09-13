import { describe, expect, it } from 'vitest';
import { usernameSchema, loginSchema, passwordSchema } from './index.js';

describe('identity boundary contracts', () => {
  it('normalizes Unicode/case/outer whitespace deterministically without internal whitespace', () => {
    expect(usernameSchema.parse('  ＡＬＩ.أحمد  ')).toBe('ali.أحمد');
    for (const value of ['a b', 'ab', 'user@example', '../user', 'a'.repeat(65)]) expect(usernameSchema.safeParse(value).success).toBe(false);
  });
  it('preserves password spaces and rejects mass-assigned privileges', () => {
    const password = '  a private long phrase  ';
    expect(passwordSchema.parse(password)).toBe(password);
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
    expect(loginSchema.safeParse({ username: 'ali', password, kind: 'SYSTEM' }).success).toBe(false);
  });
});
