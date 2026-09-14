import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate } from '@nursery/domain';
import {
 IMPORT_LIMITS,importCommitSchema,importKindSchema,importListQuerySchema,importTemplates,importUploadSchema,mobileSchema,usernameSchema,parseEgpToPiastres,parseImportBoolean,parseImportDate,parseImportMonth,defaultLinkPermissions,
 type Child,type ImportBatch,type ImportBatchSummary,type ImportCommitResult,type ImportKind,type ImportOptions,type ImportPreview,type ImportRowError,type OnboardingInput
} from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import { denied,loadPolicy,requireCapability,type Policy } from '../organization/policy.js';
import type { OrganizationService } from '../organization/service.js';
import type { LicensingService } from '../licensing/service.js';
import { GUARDIAN_SCOPE_LOCK,requireChild,resolveChild } from '../children/policy.js';
import type { FinancialCore,FinanceResource } from '../finance/core.js';
import type { LedgerService } from '../finance/ledger.js';
import type { PayrollService } from '../finance/payroll.js';
import { parseImportWorkbook,type StagedCell,type StagedRow,type StagedWorkbook } from './parse.js';
import { renderImportTemplate,templateFileName,type ReferenceData } from './templates.js';

type BatchRow={id:string;creator_id:string;kind:ImportKind;template_version:number;file_name:string;sha256:string;status:'PREVIEWED'|'COMMITTED';staged:StagedWorkbook['sheets'];row_count:number;preview:ImportPreview|null;preview_hash:string|null;created_at:string;expires_at:string;committed_at:string|null;operation_id:string|null;result:ImportCommitResult|null};
type Family={key:string;guardians:{key:string;username:string;fullName:string;mobile:string}[];children:{code:string;fullName:string;birthDate:string;branchId:string;classroomId:string|null;contacts:OnboardingInput['children'][number]['child']['contacts'];links:{guardianIndex:number;relationship:string;permissions:typeof defaultLinkPermissions}[]}[]};
type Plan={families:Family[];obligations:{row:number;childId:string;categoryId:string;amount:string;description:string;issuedOn:string;dueOn:string}[];employees:{row:number;employeeCode:string;fullName:string;basicSalary:string;effectiveMonth:string;payingBranchId:string;payingAccountId:string;loginUsername:string|null;roleId:string|null;branchIds:string[]}[];resources:FinanceResource[]};
type Validation={preview:ImportPreview;hash:string;plan:Plan};
type StagedChild=Family['children'][number]&{row:number;branchCode:string;classroomCode:string|null;linkKeys:string[]};
const codeSchema=z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/);
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
// Deterministic per-row/per-family sub-operation IDs keep every reused domain service idempotent under the one batch operation.
export function derivedOperationId(operationId:string,label:string) {
 const h=createHash('sha256').update(`${operationId}/${label}`).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-${(8+(parseInt(h[16],16)&3)).toString(16)}${h.slice(17,20)}-${h.slice(20,32)}`;
}
const text=(v:StagedCell)=>v===null?null:typeof v==='string'?v:typeof v==='number'?String(v):v?'Y':'N';

export class ImportService {
 constructor(readonly core:FinancialCore,readonly ledger:LedgerService,readonly payroll:PayrollService,readonly organization:OrganizationService,readonly licensing:LicensingService) {}
 // Same global lock order as onboarding/licensing: license, policy (exclusive when a commit may assign staff scope), guardian links, accounts.
 private async withPolicy<T>(token:string,work:(tx:Transaction,p:Policy)=>Promise<T>,exclusivePolicy=false):Promise<T> {
  try {
   return await this.licensing.auth.database.transaction(async tx=>{
    await tx.query('select pg_advisory_xact_lock_shared(7190501)');
    await tx.query(exclusivePolicy?'select pg_advisory_xact_lock(7190401)':'select pg_advisory_xact_lock_shared(7190401)');
    await tx.query('select pg_advisory_xact_lock_shared($1)',[GUARDIAN_SCOPE_LOCK]);
    const account=await this.licensing.auth.inTransaction(tx,token);
    return work(tx,await loadPolicy(tx,account));
   });
  } catch(error) {
   if(['23505','23503','23514'].includes((error as {code?:string}).code??'')) throw new SafeError('VALIDATION_ERROR','imports.conflict',false,409);
   throw error;
  }
 }
 private async modules(tx:Transaction) {
  return Object.fromEntries((await tx.query<{module_key:string;enabled:boolean}>("select module_key,enabled from module_settings where module_key in ('FINANCE','PAYROLL')")).rows.map(r=>[r.module_key,r.enabled])) as Record<string,boolean|undefined>;
 }
 // A kind is available only with every capability its interactive counterpart requires plus its module dependencies.
 private async kindState(tx:Transaction,p:Policy):Promise<Record<ImportKind,boolean>> {
  const has=(...keys:string[])=>keys.every(k=>p.account.capabilities.includes(k));const m=await this.modules(tx);
  const branchMode=p.account.kind==='SYSTEM'||p.scope.mode==='BRANCH';
  return {PARENTS_CHILDREN:has('children.manage','guardians.manage','users.create_parent'),OPENING_BALANCES:Boolean(m.FINANCE)&&has('billing.manage'),EMPLOYEES:Boolean(m.FINANCE&&m.PAYROLL)&&has('payroll.manage','finance.read')&&branchMode};
 }
 private requireKind(states:Record<ImportKind,boolean>,kind:ImportKind) {if(!states[kind]) throw denied();}
 private summary(r:BatchRow):ImportBatchSummary {
  const expired=r.status==='PREVIEWED'&&new Date(r.expires_at).getTime()<=Date.now();
  return {id:r.id,kind:r.kind,templateVersion:r.template_version,fileName:r.file_name,status:expired?'EXPIRED':r.status,rowCount:r.row_count,createdAt:new Date(r.created_at).toISOString(),expiresAt:new Date(r.expires_at).toISOString(),committedAt:r.committed_at?new Date(r.committed_at).toISOString():null};
 }
 async options(token:string):Promise<ImportOptions> {
  return this.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'imports.commit');const states=await this.kindState(tx,p);
   const recent=(await tx.query<BatchRow>('select * from import_batches where creator_id=$1 order by created_at desc,id limit $2',[p.account.id,importListQuerySchema.parse({}).limit])).rows.map(r=>this.summary(r));
   return {kinds:(Object.keys(importTemplates) as ImportKind[]).map(kind=>({kind,templateVersion:importTemplates[kind].version,enabled:states[kind],sheets:importTemplates[kind].sheets})),limits:IMPORT_LIMITS,recent};
  });
 }
 private async reference(tx:Transaction,p:Policy,kind:ImportKind):Promise<ReferenceData> {
  const system=p.account.kind==='SYSTEM',branchMode=system||p.scope.mode==='BRANCH';
  const branches=(await tx.query<{code:string;name:string}>('select code,name from branches where ($1::boolean or id=any($2::uuid[])) order by code',[system,p.scope.branchIds])).rows;
  const classrooms=kind==='PARENTS_CHILDREN'?(await tx.query<{branchCode:string;code:string;name:string}>('select b.code as "branchCode",c.code,c.name from classrooms c join branches b on b.id=c.branch_id where ($1::boolean or c.branch_id=any($2::uuid[])) and ($3::boolean or c.id=any($4::uuid[])) order by b.code,c.code',[system,p.scope.branchIds,branchMode,p.scope.classroomIds])).rows:[];
  const categories=kind==='OPENING_BALANCES'?(await tx.query<{code:string;name:string;kind:string}>('select code,name,kind from fee_categories order by code limit 100')).rows:[];
  const accounts=kind==='EMPLOYEES'?(await tx.query<{code:string;branchCode:string;name:string;type:string}>('select a.code,b.code as "branchCode",a.name,a.type from treasury_accounts a join branches b on b.id=a.branch_id where ($1::boolean or a.branch_id=any($2::uuid[])) order by a.code',[system,p.scope.branchIds])).rows:[];
  // Only SYSTEM initially scopes unassigned staff (ORGANIZATION_AND_POLICY); other actors get no assignable-role list.
  const roles=kind==='EMPLOYEES'&&system&&p.account.capabilities.includes('users.assign_roles')?(await this.organization.assignable(tx,p)).map(r=>({name:r.name})):[];
  return {branches,classrooms,categories,accounts,roles};
 }
 async template(token:string,rawKind:unknown) {
  const kind=importKindSchema.parse(rawKind);
  return this.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'imports.commit');this.requireKind(await this.kindState(tx,p),kind);
   const brand=(await tx.query<{name:string;accent:string}>("select name,theme->>'strongPinkButton' accent from nursery_settings where singleton")).rows[0]??{name:'Nursery',accent:'#BE185D'};
   return {bytes:await renderImportTemplate(kind,await this.reference(tx,p,kind),{name:brand.name,accent:/^#[0-9a-f]{6}$/i.test(brand.accent??'')?brand.accent:'#BE185D'}),filename:templateFileName(kind),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  });
 }
 async upload(token:string,raw:unknown):Promise<ImportBatch> {
  const input=importUploadSchema.parse(raw);const bytes=Buffer.from(input.contentBase64,'base64');
  if(!bytes.length||bytes.length>IMPORT_LIMITS.maxFileBytes) throw new SafeError('VALIDATION_ERROR','imports.tooLarge',false,413);
  return this.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'imports.commit');this.requireKind(await this.kindState(tx,p),input.kind);
   const parsed=await parseImportWorkbook(input.kind,bytes);
   const id=randomUUID(),validation=await this.validate(tx,p,input.kind,parsed.sheets,parsed.errors,id);
   const rowCount=Object.values(parsed.sheets).reduce((n,rows)=>n+rows.length,0);
   const row=(await tx.query<BatchRow>(`insert into import_batches(id,creator_id,kind,template_version,file_name,sha256,status,staged,row_count,preview,preview_hash,expires_at)
    values($1,$2,$3,$4,$5,$6,'PREVIEWED',$7,$8,$9,$10,now()+make_interval(hours=>$11)) returning *`,[id,p.account.id,input.kind,importTemplates[input.kind].version,input.fileName,createHash('sha256').update(bytes).digest('hex'),JSON.stringify(parsed.sheets),rowCount,JSON.stringify(validation.preview),validation.hash,IMPORT_LIMITS.previewHours])).rows[0];
   return {...this.summary(row),preview:validation.preview,previewHash:validation.hash,result:null};
  });
 }
 private async load(tx:Transaction,p:Policy,id:string,lock=false) {
  const row=(await tx.query<BatchRow>(`select * from import_batches where id=$1${lock?' for update':''}`,[id])).rows[0];
  if(!row||row.creator_id!==p.account.id) throw denied();return row;
 }
 // Status recovery and fresh revalidation: committed batches return their redacted result; previews are recomputed every read.
 async batch(token:string,id:string):Promise<ImportBatch> {
  z.uuid().parse(id);
  return this.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'imports.commit');const row=await this.load(tx,p,id);const summary=this.summary(row);
   if(row.status==='COMMITTED') return {...summary,preview:row.preview,previewHash:row.preview_hash,result:row.result};
   if(summary.status==='EXPIRED') return {...summary,preview:null,previewHash:null,result:null};
   const states=await this.kindState(tx,p);
   if(!states[row.kind]) return {...summary,preview:{...(row.preview as ImportPreview),errors:[{sheet:'Template',row:null,column:null,code:'NOT_PERMITTED'}],errorCount:1,canCommit:false},previewHash:null,result:null};
   const validation=await this.validate(tx,p,row.kind,row.staged,[],row.id);
   await tx.query('update import_batches set preview=$2,preview_hash=$3 where id=$1',[row.id,JSON.stringify(validation.preview),validation.hash]);
   return {...summary,preview:validation.preview,previewHash:validation.hash,result:null};
  });
 }
 async commit(token:string,id:string,raw:unknown):Promise<ImportCommitResult> {
  z.uuid().parse(id);const input=importCommitSchema.parse(raw);
  return this.withPolicy(token,async(tx,p)=>{
   let validation!:Validation;let row!:BatchRow;
   return this.core.operation(tx,p,input.operationId,'IMPORT_COMMIT',{batchId:id,expectedPreviewHash:input.expectedPreviewHash},'imports.commit',async()=>{
    row=await this.load(tx,p,id,true);
    if(row.status==='COMMITTED') throw new SafeError('IDEMPOTENCY_CONFLICT','imports.alreadyCommitted',false,409);
    if(this.summary(row).status==='EXPIRED') throw new SafeError('VALIDATION_ERROR','imports.expired',false,409);
    this.requireKind(await this.kindState(tx,p),row.kind);
    // Current permissions, scope, quotas, duplicates and template version are all recomputed here, never trusted from the preview.
    if(row.template_version!==importTemplates[row.kind].version) throw new SafeError('VALIDATION_ERROR','imports.templateVersion',false,409);
    validation=await this.validate(tx,p,row.kind,row.staged,[],row.id);
    if(validation.hash!==input.expectedPreviewHash) {await tx.query('update import_batches set preview=$2,preview_hash=$3 where id=$1',[row.id,JSON.stringify(validation.preview),validation.hash]);throw new SafeError('STALE_VERSION','imports.previewStale',false,409);}
    if(!validation.preview.canCommit) throw new SafeError('VALIDATION_ERROR','imports.revalidationFailed',false,409);
    return validation.plan.resources;
   },async()=>{
    const result=await this.execute(tx,p,row,validation.plan,input.operationId);
    await tx.query("update import_batches set status='COMMITTED',committed_at=now(),operation_id=$2,result=$3,preview=$4,preview_hash=$5 where id=$1",[row.id,input.operationId,JSON.stringify({...result,credentials:null}),JSON.stringify(validation.preview),validation.hash]);
    return result;
   },undefined,false,result=>({...result,credentials:null}));
  },true);
 }
 private async execute(tx:Transaction,p:Policy,row:BatchRow,plan:Plan,operationId:string):Promise<ImportCommitResult> {
  const creates={guardians:0,children:0,links:0,obligations:0,employees:0,logins:0,assignments:0};const credentials:ImportCommitResult['credentials']=[];let total=0n;
  if(row.kind==='PARENTS_CHILDREN') {
   this.licensing.requireUsable(p);
   for(const family of plan.families) {
    const onboarding:OnboardingInput={operationId:derivedOperationId(operationId,`family/${family.key}`),guardians:family.guardians.map(g=>({kind:'NEW' as const,username:g.username,profile:{fullName:g.fullName,mobile:g.mobile}})),children:family.children.map(c=>({child:{code:c.code,fullName:c.fullName,birthDate:c.birthDate,branchId:c.branchId,classroomId:c.classroomId,contacts:c.contacts},links:c.links}))};
    const result=await this.core.children.onboardInTransaction(tx,p,onboarding);
    if(result.replayed) throw new SafeError('IDEMPOTENCY_CONFLICT','imports.alreadyCommitted',false,409);
    creates.guardians+=result.guardianIds.length;creates.children+=result.childIds.length;creates.links+=family.children.reduce((n,c)=>n+c.links.length,0);
    credentials.push(...result.credentials.map(c=>({username:c.username,temporaryPassword:c.temporaryPassword})));
   }
  } else if(row.kind==='OPENING_BALANCES') {
   await this.core.enabled(tx);
   await this.core.lockChildren(tx,plan.obligations.map(o=>o.childId));
   for(const o of plan.obligations) {
    const child:Child=await resolveChild(tx,o.childId,true);requireChild(p,'billing.manage',child);
    await this.ledger.postInTransaction(tx,p,child,{operationId:derivedOperationId(operationId,`obligation/${o.row}`),childId:o.childId,categoryId:o.categoryId,amount:o.amount,description:o.description,sourceReference:`import/${row.id}/${o.row}`,issuedOn:o.issuedOn,serviceFrom:null,serviceUntil:null,installments:[{dueOn:o.dueOn,amount:o.amount}]});
    creates.obligations++;total+=BigInt(o.amount);
   }
  } else {
   for(const e of plan.employees) {
    const created=await this.payroll.createProfileInTransaction(tx,p,{operationId:derivedOperationId(operationId,`employee/${e.employeeCode}`),employeeCode:e.employeeCode,fullName:e.fullName,basicSalary:e.basicSalary,effectiveMonth:e.effectiveMonth,payingBranchId:e.payingBranchId,payingAccountId:e.payingAccountId,loginUsername:e.loginUsername}) as {id:string;accountId:string|null;temporaryPassword:string|null};
    creates.employees++;
    if(created.accountId) {creates.logins++;if(created.temporaryPassword===null) throw new SafeError('IDEMPOTENCY_CONFLICT','imports.alreadyCommitted',false,409);credentials.push({username:e.loginUsername!,temporaryPassword:created.temporaryPassword});}
    if(e.roleId&&created.accountId) {await this.organization.assignInTransaction(tx,p,created.accountId,{expectedVersion:1,roleIds:[e.roleId],branchIds:e.branchIds,classroomIds:[],scopeMode:'BRANCH'});creates.assignments++;}
   }
  }
  return {batchId:row.id,replayed:false,creates,obligationsTotal:total.toString(),credentials};
 }

 // ---- Validation: staged rows against current data, scope, quotas and duplicates. Never writes. ----
 private async validate(tx:Transaction,p:Policy,kind:ImportKind,sheets:StagedWorkbook['sheets'],parseErrors:ImportRowError[],batchId:string):Promise<Validation> {
  const errors:ImportRowError[]=[...parseErrors];const warnings:string[]=[];const rows:ImportPreview['rows']=[];
  const plan:Plan={families:[],obligations:[],employees:[],resources:[]};const resource=(r:FinanceResource)=>{if(!plan.resources.some(x=>x.branchId===r.branchId&&x.classroomId===r.classroomId)) plan.resources.push(r);};const creates={guardians:0,children:0,links:0,obligations:0,employees:0,logins:0,assignments:0};let total=0n;
  const system=p.account.kind==='SYSTEM',branchMode=system||p.scope.mode==='BRANCH';
  const branches=new Map((await tx.query<{id:string;code:string}>('select id,code from branches')).rows.map(b=>[b.code,{id:b.id,inScope:system||p.scope.branchIds.includes(b.id)}]));
  const err=(sheet:string,row:number|null,column:string|null,code:ImportRowError['code'])=>{errors.push({sheet,row,column,code});};
  // A cell already rejected by the parser (formula, overlong, unsupported) is not reported a second time as missing.
  const required=(sheet:string,r:StagedRow,column:string)=>{const v=text(r.values[column]);if(v===null&&!parseErrors.some(e=>e.sheet===sheet&&e.row===r.row&&e.column===column)) err(sheet,r.row,column,'REQUIRED');return v;};
  const parseWith=<T,>(sheet:string,r:StagedRow,column:string,schema:z.ZodType<T>,value:string|null):T|null=>{if(value===null) return null;const parsed=schema.safeParse(value);if(!parsed.success) {err(sheet,r.row,column,'INVALID');return null;}return parsed.data;};
  const uniq=new Map<string,Set<string>>();const dup=(scope:string,sheet:string,r:StagedRow,column:string|null,value:string|null)=>{if(value===null) return false;const set=uniq.get(scope)??new Set();uniq.set(scope,set);const key=value.toLowerCase();if(set.has(key)) {err(sheet,r.row,column,'DUPLICATE');return true;}set.add(key);return false;};
  const limits=(await tx.query<{parent_capacity:number;employee_capacity:number}>('select parent_capacity,employee_capacity from license_limits where singleton')).rows[0]??null;
  const reserved=async(kind:'PARENT'|'EMPLOYEE')=>(await tx.query<{count:number}>('select count(*)::int as count from seat_reservations where kind=$1 and released_at is null',[kind])).rows[0].count;
  const seats:ImportPreview['seats']={parent:{capacity:limits?.parent_capacity??null,reserved:await reserved('PARENT'),required:0},employee:{capacity:limits?.employee_capacity??null,reserved:await reserved('EMPLOYEE'),required:0}};
  const seatCheck=(sheet:string,s:ImportPreview['seats']['parent'])=>{if(s.required>0&&(s.capacity===null||p.licenseStatus!=='ACTIVE'&&p.licenseStatus!=='GRACE'||s.capacity-s.reserved<s.required)) err(sheet,null,null,'CAPACITY');};
  const usernameTaken=async(username:string)=>Boolean((await tx.query('select 1 from accounts where username_normalized=$1',[username])).rowCount);
  const today=cairoIsoDate();
  if(kind==='PARENTS_CHILDREN') {
   const classrooms=new Map((await tx.query<{id:string;branch_id:string;code:string;capacity:number;occupancy:number}>("select c.id,c.branch_id,c.code,c.capacity,(select count(*)::int from children ch where ch.classroom_id=c.id and ch.status='ACTIVE') as occupancy from classrooms c")).rows.map(c=>[`${c.branch_id}/${c.code}`,{...c,inScope:branchMode||p.scope.classroomIds.includes(c.id)}]));
   const parents=new Map<string,Family['guardians'][number]&{row:number}>();
   for(const r of sheets.Parents??[]) {
    const key=required('Parents',r,'parent_key'),username=parseWith('Parents',r,'username',usernameSchema,required('Parents',r,'username')),fullName=parseWith('Parents',r,'full_name',z.string().trim().min(1).max(160),required('Parents',r,'full_name')),mobile=parseWith('Parents',r,'mobile',mobileSchema,required('Parents',r,'mobile'));
    const dupKey=dup('parent_key','Parents',r,'parent_key',key),dupUser=dup('username','Parents',r,'username',username);
    if(username&&!dupUser&&await usernameTaken(username)) err('Parents',r.row,'username','EXISTS');
    if(key&&!dupKey&&username&&fullName&&mobile) parents.set(key.toLowerCase(),{key:key.toLowerCase(),username,fullName,mobile,row:r.row});
    rows.push({sheet:'Parents',row:r.row,key:key??'',label:username??'',detail:fullName??''});
   }
   const children=new Map<string,StagedChild>();
   for(const r of sheets.Children??[]) {
    const code=parseWith('Children',r,'child_code',codeSchema,required('Children',r,'child_code')),fullName=parseWith('Children',r,'full_name',z.string().trim().min(1).max(160),required('Children',r,'full_name'));
    const birthRaw=required('Children',r,'birth_date');const birthDate=birthRaw===null?null:parseImportDate(birthRaw);if(birthRaw!==null&&(birthDate===null||birthDate>today)) err('Children',r.row,'birth_date','INVALID');
    const branchCode=parseWith('Children',r,'branch_code',codeSchema,required('Children',r,'branch_code'));const branch=branchCode?branches.get(branchCode):undefined;
    if(branchCode&&!branch) err('Children',r.row,'branch_code','UNKNOWN_REFERENCE');else if(branch&&!branch.inScope) err('Children',r.row,'branch_code','OUT_OF_SCOPE');
    const classroomCode=parseWith('Children',r,'classroom_code',codeSchema,text(r.values.classroom_code));let classroomId:string|null=null;
    if(classroomCode&&branch) {const c=classrooms.get(`${branch.id}/${classroomCode}`);if(!c) err('Children',r.row,'classroom_code','UNKNOWN_REFERENCE');else if(!c.inScope) err('Children',r.row,'classroom_code','OUT_OF_SCOPE');else classroomId=c.id;}
    else if(!classroomCode&&!branchMode) err('Children',r.row,'classroom_code','OUT_OF_SCOPE');
    const contactName=text(r.values.contact_name),contactMobile=text(r.values.contact_mobile),contactRelationship=text(r.values.contact_relationship);const contacts:Family['children'][number]['contacts']=[];
    if(contactName||contactMobile||contactRelationship) {
     const name=parseWith('Children',r,'contact_name',z.string().trim().min(1).max(160),contactName),mob=parseWith('Children',r,'contact_mobile',mobileSchema,contactMobile),rel=parseWith('Children',r,'contact_relationship',z.string().trim().min(1).max(80),contactRelationship);
     if(!contactName) err('Children',r.row,'contact_name','REQUIRED');if(!contactMobile) err('Children',r.row,'contact_mobile','REQUIRED');if(!contactRelationship) err('Children',r.row,'contact_relationship','REQUIRED');
     if(name&&mob&&rel) contacts.push({fullName:name,mobile:mob,relationship:rel});
    }
    const dupCode=dup('child_code','Children',r,'child_code',code);
    if(code&&!dupCode&&(await tx.query('select 1 from children where code=$1',[code])).rowCount) err('Children',r.row,'child_code','EXISTS');
    if(code&&!dupCode&&fullName&&birthDate&&birthDate<=today&&branch?.inScope&&(classroomId||(!classroomCode&&branchMode))) children.set(code,{code,fullName,birthDate,branchId:branch.id,classroomId,contacts,links:[],row:r.row,branchCode:branchCode!,classroomCode,linkKeys:[]});
    rows.push({sheet:'Children',row:r.row,key:code??'',label:fullName??'',detail:[branchCode,classroomCode].filter(Boolean).join(' / ')});
   }
   const linkedParents=new Set<string>(),linkedChildren=new Set<string>(),referencedParents=new Set<string>(),referencedChildren=new Set<string>();const union=new Map<string,string>();const find=(k:string):string=>{const parent=union.get(k)??k;if(parent===k) return k;const root=find(parent);union.set(k,root);return root;};
   for(const r of sheets.Links??[]) {
    const key=required('Links',r,'parent_key')?.toLowerCase()??null,code=parseWith('Links',r,'child_code',codeSchema,required('Links',r,'child_code')),relationship=parseWith('Links',r,'relationship',z.string().trim().min(1).max(80),required('Links',r,'relationship'));
    const parent=key?parents.get(key):undefined,child=code?children.get(code):undefined;if(key) referencedParents.add(key);if(code) referencedChildren.add(code);
    if(key&&!parent&&!(sheets.Parents??[]).some(x=>text(x.values.parent_key)?.toLowerCase()===key)) err('Links',r.row,'parent_key','UNKNOWN_REFERENCE');
    if(code&&!child&&!(sheets.Children??[]).some(x=>codeSchema.safeParse(text(x.values.child_code)??'').data===code)) err('Links',r.row,'child_code','UNKNOWN_REFERENCE');
    const permissions={...defaultLinkPermissions};let valid=true;
    for(const [column,name] of [['can_read','read'],['can_finance','finance'],['can_pickup','pickup'],['can_notify','notify']] as const) {const v=r.values[column];if(v===null) continue;const b=typeof v==='string'||typeof v==='boolean'||typeof v==='number'?parseImportBoolean(v):null;if(b===null) {err('Links',r.row,column,'INVALID');valid=false;} else permissions[name]=b;}
    if(dup('link','Links',r,null,key&&code?`${key}/${code}`:null)) valid=false;
    if(parent&&child&&relationship&&valid) {
     linkedParents.add(parent.key);linkedChildren.add(child.code);union.set(find(`p:${parent.key}`),find(`c:${child.code}`));
     child.links.push({guardianIndex:-1,relationship,permissions});child.linkKeys.push(`p:${parent.key}`);
    }
    rows.push({sheet:'Links',row:r.row,key:`${key??''}/${code??''}`,label:relationship??'',detail:Object.entries(permissions).filter(([,v])=>v).map(([k])=>k).join(', ')});
   }
   // Unlinked means no link row mentions the key at all; invalid partner rows already carry their own errors.
   for(const parent of parents.values()) if(!referencedParents.has(parent.key)) err('Parents',parent.row,'parent_key','UNLINKED');
   for(const child of children.values()) if(!referencedChildren.has(child.code)) err('Children',child.row,'child_code','UNLINKED');
   const families=new Map<string,{key:string;guardians:Family['guardians'];children:StagedChild[]}>();
   for(const parent of parents.values()) {if(!linkedParents.has(parent.key)) continue;const root=find(`p:${parent.key}`);const fam=families.get(root)??{key:root,guardians:[],children:[]};families.set(root,fam);fam.guardians.push({key:parent.key,username:parent.username,fullName:parent.fullName,mobile:parent.mobile});}
   for(const child of children.values()) {if(!linkedChildren.has(child.code)) continue;const fam=families.get(find(`c:${child.code}`));if(!fam) continue;fam.children.push(child);}
   for(const fam of families.values()) {
    fam.guardians.sort((a,b)=>a.key.localeCompare(b.key));fam.children.sort((a,b)=>a.code.localeCompare(b.code));fam.key=fam.guardians.map(g=>g.key).join('+');
    if(fam.guardians.length>IMPORT_LIMITS.maxFamilyGuardians||fam.children.length>IMPORT_LIMITS.maxFamilyChildren) {for(const c of fam.children) err('Children',c.row,'child_code','FAMILY_TOO_LARGE');continue;}
    for(const c of fam.children) c.links=c.links.map((l,i)=>({...l,guardianIndex:fam.guardians.findIndex(g=>`p:${g.key}`===c.linkKeys[i])}));
    plan.families.push({key:fam.key,guardians:fam.guardians,children:fam.children.map(c=>({code:c.code,fullName:c.fullName,birthDate:c.birthDate,branchId:c.branchId,classroomId:c.classroomId,contacts:c.contacts,links:c.links}))});
   }
   plan.families.sort((a,b)=>a.key.localeCompare(b.key));
   creates.guardians=parents.size;creates.children=children.size;creates.links=[...children.values()].reduce((n,c)=>n+c.links.length,0);creates.logins=parents.size;
   seats.parent.required=parents.size;seatCheck('Parents',seats.parent);
   const perClassroom=new Map<string,number>();for(const c of children.values()) if(c.classroomId) perClassroom.set(c.classroomId,(perClassroom.get(c.classroomId)??0)+1);
   for(const c of classrooms.values()) {const add=perClassroom.get(c.id)??0;if(add&&c.occupancy+add>c.capacity) warnings.push(`CAPACITY_EXCEEDED:${c.code}`);}
   for(const c of children.values()) resource({branchId:c.branchId,classroomId:c.classroomId??undefined});
  } else if(kind==='OPENING_BALANCES') {
   const categories=new Map((await tx.query<{id:string;code:string}>('select id,code from fee_categories')).rows.map(c=>[c.code,c.id]));const childCache=new Map<string,Child|null>();
   for(const r of sheets.Balances??[]) {
    const code=parseWith('Balances',r,'child_code',codeSchema,required('Balances',r,'child_code')),categoryCode=parseWith('Balances',r,'category_code',codeSchema,required('Balances',r,'category_code'));
    const amountRaw=r.values.amount_egp;const amount=amountRaw===null?null:typeof amountRaw==='boolean'?null:parseEgpToPiastres(amountRaw);
    if(amountRaw===null) err('Balances',r.row,'amount_egp','REQUIRED');else if(amount===null||amount==='0') err('Balances',r.row,'amount_egp','INVALID');
    const description=parseWith('Balances',r,'description',z.string().trim().min(1).max(120),required('Balances',r,'description'));
    const issuedRaw=required('Balances',r,'issued_on'),dueRaw=required('Balances',r,'due_on');const issuedOn=issuedRaw===null?null:parseImportDate(issuedRaw),dueOn=dueRaw===null?null:parseImportDate(dueRaw);
    if(issuedRaw!==null&&(issuedOn===null||issuedOn>today)) err('Balances',r.row,'issued_on','INVALID');if(dueRaw!==null&&(dueOn===null||(issuedOn&&dueOn<issuedOn))) err('Balances',r.row,'due_on','INVALID');
    let child:Child|null=null;
    if(code) {
     if(!childCache.has(code)) childCache.set(code,(await tx.query<Child>('select id,code,full_name as "fullName",birth_date::text as "birthDate",branch_id as "branchId",classroom_id as "classroomId",status,public_message as "publicMessage",version from children where code=$1',[code])).rows[0]??null);
     child=childCache.get(code)!;
     if(!child) err('Balances',r.row,'child_code','UNKNOWN_REFERENCE');else {try {requireChild(p,'billing.manage',child);} catch {err('Balances',r.row,'child_code','OUT_OF_SCOPE');child=null;}if(child&&child.status==='ARCHIVED') {err('Balances',r.row,'child_code','INVALID');child=null;}}
    }
    const categoryId=categoryCode?categories.get(categoryCode)??null:null;if(categoryCode&&!categoryId) err('Balances',r.row,'category_code','UNKNOWN_REFERENCE');
    const complete=child&&categoryId&&amount&&amount!=='0'&&description&&issuedOn&&issuedOn<=today&&dueOn&&dueOn>=issuedOn;
    if(complete&&!dup('balance','Balances',r,null,`${child!.id}/${categoryId}/${amount}/${dueOn}/${description!.toLowerCase()}`)) {
     if((await tx.query("select 1 from obligations o join installments i on i.obligation_id=o.id where o.child_id=$1 and o.category_id=$2 and o.amount=$3 and lower(o.description)=lower($4) and i.due_on=$5 and o.source_reference like 'import/%' limit 1",[child!.id,categoryId,amount,description,dueOn])).rowCount) err('Balances',r.row,null,'EXISTS');
     else {plan.obligations.push({row:r.row,childId:child!.id,categoryId:categoryId!,amount:amount!,description:description!,issuedOn:issuedOn!,dueOn:dueOn!});total+=BigInt(amount!);}
    }
    rows.push({sheet:'Balances',row:r.row,key:code??'',label:child?`${child.code} — ${child.fullName}`:code??'',detail:`${categoryCode??''} ${amount?`${(BigInt(amount)/100n).toString()}.${(BigInt(amount)%100n).toString().padStart(2,'0')}`:''} ${dueOn??''}`.trim()});
   }
   creates.obligations=plan.obligations.length;for(const c of childCache.values()) if(c) resource({branchId:c.branchId,classroomId:c.classroomId??undefined,childId:c.id});
  } else {
   const accounts=new Map((await tx.query<{id:string;branch_id:string;code:string}>('select id,branch_id,code from treasury_accounts')).rows.map(a=>[a.code,a]));
   const canLogin=p.account.capabilities.includes('users.manage_staff'),canAssign=system&&p.account.capabilities.includes('users.assign_roles');
   const roles=canAssign?await this.organization.assignable(tx,p):[];
   for(const r of sheets.Employees??[]) {
    const code=parseWith('Employees',r,'employee_code',codeSchema,required('Employees',r,'employee_code')),fullName=parseWith('Employees',r,'full_name',z.string().trim().min(1).max(160),required('Employees',r,'full_name'));
    const salaryRaw=r.values.basic_salary_egp;const salary=salaryRaw===null||typeof salaryRaw==='boolean'?null:parseEgpToPiastres(salaryRaw);
    if(salaryRaw===null) err('Employees',r.row,'basic_salary_egp','REQUIRED');else if(salary===null||salary==='0') err('Employees',r.row,'basic_salary_egp','INVALID');
    const monthRaw=required('Employees',r,'effective_month');const month=monthRaw===null?null:parseImportMonth(monthRaw);if(monthRaw!==null&&month===null) err('Employees',r.row,'effective_month','INVALID');
    const branchCode=parseWith('Employees',r,'paying_branch_code',codeSchema,required('Employees',r,'paying_branch_code'));const branch=branchCode?branches.get(branchCode):undefined;
    if(branchCode&&!branch) err('Employees',r.row,'paying_branch_code','UNKNOWN_REFERENCE');else if(branch&&!branch.inScope) err('Employees',r.row,'paying_branch_code','OUT_OF_SCOPE');
    const accountCode=parseWith('Employees',r,'paying_account_code',codeSchema,required('Employees',r,'paying_account_code'));const account=accountCode?accounts.get(accountCode):undefined;
    if(accountCode&&!account) err('Employees',r.row,'paying_account_code','UNKNOWN_REFERENCE');else if(account&&branch&&account.branch_id!==branch.id) err('Employees',r.row,'paying_account_code','INVALID');
    const loginRaw=text(r.values.login_username);const login=parseWith('Employees',r,'login_username',usernameSchema,loginRaw);
    if(login&&!canLogin) err('Employees',r.row,'login_username','NOT_PERMITTED');
    const dupLogin=dup('username','Employees',r,'login_username',login);if(login&&!dupLogin&&await usernameTaken(login)) err('Employees',r.row,'login_username','EXISTS');
    const roleName=text(r.values.role_name),branchCodesRaw=text(r.values.branch_codes);let roleId:string|null=null;const branchIds:string[]=[];
    if(roleName) {
     if(!login) err('Employees',r.row,'role_name','INVALID');else if(!canAssign) err('Employees',r.row,'role_name','NOT_PERMITTED');
     else {const role=roles.find(x=>x.name===roleName);if(!role) err('Employees',r.row,'role_name','UNKNOWN_REFERENCE');else roleId=role.id;}
     for(const raw of (branchCodesRaw??'').split(',').map(s=>s.trim()).filter(Boolean)) {const parsed=codeSchema.safeParse(raw);const b=parsed.success?branches.get(parsed.data):undefined;if(!b) err('Employees',r.row,'branch_codes','UNKNOWN_REFERENCE');else if(!b.inScope) err('Employees',r.row,'branch_codes','OUT_OF_SCOPE');else if(!branchIds.includes(b.id)) branchIds.push(b.id);}
     if(!branchIds.length&&branch?.inScope) branchIds.push(branch.id);
    } else if(branchCodesRaw) err('Employees',r.row,'branch_codes','INVALID');
    const dupCode=dup('employee_code','Employees',r,'employee_code',code);
    if(code&&!dupCode&&(await tx.query('select 1 from employee_profiles where employee_code=$1',[code])).rowCount) err('Employees',r.row,'employee_code','EXISTS');
    const ok=code&&!dupCode&&fullName&&salary&&salary!=='0'&&month&&branch?.inScope&&account&&account.branch_id===branch.id&&(!loginRaw||login&&canLogin&&!dupLogin)&&(!roleName||roleId&&branchIds.length);
    if(ok) plan.employees.push({row:r.row,employeeCode:code,fullName,basicSalary:salary,effectiveMonth:month,payingBranchId:branch.id,payingAccountId:account.id,loginUsername:login??null,roleId,branchIds});
    rows.push({sheet:'Employees',row:r.row,key:code??'',label:fullName??'',detail:[branchCode,accountCode,login,roleName].filter(Boolean).join(' / ')});
   }
   creates.employees=plan.employees.length;creates.logins=plan.employees.filter(e=>e.loginUsername).length;creates.assignments=plan.employees.filter(e=>e.roleId).length;
   seats.employee.required=creates.logins;seatCheck('Employees',seats.employee);
   for(const id of plan.employees.flatMap(e=>[e.payingBranchId,...e.branchIds])) resource({branchId:id});
  }
  const emptyBatch=!Object.values(sheets).some(list=>list.length);if(emptyBatch) err(Object.keys(importTemplates[kind].sheets)[0],null,null,'REQUIRED');
  const rowCounts=Object.fromEntries(Object.entries(sheets).map(([name,list])=>[name,list.length]));
  const preview:ImportPreview={templateVersion:importTemplates[kind].version,rowCounts,errors:errors.slice(0,500),errorCount:errors.length,canCommit:errors.length===0,creates,obligationsTotal:total.toString(),seats,warnings:[...new Set(warnings)],rows:rows.slice(0,1500)};
  const hash=sha({batchId,kind,templateVersion:preview.templateVersion,sheets,errors,creates,obligationsTotal:preview.obligationsTotal,seats,warnings:preview.warnings,scope:{revision:p.scope.revision,mode:p.scope.mode,branchIds:p.scope.branchIds,classroomIds:p.scope.classroomIds,capabilities:p.account.capabilities,license:p.licenseStatus},plan});
  return {preview,hash,plan};
 }
}
