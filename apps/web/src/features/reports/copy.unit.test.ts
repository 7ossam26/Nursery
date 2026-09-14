import { it,expect } from 'vitest';
import { reportsEn,reportsAr } from './copy.js';
it('every reports UI message has complete Egyptian Arabic copy',()=>{expect(Object.keys(reportsEn).sort()).toEqual(Object.keys(reportsAr).sort());for(const v of Object.values(reportsAr))expect(v).toMatch(/[\u0600-\u06ff]/);});
