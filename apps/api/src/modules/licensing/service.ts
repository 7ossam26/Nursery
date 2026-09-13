import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate, subscriptionAccessStatus } from '@nursery/domain';
import {
  saveLicenseLimitsSchema, renewalPaymentInputSchema, provisionInputSchema,
  releaseSeatInputSchema, restoreAccountInputSchema, deactivateInputSchema, reactivateInputSchema,
  blockAccountInputSchema, unblockAccountInputSchema, saveNurserySettingsSchema, moduleChangeInputSchema,
  moduleChangeImpacts, validateThemeContrast, estimatePeriodTotalPiastres, defaultTheme,
  type Capability, type LicenseLimits, type LicenseStatus, type LicenseContext, type ModuleKey, type ModuleSetting,
  type NurserySettings, type RenewalPayment, type SeatKind, type ProvisionResult, type Branding, type ModuleImpactPreview
} from '@nursery/contracts';
import { hashPassword, randomToken } from '../auth/crypto.js';
import { AUTH_DEFAULTS, type AuthService } from '../auth/service.js';
import { denied, stale, loadPolicy, requireCapability, type Policy } from '../organization/policy.js';
import { SafeError } from '../../errors.js';
import { GUARDIAN_SCOPE_LOCK, requireParentAdministration } from '../children/policy.js';

const LICENSE_LOCK = 7190501;

export class LicensingService {
  constructor(readonly auth: AuthService) {}

  // Mirrors OrganizationService.withPolicy: session/policy revalidated inside the same transaction as the work.
  async withPolicy<T>(token: string, work: (tx: Transaction, policy: Policy) => Promise<T>, options: { edit?: boolean; targetIds?: string[]; parentAction?: boolean } = {}): Promise<T> {
    try {
      return await this.auth.database.transaction(async (tx) => {
        await tx.query(options.edit ? 'select pg_advisory_xact_lock($1)' : 'select pg_advisory_xact_lock_shared($1)', [LICENSE_LOCK]);
        await tx.query('select pg_advisory_xact_lock_shared(7190401)');
        if (options.parentAction) await tx.query('select pg_advisory_xact_lock($1)',[GUARDIAN_SCOPE_LOCK]);
        const account = await this.auth.inTransaction(tx, token, options.targetIds);
        return work(tx, await loadPolicy(tx, account));
      });
    } catch (error) {
      if (['23505', '23503', '23514'].includes((error as { code?: string }).code ?? '')) throw new SafeError('VALIDATION_ERROR', 'licensing.conflict', false, 409);
      throw error;
    }
  }
  private async audit(tx: Transaction, p: Policy, event: string, targetId: string | null, before: unknown, after: unknown) {
    await tx.query('insert into licensing_audit_events(id,actor_id,event,target_id,before_data,after_data) values($1,$2,$3,$4,$5,$6)', [randomUUID(), p.account.id, event, targetId, JSON.stringify(before), JSON.stringify(after)]);
  }
  private async limitsRow(tx: Transaction): Promise<LicenseLimits | null> {
    return (await tx.query<LicenseLimits>(`select parent_capacity as "parentCapacity",employee_capacity as "employeeCapacity",
      parent_unit_price_piastres as "parentUnitPricePiastres",employee_unit_price_piastres as "employeeUnitPricePiastres",
      subscription_period as "subscriptionPeriod",starts_on::text as "startsOn",valid_until::text as "validUntil",grace_days as "graceDays",
      agreed_total_override_piastres as "agreedTotalOverridePiastres",agreed_total_override_reason as "agreedTotalOverrideReason",
      support_contact as "supportContact",version,updated_at as "updatedAt"
      from license_limits where singleton`)).rows[0] ?? null;
  }
  private status(limits: LicenseLimits | null): LicenseStatus {
    return limits === null ? 'NOT_CONFIGURED' : subscriptionAccessStatus(cairoIsoDate(), limits.validUntil, limits.graceDays);
  }
  private async activeCount(tx: Transaction, kind: SeatKind): Promise<number> {
    return (await tx.query<{ count: number }>('select count(*)::int as count from seat_reservations where kind=$1 and released_at is null', [kind])).rows[0].count;
  }

