import { afterEach,describe,expect,it } from 'vitest';
import ExcelJS from 'exceljs';
import { cairoIsoDate } from '@nursery/domain';
import { IMPORT_LIMITS,importTemplates } from '@nursery/contracts';
import { importFixture,fillTemplate } from '../helpers/imports.js';
import { reconcileFinance } from '../helpers/finance.js';
import { defaultLimitsInput } from '../helpers/licensing.js';

describe('Phase 21 Excel templates, validation preview and atomic import on PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof importFixture>>;
 afterEach(async()=>{await f?.close();});
 const parentsRows=(suffix:string,branch='A',classroom='C0')=>({
  Parents:[['P1',`import-parent-1-${suffix}`,'Parent One','01000000001'],['P2',`import-parent-2-${suffix}`,'Parent Two','01000000002']],
  Children:[[`IMP-${suffix}-1`,'Child One','2022-03-04',branch,classroom,'Aunt Contact','01000000009','Aunt'],[`IMP-${suffix}-2`,'Child Two',new Date('2021-05-06T00:00:00Z'),branch,null,null,null,null]],
  Links:[['P1',`IMP-${suffix}-1`,'Mother','Y','Y','N','Y'],['P1',`IMP-${suffix}-2`,'Mother',null,null,null,null],['P2',`IMP-${suffix}-1`,'Father','Y','N','Y','Y']]
 });
 async function cash() {return (await f.database.pool.query<{total:string}>('select coalesce(sum(amount),0)::text as total from treasury_movements')).rows[0].total;}
 async function outstanding(childId:string) {return (await f.database.pool.query<{total:string}>('select coalesce(sum(remaining),0)::text as total from installment_balances b join obligations o on o.id=b.obligation_id where o.child_id=$1',[childId])).rows[0].total;}

 it('templates are versioned, scope-filtered, formula-free workbooks with bilingual guide and reference sheets',async()=>{
  f=await importFixture();const staff=await f.importStaff([f.a.id]);
  const book=new ExcelJS.Workbook();await book.xlsx.load((await f.template('PARENTS_CHILDREN',staff.token)) as unknown as ArrayBuffer);
  expect(book.worksheets.map(s=>s.name)).toEqual(['Parents','Children','Links','Guide','Reference','Template']);
  expect(book.getWorksheet('Parents')!.getRow(1).values).toEqual([undefined,...importTemplates.PARENTS_CHILDREN.sheets.Parents]);
  const meta=book.getWorksheet('Template')!.getRow(1);expect([meta.getCell(1).text,meta.getCell(2).text,Number(meta.getCell(3).text)]).toEqual(['NURSERY_IMPORT','PARENTS_CHILDREN',1]);
  const reference=book.getWorksheet('Reference')!;const cells:string[]=[];reference.eachRow(r=>r.eachCell(c=>{cells.push(c.text);expect(c.type).not.toBe(ExcelJS.ValueType.Formula);}));
  expect(cells).toContain('A');expect(cells).not.toContain('B');expect(cells).toContain('C0');expect(cells).not.toContain('C2');
  const guide=book.getWorksheet('Guide')!;const guideText:string[]=[];guide.eachRow(r=>r.eachCell(c=>guideText.push(c.text)));expect(guideText.join('\n')).toMatch(/[\u0600-\u06ff]/);expect(guideText).toContain('parent_key');
  await expect(f.imports.template((await f.financeStaff([f.a.id],[],'BRANCH',['finance.read'])).token,'OPENING_BALANCES')).rejects.toMatchObject({code:'FORBIDDEN'});
  const options=await f.imports.options(staff.token);expect(options.kinds.map(k=>[k.kind,k.enabled])).toEqual([['PARENTS_CHILDREN',true],['OPENING_BALANCES',true],['EMPLOYEES',true]]);expect(options.limits.maxRowsPerSheet).toBe(500);
 });
 it('A03/A04: sibling and shared-child links create one account per parent key, and concurrent final-slot imports commit exactly once',async()=>{
  f=await importFixture();
  const batch=await f.upload('PARENTS_CHILDREN',parentsRows('a03'));
  expect(batch.preview.errors).toEqual([]);expect(batch.preview.creates).toMatchObject({guardians:2,children:2,links:3,logins:2});expect(batch.preview.seats.parent).toMatchObject({required:2,reserved:0,capacity:20});
  const operationId=crypto.randomUUID(),first=await f.commit(batch,f.root.token,operationId);
  expect(first.creates).toMatchObject({guardians:2,children:2,links:3});expect(first.credentials).toHaveLength(2);expect(first.credentials!.every(c=>c.temporaryPassword.length>10)).toBe(true);
  const replay=await f.commit(batch,f.root.token,operationId);expect(replay.credentials).toBeNull();expect(replay.creates).toEqual(first.creates);
  await expect(f.imports.commit(f.root.token,batch.id,{operationId,expectedPreviewHash:'0'.repeat(64)})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(f.commit(batch)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const accounts=(await f.database.pool.query<{n:number}>("select count(*)::int as n from accounts where kind='GUARDIAN'")).rows[0].n;expect(accounts).toBe(2);
  const links=(await f.database.pool.query<{code:string;n:number}>('select c.code,count(*)::int as n from guardian_child_links l join children c on c.id=l.child_id group by c.code order by c.code')).rows;expect(links).toEqual([{code:'IMP-A03-1',n:2},{code:'IMP-A03-2',n:1}]);
  expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from seat_reservations where kind='PARENT' and released_at is null")).rows[0].n).toBe(2);
  const status=await f.imports.batch(f.root.token,batch.id);expect(status.status).toBe('COMMITTED');expect(status.result?.credentials).toBeNull();
  expect((await f.database.pool.query("select details->'result'->'credentials' as c from financial_audit_events where action='IMPORT_COMMIT'")).rows[0].c).toBeNull();
  // Cap 4 with 2 reserved: two single-parent batches race for the last two seats one at a time; a third cannot fit.
  await f.licensing.saveLimits(f.root.token,{expectedVersion:1,value:{...defaultLimitsInput,parentCapacity:3,employeeCapacity:20}});
  const single=(s:string)=>({Parents:[[`P${s}`,`race-${s}`,`Race ${s}`,'01000000003']],Children:[[`RACE-${s}`,`Race child ${s}`,'2022-01-01','A','C0',null,null,null]],Links:[[`P${s}`,`RACE-${s}`,'Mother',null,null,null,null]]});
  const x=await f.upload('PARENTS_CHILDREN',single('x')),y=await f.upload('PARENTS_CHILDREN',single('y'));expect(x.preview.canCommit&&y.preview.canCommit).toBe(true);
  const results=await Promise.allSettled([f.commit(x),f.commit(y)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const failed=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(['VALIDATION_ERROR','STALE_VERSION']).toContain(failed.reason.code);
  expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from children where code like 'RACE-%'")).rows[0].n).toBe(1);
  expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from accounts where username_normalized like 'race-%'")).rows[0].n).toBe(1);
  const loser=results[0].status==='rejected'?x:y;const reread=await f.imports.batch(f.root.token,loser.id);expect(reread.status).toBe('PREVIEWED');expect(reread.preview?.errors).toEqual([{sheet:'Parents',row:null,column:null,code:'CAPACITY'}]);
  await expect(f.commit(reread)).rejects.toMatchObject({code:'VALIDATION_ERROR',messageKey:'imports.revalidationFailed'});
 });
 it('A29: importing 2,500 EGP opening debt raises outstanding by 2,500 and cash by zero, with duplicate protection and replay',async()=>{
  f=await importFixture();const child=await f.child('OPEN1');const before=await cash();
  const rows={Balances:[['OPEN1','TUITION','2,500.00','Opening tuition balance','2026-01-15',new Date('2026-02-01T00:00:00Z')]]};
  const batch=await f.upload('OPENING_BALANCES',rows);expect(batch.preview.errors).toEqual([]);expect(batch.preview.obligationsTotal).toBe('250000');expect(batch.preview.creates.obligations).toBe(1);
  const operationId=crypto.randomUUID(),result=await f.commit(batch,f.root.token,operationId);expect(result).toMatchObject({creates:{obligations:1},obligationsTotal:'250000',credentials:[]});
  expect(await outstanding(child.childId)).toBe('250000');expect(await cash()).toBe(before);
  expect((await f.database.pool.query<{n:number}>('select count(*)::int as n from receipts')).rows[0].n).toBe(0);
  const obligation=(await f.database.pool.query<{source_reference:string;description:string;issued_on:string;due_on:string}>('select o.source_reference,o.description,o.issued_on::text,i.due_on::text from obligations o join installments i on i.obligation_id=o.id where o.child_id=$1',[child.childId])).rows[0];
  expect(obligation).toMatchObject({source_reference:`import/${batch.id}/2`,description:'Opening tuition balance',issued_on:'2026-01-15',due_on:'2026-02-01'});
  expect(await f.commit(batch,f.root.token,operationId)).toMatchObject({creates:{obligations:1},credentials:null});expect(await outstanding(child.childId)).toBe('250000');
  const again=await f.upload('OPENING_BALANCES',rows);expect(again.preview.errors).toEqual([{sheet:'Balances',row:2,column:null,code:'EXISTS'}]);expect(again.preview.canCommit).toBe(false);
  await expect(f.commit(again)).rejects.toMatchObject({code:'VALIDATION_ERROR',messageKey:'imports.revalidationFailed'});
  const bad=await f.upload('OPENING_BALANCES',{Balances:[['OPEN1','TUITION','12.345','Three decimals','2026-01-15','2026-02-01'],['NOPE','TUITION','10','Unknown child','2026-01-15','2026-02-01'],['OPEN1','NOCAT','10','Unknown category',cairoIsoDate(),'2020-01-01'],['OPEN1','TUITION','0','Zero','2999-01-01','2999-01-01']]});
  expect(bad.preview.errors).toEqual(expect.arrayContaining([{sheet:'Balances',row:2,column:'amount_egp',code:'INVALID'},{sheet:'Balances',row:3,column:'child_code',code:'UNKNOWN_REFERENCE'},{sheet:'Balances',row:4,column:'category_code',code:'UNKNOWN_REFERENCE'},{sheet:'Balances',row:4,column:'due_on',code:'INVALID'},{sheet:'Balances',row:5,column:'amount_egp',code:'INVALID'},{sheet:'Balances',row:5,column:'issued_on',code:'INVALID'}]));
  const report=await f.app.reports.report(f.root.token,{kind:'CASH_RESULT',from:'2026-01-01',to:cairoIsoDate(),limit:20,offset:0});expect(report.totals.amount).toBe('0');
  expect(await reconcileFinance(f.database)).toEqual([]);
 });
 it('A30: quota, scope or data changes after preview cause clear revalidation failure and a retry never duplicates records',async()=>{
  f=await importFixture();const staff=await f.importStaff([f.a.id]);
  const batch=await f.upload('PARENTS_CHILDREN',parentsRows('a30'),staff.token);expect(batch.preview.canCommit).toBe(true);
  // Quota consumed by someone else after preview.
  await f.licensing.saveLimits(f.root.token,{expectedVersion:1,value:{...defaultLimitsInput,parentCapacity:1,employeeCapacity:20}});
  await expect(f.commit(batch,staff.token)).rejects.toMatchObject({code:'STALE_VERSION',messageKey:'imports.previewStale'});
  const stale=await f.imports.batch(staff.token,batch.id);expect(stale.preview?.errors).toEqual([{sheet:'Parents',row:null,column:null,code:'CAPACITY'}]);expect(stale.preview?.seats.parent).toMatchObject({capacity:1,required:2});
  await f.licensing.saveLimits(f.root.token,{expectedVersion:2,value:{...defaultLimitsInput,parentCapacity:20,employeeCapacity:20}});
  // Scope removed after preview: branch A children are now out of scope for this actor.
  await f.app.organization.assign(f.root.token,staff.id,{expectedVersion:2,roleIds:(await f.database.pool.query<{role_id:string}>('select role_id from account_roles where account_id=$1',[staff.id])).rows.map(r=>r.role_id),branchIds:[f.b.id],classroomIds:[],scopeMode:'BRANCH'});
  const fresh=await f.imports.batch(staff.token,batch.id);expect(fresh.preview?.errors.map(e=>e.code)).toEqual(['OUT_OF_SCOPE','OUT_OF_SCOPE']);
  await expect(f.imports.commit(staff.token,batch.id,{operationId:crypto.randomUUID(),expectedPreviewHash:batch.previewHash!})).rejects.toMatchObject({code:'STALE_VERSION'});
  await expect(f.commit(fresh,staff.token)).rejects.toMatchObject({code:'VALIDATION_ERROR',messageKey:'imports.revalidationFailed'});
  expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from children where code like 'IMP-A30%'")).rows[0].n).toBe(0);
  // Data changed: the same child code now exists (created interactively), so the batch reports EXISTS and stays uncommitted.
  await f.child('IMP-A30-1');const dataChanged=await f.imports.batch(f.root.token,batch.id).catch(e=>e);expect(dataChanged.code).toBe('FORBIDDEN');
  const own=await f.upload('PARENTS_CHILDREN',parentsRows('a30b'));await f.child('IMP-A30B-2');
  await expect(f.commit(own)).rejects.toMatchObject({code:'STALE_VERSION'});const rechecked=await f.imports.batch(f.root.token,own.id);expect(rechecked.preview?.errors).toEqual([{sheet:'Children',row:3,column:'child_code',code:'EXISTS'}]);
  // Template version drift is rejected at upload.
  await expect(f.upload('PARENTS_CHILDREN',parentsRows('v9'),f.root.token,book=>{book.getWorksheet('Template')!.getCell(1,3).value=99;})).rejects.toMatchObject({messageKey:'imports.templateVersion'});
  expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from accounts where username_normalized like 'import-parent-%'")).rows[0].n).toBe(0);
 });
 it('A37: malicious cells, oversize/forged files, unsupported formulas, foreign batches and unauthorized role codes are rejected safely',async()=>{
  f=await importFixture();const staff=await f.importStaff([f.a.id]);
  const hostile=await f.upload('PARENTS_CHILDREN',{Parents:[['P1','hostile-parent','=HYPERLINK("http://evil")','01000000001'],['P2','hostile-two',{formula:'1+1'},'01000000002'],['P3','hostile-three','Fine Name','+201000000003']],Children:[['HOST-1','Child','2022-01-01','A','C0',null,null,null]],Links:[['P1','HOST-1','Mother',null,null,null,null],['P2','HOST-1','Father',null,null,null,null],['P3','HOST-1','Uncle',null,null,null,null]]});
  expect(hostile.preview.errors).toEqual(expect.arrayContaining([{sheet:'Parents',row:2,column:'full_name',code:'FORMULA'},{sheet:'Parents',row:3,column:'full_name',code:'FORMULA'}]));expect(hostile.preview.canCommit).toBe(false);
  expect(hostile.preview.errors.some(e=>e.row===4)).toBe(false);
  const big=Buffer.alloc(IMPORT_LIMITS.maxFileBytes+1,1).toString('base64');
  await expect(f.imports.upload(f.root.token,{kind:'PARENTS_CHILDREN',fileName:'big.xlsx',contentBase64:big})).rejects.toMatchObject({messageKey:'imports.tooLarge'});
  await expect(f.imports.upload(f.root.token,{kind:'PARENTS_CHILDREN',fileName:'text.xlsx',contentBase64:Buffer.from('not a workbook at all').toString('base64')})).rejects.toMatchObject({messageKey:'imports.unsupportedFile'});
  // Forged central-directory sizes and macro parts are rejected by the bounded zip guard before any parser runs.
  const genuine=Buffer.from(await fillTemplate(await f.template('PARENTS_CHILDREN'),{}),'base64');
  const forged=Buffer.from(genuine);let eocd=-1;for(let i=forged.length-22;i>=0;i--) if(forged.readUInt32LE(i)===0x06054b50) {eocd=i;break;}const directory=forged.readUInt32LE(eocd+16);forged.writeUInt32LE(0x7fffffff,directory+24);
  await expect(f.imports.upload(f.root.token,{kind:'PARENTS_CHILDREN',fileName:'forged.xlsx',contentBase64:forged.toString('base64')})).rejects.toMatchObject({messageKey:'imports.tooLarge'});
  const macro=Buffer.from(genuine);const name=Buffer.from('xl/workbook.xml');const idx=macro.indexOf(name,directory);expect(idx).toBeGreaterThan(0);macro.write('xl/vbaProje.bin',idx);
  await expect(f.imports.upload(f.root.token,{kind:'PARENTS_CHILDREN',fileName:'macro.xlsx',contentBase64:macro.toString('base64')})).rejects.toMatchObject({messageKey:'imports.unsupportedFile'});
  // Foreign batch IDs are never readable or committable; template version drift is a distinct error.
  const mine=await f.upload('OPENING_BALANCES',{Balances:[['ANY','TUITION','1','x','2026-01-01','2026-01-01']]});
  await expect(f.imports.batch(staff.token,mine.id)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(f.imports.commit(staff.token,mine.id,{operationId:crypto.randomUUID(),expectedPreviewHash:'a'.repeat(64)})).rejects.toMatchObject({code:'FORBIDDEN'});
  // Role codes: delegated admins cannot scope unassigned staff; SYSTEM validates unknown/unassignable roles and branch scope.
  const employees=(login:string|null,role:string|null,branches:string|null)=>({Employees:[['EMP-X','Employee X','5000','2026-09','A','A-CASH',login,role,branches]]});
  const delegated=await f.upload('EMPLOYEES',employees('emp-x-login','Finance role',null),(await f.importStaff([f.a.id],['imports.commit','finance.read','payroll.manage','users.manage_staff','users.assign_roles'])).token);
  expect(delegated.preview.errors).toEqual([{sheet:'Employees',row:2,column:'role_name',code:'NOT_PERMITTED'}]);
  const unknownRole=await f.upload('EMPLOYEES',employees('emp-x-login','No such role','B'));expect(unknownRole.preview.errors).toEqual([{sheet:'Employees',row:2,column:'role_name',code:'UNKNOWN_REFERENCE'}]);
  const outOfScope=await f.upload('EMPLOYEES',employees(null,null,null),(await f.importStaff([f.b.id],['imports.commit','finance.read','payroll.manage'])).token);expect(outOfScope.preview.errors).toEqual([{sheet:'Employees',row:2,column:'paying_branch_code',code:'OUT_OF_SCOPE'}]);
  const noLogin=await f.upload('EMPLOYEES',employees('emp-x-login',null,null),(await f.importStaff([f.a.id],['imports.commit','finance.read','payroll.manage'])).token);expect(noLogin.preview.errors).toEqual([{sheet:'Employees',row:2,column:'login_username',code:'NOT_PERMITTED'}]);
  expect((await f.database.pool.query<{n:number}>('select count(*)::int as n from employee_profiles')).rows[0].n).toBe(0);
 });
 it('employee import creates profiles, salaries, optional seat-reserving logins and SYSTEM role assignment through payroll services',async()=>{
  f=await importFixture();const role=await f.app.organization.save(f.root.token,'roles',{name:'Imported teacher',capabilities:['learning.read','learning.publish']});
  const batch=await f.upload('EMPLOYEES',{Employees:[['EMP-1','Employee One',5000,'2026-09','A','A-CASH','emp-one','Imported teacher','A, B'],['EMP-2','Employee Two','4,250.50','2026-08','B','B-CASH',null,null,null]]});
  expect(batch.preview.errors).toEqual([]);expect(batch.preview.creates).toMatchObject({employees:2,logins:1,assignments:1});expect(batch.preview.seats.employee).toMatchObject({required:1});
  const operationId=crypto.randomUUID(),result=await f.commit(batch,f.root.token,operationId);expect(result.creates).toMatchObject({employees:2,logins:1,assignments:1});expect(result.credentials).toEqual([{username:'emp-one',temporaryPassword:expect.any(String)}]);
  expect(await f.commit(batch,f.root.token,operationId)).toMatchObject({credentials:null});
  const profiles=(await f.database.pool.query<{employee_code:string;account_id:string|null;basic_salary:string;effective_month:string}>('select e.employee_code,e.account_id,h.basic_salary::text,h.effective_month::text from employee_profiles e join salary_history h on h.employee_id=e.id order by e.employee_code')).rows;
  expect(profiles).toEqual([{employee_code:'EMP-1',account_id:expect.any(String),basic_salary:'500000',effective_month:'2026-09-01'},{employee_code:'EMP-2',account_id:null,basic_salary:'425050',effective_month:'2026-08-01'}]);
  expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from seat_reservations where kind='EMPLOYEE' and released_at is null")).rows[0].n).toBe(1);
  const assignment=(await f.database.pool.query<{branches:string[];roles:string[]}>('select array(select branch_id from account_branches where account_id=$1 order by branch_id) as branches,array(select role_id from account_roles where account_id=$1) as roles',[profiles[0].account_id])).rows[0];
  expect(assignment.branches).toEqual([f.a.id,f.b.id].sort());expect(assignment.roles).toEqual([role.id]);
  const login=await f.app.auth.login('emp-one',result.credentials![0].temporaryPassword);expect(login.account.mustChangePassword).toBe(true);
  const roster=await f.app.payroll.roster(f.root.token,{month:'2026-09'});expect(roster.items.map(i=>i.employeeCode).sort()).toEqual(['EMP-1','EMP-2']);
  expect(await reconcileFinance(f.database)).toEqual([]);
 });
 it('validation rules: links, family size, row caps, template structure, classroom scope, capacity warnings, expiry, immutability and module gates',async()=>{
  f=await importFixture();
  const unlinked=await f.upload('PARENTS_CHILDREN',{Parents:[['P1','unlinked-parent','Parent','01000000001'],['P2','linked-parent','Parent','01000000002']],Children:[['UNL-1','Child','2022-01-01','A','C0',null,null,null],['UNL-2','Child','2022-01-01','A',null,null,null,null]],Links:[['P2','UNL-2','Mother',null,null,null,null],['P2','UNL-2','Mother',null,null,null,null],['P9','UNL-9','Mother','maybe',null,null,null]]});
  expect(unlinked.preview.errors).toEqual(expect.arrayContaining([{sheet:'Parents',row:2,column:'parent_key',code:'UNLINKED'},{sheet:'Children',row:2,column:'child_code',code:'UNLINKED'},{sheet:'Links',row:3,column:null,code:'DUPLICATE'},{sheet:'Links',row:4,column:'parent_key',code:'UNKNOWN_REFERENCE'},{sheet:'Links',row:4,column:'child_code',code:'UNKNOWN_REFERENCE'},{sheet:'Links',row:4,column:'can_read',code:'INVALID'}]));
  const bigFamily=await f.upload('PARENTS_CHILDREN',{Parents:[1,2,3,4,5].map(i=>[`P${i}`,`big-${i}`,`Parent ${i}`,'01000000001']),Children:[['BIG-1','Child','2022-01-01','A','C0',null,null,null]],Links:[1,2,3,4,5].map(i=>[`P${i}`,'BIG-1','Guardian',null,null,null,null])});
  expect(bigFamily.preview.errors).toEqual([{sheet:'Children',row:2,column:'child_code',code:'FAMILY_TOO_LARGE'}]);
  const tooMany=await f.upload('OPENING_BALANCES',{Balances:Array.from({length:IMPORT_LIMITS.maxRowsPerSheet+1},(_,i)=>['NOPE','TUITION','1',`Row ${i}`,'2026-01-01','2026-01-01'])});
  expect(tooMany.preview.errors.some(e=>e.code==='TOO_MANY_ROWS')).toBe(true);expect(tooMany.rowCount).toBe(IMPORT_LIMITS.maxRowsPerSheet);
  const structure=await f.upload('PARENTS_CHILDREN',{},f.root.token,book=>{book.removeWorksheet(book.getWorksheet('Links')!.id);book.getWorksheet('Parents')!.getCell(1,2).value='login';});
  expect(structure.preview.errors).toEqual(expect.arrayContaining([{sheet:'Links',row:null,column:null,code:'MISSING_SHEET'},{sheet:'Parents',row:1,column:null,code:'HEADER_MISMATCH'}]));expect(structure.preview.canCommit).toBe(false);
  // Classroom-scoped actors must place every child in one of their classrooms; capacity overflow is advisory only.
  const teacher=await f.importStaff([f.a.id],undefined,[f.classes[0].id],'CLASSROOM');
  const scoped=await f.upload('PARENTS_CHILDREN',{Parents:[['P1','scoped-parent','Parent','01000000001']],Children:[['SC-1','Child','2022-01-01','A',null,null,null,null],['SC-2','Child','2022-01-01','A','C1',null,null,null],['SC-3','Child','2022-01-01','A','C0',null,null,null],['SC-4','Child','2022-01-01','A','C0',null,null,null]],Links:[['P1','SC-1','Mother',null,null,null,null],['P1','SC-2','Mother',null,null,null,null],['P1','SC-3','Mother',null,null,null,null],['P1','SC-4','Mother',null,null,null,null]]},teacher.token);
  expect(scoped.preview.errors).toEqual([{sheet:'Children',row:2,column:'classroom_code',code:'OUT_OF_SCOPE'},{sheet:'Children',row:3,column:'classroom_code',code:'OUT_OF_SCOPE'}]);expect(scoped.preview.warnings).toEqual(['CAPACITY_EXCEEDED:C0']);
  // Expired previews cannot be committed; committed batches are immutable; disabling finance blocks monetary kinds.
  await f.child('EXP1');const fresh=await f.upload('OPENING_BALANCES',{Balances:[['EXP1','TUITION','10','Expiring','2026-01-01','2026-01-01']]});
  await f.database.pool.query("update import_batches set expires_at=now()-interval '1 minute' where id=$1",[fresh.id]);
  expect((await f.imports.batch(f.root.token,fresh.id)).status).toBe('EXPIRED');await expect(f.commit(fresh)).rejects.toMatchObject({messageKey:'imports.expired'});
  const committed=await f.upload('OPENING_BALANCES',{Balances:[['EXP1','TUITION','10','Committed','2026-01-01','2026-01-01']]});await f.commit(committed);
  await expect(f.database.pool.query("update import_batches set status='PREVIEWED',committed_at=null,operation_id=null,result=null where id=$1",[committed.id])).rejects.toMatchObject({code:'23514'});
  await expect(f.database.pool.query('delete from import_batches where id=$1',[committed.id])).rejects.toMatchObject({code:'23514'});
  const finance=(await f.licensing.modules(f.root.token)).find(m=>m.moduleKey==='FINANCE')!;await f.licensing.saveModuleSetting(f.root.token,'FINANCE',{expectedVersion:finance.version,enabled:false,reason:'Import gate check'});
  const options=await f.imports.options(f.root.token);expect(options.kinds.map(k=>[k.kind,k.enabled])).toEqual([['PARENTS_CHILDREN',true],['OPENING_BALANCES',false],['EMPLOYEES',false]]);
  await expect(f.imports.template(f.root.token,'OPENING_BALANCES')).rejects.toMatchObject({code:'FORBIDDEN'});
  const pending=await f.imports.batch(f.root.token,tooMany.id);expect(pending.preview?.errors).toEqual([{sheet:'Template',row:null,column:null,code:'NOT_PERMITTED'}]);await expect(f.commit(tooMany)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(await reconcileFinance(f.database)).toEqual([]);
 });
});
