import { describe,expect,it } from 'vitest';
import { importCommitSchema,importUploadSchema,parseEgpToPiastres,parseImportBoolean,parseImportDate,parseImportMonth,unsafeImportText } from './imports.js';

describe('import contract parsers',()=>{
 it('converts EGP text and numbers to exact piastres and rejects imprecise or signed input',()=>{
  expect(parseEgpToPiastres('2,500.00')).toBe('250000');expect(parseEgpToPiastres('2500')).toBe('250000');expect(parseEgpToPiastres('2500.5')).toBe('250050');expect(parseEgpToPiastres(4250.5)).toBe('425050');expect(parseEgpToPiastres('0.01')).toBe('1');expect(parseEgpToPiastres('100.01 EGP')).toBe('10001');
  for(const bad of ['12.345','-5','abc','','1e3',' ']) expect(parseEgpToPiastres(bad)).toBeNull();
  expect(parseEgpToPiastres(12.345)).toBeNull();expect(parseEgpToPiastres(Number.NaN)).toBeNull();expect(parseEgpToPiastres(-1)).toBeNull();
 });
 it('parses bilingual booleans, ISO/display/typed dates and months',()=>{
  expect(['Y','yes','TRUE','1','نعم'].map(parseImportBoolean)).toEqual([true,true,true,true,true]);expect(['n','No','false','0','لا'].map(parseImportBoolean)).toEqual([false,false,false,false,false]);expect(parseImportBoolean('maybe')).toBeNull();expect(parseImportBoolean(true)).toBe(true);expect(parseImportBoolean(2)).toBeNull();
  expect(parseImportDate('2022-03-04')).toBe('2022-03-04');expect(parseImportDate('04/03/2022')).toBe('2022-03-04');expect(parseImportDate(new Date('2021-05-06T00:00:00Z'))).toBe('2021-05-06');expect(parseImportDate('2022-13-01')).toBeNull();expect(parseImportDate('31/02/2022')).toBeNull();expect(parseImportDate(new Date('x'))).toBeNull();
  expect(parseImportMonth('2026-09')).toBe('2026-09');expect(parseImportMonth('2026-13')).toBeNull();expect(parseImportMonth('01/09/2026')).toBe('2026-09');expect(parseImportMonth(new Date('2026-08-01T00:00:00Z'))).toBe('2026-08');
 });
 it('flags formula-like and control-character text while allowing international mobiles',()=>{
  expect(unsafeImportText('=SUM(A1)')).toBe(true);expect(unsafeImportText(' @cmd')).toBe(true);expect(unsafeImportText('-Child')).toBe(true);expect(unsafeImportText('+HYPERLINK')).toBe(true);expect(unsafeImportText('a\u0000b')).toBe(true);expect(unsafeImportText('\u202eabc')).toBe(true);
  expect(unsafeImportText('+201000000003')).toBe(false);expect(unsafeImportText('-5')).toBe(false);expect(unsafeImportText('Child One')).toBe(false);expect(unsafeImportText('محمد')).toBe(false);
 });
 it('upload and commit inputs are strict and bounded',()=>{
  expect(importUploadSchema.safeParse({kind:'EMPLOYEES',fileName:'staff.xlsx',contentBase64:'UEsDBA=='}).success).toBe(true);
  expect(importUploadSchema.safeParse({kind:'EMPLOYEES',fileName:'../staff.xlsx',contentBase64:'UEsDBA=='}).success).toBe(false);
  expect(importUploadSchema.safeParse({kind:'OTHER',fileName:'a.xlsx',contentBase64:'UEsDBA=='}).success).toBe(false);
  expect(importUploadSchema.safeParse({kind:'EMPLOYEES',fileName:'a.xlsx',contentBase64:'not base64!'}).success).toBe(false);
  expect(importCommitSchema.safeParse({operationId:crypto.randomUUID(),expectedPreviewHash:'a'.repeat(64)}).success).toBe(true);
  expect(importCommitSchema.safeParse({operationId:crypto.randomUUID(),expectedPreviewHash:'a'.repeat(64),extra:1}).success).toBe(false);
 });
});
