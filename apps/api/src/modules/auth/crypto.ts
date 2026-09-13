import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const randomToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const keyedHash = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('base64url');
export const equalSecret = (a: string, b: string): boolean => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
// Same work for an unknown account; no username or password is written to audit/logs.
const dummyHash = `scrypt$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export async function verifyPassword(password: string, encoded = dummyHash): Promise<boolean> {
  const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  const salt = match?.[1] ?? '0'.repeat(32);
  const actual = await derive(password, salt);
  return !!match && timingSafeEqual(actual, Buffer.from(match[2], 'hex'));
}
