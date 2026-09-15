import { randomUUID } from 'node:crypto';
import { lstat,readdir,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, PDFArray, type PDFObject } from 'pdf-lib';
import { documentInputSchema, MAX_DOCUMENT_BYTES } from '@nursery/contracts';
import { z } from 'zod';
import type { ChildService } from './service.js';
import { requireChild, resolveChild } from './policy.js';
import { denied, requireCapability } from '../organization/policy.js';
import { SafeError } from '../../errors.js';
import { PrivateDocumentStore,FILE_LOCK,documentHash as hash } from './private-store.js';

const invalid = () => new SafeError('VALIDATION_ERROR','children.invalidDocument',false,400);
export async function validateDocument(bytes: Buffer,mimeType: 'application/pdf' | 'image/png' | 'image/jpeg'): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw invalid();
  try {
    if (mimeType === 'application/pdf') {
      if (!bytes.subarray(0,8).toString('ascii').match(/^%PDF-1\.[0-7]/) || !bytes.subarray(-1024).toString('ascii').includes('%%EOF')) throw invalid();
      const pdf = await PDFDocument.load(bytes,{ ignoreEncryption: false,throwOnInvalidObject: true,updateMetadata: false });
      if (!pdf.getPageCount() || pdf.getPageCount() > 100) throw invalid();
      const forbidden = new Set(['A','AA','OpenAction','JS','JavaScript','Launch','EmbeddedFiles','Filespec','RichMedia','XFA','AcroForm','SubmitForm','ImportData','GoToR','URI']);
      const visited = new Set<PDFObject>();
      function inspect(object: PDFObject,depth = 0) {
        if (visited.has(object)) return; visited.add(object);
        if (depth>100 || visited.size>100000) throw invalid();
        if (object instanceof PDFArray) { for (const item of object.asArray()) inspect(item,depth+1); return; }
        const dict = object instanceof PDFDict ? object : object instanceof PDFRawStream ? object.dict : null;
        if (!dict) return;
        for (const [key,value] of dict.entries()) {
          if (forbidden.has(key.decodeText()) || (value instanceof PDFName && forbidden.has(value.decodeText()))) throw invalid();
          inspect(value,depth+1);
        }
      }
      for (const [,object] of pdf.context.enumerateIndirectObjects()) inspect(object);
      // Serialize parsed objects; no filename, public path, or browser inline preview is accepted.
      const output = Buffer.from(await pdf.save()); if (output.length > MAX_DOCUMENT_BYTES) throw invalid(); return output;
    }
    const image = sharp(bytes,{ failOn: 'warning',limitInputPixels: 16_000_000,animated: false }); const meta = await image.metadata();
    if (meta.format !== (mimeType === 'image/png' ? 'png' : 'jpeg') || (meta.pages ?? 1) !== 1) throw invalid();
    // Fully decode/re-encode to validate content and strip metadata/trailing payloads.
    const output = await (mimeType === 'image/png' ? image.png() : image.jpeg()).toBuffer();
    if (output.length > MAX_DOCUMENT_BYTES) throw invalid(); return output;
  } catch { throw invalid(); }
}

