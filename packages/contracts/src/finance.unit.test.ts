import { it,expect } from 'vitest';
import { amountSchema,signedAmountSchema } from './finance.js';
import { egpToPiastres,splitPiastres,parsePiastres } from '@nursery/domain';
it('A14 exact split conserves piastres in stable child order and accepts unsafe-number-range strings',()=>{
 expect(splitPiastres(10001n,['c','a','b'])).toEqual([{childId:'a',amount:'3334'},{childId:'b',amount:'3334'},{childId:'c',amount:'3333'}]);
 expect(egpToPiastres('90071992547410.01')).toBe('9007199254741001');expect(amountSchema.parse('9223372036854775807')).toBe('9223372036854775807');expect(signedAmountSchema.parse('-9223372036854775807')).toBe('-9223372036854775807');
 for(const v of [1,1.2,'01','-0','1e3','0.1','9223372036854775808','1'.repeat(300)]) expect(amountSchema.safeParse(v).success).toBe(false);
 for(const v of ['1.001','1e3','01.00','NaN']) expect(()=>egpToPiastres(v)).toThrow();expect(()=>parsePiastres('9223372036854775808')).toThrow();
 expect(()=>splitPiastres(10n,['a','a'])).toThrow();expect(()=>splitPiastres(10n,[])).toThrow();
});
