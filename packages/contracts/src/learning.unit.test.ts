import { expect, it } from 'vitest';
import { checkpointPublicationSchema, checkpointCorrectionSchema, learningProgress, builtInMeanings, type DailySlot } from './learning.js';
it('progress is reporting completion: pending never completes, resolved and N/A do, empty hides',() => {
  const slot = (meaning: 'PENDING' | 'RESOLVED' | 'NOT_APPLICABLE',published: boolean) => ({ status: { meaning },event: published ? { id: 'published' } : null }) as Pick<DailySlot,'status' | 'event'>;
  expect(learningProgress([slot('PENDING',false),slot('PENDING',true),slot('RESOLVED',true),slot('NOT_APPLICABLE',true)])).toEqual({ completed: 2,total: 4,hidden: false });
  expect(learningProgress([])).toEqual({ completed: 0,total: 0,hidden: true });
  expect(builtInMeanings.ABSENT).toBe('RESOLVED'); expect(builtInMeanings.RESULT_PUBLISHED).toBe('RESOLVED');
  expect(builtInMeanings.AWAITING_RESULT).toBe('PENDING'); expect(builtInMeanings.NO_EXAM).toBe('NOT_APPLICABLE');
});
it('custom payloads only accept status/note with valid scope, revision and idempotency metadata',() => {
  const input = { childId: crypto.randomUUID(),date: '2026-09-14',definitionId: crypto.randomUUID(),statusId: crypto.randomUUID(),note: null,expectedVersion: 0,operationId: crypto.randomUUID() };
  expect(checkpointPublicationSchema.safeParse(input).success).toBe(true);
  for (const extra of [{ score: 0 },{ fields: {} },{ html: '<b>hi</b>' },{ expectedVersion: -1 },{ date: '2026-02-30' }]) expect(checkpointPublicationSchema.safeParse({ ...input,...extra }).success).toBe(false);
  expect(checkpointCorrectionSchema.safeParse({ ...input,expectedVersion: 1,reason: 'Verified with teacher' }).success).toBe(true);
  expect(checkpointCorrectionSchema.safeParse({ ...input,reason: ' ' }).success).toBe(false);
});
