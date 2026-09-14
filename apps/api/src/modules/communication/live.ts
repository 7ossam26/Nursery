import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SafeError } from '../../errors.js';

// No resource JSON or identifiers on the wire. Each tick reconstructs current policy.
export function installParentLive(app: FastifyInstance) {
  const active=new Map<string,number>(); const closers=new Set<() => void>();
  app.addHook('preClose',async () => { for (const close of [...closers]) close(); });
  app.get('/api/v1/parent/live',async (request,reply) => {
    const { childId }=z.object({ childId: z.uuid().optional() }).strict().parse(request.query);
    const accountId=request.authentication!.account.id;
    if ((active.get(accountId) ?? 0)>=3) throw new SafeError('RATE_LIMITED','auth.rateLimited',true,429);
    const initial=await app.communication.liveSnapshot(request.sessionToken,childId);
    if (reply.raw.destroyed) { reply.hijack(); return reply; }
    if ((active.get(accountId) ?? 0)>=3) throw new SafeError('RATE_LIMITED','auth.rateLimited',true,429);
    active.set(accountId,(active.get(accountId) ?? 0)+1);
    reply.header('Content-Type','text/event-stream').header('X-Accel-Buffering','no').header('Connection','keep-alive');
    // Preserve the global security/no-store headers when taking ownership of the stream.
    for (const [key,value] of Object.entries(reply.getHeaders())) if (value!==undefined) reply.raw.setHeader(key,typeof value==='number' ? String(value) : value);
    reply.raw.writeHead(200); reply.hijack();
    let ended=false; let pending=false; let current=initial; let beats=0;
    const send=(event: string) => { if (!ended) reply.raw.write(`event: ${event}\ndata: {}\n\n`); };
    const close=() => {
      if (ended) return; ended=true; clearInterval(timer); clearTimeout(lifetime);
      active.set(accountId,Math.max(0,(active.get(accountId) ?? 1)-1)); if (!active.get(accountId)) active.delete(accountId);
      closers.delete(close); reply.raw.end();
    };
    const timer=setInterval(() => {
      if (pending || ended) return; pending=true;
      void app.communication.liveSnapshot(request.sessionToken,childId).then((next) => {
        if (ended) return;
        if (next.access!==current.access) { send('revoked'); close(); return; }
        if (next.change!==current.change) send('invalidate');
        current=next; if (++beats%10===0) reply.raw.write(': heartbeat\n\n');
      }).catch(() => { send('revoked'); close(); }).finally(() => { pending=false; });
    },1000);
    const lifetime=setTimeout(() => { send('reconnect'); close(); },15*60_000);
    closers.add(close); reply.raw.on('close',close); send('snapshot');
  });
}
