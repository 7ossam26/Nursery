import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addIsoDays, cairoIsoDate } from '@nursery/domain';
import { licensingFixture, defaultLimitsInput } from '../helpers/licensing.js';

describe('Phase 05 licensing, slots, and nursery settings with real PostgreSQL', () => {
  let f: Awaited<ReturnType<typeof licensingFixture>>;
  beforeAll(async () => { f = await licensingFixture(); }, 30000);
  afterAll(async () => { await f?.close(); });
  const currentVersion = async () => (await f.licensing.context(f.root.token)).limits!.version;

  it('estimate uses purchased capacities regardless of active accounts, and renewal payments never touch a treasury table', async () => {
    const saved = await f.licensing.saveLimits(f.root.token, { expectedVersion: null, value: defaultLimitsInput });
    expect(saved.version).toBe(1);
    const before = await f.licensing.context(f.root.token);
    expect(before.status).toBe('ACTIVE');
    expect(before.estimatePiastres).toBe(2 * 10_000 + 2 * 5_000);
    const parent = await f.licensing.provisionParent(f.root.token, { username: 'parent-estimate' });
    expect(parent.temporaryPassword.length).toBeGreaterThan(20);
    const after = await f.licensing.context(f.root.token);
    expect(after.estimatePiastres).toBe(before.estimatePiastres);
    expect(after.parentReserved).toBe(1);
    const payment = await f.licensing.recordRenewalPayment(f.root.token, { periodStart: '2026-01-01', periodEnd: '2026-01-31', amountPiastres: 30_000, method: 'Bank transfer' });
    expect(payment.amountPiastres).toBe(30_000);
    const noTreasuryTables = (await f.database.pool.query("select table_name from information_schema.tables where table_schema=current_schema() and (table_name ilike '%treasury%' or table_name ilike '%tuition%')")).rows;
    expect(noTreasuryTables).toEqual([]);
  });

  it('A04: two concurrent provisions for the final parent seat leave exactly one winner and an accurate count', async () => {
    const results = await Promise.allSettled([
      f.licensing.provisionParent(f.root.token, { username: 'parent-race-a' }),
      f.licensing.provisionParent(f.root.token, { username: 'parent-race-b' })
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'VALIDATION_ERROR', messageKey: 'licensing.capacityExceeded' } });
    const context = await f.licensing.context(f.root.token);
    expect(context.parentReserved).toBe(2);
    await expect(f.licensing.provisionParent(f.root.token, { username: 'parent-overflow' })).rejects.toMatchObject({ messageKey: 'licensing.capacityExceeded' });
    expect((await f.licensing.context(f.root.token)).parentReserved).toBe(2);
  });

  it('A05: deactivation/reactivation never frees a reservation; only explicit Superadmin release does, and restore reclaims a fresh seat and credential', async () => {
    const staff = await f.licensing.provisionStaff(f.root.token, { username: 'staff-release' });
    expect((await f.licensing.context(f.root.token)).employeeReserved).toBe(1);
    await f.licensing.deactivateAccount(f.root.token, staff.id, { reason: 'temporary leave' });
    expect((await f.licensing.context(f.root.token)).employeeReserved).toBe(1);
    expect((await f.database.pool.query('select status from accounts where id=$1', [staff.id])).rows[0].status).toBe('DISABLED');
    await f.licensing.reactivateAccount(f.root.token, staff.id, { reason: 'back early' });
    expect((await f.licensing.context(f.root.token)).employeeReserved).toBe(1);
    expect((await f.database.pool.query('select status from accounts where id=$1', [staff.id])).rows[0].status).toBe('ACTIVE');
    await f.licensing.releaseSeat(f.root.token, staff.id, { reason: 'left the nursery' });
    expect((await f.licensing.context(f.root.token)).employeeReserved).toBe(0);
    expect((await f.database.pool.query('select status from accounts where id=$1', [staff.id])).rows[0].status).toBe('RELEASED');
    await expect(f.licensing.releaseSeat(f.root.token, staff.id, { reason: 'again' })).rejects.toMatchObject({ messageKey: 'licensing.noActiveReservation' });
    await expect(f.licensing.reactivateAccount(f.root.token, staff.id, { reason: 'oops' })).rejects.toMatchObject({ messageKey: 'licensing.useRestoreAction' });
    const restored = await f.licensing.restoreAccount(f.root.token, staff.id, { reason: 'rehired' });
    expect(restored.temporaryPassword.length).toBeGreaterThan(20);
    expect((await f.licensing.context(f.root.token)).employeeReserved).toBe(1);
    expect((await f.database.pool.query('select status from accounts where id=$1', [staff.id])).rows[0].status).toBe('ACTIVE');
  });

  it('A07: grace/suspension follow Cairo business dates; root keeps support access while normal use is blocked, and renewal restores it without touching seats or history', async () => {
    const today = cairoIsoDate();
    const graceLimits = await f.licensing.saveLimits(f.root.token, { expectedVersion: await currentVersion(), value: { ...defaultLimitsInput, employeeCapacity: 10, parentCapacity: 10, validUntil: addIsoDays(today, -1), graceDays: 3 } });
    expect(graceLimits.version).toBeGreaterThan(1);
    expect((await f.licensing.context(f.root.token)).status).toBe('GRACE');
    const staff = await f.licensing.provisionStaff(f.root.token, { username: 'staff-during-grace' });
    const setupLogin = await f.app.auth.login('staff-during-grace', staff.temporaryPassword);
    expect(setupLogin.account.licenseStatus).toBe('GRACE');
    const permanentPassword = 'Staff during grace permanent phrase 2026';
    const permanent = await f.app.auth.changePassword(setupLogin.token, staff.temporaryPassword, permanentPassword);
    expect(permanent.account.mustChangePassword).toBe(false);
    const reservedBefore = (await f.licensing.context(f.root.token)).employeeReserved;
    const accountCountBefore = (await f.database.pool.query('select count(*)::int as count from accounts')).rows[0].count;

    await f.licensing.saveLimits(f.root.token, { expectedVersion: await currentVersion(), value: { ...defaultLimitsInput, employeeCapacity: 10, parentCapacity: 10, validUntil: addIsoDays(today, -10), graceDays: 1 } });
    expect((await f.licensing.context(f.root.token)).status).toBe('SUSPENDED');
    // Root support access remains available and unaffected.
    await expect(f.licensing.context(f.root.token)).resolves.toMatchObject({ status: 'SUSPENDED' });
    // The staff member's own permanent credential is rejected outright while suspended, not partially.
    await expect(f.app.auth.login('staff-during-grace', permanentPassword)).rejects.toMatchObject({ code: 'LICENSE_SUSPENDED' });
    // Superadmin cannot provision new accounts while suspended either, but nothing is lost.
    await expect(f.licensing.provisionStaff(f.root.token, { username: 'staff-blocked-provision' })).rejects.toMatchObject({ code: 'LICENSE_SUSPENDED' });
    expect((await f.licensing.context(f.root.token)).employeeReserved).toBe(reservedBefore);
    expect((await f.database.pool.query('select count(*)::int as count from accounts')).rows[0].count).toBe(accountCountBefore);

    await f.licensing.saveLimits(f.root.token, { expectedVersion: await currentVersion(), value: { ...defaultLimitsInput, employeeCapacity: 10, parentCapacity: 10, validUntil: addIsoDays(today, 365), graceDays: 7 } });
    expect((await f.licensing.context(f.root.token)).status).toBe('ACTIVE');
    // Renewal restores normal access immediately, without deleting history or changing slots.
    const restoredLogin = await f.app.auth.login('staff-during-grace', permanentPassword);
    expect(restoredLogin.account.licenseStatus).toBe('ACTIVE');
    expect((await f.licensing.context(f.root.token)).employeeReserved).toBe(reservedBefore);
  });

  it('A31: module settings have no branch column and enforce the finance catch-up preview workflow on the API', async () => {
    const columns = (await f.database.pool.query("select column_name from information_schema.columns where table_name='module_settings'")).rows.map((r) => r.column_name);
    expect(columns).not.toContain('branch_id');
    const finance = (await f.licensing.modules(f.root.token)).find((m) => m.moduleKey === 'FINANCE')!;
    expect(finance.enabled).toBe(true);
    const disablePreview = await f.licensing.previewModuleChange(f.root.token, 'FINANCE', { enabled: false });
    expect(disablePreview.requiresCatchupAcknowledgement).toBe(false);
    const disabled = await f.licensing.saveModuleSetting(f.root.token, 'FINANCE', { expectedVersion: finance.version, enabled: false, reason: 'temporary pause' });
    expect(disabled.enabled).toBe(false);
    await expect(f.licensing.saveModuleSetting(f.root.token, 'FINANCE', { expectedVersion: disabled.version, enabled: true, reason: 'resume' })).rejects.toMatchObject({ messageKey: 'licensing.catchupRequired' });
    const enablePreview = await f.licensing.previewModuleChange(f.root.token, 'FINANCE', { enabled: true });
    expect(enablePreview.requiresCatchupAcknowledgement).toBe(true);
    expect(enablePreview.missingPeriods).toEqual([]);
    const reenabled = await f.licensing.saveModuleSetting(f.root.token, 'FINANCE', { expectedVersion: disabled.version, enabled: true, reason: 'resume', catchupAcknowledged: true });
    expect(reenabled.enabled).toBe(true);
    const history = (await f.database.pool.query("select previous_enabled,new_enabled,catchup_previewed from module_settings_history where module_key='FINANCE' order by created_at")).rows;
    expect(history).toEqual([{ previous_enabled: true, new_enabled: false, catchup_previewed: false }, { previous_enabled: false, new_enabled: true, catchup_previewed: true }]);
  });

  it('A35: theme edits are contrast-validated server-side and branding is readable publicly before sign-in', async () => {
    const settings = await f.licensing.nurserySettings(f.root.token);
    expect(settings.theme.brandPink).toBe('#F13E93');
    const badTheme = { ...settings.theme, text: '#EEEEEE' };
    await expect(f.licensing.saveNurserySettings(f.root.token, { expectedVersion: settings.version, value: { name: settings.name, logoPath: null, contactPhone: null, contactEmail: null, theme: badTheme } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', messageKey: 'licensing.contrast' });
    expect((await f.licensing.nurserySettings(f.root.token)).version).toBe(settings.version);
    const saved = await f.licensing.saveNurserySettings(f.root.token, { expectedVersion: settings.version, value: { name: 'Sunshine Nursery', logoPath: null, contactPhone: '+20 100 000 0000', contactEmail: null, theme: settings.theme } });
    expect(saved.name).toBe('Sunshine Nursery');
    expect(saved.version).toBe(settings.version + 1);
    const branding = await f.licensing.branding();
    expect(branding.name).toBe('Sunshine Nursery');
  });

  it('delegated capabilities gate exactly their own actions; reserved licensing/seat/branding capabilities remain Superadmin-only', async () => {
    const role = await f.app.organization.save(f.root.token, 'roles', { name: 'Nursery operations lead', capabilities: ['users.manage_staff', 'users.create_parent', 'parents.block', 'modules.manage'] });
    const branch = await f.app.organization.save(f.root.token, 'branches', { code: 'OPS', name: 'Operations branch' });
    const operatorAccount = await f.licensing.provisionStaff(f.root.token, { username: 'operations-lead' });
    await f.app.organization.assign(f.root.token, operatorAccount.id, { expectedVersion: 1, roleIds: [role.id], branchIds: [branch.id], classroomIds: [], scopeMode: 'BRANCH' });
    const setup = await f.app.auth.login('operations-lead', operatorAccount.temporaryPassword);
    const operator = await f.app.auth.changePassword(setup.token, operatorAccount.temporaryPassword, 'Operations lead permanent phrase 2026');
    expect(operator.account.capabilities.slice().sort()).toEqual(['modules.manage', 'parents.block', 'users.create_parent', 'users.manage_staff'].sort());

    const createdParent = await f.licensing.provisionParent(operator.token, { username: 'parent-by-operator' });
    expect(createdParent.temporaryPassword.length).toBeGreaterThan(20);

    await expect(f.licensing.context(operator.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.licensing.releaseSeat(operator.token, operatorAccount.id, { reason: 'test' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const currentBranding = await f.licensing.nurserySettings(f.root.token);
    await expect(f.licensing.saveNurserySettings(operator.token, { expectedVersion: currentBranding.version, value: { name: 'x', logoPath: null, contactPhone: null, contactEmail: null, theme: currentBranding.theme } })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const attendance = (await f.licensing.modules(operator.token)).find((m) => m.moduleKey === 'ATTENDANCE')!;
    const toggled = await f.licensing.saveModuleSetting(operator.token, 'ATTENDANCE', { expectedVersion: attendance.version, enabled: false, reason: 'operator pause' });
    expect(toggled.enabled).toBe(false);
    await f.licensing.saveModuleSetting(f.root.token, 'ATTENDANCE', { expectedVersion: toggled.version, enabled: true, reason: 'restore' });

    // Phase 06 adds resource-scope enforcement: a capability alone cannot globally block an unlinked parent.
    await expect(f.licensing.blockAccount(operator.token, createdParent.id, { reason: 'unlinked target' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.app.children.onboard(f.root.token,{ operationId: crypto.randomUUID(),guardians: [{ kind: 'EXISTING',accountId: createdParent.id,profile: { fullName: 'Operations parent',mobile: '01000000000' } }],
      children: [{ child: { code: 'OPS-CHILD',fullName: 'Operations child',birthDate: '2022-01-01',branchId: branch.id,classroomId: null,contacts: [] },links: [{ guardianIndex: 0,relationship: 'Parent',permissions: { read: true,finance: false,pickup: false,notify: true } }] }] });
    await f.licensing.blockAccount(operator.token, createdParent.id, { reason: 'awaiting document', publicMessage: 'Please visit reception', untilDate: addIsoDays(cairoIsoDate(), 30) });
    expect((await f.database.pool.query('select status from accounts where id=$1', [createdParent.id])).rows[0].status).toBe('BLOCKED');
    await f.licensing.unblockAccount(operator.token, createdParent.id, { reason: 'document received' });
    expect((await f.database.pool.query('select status from accounts where id=$1', [createdParent.id])).rows[0].status).toBe('ACTIVE');
  });
});
