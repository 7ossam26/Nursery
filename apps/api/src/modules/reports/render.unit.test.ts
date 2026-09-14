import { it,expect } from 'vitest';
import ExcelJS from 'exceljs';
import { renderReportXlsx,renderReportPdf,safeSpreadsheetText } from './render.js';
it('escapes every spreadsheet injection prefix and preserves exact large integer money',async()=>{
 for(const s of ['=1+1','+SUM(A1)','-1+1','@SUM(A1)',' \t=1','\r\n+1'])expect(safeSpreadsheetText(s)).toBe(`'${s}`);
 expect(safeSpreadsheetText('طفل عربي')).toBe('طفل عربي');
 const bytes=await renderReportXlsx({operationId:crypto.randomUUID(),kind:'COLLECTIONS',from:'2026-09-01',to:'2026-09-30',locale:'ar-EG',format:'XLSX'}, {kind:'COLLECTIONS',from:'2026-09-01',to:'2026-09-30',rows:[{id:'1',date:'2026-09-14',branchId:'a',classroomId:null,childId:null,label:'=1+1',category:'@SUM(A1)',amount:'999999999999999999',details:{branch:'-formula',reason:'+formula'}}],totalCount:1,totals:{amount:'999999999999999999'},warnings:[]},{name:'=Brand',phone:null,accent:'#BE185D'});
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as never);const s=book.worksheets[0];expect(s.getCell('A1').value).toBe("'=Brand");expect(s.getCell('B8').value).toBe("'=1+1");expect(s.getCell('C8').value).toBe("'@SUM(A1)");expect(s.getCell('F8').value).toBe("'-formula");expect(s.getCell('D8').value).toBe('9999999999999999.99');expect(s.getCell('D5').value).toBe('9999999999999999.99');expect(s.getCell('E8').value).toBe("'999999999999999999");s.eachRow(r=>r.eachCell(c=>expect(c.type).not.toBe(ExcelJS.ValueType.Formula)));
});
it('rejects excessive PDF text complexity explicitly before rendering, never truncating rows',async()=>{
 const rows=Array.from({length:300},(_,n)=>({id:String(n),date:null,branchId:'a',classroomId:null,childId:null,label:'Realistic label',category:null,amount:null,details:{description:'A'.repeat(2000)}}));
 await expect(renderReportPdf({operationId:crypto.randomUUID(),kind:'INCIDENTS',from:'2026-09-01',to:'2026-09-30',locale:'en',format:'PDF'},{kind:'INCIDENTS',from:'2026-09-01',to:'2026-09-30',rows,totalCount:300,totals:{amount:'0'},warnings:[]},{name:'Nursery',phone:null,accent:'#BE185D'})).rejects.toMatchObject({messageKey:'reports.tooLarge'});
});
