import { useRef,useState } from 'react';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';
import { errorKey } from '../children/scoped.js';

// Same FinancialCore protocol used by collections: a frozen actor-scoped request, then
// status lookup before offering the identical retry. Nothing is queued or persisted.
export function useFinancialOperation(onSaved:(result?:unknown)=>void) {
 const auth=useAuth(),callback=useRef(onSaved);callback.current=onSaved;
 const pending=useRef<{path:string;body:{operationId:string}&Record<string,unknown>}|null>(null);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[canRetry,setCanRetry]=useState(false),[message,setMessage]=useState<MessageKey|null>(null);
 function saved(result?:unknown) {pending.current=null;setUncertain(false);setCanRetry(false);setMessage('spending.saved');callback.current(result);}
 async function send() {
  if(!pending.current) return;setBusy(true);setMessage(null);
  try {const result=await auth.client.business(pending.current.path,'POST',pending.current.body);saved(result);}
  catch(error) {auth.handleError(error);if(!(error instanceof AuthError)||['INTERNAL_ERROR','DATABASE_UNAVAILABLE'].includes(error.detail.code)) {setUncertain(true);setCanRetry(false);setMessage('finance.uncertain');}else {pending.current=null;setUncertain(false);setCanRetry(false);setMessage(errorKey(error));callback.current();}}
  finally {setBusy(false);}
 }
 function submit(path:string,input:Record<string,unknown>) {
  if(pending.current||busy) return;pending.current={path,body:{...input,operationId:crypto.randomUUID()}};void send();
 }
 async function check() {
  if(!pending.current||busy) return;setBusy(true);
  try {const status=await auth.client.business<{status:'COMMITTED'|'NOT_FOUND';result?:unknown}>(`finance/operations/${pending.current.body.operationId}`);if(status.status==='COMMITTED') saved(status.result);else {setCanRetry(true);setMessage('finance.notFound');}}
  catch(error) {auth.handleError(error);setMessage(errorKey(error));}finally {setBusy(false);}
 }
 return {busy,uncertain,canRetry,message,locked:busy||uncertain,submit,check,retry:()=>{if(canRetry&&!busy) void send();},invalid:()=>setMessage('finance.invalid')};
}
