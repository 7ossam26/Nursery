import { z } from 'zod';
import { bestForeground, contrastRatio, MINIMUM_TEXT_CONTRAST } from '@nursery/domain';
import { versionSchema } from './organization.js';
import { usernameSchema } from './identity.js';

export const subscriptionPeriodSchema = z.enum(['MONTHLY', 'YEARLY']);
export type SubscriptionPeriod = z.infer<typeof subscriptionPeriodSchema>;
export const licenseStatusSchema = z.enum(['NOT_CONFIGURED', 'ACTIVE', 'GRACE', 'SUSPENDED']);
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;
export const seatKindSchema = z.enum(['PARENT', 'EMPLOYEE']);
export type SeatKind = z.infer<typeof seatKindSchema>;

const isoDate = z.iso.date();
const reason = z.string().trim().min(1).max(500);
const piastresAmount = z.number().int().min(0).max(1_000_000_000);

export const licenseLimitsInputSchema = z.object({
  parentCapacity: z.number().int().min(0).max(100_000),
  employeeCapacity: z.number().int().min(0).max(100_000),
  parentUnitPricePiastres: piastresAmount,
  employeeUnitPricePiastres: piastresAmount,
  subscriptionPeriod: subscriptionPeriodSchema,
  startsOn: isoDate,
  validUntil: isoDate,
  graceDays: z.number().int().min(0).max(90),
  agreedTotalOverridePiastres: piastresAmount.nullable(),
  agreedTotalOverrideReason: z.string().trim().min(1).max(500).nullable(),
  supportContact: z.string().trim().max(500).nullable()
}).strict()
  .refine((v) => v.validUntil >= v.startsOn, { message: 'validUntil must not precede startsOn' })
  .refine((v) => (v.agreedTotalOverridePiastres === null) === (v.agreedTotalOverrideReason === null), { message: 'An override amount and its reason must both be present or both absent' });
export type LicenseLimitsInput = z.infer<typeof licenseLimitsInputSchema>;
export type LicenseLimits = LicenseLimitsInput & { version: number; updatedAt: string };
export const saveLicenseLimitsSchema = z.object({ expectedVersion: versionSchema.nullable(), value: licenseLimitsInputSchema }).strict();

// Commercial estimate always uses purchased capacities, never active-login counts (D28).
export function estimatePeriodTotalPiastres(limits: Pick<LicenseLimitsInput, 'parentCapacity' | 'employeeCapacity' | 'parentUnitPricePiastres' | 'employeeUnitPricePiastres' | 'agreedTotalOverridePiastres'>): number {
  const base = limits.parentCapacity * limits.parentUnitPricePiastres + limits.employeeCapacity * limits.employeeUnitPricePiastres;
  return limits.agreedTotalOverridePiastres ?? base;
}

export const renewalPaymentInputSchema = z.object({
  periodStart: isoDate, periodEnd: isoDate, amountPiastres: piastresAmount,
  method: z.string().trim().min(1).max(120), note: z.string().trim().max(500).nullable().optional()
}).strict().refine((v) => v.periodEnd >= v.periodStart, { message: 'periodEnd must not precede periodStart' });
export type RenewalPaymentInput = z.infer<typeof renewalPaymentInputSchema>;
export type RenewalPayment = RenewalPaymentInput & { id: string; recordedAt: string; recordedBy: string };

export const provisionInputSchema = z.object({ username: usernameSchema }).strict();
export type ProvisionInput = z.infer<typeof provisionInputSchema>;
export type ProvisionResult = { id: string; username: string; temporaryPassword: string };

export const releaseSeatInputSchema = z.object({ reason }).strict();
export const restoreAccountInputSchema = z.object({ reason }).strict();
export const deactivateInputSchema = z.object({ reason }).strict();
export const reactivateInputSchema = z.object({ reason }).strict();
export const blockAccountInputSchema = z.object({ reason, publicMessage: z.string().trim().max(500).optional(), untilDate: isoDate.optional() }).strict();
export const unblockAccountInputSchema = z.object({ reason }).strict();

export type SeatReservation = { kind: SeatKind; accountId: string; reservedAt: string };
export type LicenseContext = {
  limits: LicenseLimits | null;
  status: LicenseStatus;
  parentReserved: number;
  employeeReserved: number;
  estimatePiastres: number | null;
  renewalPayments: RenewalPayment[];
};

// Nursery branding theme, matching UX_AND_BRANDING.md tokens.
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Expected a 6-digit hex color');
export const themeInputSchema = z.object({
  brandPink: hexColor, softPink: hexColor, peach: hexColor, paleYellow: hexColor,
  text: hexColor, surface: hexColor, background: hexColor, strongPinkButton: hexColor,
  success: hexColor, warning: hexColor, error: hexColor
}).strict();
export type ThemeTokens = z.infer<typeof themeInputSchema>;
export const themeTokenKeys = Object.keys(themeInputSchema.shape) as (keyof ThemeTokens)[];
export const defaultTheme: ThemeTokens = {
  brandPink: '#F13E93', softPink: '#F891BB', peach: '#F9D0CD', paleYellow: '#FAFFCB',
  text: '#111827', surface: '#FFFFFF', background: '#FFF7FA', strongPinkButton: '#BE185D',
  success: '#166534', warning: '#92400E', error: '#B42318'
};

