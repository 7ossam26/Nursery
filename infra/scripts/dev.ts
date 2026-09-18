import { spawn, type ChildProcess } from 'node:child_process';

// `npm run dev --workspaces` runs each workspace in sequence, so the first watcher blocks the rest.
// This launches the api, web and worker dev servers in parallel with a prefixed, line-buffered log and stops all of them together.
const workspaces = [
  { name: 'api', pkg: '@nursery/api' },
  { name: 'web', pkg: '@nursery/web' },
  { name: 'worker', pkg: '@nursery/worker' }
];
const width = Math.max(...workspaces.map((w) => w.name.length));
const children: ChildProcess[] = [];
let stopping = false;

function forward(name: string, stream: NodeJS.ReadableStream | null, target: NodeJS.WriteStream) {
  if (!stream) return;
  let rest = '';
  stream.on('data', (chunk: Buffer) => {
    const lines = (rest + chunk.toString()).split(/\r?\n/);
    rest = lines.pop() ?? '';
    for (const line of lines) target.write(`[${name.padEnd(width)}] ${line}\n`);
  });
  stream.on('end', () => { if (rest) target.write(`[${name.padEnd(width)}] ${rest}\n`); });
}

function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  setTimeout(() => process.exit(code), 500).unref();
}

for (const { name, pkg } of workspaces) {
  // A shell is required on Windows because `npm` is a .cmd shim; the command is a fixed constant, never user input.
  const child = spawn(`npm run dev -w ${pkg}`, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  forward(name, child.stdout, process.stdout);
  forward(name, child.stderr, process.stderr);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    process.stderr.write(`[${name.padEnd(width)}] exited (${signal ?? code}); stopping the others.\n`);
    stopAll(code ?? 1);
  });
  children.push(child);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stopAll(0));
