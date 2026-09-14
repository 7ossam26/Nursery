import { expect,it } from 'vitest';
import { announcementInputSchema,communicationQuerySchema } from './communication.js';
it('bounds plain notice text, rejects extra recipient/scope fields and validates inclusive holiday dates',() => {
 const base={ operationId: crypto.randomUUID(),title: 'Notice',body: 'Please read',target: { kind: 'NURSERY' },acknowledgmentRequired: false };
 expect(announcementInputSchema.parse(base).holiday).toBeNull();
 expect(announcementInputSchema.safeParse({ ...base,target: { kind: 'BRANCH',id: crypto.randomUUID(),recipientIds: [] } }).success).toBe(false);
 expect(announcementInputSchema.safeParse({ ...base,target: { kind: 'CHILDREN',ids: [] } }).success).toBe(false);
 const id=crypto.randomUUID(); expect(announcementInputSchema.safeParse({ ...base,target: { kind: 'PARENTS',ids: [id,id] } }).success).toBe(false);
 expect(announcementInputSchema.safeParse({ ...base,holiday: { from: '2026-10-01',until: '2026-09-30' } }).success).toBe(false);
 expect(announcementInputSchema.safeParse({ ...base,body: 'x'.repeat(2001) }).success).toBe(false);
 expect(communicationQuerySchema.parse({})).toEqual({ limit: 20,offset: 0 }); expect(communicationQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
});