export type ContrastFailure = { pair: string; ratio: number };
// Server-side gate for A35: block unreadable text/surface pairs with the computed ratio as feedback.
export function validateThemeContrast(theme: ThemeTokens): ContrastFailure[] {
  const failures: ContrastFailure[] = [];
  const textPairs: [string, keyof ThemeTokens][] = [['surface', 'surface'], ['background', 'background'], ['peach', 'peach'], ['paleYellow', 'paleYellow'], ['softPink', 'softPink'], ['brandPink', 'brandPink']];
  for (const [label, key] of textPairs) {
    const ratio = contrastRatio(theme.text, theme[key]);
    if (ratio < MINIMUM_TEXT_CONTRAST) failures.push({ pair: `text/${label}`, ratio });
  }
  for (const [label, key] of [['success', 'success'], ['warning', 'warning'], ['error', 'error']] as const) {
    const ratio = contrastRatio(theme[key], theme.surface);
    if (ratio < MINIMUM_TEXT_CONTRAST) failures.push({ pair: `${label}/surface`, ratio });
  }
  const button = bestForeground(theme.strongPinkButton, [theme.surface, theme.text]);
  if (button.ratio < MINIMUM_TEXT_CONTRAST) failures.push({ pair: 'strongPinkButton foreground', ratio: button.ratio });
  return failures;
}

export const nurserySettingsInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  logoPath: z.string().trim().max(500).nullable(),
  contactPhone: z.string().trim().max(40).nullable(),
  contactEmail: z.string().trim().max(200).nullable(),
  theme: themeInputSchema
}).strict();
export type NurserySettingsInput = z.infer<typeof nurserySettingsInputSchema>;
export type NurserySettings = NurserySettingsInput & { version: number; updatedAt: string };
export const saveNurserySettingsSchema = z.object({ expectedVersion: versionSchema, value: nurserySettingsInputSchema }).strict();
export type Branding = { name: string; logoPath: string | null; theme: ThemeTokens };

export const moduleKeys = ['FINANCE', 'ATTENDANCE', 'EXAMS', 'HOMEWORK', 'HEALTH', 'PICKUP', 'INCIDENTS', 'CUSTOM_CHECKPOINTS', 'TRANSPORT', 'ACTIVITIES', 'PAYROLL'] as const;
export const moduleKeySchema = z.enum(moduleKeys);
export type ModuleKey = z.infer<typeof moduleKeySchema>;
export type ModuleSetting = { moduleKey: ModuleKey; enabled: boolean; version: number; updatedAt: string };
export type ModuleImpactPreview = { moduleKey: ModuleKey; enabled: boolean; impacts: string[]; requiresCatchupAcknowledgement: boolean; missingPeriods: { start: string; end: string }[] };
export const moduleChangeInputSchema = z.object({ expectedVersion: versionSchema, enabled: z.boolean(), reason, catchupAcknowledged: z.boolean().optional() }).strict();
export type ModuleChangeInput = z.infer<typeof moduleChangeInputSchema>;

// Documented impact of toggling a module, per ACCESS_AND_LICENSING.md dependency rules.
const moduleImpacts: Record<ModuleKey, string[]> = {
  FINANCE: ['Pauses new billing/payroll generation and disables paid transport, paid events, collections, and treasury reports.', 'Existing financial records and history are retained. Disabled billing periods need a separate exact catch-up approval in Billing agreements.'],
  ATTENDANCE: ['Removes the attendance checkpoint from today\'s daily bar and stops new attendance tasks.', 'Published attendance history is retained.'],
  CUSTOM_CHECKPOINTS: ['Hides custom checkpoints from current operations and guardian views.', 'Published custom checkpoint history is retained.'],
  EXAMS: ['Removes the exam checkpoint from today\'s daily bar and stops new exam tasks.', 'Published exam history is retained.'],
  HOMEWORK: ['Removes the homework checkpoint from today\'s daily bar and stops new homework tasks.', 'Published homework history is retained.'],
  HEALTH: ['Hides the parent health section and stops new health-entry tasks.', 'Existing emergency information remains in the restricted staff emergency panel (D26).'],
  PICKUP: ['Stops new authorized-person entries, restrictions and release recording for every branch.', 'Existing authorizations and date-only release history remain readable to authorized staff.'],
  INCIDENTS: ['Stops new incident reports and follow-up edits; parents lose the incident section.', 'Existing incident records and their notification events are retained for authorized staff.']
  ,TRANSPORT: ['Stops new bus subscriptions and permission changes. Paid transport also requires Finance.', 'Existing subscriptions and permitted history remain readable to authorized staff.']
  ,ACTIVITIES: ['Stops new trips, invitations, consent records and cancelations. Paid activities also require Finance.', 'Existing events, invitations and financial history remain readable to authorized staff.']
  ,PAYROLL: ['Stops new employee financial profiles, monthly snapshots, adjustments, advances and settlements. Finance is also required for cash actions.', 'Existing employee and payroll history remains readable to authorized finance staff.']
};
export function moduleChangeImpacts(moduleKey: ModuleKey, enabled: boolean, currentlyEnabled: boolean): ModuleImpactPreview {
  const requiresCatchupAcknowledgement = moduleKey === 'FINANCE' && enabled && !currentlyEnabled;
  // Module enablement does not approve charges. Exact scoped amount previews live in BillingService.
  return { moduleKey, enabled, impacts: moduleImpacts[moduleKey], requiresCatchupAcknowledgement, missingPeriods: [] };
}