export class ChildDocumentService {
  readonly store:PrivateDocumentStore;
  constructor(readonly children: ChildService,configuredRoot: string) {this.store=new PrivateDocumentStore(configuredRoot,'child-documents');}
  async upload(token: string,childId: string,raw: unknown) {
    z.uuid().parse(childId); const input = documentInputSchema.parse(raw); const key = randomUUID(); let path: string | undefined;
    try {
      return await this.children.withPolicy(token,async (tx,p) => {
        const child = await resolveChild(tx,childId,true); requireChild(p,'documents.manage',child);
        await tx.query('select pg_advisory_xact_lock_shared($1)',[FILE_LOCK]);
        const bytes = await validateDocument(Buffer.from(input.contentBase64,'base64'),input.mimeType);
        path=await this.store.write(key,bytes);
        const id = randomUUID();
        await tx.query('insert into child_documents(id,child_id,branch_id,name,expires_on,storage_key,mime_type,byte_size,sha256,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,childId,child.branchId,input.name,input.expiresOn,key,input.mimeType,bytes.length,hash(bytes),p.account.id]);
        await this.children.audit(tx,p,child,'document.uploaded',null,{ id,name: input.name,expiresOn: input.expiresOn,mimeType: input.mimeType,byteSize: bytes.length });
        return { id,name: input.name,expiresOn: input.expiresOn,mimeType: input.mimeType,byteSize: bytes.length };
      });
    } catch (error) {
      if (path) {
        // A lost commit acknowledgement must not remove a referenced file. If DB is unavailable,
        // leave the private candidate for the conservative janitor instead of guessing the outcome.
        try {
          const referenced = await this.children.licensing.auth.database.pool.query('select 1 from child_documents where storage_key=$1',[key]);
          if (!referenced.rowCount) await unlink(path);
        } catch { /* The authorized cleanup action will reconcile abandoned private files. */ }
      }
      throw error;
    }
  }
  async download(token: string,id: string) {
    z.uuid().parse(id);
    return this.children.withPolicy(token,async (tx,p) => {
      // Resolve ownership first, lock its child, then re-read the document under its lock.
      const owner = (await tx.query<{ child_id: string }>('select child_id from child_documents where id=$1',[id])).rows[0]; if (!owner) throw denied();
      const child = await resolveChild(tx,owner.child_id); requireChild(p,'documents.manage',child);
      const doc = (await tx.query<{ storage_key: string; mime_type: string; sha256: string; retired: boolean }>('select storage_key,mime_type,sha256,retired from child_documents where id=$1 for share',[id])).rows[0];
      if (!doc || doc.retired) throw denied();
      await tx.query('select pg_advisory_xact_lock_shared($1)',[FILE_LOCK]);
      const bytes=await this.store.read(doc.storage_key,doc.sha256);
      await this.children.audit(tx,p,child,'document.downloaded',null,{ id });
      return { bytes,mimeType: doc.mime_type,filename: `${id}.${doc.mime_type === 'application/pdf' ? 'pdf' : doc.mime_type === 'image/png' ? 'png' : 'jpg'}` };
    });
  }
  async retire(token: string,id: string) {
    z.uuid().parse(id);
    return this.children.withPolicy(token,async (tx,p) => {
      const owner = (await tx.query<{ child_id: string }>('select child_id from child_documents where id=$1',[id])).rows[0]; if (!owner) throw denied();
      const child = await resolveChild(tx,owner.child_id,true); requireChild(p,'documents.manage',child);
      const doc = (await tx.query('select * from child_documents where id=$1 for update',[id])).rows[0]; if (!doc || doc.retired) throw denied();
      await tx.query('update child_documents set retired=true where id=$1',[id]);
      await this.children.audit(tx,p,child,'document.retired',{ id,name: doc.name },null);
      // Referenced historical bytes are retained; retirement is not destructive deletion.
    });
  }
  async cleanup(token: string) {
    return this.children.withPolicy(token,async (tx,p) => {
      requireCapability(p,'support.access'); await tx.query('select pg_advisory_xact_lock($1)',[FILE_LOCK]);
      const root = await this.store.root(); const referenced = new Set((await tx.query<{ storage_key: string }>('select storage_key from child_documents')).rows.map((r) => r.storage_key)); let removed = 0;
      for (const entry of await readdir(root,{ withFileTypes: true })) {
        if (!entry.isFile() || !/^[0-9a-f-]{36}\.blob$/.test(entry.name)) continue;
        const key = entry.name.slice(0,-5); if (!z.uuid().safeParse(key).success || referenced.has(key)) continue;
        const path = resolve(root,entry.name); const stat = await lstat(path);
        if (!stat.isSymbolicLink() && stat.isFile() && stat.mtimeMs < Date.now()-24*60*60_000) { await unlink(path); removed++; }
      }
      await this.children.audit(tx,p,null,'documents.abandoned_cleanup',null,{ removed }); return { removed };
    });
  }
}
