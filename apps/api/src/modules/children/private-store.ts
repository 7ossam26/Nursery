import { createHash } from 'node:crypto';
import { mkdir,lstat,open,readFile,realpath,unlink } from 'node:fs/promises';
import { isAbsolute,relative,resolve } from 'node:path';
import { z } from 'zod';
import { MAX_DOCUMENT_BYTES } from '@nursery/contracts';

export const documentHash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
// Namespace is infrastructure supplied by the service, never a request path or filename.
export class PrivateDocumentStore {
 constructor(readonly configuredRoot:string,readonly namespace:'child-documents'|'expense-documents') {}
 async root() {
  const path=resolve(this.configuredRoot,this.namespace),web=resolve('apps/web');const rel=relative(web,path);
  if(!rel.startsWith('..')&&!isAbsolute(rel)) throw new Error('Private storage cannot be inside the web application');
  await mkdir(path,{recursive:true,mode:0o700});if((await lstat(path)).isSymbolicLink()) throw new Error('Private storage cannot be a symlink');
  const actual=await realpath(path),actualRel=relative(web,actual);if(!actualRel.startsWith('..')&&!isAbsolute(actualRel)) throw new Error('Private storage resolves inside the web application');return actual;
 }
 async write(key:string,bytes:Buffer) {
  const path=resolve(await this.root(),`${z.uuid().parse(key)}.blob`),handle=await open(path,'wx',0o600);
  try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}return path;
 }
 async read(key:string,sha256:string) {
  const path=resolve(await this.root(),`${z.uuid().parse(key)}.blob`),stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_DOCUMENT_BYTES) throw new Error('Invalid private file');
  const bytes=await readFile(path);if(documentHash(bytes)!==sha256) throw new Error('Private file integrity failure');return bytes;
 }
 async remove(key:string) {await unlink(resolve(await this.root(),`${z.uuid().parse(key)}.blob`));}
}
