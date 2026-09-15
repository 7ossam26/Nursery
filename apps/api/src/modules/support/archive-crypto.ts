import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Transform } from 'node:stream';

// Recovery sets are AES-256-GCM: magic, 12-byte IV, ciphertext, 16-byte tag. The tag authenticates the whole
// archive, so a truncated or edited file fails to open instead of restoring silently corrupted data.
export const ARCHIVE_MAGIC = Buffer.from('NBK1');
const IV_BYTES = 12, TAG_BYTES = 16;
export function parseKey(hex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Backup encryption key must be 64 hexadecimal characters');
  return Buffer.from(hex, 'hex');
}
export function encryptingStream(key: Buffer): Transform {
  const iv = randomBytes(IV_BYTES); const cipher = createCipheriv('aes-256-gcm', key, iv); let started = false;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const parts: Buffer[] = []; if (!started) { started = true; parts.push(ARCHIVE_MAGIC, iv); }
      parts.push(cipher.update(chunk)); callback(null, Buffer.concat(parts));
    },
    flush(callback) {
      const parts: Buffer[] = []; if (!started) { started = true; parts.push(ARCHIVE_MAGIC, iv); }
      parts.push(cipher.final(), cipher.getAuthTag()); callback(null, Buffer.concat(parts));
    }
  });
}
// Yields plaintext chunks; throws before yielding anything if the header is wrong and at the end if the tag fails.
export async function* decryptFile(path: string, key: Buffer): AsyncGenerator<Buffer> {
  const size = (await stat(path)).size; const headerBytes = ARCHIVE_MAGIC.length + IV_BYTES;
  if (size < headerBytes + TAG_BYTES) throw new Error('Archive is too short to be a recovery set');
  const handle = await open(path, 'r');
  let header: Buffer, tag: Buffer;
  try {
    header = Buffer.alloc(headerBytes); await handle.read(header, 0, headerBytes, 0);
    tag = Buffer.alloc(TAG_BYTES); await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally { await handle.close(); }
  if (!header.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC)) throw new Error('Archive header is not a recovery set');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(ARCHIVE_MAGIC.length)); decipher.setAuthTag(tag);
  for await (const chunk of createReadStream(path, { start: headerBytes, end: size - TAG_BYTES - 1 })) { const plain = decipher.update(chunk as Buffer); if (plain.length) yield plain; }
  const last = decipher.final(); if (last.length) yield last;
}
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