  // ---- License limits, status, and manual renewal payments (SYSTEM only) ----
  async context(token: string): Promise<LicenseContext> {
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'licensing.manage');
      const limits = await this.limitsRow(tx);
      const [parentReserved, employeeReserved, renewalPayments] = await Promise.all([
        this.activeCount(tx, 'PARENT'), this.activeCount(tx, 'EMPLOYEE'),
        tx.query<RenewalPayment>('select id,recorded_at as "recordedAt",period_start::text as "periodStart",period_end::text as "periodEnd",amount_piastres as "amountPiastres",method,note,recorded_by as "recordedBy" from license_renewal_payments order by recorded_at desc limit 50').then((r) => r.rows)
      ]);
      return { limits, status: this.status(limits), parentReserved, employeeReserved, estimatePiastres: limits ? estimatePeriodTotalPiastres(limits) : null, renewalPayments };
    });
  }
  async saveLimits(token: string, raw: unknown): Promise<LicenseLimits> {
    const input = saveLicenseLimitsSchema.parse(raw);
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'licensing.manage');
      const before = await this.limitsRow(tx);
      if ((before?.version ?? null) !== input.expectedVersion) throw stale();
      const v = input.value;
      if (before) {
        const [parentReserved, employeeReserved] = await Promise.all([this.activeCount(tx, 'PARENT'), this.activeCount(tx, 'EMPLOYEE')]);
        if (v.parentCapacity < parentReserved || v.employeeCapacity < employeeReserved) throw new SafeError('VALIDATION_ERROR', 'licensing.belowReserved', false, 409);
        await tx.query(`update license_limits set parent_capacity=$1,employee_capacity=$2,parent_unit_price_piastres=$3,employee_unit_price_piastres=$4,
          subscription_period=$5,starts_on=$6,valid_until=$7,grace_days=$8,agreed_total_override_piastres=$9,agreed_total_override_reason=$10,support_contact=$11,version=version+1,updated_at=now() where singleton`,
          [v.parentCapacity, v.employeeCapacity, v.parentUnitPricePiastres, v.employeeUnitPricePiastres, v.subscriptionPeriod, v.startsOn, v.validUntil, v.graceDays, v.agreedTotalOverridePiastres, v.agreedTotalOverrideReason, v.supportContact]);
      } else {
        await tx.query(`insert into license_limits(parent_capacity,employee_capacity,parent_unit_price_piastres,employee_unit_price_piastres,subscription_period,starts_on,valid_until,grace_days,agreed_total_override_piastres,agreed_total_override_reason,support_contact)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [v.parentCapacity, v.employeeCapacity, v.parentUnitPricePiastres, v.employeeUnitPricePiastres, v.subscriptionPeriod, v.startsOn, v.validUntil, v.graceDays, v.agreedTotalOverridePiastres, v.agreedTotalOverrideReason, v.supportContact]);
      }
      await this.audit(tx, p, 'licensing.limits_saved', null, before, v);
      return (await this.limitsRow(tx))!;
    }, { edit: true });
  }
  async recordRenewalPayment(token: string, raw: unknown): Promise<RenewalPayment> {
    const input = renewalPaymentInputSchema.parse(raw);
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'licensing.manage');
      const id = randomUUID();
      // Deliberately isolated from every child-fee/branch treasury table: this ledger never posts business cash.
      await tx.query('insert into license_renewal_payments(id,period_start,period_end,amount_piastres,method,note,recorded_by) values($1,$2,$3,$4,$5,$6,$7)', [id, input.periodStart, input.periodEnd, input.amountPiastres, input.method, input.note ?? null, p.account.id]);
      await this.audit(tx, p, 'licensing.renewal_recorded', null, null, input);
      return (await tx.query<RenewalPayment>('select id,recorded_at as "recordedAt",period_start::text as "periodStart",period_end::text as "periodEnd",amount_piastres as "amountPiastres",method,note,recorded_by as "recordedBy" from license_renewal_payments where id=$1', [id])).rows[0];
    }, { edit: true });
  }

  // ---- Seat-reserving provisioning: account row and reservation commit atomically or not at all ----
  private async reserveSeat(tx: Transaction, kind: SeatKind, accountId: string): Promise<void> {
    const limits = (await tx.query<{ parent_capacity: number; employee_capacity: number }>('select parent_capacity,employee_capacity from license_limits where singleton for update')).rows[0];
    if (!limits) throw new SafeError('VALIDATION_ERROR', 'licensing.notConfigured', false, 409);
    const capacity = kind === 'PARENT' ? limits.parent_capacity : limits.employee_capacity;
    if ((await this.activeCount(tx, kind)) >= capacity) throw new SafeError('VALIDATION_ERROR', 'licensing.capacityExceeded', false, 409);
    await tx.query('insert into seat_reservations(id,kind,account_id) values($1,$2,$3)', [randomUUID(), kind, accountId]);
  }
  requireUsable(p: Policy) {
    if (p.licenseStatus === 'SUSPENDED') throw new SafeError('LICENSE_SUSPENDED', 'licensing.suspended', false, 403);
    if (p.licenseStatus === 'NOT_CONFIGURED') throw new SafeError('VALIDATION_ERROR', 'licensing.notConfigured', false, 409);
  }
  private async provision(token: string, capability: Capability, kind: 'STAFF' | 'GUARDIAN', seatKind: SeatKind, raw: unknown): Promise<ProvisionResult> {
    const input = provisionInputSchema.parse(raw);
    return this.withPolicy(token, (tx,p) => this.provisionInTransaction(tx,p,capability,kind,seatKind,input));
  }
  // Reused by family onboarding; the caller owns the same license/policy locks and transaction.
  async provisionInTransaction(tx: Transaction, p: Policy, capability: Capability, kind: 'STAFF' | 'GUARDIAN', seatKind: SeatKind, raw: unknown): Promise<ProvisionResult> {
      const input = provisionInputSchema.parse(raw);
      requireCapability(p, capability);
      this.requireUsable(p);
      const id = randomUUID(); const temporaryPassword = randomToken();
      await tx.query('insert into accounts(id,kind,username_normalized,password_hash,temporary_expires_at) values($1,$2,$3,$4,$5)', [id, kind, input.username, await hashPassword(temporaryPassword), new Date(Date.now() + AUTH_DEFAULTS.temporaryMs)]);
      await this.reserveSeat(tx, seatKind, id);
      await this.audit(tx, p, `licensing.${kind.toLowerCase()}_provisioned`, id, null, { username: input.username });
      return { id, username: input.username, temporaryPassword };
  }
  async provisionStaff(token: string, raw: unknown) { return this.provision(token, 'users.manage_staff', 'STAFF', 'EMPLOYEE', raw); }
  async provisionParent(token: string, raw: unknown) { return this.provision(token, 'users.create_parent', 'GUARDIAN', 'PARENT', raw); }

  // ---- Explicit Superadmin release/restore: the only actions that ever free or reclaim a slot ----
  async releaseSeat(token: string, targetId: string, raw: unknown): Promise<void> {
    const input = releaseSeatInputSchema.parse(raw);
    await this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'seats.release');
      const reservation = (await tx.query<{ id: string; kind: SeatKind }>('select id,kind from seat_reservations where account_id=$1 and released_at is null for update', [targetId])).rows[0];
      if (!reservation) throw new SafeError('VALIDATION_ERROR', 'licensing.noActiveReservation', false, 409);
      await this.auth.changeStatusInTransaction(tx, p.account.id, targetId, { status: 'RELEASED', reason: input.reason });
      await tx.query('update seat_reservations set released_at=now(),released_by=$2,released_reason=$3 where id=$1', [reservation.id, p.account.id, input.reason]);
      await this.audit(tx, p, 'licensing.seat_released', targetId, { reservationId: reservation.id, kind: reservation.kind }, { reason: input.reason });
    }, { targetIds: [targetId] });
  }
  async restoreAccount(token: string, targetId: string, raw: unknown): Promise<{ temporaryPassword: string }> {
    const input = restoreAccountInputSchema.parse(raw);
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'seats.release');
      const target = (await tx.query<{ kind: 'STAFF' | 'GUARDIAN' | 'SYSTEM'; status: string }>('select kind,status from accounts where id=$1', [targetId])).rows[0];
      if (!target || target.kind === 'SYSTEM') throw denied();
      if (target.status !== 'RELEASED') throw new SafeError('VALIDATION_ERROR', 'licensing.notReleased', false, 409);
      await this.reserveSeat(tx, target.kind === 'STAFF' ? 'EMPLOYEE' : 'PARENT', targetId);
      await this.auth.changeStatusInTransaction(tx, p.account.id, targetId, { status: 'ACTIVE', reason: input.reason });
      const temporaryPassword = await this.auth.setTemporaryCredential(tx, targetId);
      await this.audit(tx, p, 'licensing.account_restored', targetId, { status: 'RELEASED' }, { status: 'ACTIVE' });
      return { temporaryPassword };
    }, { targetIds: [targetId] });
  }

  // ---- Deactivation/reactivation (staff) and temporary blocks (parents): never touch the seat reservation ----
  private async targetInfo(tx: Transaction, targetId: string): Promise<{ kind: 'STAFF' | 'GUARDIAN' | 'SYSTEM'; status: string }> {
    const row = (await tx.query<{ kind: 'STAFF' | 'GUARDIAN' | 'SYSTEM'; status: string }>('select kind,status from accounts where id=$1', [targetId])).rows[0];
    if (!row) throw denied();
    return row;
  }
  // A RELEASED account has no active reservation; only restoreAccount (Superadmin) may bring it back with a fresh one.
  private requireOrdinaryTransition(target: { kind: string; status: string }, expectedKind: 'STAFF' | 'GUARDIAN') {
    if (target.kind !== expectedKind) throw new SafeError('VALIDATION_ERROR', 'licensing.wrongAccountKind', false, 400);
    if (target.status === 'RELEASED') throw new SafeError('VALIDATION_ERROR', 'licensing.useRestoreAction', false, 409);
  }
  async deactivateAccount(token: string, targetId: string, raw: unknown): Promise<void> {
    const input = deactivateInputSchema.parse(raw);
    await this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'users.manage_staff');
      if (targetId === p.account.id) throw denied();
      this.requireOrdinaryTransition(await this.targetInfo(tx, targetId), 'STAFF');
      await this.auth.changeStatusInTransaction(tx, p.account.id, targetId, { status: 'DISABLED', reason: input.reason });
      await this.audit(tx, p, 'licensing.staff_deactivated', targetId, null, input);
    }, { targetIds: [targetId] });
  }
  async reactivateAccount(token: string, targetId: string, raw: unknown): Promise<void> {
    const input = reactivateInputSchema.parse(raw);
    await this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'users.manage_staff');
      this.requireOrdinaryTransition(await this.targetInfo(tx, targetId), 'STAFF');
      await this.auth.changeStatusInTransaction(tx, p.account.id, targetId, { status: 'ACTIVE', reason: input.reason });
      await this.audit(tx, p, 'licensing.staff_reactivated', targetId, null, input);
    }, { targetIds: [targetId] });
  }
  async blockAccount(token: string, targetId: string, raw: unknown): Promise<void> {
    const input = blockAccountInputSchema.parse(raw);
    await this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'parents.block');
      await requireParentAdministration(tx,p,targetId);
      this.requireOrdinaryTransition(await this.targetInfo(tx, targetId), 'GUARDIAN');
      await this.auth.changeStatusInTransaction(tx, p.account.id, targetId, { status: 'BLOCKED', reason: input.reason, publicMessage: input.publicMessage, untilDate: input.untilDate });
      await this.audit(tx, p, 'licensing.parent_blocked', targetId, null, { reason: input.reason, untilDate: input.untilDate ?? null });
    }, { targetIds: [targetId], parentAction: true });
  }
  async unblockAccount(token: string, targetId: string, raw: unknown): Promise<void> {
    const input = unblockAccountInputSchema.parse(raw);
    await this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'parents.block');
      await requireParentAdministration(tx,p,targetId);
      this.requireOrdinaryTransition(await this.targetInfo(tx, targetId), 'GUARDIAN');
      await this.auth.changeStatusInTransaction(tx, p.account.id, targetId, { status: 'ACTIVE', reason: input.reason });
      await this.audit(tx, p, 'licensing.parent_unblocked', targetId, null, input);
    }, { targetIds: [targetId], parentAction: true });
  }

  // ---- Nursery-wide module settings: identical for every branch, no per-branch column exists ----
  private async moduleRow(tx: Transaction, moduleKey: ModuleKey) {
    const row = (await tx.query<{ enabled: boolean; version: number }>('select enabled,version from module_settings where module_key=$1', [moduleKey])).rows[0];
    if (!row) throw denied();
    return row;
  }
  async modules(token: string): Promise<ModuleSetting[]> {
    return this.withPolicy(token, async (tx, p) => {
      if (!p.account.capabilities.includes('organization.read') && !p.account.capabilities.includes('modules.manage')) throw denied();
      return (await tx.query<ModuleSetting>('select module_key as "moduleKey",enabled,version,updated_at as "updatedAt" from module_settings order by module_key')).rows;
    });
  }
  async previewModuleChange(token: string, moduleKey: ModuleKey, raw: unknown): Promise<ModuleImpactPreview> {
    const input = z.object({ enabled: z.boolean() }).strict().parse(raw);
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'modules.manage');
      const current = await this.moduleRow(tx, moduleKey);
      return moduleChangeImpacts(moduleKey, input.enabled, current.enabled);
    });
  }
  async saveModuleSetting(token: string, moduleKey: ModuleKey, raw: unknown) {
    const input = moduleChangeInputSchema.parse(raw);
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'modules.manage');
      const current = await this.moduleRow(tx, moduleKey);
      if (current.version !== input.expectedVersion) throw stale();
      const impact = moduleChangeImpacts(moduleKey, input.enabled, current.enabled);
      if (impact.requiresCatchupAcknowledgement && !input.catchupAcknowledged) throw new SafeError('VALIDATION_ERROR', 'licensing.catchupRequired', false, 409);
      await tx.query('update module_settings set enabled=$2,version=version+1,updated_at=now() where module_key=$1', [moduleKey, input.enabled]);
      await tx.query('insert into module_settings_history(id,module_key,actor_id,previous_enabled,new_enabled,reason,catchup_previewed) values($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), moduleKey, p.account.id, current.enabled, input.enabled, input.reason, impact.requiresCatchupAcknowledgement]);
      await this.audit(tx, p, 'licensing.module_changed', null, { moduleKey, enabled: current.enabled }, { moduleKey, enabled: input.enabled });
      return { moduleKey, enabled: input.enabled, version: current.version + 1 };
    }, { edit: true });
  }

  // ---- Nursery branding: Superadmin-only edits, contrast-validated; a public read for unauthenticated pages ----
  private async settingsRow(tx: Transaction): Promise<NurserySettings | null> {
    return (await tx.query<NurserySettings>('select name,logo_path as "logoPath",contact_phone as "contactPhone",contact_email as "contactEmail",theme,version,updated_at as "updatedAt" from nursery_settings where singleton')).rows[0] ?? null;
  }
  async nurserySettings(token: string): Promise<NurserySettings> {
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'branding.manage');
      return (await this.settingsRow(tx))!;
    });
  }
  async saveNurserySettings(token: string, raw: unknown): Promise<NurserySettings> {
    const input = saveNurserySettingsSchema.parse(raw);
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'branding.manage');
      const before = await this.settingsRow(tx);
      if (!before || before.version !== input.expectedVersion) throw stale();
      const failures = validateThemeContrast(input.value.theme);
      if (failures.length) throw new SafeError('VALIDATION_ERROR', 'licensing.contrast', false, 400, failures.map((f) => `${f.pair} ${f.ratio.toFixed(2)}:1`).join('; '));
      await tx.query('update nursery_settings set name=$1,logo_path=$2,contact_phone=$3,contact_email=$4,theme=$5,version=version+1,updated_at=now() where singleton',
        [input.value.name, input.value.logoPath, input.value.contactPhone, input.value.contactEmail, JSON.stringify(input.value.theme)]);
      await this.audit(tx, p, 'licensing.branding_saved', null, before, input.value);
      return (await this.settingsRow(tx))!;
    }, { edit: true });
  }
  async branding(): Promise<Branding> {
    return this.auth.database.transaction(async (tx) => {
      const row = await this.settingsRow(tx);
      return row ? { name: row.name, logoPath: row.logoPath, theme: row.theme } : { name: 'Nursery', logoPath: null, theme: defaultTheme };
    });
  }

  // ---- Explicit audited Superadmin context, kept visually separate from ordinary administration ----
  async supportContext(token: string, reason: string) {
    const safeReason = z.string().trim().min(1).max(500).parse(reason);
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.access');
      const [limits, modules, branding, staffCount, parentCount] = await Promise.all([
        this.limitsRow(tx),
        tx.query<ModuleSetting>('select module_key as "moduleKey",enabled,version,updated_at as "updatedAt" from module_settings order by module_key').then((r) => r.rows),
        this.settingsRow(tx),
        tx.query<{ count: number }>("select count(*)::int as count from accounts where kind='STAFF'").then((r) => r.rows[0].count),
        tx.query<{ count: number }>("select count(*)::int as count from accounts where kind='GUARDIAN'").then((r) => r.rows[0].count)
      ]);
      await this.audit(tx, p, 'support.access', null, null, { reason: safeReason });
      return { status: this.status(limits), limits, modules, branding, staffCount, parentCount };
    });
  }
}
