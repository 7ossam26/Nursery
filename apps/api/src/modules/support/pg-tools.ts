import { spawn } from 'node:child_process';
import { join } from 'node:path';

// Connection secrets travel through the environment, never through process arguments or log lines.
export function connectionArguments(databaseUrl: string): { args: string[]; env: Record<string, string>; database: string; searchPath: string | null } {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL must name a database');
  const args = ['--host', url.hostname, '--port', url.port || '5432', '--dbname', database];
  const env: Record<string, string> = {};
  if (url.username) { args.push('--username', decodeURIComponent(url.username)); args.push('--no-password'); }
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get('sslmode'); if (sslmode) env.PGSSLMODE = sslmode;
  const options = url.searchParams.get('options'); const searchPath = options ? /search_path=([^\s]+)/.exec(options)?.[1] ?? null : null;
  return { args, env, database, searchPath };
}
export function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[redacted-url]').replace(/(PGPASSWORD|password)=\S+/gi, '$1=[redacted]').slice(0, 2000);
}
export function toolPath(tool: 'pg_dump' | 'pg_restore' | 'psql', environment: NodeJS.ProcessEnv = process.env): string {
  const directory = environment.PG_BIN_DIR; return directory ? join(directory, tool) : tool;
}
export class ToolError extends Error {
  constructor(readonly tool: string, readonly exitCode: number | null, readonly stderr: string) { super(`${tool} failed (exit ${exitCode ?? 'signal'})`); }
}
// Runs a PostgreSQL client tool to completion. stderr is collected (redacted) for diagnostics and never echoed to clients.
export function runTool(tool: 'pg_dump' | 'pg_restore' | 'psql', args: string[], env: Record<string, string>, environment: NodeJS.ProcessEnv = process.env): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(toolPath(tool, environment), args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...environment, ...env, PGCONNECT_TIMEOUT: environment.PGCONNECT_TIMEOUT ?? '15' } });
    let stderr = ''; child.stderr.on('data', (chunk) => { if (stderr.length < 64_000) stderr += String(chunk); });
    child.on('error', (error) => reject(new ToolError(tool, null, redact(`${error.message}\n${stderr}`))));
    child.on('close', (code) => (code === 0 ? resolve({ stderr: redact(stderr) }) : reject(new ToolError(tool, code, redact(stderr)))));
  });
}
