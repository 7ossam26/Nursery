import { expect, it } from 'vitest';
import { onboardingInputSchema, guardianLinkInputSchema, documentInputSchema } from './children.js';
const family = { operationId: crypto.randomUUID(),guardians: [{ kind: 'NEW',username: 'parent-test',profile: { fullName: 'Test parent',mobile: '01000000000' } }],children: [{ child: { code: 'CHILD',fullName: 'Test child',birthDate: '2022-01-01',branchId: crypto.randomUUID(),classroomId: null,contacts: [] },links: [{ guardianIndex: 0,relationship: 'Parent',permissions: { read: true,finance: false,pickup: false,notify: true } }] }] };
it('requires complete parent/contact fields and valid per-child references without extra privilege fields',() => {
  expect(onboardingInputSchema.safeParse(family).success).toBe(true);
  expect(onboardingInputSchema.safeParse({ ...family,guardians: [{ ...family.guardians[0],profile: { fullName: 'Test parent',mobile: '(--- ---)' } }] }).success).toBe(false);
  expect(onboardingInputSchema.safeParse({ ...family,guardians: [{ kind: 'NEW',username: 'parent-test' }] }).success).toBe(false);
  expect(onboardingInputSchema.safeParse({ ...family,children: [{ ...family.children[0],links: [{ ...family.children[0].links[0],guardianIndex: 3 }] }] }).success).toBe(false);
  expect(onboardingInputSchema.safeParse({ ...family,roleIds: ['SYSTEM'] }).success).toBe(false);
  expect(guardianLinkInputSchema.safeParse({ expectedChildVersion: 1,accountId: crypto.randomUUID(),relationship: 'Parent',permissions: { ...family.children[0].links[0].permissions,manage: true },active: true }).success).toBe(false);
});
it('accepts generic named document metadata while rejecting paths, base64 errors and unapproved types',() => {
  const document = { name: 'Registration copy',expiresOn: null,mimeType: 'image/png',contentBase64: 'AAAA' };
  expect(documentInputSchema.safeParse(document).success).toBe(true);
  expect(documentInputSchema.safeParse({ ...document,storageKey: '../public' }).success).toBe(false);
  expect(documentInputSchema.safeParse({ ...document,mimeType: 'image/svg+xml' }).success).toBe(false);
  expect(documentInputSchema.safeParse({ ...document,contentBase64: 'broken!' }).success).toBe(false);
});
