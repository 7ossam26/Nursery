import { createHash } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';

// Minimal POSIX ustar writer/reader for the recovery set. Entry names are short fixed layouts
// (`files/<namespace>/<uuid>.blob`, `database.dump`, `manifest.json`), so no long-name extensions are needed.
const BLOCK = 512;
function octal(value: number, length: number): string { return value.toString(8).padStart(length - 1, '0') + '\0'; }
export function tarHeader(name: string, size: number, mtime = Math.floor(Date.now() / 1000)): Buffer {
  if (Buffer.byteLength(name) > 100 || name.includes('\0')) throw new Error('tar entry name too long');
  if (!Number.isSafeInteger(size) || size < 0 || size >= 8 ** 11) throw new Error('tar entry size out of range');
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100, 'utf8'); header.write(octal(0o644, 8), 100); header.write(octal(0, 8), 108); header.write(octal(0, 8), 116);
  header.write(octal(size, 12), 124); header.write(octal(mtime, 12), 136); header.write('        ', 148); header.write('0', 156);
  header.write('ustar\0', 257); header.write('00', 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  return header;
}
export function parseTarHeader(header: Buffer): { name: string; size: number } | null {
  if (header.length !== BLOCK || header.every((byte) => byte === 0)) return null;
  const stored = parseInt(header.toString('ascii', 148, 156).replace(/\0.*$/, '').trim(), 8);
  let sum = 0; for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
  if (stored !== sum) throw new Error('tar header checksum mismatch');
  const name = header.toString('utf8', 0, 100).replace(/\0.*$/, ''); const size = parseInt(header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim(), 8);
  if (!name || !Number.isSafeInteger(size)) throw new Error('tar header invalid');
  return { name, size };
}
export function padding(size: number): Buffer { return Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK); }
export const TAR_END = Buffer.alloc(BLOCK * 2);

const write = (target: Writable, chunk: Buffer) => new Promise<void>((resolve, reject) => { target.write(chunk, (error) => (error ? reject(error) : resolve())); });
// Streams one entry from a byte source of known size and returns its SHA-256.
export async function writeTarEntry(target: Writable, name: string, size: number, source: Readable | Buffer): Promise<string> {
  await write(target, tarHeader(name, size));
  const hash = createHash('sha256'); let written = 0;
  if (Buffer.isBuffer(source)) { hash.update(source); written = source.length; await write(target, source); }
  else for await (const chunk of source) { const bytes = chunk as Buffer; hash.update(bytes); written += bytes.length; await write(target, bytes); }
  if (written !== size) throw new Error(`tar entry ${name} changed size while it was read`);
  await write(target, padding(size));
  return hash.digest('hex');
}
export async function finishTar(target: Writable): Promise<void> { await write(target, TAR_END); }

// Reads entries sequentially from a byte stream; the consumer must drain `body` before the next entry is yielded.
export async function* readTar(source: AsyncIterable<Buffer>): AsyncGenerator<{ name: string; size: number; body: AsyncGenerator<Buffer> }> {
  const iterator = source[Symbol.asyncIterator](); let buffer = Buffer.alloc(0); let done = false;
  async function fill(minimum: number) {
    while (buffer.length < minimum && !done) { const next = await iterator.next(); if (next.done) done = true; else buffer = Buffer.concat([buffer, next.value]); }
    if (buffer.length < minimum) throw new Error('tar stream ended unexpectedly');
  }
  async function take(count: number): Promise<Buffer> { await fill(count); const out = buffer.subarray(0, count); buffer = buffer.subarray(count); return out; }
  for (;;) {
    const header = parseTarHeader(await take(BLOCK));
    // Drain trailing blocks so an authenticated source (AES-GCM) reaches its tag check before we finish.
    if (!header) { while (!done) done = (await iterator.next()).done ?? false; return; }
    let remaining = header.size; let consumed = false;
    const body = (async function* () { while (remaining > 0) { const chunk = await take(Math.min(remaining, 1 << 20)); remaining -= chunk.length; yield Buffer.from(chunk); } consumed = true; })();
    yield { name: header.name, size: header.size, body };
    if (!consumed) { for await (const _ of body) void _; }
    await take(padding(header.size).length);
  }
}
