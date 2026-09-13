import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFile, readdir, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { childFixture } from '../helpers/children.js';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';
import { defaultLinkPermissions, MAX_DOCUMENT_BYTES } from '@nursery/contracts';
describe('Phase 06 children, guardians, atomic onboarding and private documents',() => {
  let f: Awaited<ReturnType<typeof childFixture>>;
  beforeAll(async () => { f = await childFixture(); },30000);
  afterAll(async () => { await f?.close(); },30000);
  const request = (token: string,url: string,method: 'GET' | 'POST' | 'PUT' = 'GET',payload?: unknown) => f.app.inject({ method,url,headers: { cookie: `__Host-nursery_session=${token}`,origin: f.config.appOrigin,'content-type': 'application/json','x-csrf-token': keyedHash(f.config.sessionSecret,`session-csrf:${token}`) },...(payload === undefined ? {} : { payload }) });
  const detail = (id: string) => f.children.detail(f.root.token,id);
  it('A03: two guardians share one child record and one guardian switches between children without more seats',async () => {
    const input = f.family('SHARED'); input.guardians.push({ kind: 'NEW',username: 'parent-shared-two',profile: { fullName: 'Second guardian',mobile: '01000000002' } });
    input.children[0].links.push({ guardianIndex: 1,relationship: 'Father',permissions: { ...defaultLinkPermissions } });
    input.children.push({ child: { ...input.children[0].child,code: 'SIBLING',fullName: 'Active sibling' },links: [input.children[0].links[0]] });
    const result = await f.children.onboard(f.root.token,input); expect(result.credentials).toHaveLength(2); expect(result.childIds).toHaveLength(2);
    const first = await f.parent(result.guardianIds[0],result.credentials[0].username,result.credentials[0].temporaryPassword);
    const second = await f.parent(result.guardianIds[1],result.credentials[1].username,result.credentials[1].temporaryPassword);
    expect((await f.children.guardianChildren(first.token)).map((c) => c.id).sort()).toEqual([...result.childIds].sort());
    expect((await f.children.guardianChildren(second.token)).map((c) => c.id)).toEqual([result.childIds[0]]);
    const a = await f.children.guardianDetail(first.token,result.childIds[0]); const b = await f.children.guardianDetail(second.token,result.childIds[0]); expect(a.child).toEqual(b.child);
    await expect(f.children.guardianDetail(second.token,result.childIds[1])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.licensing.blockAccount(f.root.token,result.guardianIds[1],{ reason: 'Explicit guardian block',publicMessage: 'Contact nursery' });
    expect((await f.children.guardianDetail(first.token,result.childIds[0])).child).toEqual(a.child);
    await expect(f.children.guardianDetail(second.token,result.childIds[0])).rejects.toThrow();
    await f.licensing.unblockAccount(f.root.token,result.guardianIds[1],{ reason: 'Explicit restore' });
    expect(JSON.stringify(a)).not.toMatch(/username|mobile|branchId|created_at|password|Secondary contact/);
    const before = await f.licensing.context(f.root.token);
    const extra = f.family('EXTRA'); extra.guardians = [{ kind: 'EXISTING',accountId: result.guardianIds[0] }]; await f.children.onboard(f.root.token,extra);
    expect((await f.licensing.context(f.root.token)).parentReserved).toBe(before.parentReserved);
    const replay = await f.children.onboard(f.root.token,input); expect(replay.childIds).toEqual(result.childIds); expect(replay.credentials).toEqual([]); expect(replay.replayed).toBe(true);
    await expect(f.children.onboard(f.root.token,{ ...input,children: [{ ...input.children[0],child: { ...input.children[0].child,fullName: 'Different replay' } }] })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect((await f.database.pool.query("select count(*)::int as count from children where code in ('SHARED','SIBLING')")).rows[0].count).toBe(2);
  });
  it('A04: over-quota family transaction and audit failure leave no account/child/link/profile residue',async () => {
    const current = (await f.licensing.context(f.root.token)).parentReserved;
    const context = await f.licensing.context(f.root.token); const { version: _version,updatedAt: _updated,...value } = context.limits!;
    await f.licensing.saveLimits(f.root.token,{ expectedVersion: context.limits!.version,value: { ...value,parentCapacity: current+1 } });
    const input = f.family('QUOTA'); input.guardians.push({ kind: 'NEW',username: 'parent-quota-two',profile: { fullName: 'Quota second',mobile: '01000000002' } }); input.children[0].links.push({ guardianIndex: 1,relationship: 'Parent',permissions: defaultLinkPermissions });
    await expect(f.children.onboard(f.root.token,input)).rejects.toMatchObject({ messageKey: 'licensing.capacityExceeded' });
    expect((await f.database.pool.query("select id from accounts where username_normalized like 'parent-quota%'")).rowCount).toBe(0);
    expect((await f.database.pool.query("select id from children where code='QUOTA'")).rowCount).toBe(0); expect((await f.licensing.context(f.root.token)).parentReserved).toBe(current);
    await f.licensing.saveLimits(f.root.token,{ expectedVersion: (await f.licensing.context(f.root.token)).limits!.version,value: { ...value,parentCapacity: 20 } });
    await f.database.pool.query("alter table child_audit_events add constraint test_child_audit_failure check(event <> 'child.onboarded') not valid");
    try { await expect(f.children.onboard(f.root.token,f.family('ROLLBACK'))).rejects.toThrow(); }
    finally { await f.database.pool.query('alter table child_audit_events drop constraint test_child_audit_failure'); }
    expect((await f.database.pool.query("select id from accounts where username_normalized='parent-rollback'")).rowCount).toBe(0); expect((await f.database.pool.query("select id from children where code='ROLLBACK'")).rowCount).toBe(0);
  });
  it('A04: distinct actors compete for the final seat and only one entire family commits',async () => {
    const a = await f.staff([f.a.id]); const b = await f.staff([f.a.id]); const context = await f.licensing.context(f.root.token); const { version: _v,updatedAt: _u,...value } = context.limits!;
    await f.licensing.saveLimits(f.root.token,{ expectedVersion: context.limits!.version,value: { ...value,parentCapacity: context.parentReserved+1 } });
    const results = await Promise.allSettled([f.children.onboard(a.token,f.family('RACEA')),f.children.onboard(b.token,f.family('RACEB'))]); expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { messageKey: 'licensing.capacityExceeded' } });
    expect((await f.database.pool.query("select count(*)::int as count from children where code in ('RACEA','RACEB')")).rows[0].count).toBe(1);
    expect((await f.database.pool.query("select count(*)::int as count from guardian_child_links l join children c on c.id=l.child_id where c.code in ('RACEA','RACEB')")).rows[0].count).toBe(1);
    await f.licensing.saveLimits(f.root.token,{ expectedVersion: (await f.licensing.context(f.root.token)).limits!.version,value: { ...value,parentCapacity: 20 } });
  });
  it('A01: scoped search/detail/options/linking and duplicate errors cannot reveal foreign families',async () => {
    const a = await f.staff([f.a.id]); const teacher = await f.staff([f.a.id],[f.classes[1].id],'CLASSROOM');
    const foreign = await f.children.onboard(f.root.token,f.family('FOREIGN',f.b.id,f.classes[2].id));
    expect((await request(a.token,`/api/v1/children/${foreign.childIds[0]}`)).statusCode).toBe(403);
    expect((await request(a.token,'/api/v1/children?search=FOREIGN')).json().data.total).toBe(0);
    expect((await f.children.guardianOptions(a.token,{ search: 'FOREIGN' })).total).toBe(0);
    expect((await request(teacher.token,'/api/v1/children')).json().data.total).toBe(0);
    const guessed = f.family('GUESS'); guessed.guardians = [{ kind: 'EXISTING',accountId: foreign.guardianIds[0] }];
    expect((await request(a.token,'/api/v1/children/onboarding','POST',guessed)).statusCode).toBe(403);
    expect((await request(a.token,`/api/v1/children/${foreign.childIds[0]}/guardian-links`,'PUT',{ expectedChildVersion: 1,accountId: foreign.guardianIds[0],relationship: 'Parent',permissions: defaultLinkPermissions,active: true })).statusCode).toBe(403);
    const duplicate = f.family('DUPLICATE'); duplicate.guardians[0] = { kind: 'NEW',username: 'parent-foreign',profile: { fullName: 'Unknown duplicate',mobile: '01000000000' } };
    const error = await request(a.token,'/api/v1/children/onboarding','POST',duplicate); expect(error.statusCode).toBe(409); expect(error.body).not.toContain('Parent FOREIGN'); expect(error.json().messageKey).toBe('children.conflict');
    const badClass = f.family('BADCLASS',f.a.id,f.classes[2].id); expect((await request(a.token,'/api/v1/children/onboarding','POST',badClass)).statusCode).toBe(403);
    expect((await request(a.token,'/api/v1/children?limit=101')).statusCode).toBe(400);
  });
  it('pause/archive/move retain history, active sibling access and reservations; capacity is advisory',async () => {
    const shared = (await f.children.list(f.root.token,{ search: 'SHARED' })).items[0]; const sibling = (await f.children.list(f.root.token,{ search: 'SIBLING' })).items[0];
    const profile = (await detail(shared.id)).guardians[0]; const login = await f.app.auth.login(profile.username,`Permanent guardian secret ${profile.id}`);
    const seats = (await f.licensing.context(f.root.token)).parentReserved;
    await f.children.lifecycle(f.root.token,shared.id,{ expectedVersion: 1,status: 'PAUSED',reason: 'Pause reason INTERNAL',publicMessage: 'Contact reception' });
    const list = await f.children.guardianChildren(login.token); expect(list.find((c) => c.id===shared.id)?.publicMessage).toBe('Contact reception');
    await expect(f.children.guardianDetail(login.token,shared.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Pick the guardian linked to both siblings, independent of sorted display names.
    const common = (await detail(sibling.id)).guardians[0]; const commonSession = await f.app.auth.login(common.username,`Permanent guardian secret ${common.id}`);
    await expect(f.children.guardianDetail(commonSession.token,sibling.id)).resolves.toMatchObject({ child: { id: sibling.id } });
    expect(JSON.stringify(list)).not.toContain('INTERNAL');
    const moved = await f.children.moveClassroom(f.root.token,shared.id,{ expectedVersion: 2,classroomId: f.classes[1].id,reason: 'New classroom' }); expect(moved.version).toBe(3);
    const history = (await detail(shared.id)).classroomHistory; expect(history).toHaveLength(2); expect(history[1].previousClassroomId).toBe(f.classes[0].id);
    await f.children.lifecycle(f.root.token,shared.id,{ expectedVersion: 3,status: 'ACTIVE',reason: 'Resumed',publicMessage: null });
    await f.children.lifecycle(f.root.token,shared.id,{ expectedVersion: 4,status: 'ARCHIVED',reason: 'Left nursery',publicMessage: null });
    expect((await detail(shared.id)).statusHistory.map((h) => h.newStatus)).toEqual(['ACTIVE','PAUSED','ACTIVE','ARCHIVED']);
    expect((await f.children.guardianChildren(commonSession.token)).map((c) => c.id)).not.toContain(shared.id);
    expect((await f.licensing.context(f.root.token)).parentReserved).toBe(seats);
    expect((await f.database.pool.query("select payload from child_integration_events where child_id=$1 and kind='child.archived'",[shared.id])).rows[0].payload.feeAgreementAction).toBe('END_FUTURE_MONTHLY_GENERATION');
    const high = await f.children.onboard(f.root.token,f.family('CAPACITY')); expect(high.warnings).toContain('CAPACITY_EXCEEDED');
    await expect(f.database.pool.query('update child_classroom_history set reason=$1 where child_id=$2',['rewrite',shared.id])).rejects.toThrow();
    await expect(f.database.pool.query('update children set branch_id=$1,classroom_id=null where id=$2',[f.b.id,sibling.id])).rejects.toThrow();
    await expect(f.children.moveClassroom(f.root.token,sibling.id,{ expectedVersion: 1,classroomId: f.classes[2].id,reason: 'Foreign branch' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('live guardian link permissions and manual account blocks act independently; all active branches gate global blocks',async () => {
    const child = (await f.children.list(f.root.token,{ search: 'SIBLING' })).items[0]; const guardian = (await detail(child.id)).guardians[0]; const session = await f.app.auth.login(guardian.username,`Permanent guardian secret ${guardian.id}`);
    await expect(f.children.withGuardianResource(session.token,child.id,'finance',async () => 'financial data')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.children.linkGuardian(f.root.token,child.id,{ expectedChildVersion: child.version,accountId: guardian.id,relationship: 'Parent',permissions: { read: false,finance: false,pickup: false,notify: false },active: true });
    await expect(f.children.guardianDetail(session.token,child.id)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect((await f.children.guardianChildren(session.token)).map((c) => c.id)).not.toContain(child.id);
    const foreign = f.family('CROSS',f.b.id,f.classes[2].id); foreign.guardians = [{ kind: 'EXISTING',accountId: guardian.id }]; await f.children.onboard(f.root.token,foreign);
    const admin = await f.staff([f.a.id]); await expect(f.licensing.blockAccount(admin.token,guardian.id,{ reason: 'No all-branch authority' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.licensing.blockAccount(f.root.token,guardian.id,{ reason: 'Manual support block' }); await expect(f.children.guardianChildren(session.token)).rejects.toMatchObject({ code: 'ACCOUNT_BLOCKED' });
    const second = (await f.children.list(f.root.token,{ search: 'EXTRA' })).items[0]; expect(second.id).toBeTruthy();
    await f.licensing.unblockAccount(f.root.token,guardian.id,{ reason: 'Resolved' });
  });
  it('A37: validated PDF/PNG/JPEG round-trip privately; types, paths, foreign IDs and guardian administrative downloads fail',async () => {
    const child = (await f.children.list(f.root.token,{ search: 'CAPACITY' })).items[0]; const admin = await f.staff([f.a.id]); const foreign = await f.staff([f.b.id]);
    const png = await sharp({ create: { width: 2,height: 2,channels: 3,background: '#ffffff' } }).png().toBuffer();
    const jpg = await sharp(png).jpeg().toBuffer(); const pdf = await PDFDocument.create(); pdf.addPage(); const pdfBytes = Buffer.from(await pdf.save());
    const credential = (await f.children.onboard(f.root.token,f.family('DOCUMENT-OTHER'))).credentials[0]; const other = await f.parent(credential.id,credential.username,credential.temporaryPassword);
    for (const [mimeType,bytes] of [['image/png',png],['image/jpeg',jpg],['application/pdf',pdfBytes]] as const) {
      const upload = await request(admin.token,`/api/v1/children/${child.id}/documents`,'POST',{ name: 'Named administrative record',expiresOn: '2027-01-01',mimeType,contentBase64: bytes.toString('base64') }); expect(upload.statusCode).toBe(201);
      const id = upload.json().data.id; const download = await request(admin.token,`/api/v1/child-documents/${id}/download`); expect(download.statusCode).toBe(200); expect(download.headers['content-disposition']).toContain('attachment;'); expect(download.headers['cache-control']).toBe('no-store');
      expect((await request(foreign.token,`/api/v1/child-documents/${id}/download`)).statusCode).toBe(403);
      const parent = (await detail(child.id)).guardians[0];
      expect((await request(other.token,`/api/v1/child-documents/${id}/download`)).statusCode).toBe(403); expect(parent.id).toBeTruthy();
      await f.documents.retire(admin.token,id); await expect(f.documents.download(admin.token,id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    for (const [mimeType,bytes] of [['image/png',Buffer.from('<html>attack</html>')],['image/jpeg',png],['application/pdf',Buffer.from('%PDF-1.7\nnot a PDF\n%%EOF')],['image/svg+xml',Buffer.from('<svg/>')]] as const) expect((await request(admin.token,`/api/v1/children/${child.id}/documents`,'POST',{ name: 'Invalid',expiresOn: null,mimeType,contentBase64: bytes.toString('base64') })).statusCode).toBe(400);
    expect((await request(admin.token,`/api/v1/children/${child.id}/documents`,'POST',{ name: 'Path',expiresOn: null,mimeType: 'image/png',contentBase64: png.toString('base64'),storageKey: '../../public/attack' })).statusCode).toBe(400);
    expect((await request(admin.token,'/api/v1/child-documents/%2e%2e%2fsecret/download')).statusCode).toBe(400);
    expect((await request(admin.token,`/api/v1/child-documents/${crypto.randomUUID()}/download`)).statusCode).toBe(403);
    await expect(f.documents.upload(admin.token,child.id,{ name: 'Too large',expiresOn: null,mimeType: 'image/png',contentBase64: Buffer.alloc(MAX_DOCUMENT_BYTES+1).toString('base64') })).rejects.toThrow();
    const activePdf = await PDFDocument.create(); activePdf.addPage(); activePdf.catalog.set(PDFName.of('OpenAction'),activePdf.context.obj({ S: PDFName.of('JavaScript'),JS: PDFString.of('alert(1)') }));
    await expect(f.documents.upload(admin.token,child.id,{ name: 'Script',expiresOn: null,mimeType: 'application/pdf',contentBase64: Buffer.from(await activePdf.save()).toString('base64') })).rejects.toMatchObject({ messageKey: 'children.invalidDocument' });
  });
  it('document rollback removes candidate bytes and conservative cleanup removes only old unreferenced safe keys',async () => {
    const child = (await f.children.list(f.root.token,{ search: 'CAPACITY' })).items[0]; const png = await sharp({ create: { width: 1,height: 1,channels: 3,background: '#fff' } }).png().toBuffer(); const root = join(f.config.privateFilesDir,'child-documents');
    const before = await readdir(root); await f.database.pool.query("alter table child_audit_events add constraint test_document_audit_failure check(event <> 'document.uploaded') not valid");
    try { await expect(f.documents.upload(f.root.token,child.id,{ name: 'Rollback document',expiresOn: null,mimeType: 'image/png',contentBase64: png.toString('base64') })).rejects.toThrow(); } finally { await f.database.pool.query('alter table child_audit_events drop constraint test_document_audit_failure'); }
    expect(await readdir(root)).toEqual(before);
    const stale = join(root,`${crypto.randomUUID()}.blob`); const recent = join(root,`${crypto.randomUUID()}.blob`); const unknown = join(root,'do-not-delete.txt');
    await writeFile(stale,png); await writeFile(recent,png); await writeFile(unknown,'unrelated'); await utimes(stale,new Date(0),new Date(0));
    expect(await f.documents.cleanup(f.root.token)).toEqual({ removed: 1 }); expect(await readFile(recent)).toEqual(png); expect((await readdir(root)).length).toBe(before.length+2); expect(await readFile(unknown,'utf8')).toBe('unrelated');
  });
  it('existing-only onboarding needs no provisioning capability and still respects installation suspension',async () => {
    const account = await f.account(); const role = await f.app.organization.save(f.root.token,'roles',{ name: 'Existing family clerk',capabilities: ['children.read','children.manage','guardians.manage'] });
    await f.app.organization.assign(f.root.token,account.id,{ expectedVersion: 1,roleIds: [role.id],branchIds: [f.a.id],classroomIds: [],scopeMode: 'BRANCH' });
    const clerk = await f.app.auth.login(account.username,account.password);
    const parent = (await f.children.guardianOptions(f.root.token,{ search: 'parent-capacity' })).items[0]; const input = f.family('EXISTING-ONLY'); input.guardians=[{ kind: 'EXISTING',accountId: parent.id }];
    const before = await f.licensing.context(f.root.token); await f.children.onboard(clerk.token,input); expect((await f.licensing.context(f.root.token)).parentReserved).toBe(before.parentReserved);
    const { version: _v,updatedAt: _u,...value } = before.limits!;
    await f.licensing.saveLimits(f.root.token,{ expectedVersion: before.limits!.version,value: { ...value,startsOn: '2000-01-01',validUntil: '2000-01-31',graceDays: 0 } });
    try { await expect(f.children.onboard(f.root.token,{ ...input,operationId: crypto.randomUUID(),children: [{ ...input.children[0],child: { ...input.children[0].child,code: 'SUSPENDED-NEW' } }] })).rejects.toMatchObject({ code: 'LICENSE_SUSPENDED' }); }
    finally { await f.licensing.saveLimits(f.root.token,{ expectedVersion: (await f.licensing.context(f.root.token)).limits!.version,value }); }
    expect((await f.database.pool.query("select 1 from children where code='SUSPENDED-NEW'")).rowCount).toBe(0);
  });
  it('profile edits require all linked scopes; current-session moves and stale writers retain correct history',async () => {
    const input = f.family('EDIT'); const created = await f.children.onboard(f.root.token,input); const id = created.childIds[0]; const guardian = (await detail(id)).guardians[0];
    const teacher = await f.staff([f.a.id],[f.classes[0].id],'CLASSROOM');
    await f.children.updateGuardian(f.root.token,guardian.id,{ expectedVersion: 1,profile: { fullName: 'Edited guardian',mobile: '01000000003' } });
    const before = await detail(id); const results = await Promise.allSettled([
      f.children.update(f.root.token,id,{ expectedVersion: 1,fullName: 'Edited child',birthDate: '2022-02-02',contacts: [] }),
      f.children.update(f.root.token,id,{ expectedVersion: 1,fullName: 'Concurrent overwrite',birthDate: '2022-02-02',contacts: [] }) ]);
    expect(results.filter((r) => r.status==='fulfilled')).toHaveLength(1); expect(results.find((r) => r.status==='rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    const after = await detail(id); expect(after.contacts).toEqual([]); expect(after.statusHistory).toEqual(before.statusHistory); expect(after.classroomHistory).toEqual(before.classroomHistory);
    await f.children.moveClassroom(f.root.token,id,{ expectedVersion: 2,classroomId: f.classes[1].id,reason: 'Move to other teacher' });
    await expect(f.children.detail(teacher.token,id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const cross = f.family('EDIT-CROSS',f.b.id,f.classes[2].id); cross.guardians=[{ kind: 'EXISTING',accountId: guardian.id }]; await f.children.onboard(f.root.token,cross);
    const limited = await f.staff([f.a.id]); await expect(f.children.updateGuardian(limited.token,guardian.id,{ expectedVersion: 2,profile: { fullName: 'Unsafe global edit',mobile: '01000000003' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await detail(id)).guardians[0].fullName).toBe('Edited guardian');
    await expect(f.database.pool.query("insert into seat_reservations(id,kind,account_id) values($1,'EMPLOYEE',$2)",[crypto.randomUUID(),guardian.id])).rejects.toThrow();
    const noClass = await f.children.onboard(f.root.token,f.family('NOCLASS',f.a.id,null));
    await expect(f.children.withPolicy(f.root.token,(tx,p) => f.children.activeClassroomChild(tx,p,noClass.childIds[0],'children.read'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
