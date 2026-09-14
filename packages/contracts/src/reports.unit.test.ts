import { it,expect } from 'vitest';
import { reportKinds,reportQuerySchema,reportExportInputSchema } from './reports.js';
import { reportTitles,reportText } from './report-copy.js';
it('strict report contracts enforce date order, row/offset caps and required export identity',()=>{
 const query={kind:'COLLECTIONS',from:'2026-09-01',to:'2026-09-30'};
 expect(reportQuerySchema.parse(query)).toMatchObject({limit:50,offset:0});
 for(const input of [{...query,limit:101},{...query,offset:100001},{...query,from:'2026-10-01'},{...query,kind:'MEALS'},{...query,anything:true}])expect(reportQuerySchema.safeParse(input).success).toBe(false);
 expect(reportExportInputSchema.safeParse({...query,format:'PDF'}).success).toBe(false);
 expect(reportExportInputSchema.parse({...query,format:'PDF',operationId:crypto.randomUUID()}).locale).toBe('en');
 for(const kind of reportKinds){expect(reportTitles[kind]).toHaveLength(2);expect(reportText('ar-EG',kind)).toMatch(/[\u0600-\u06ff]/);}
});
