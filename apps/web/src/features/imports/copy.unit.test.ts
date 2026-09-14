import { it,expect } from 'vitest';
import { importsEn,importsAr } from './copy.js';
import { importColumnHelp,importErrorHelp,importErrorCodes,importKindTitles,importTemplates } from '@nursery/contracts';
it('every imports UI message has complete Egyptian Arabic copy',()=>{expect(Object.keys(importsEn).sort()).toEqual(Object.keys(importsAr).sort());for(const v of Object.values(importsAr))expect(v).toMatch(/[\u0600-\u06ff]/);});
it('every template column, error code and kind has bilingual shared help',()=>{
 for(const kind of Object.keys(importTemplates) as (keyof typeof importTemplates)[]) {expect(importKindTitles[kind][1]).toMatch(/[\u0600-\u06ff]/);for(const keys of Object.values(importTemplates[kind].sheets)) for(const key of keys) {expect(importColumnHelp[key][0]).toBeTruthy();expect(importColumnHelp[key][1]).toMatch(/[\u0600-\u06ff]/);}}
 for(const code of importErrorCodes) expect(importErrorHelp[code][1]).toMatch(/[\u0600-\u06ff]/);
});
