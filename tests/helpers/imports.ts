import ExcelJS from 'exceljs';
import type { ImportBatch,ImportKind } from '@nursery/contracts';
import { financeFixture } from './finance.js';

export type SheetRows=Record<string,(string|number|boolean|Date|null|{formula:string})[][]>;
// Fills a real downloaded template (Guide/Reference/Template sheets intact) so tests exercise the genuine file contract.
export async function fillTemplate(template:Buffer,rows:SheetRows,mutate?:(book:ExcelJS.Workbook)=>void):Promise<string> {
 const book=new ExcelJS.Workbook();await book.xlsx.load(template as unknown as ArrayBuffer);
 for(const [name,list] of Object.entries(rows)) {const sheet=book.getWorksheet(name);if(!sheet) throw new Error(`missing sheet ${name}`);for(const row of list) sheet.addRow(row);}
 mutate?.(book);
 return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
}
export async function importFixture(https=true) {
 const f=await financeFixture(https);
 try {
  const imports=f.app.imports;
  async function template(kind:ImportKind,token=f.root.token) {return (await imports.template(token,kind)).bytes;}
  async function upload(kind:ImportKind,rows:SheetRows,token=f.root.token,mutate?:(book:ExcelJS.Workbook)=>void):Promise<ImportBatch> {
   return imports.upload(token,{kind,fileName:`${kind.toLowerCase()}.xlsx`,contentBase64:await fillTemplate(await template(kind,token),rows,mutate)});
  }
  async function commit(batch:ImportBatch,token=f.root.token,operationId=crypto.randomUUID()) {
   return imports.commit(token,batch.id,{operationId,expectedPreviewHash:batch.previewHash});
  }
  async function importStaff(branchIds:string[],capabilities:Parameters<typeof f.financeStaff>[3]=['imports.commit','children.read','children.manage','guardians.manage','users.create_parent','finance.read','billing.manage','payroll.manage'],classroomIds:string[]=[],mode:'BRANCH'|'CLASSROOM'='BRANCH') {
   return f.financeStaff(branchIds,classroomIds,mode,capabilities);
  }
  return {...f,imports,template,upload,commit,importStaff};
 } catch(error) {await f.close();throw error;}
}
