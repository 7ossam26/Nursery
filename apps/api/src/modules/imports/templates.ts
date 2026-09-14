import ExcelJS from 'exceljs';
import { IMPORT_LIMITS,IMPORT_TEMPLATE_MARKER,importColumnHelp,importKindTitles,importSheetTitles,importTemplates,importText,type ImportKind } from '@nursery/contracts';
import { safeSpreadsheetText } from '../reports/render.js';

export type ReferenceData={branches:{code:string;name:string}[];classrooms:{branchCode:string;code:string;name:string}[];categories:{code:string;name:string;kind:string}[];accounts:{code:string;branchCode:string;name:string;type:string}[];roles:{name:string}[]};
const FONT={name:'Noto Sans Arabic',size:11};
const text=(v:string)=>safeSpreadsheetText(v);
function header(sheet:ExcelJS.Worksheet,keys:readonly string[],accent:string) {
 const row=sheet.addRow([...keys]);row.font={...FONT,bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:accent.replace('#','FF')}};
 // Codes, keys, usernames and mobiles stay text so leading zeros and identifiers survive spreadsheet editing.
 sheet.columns=keys.map(key=>({width:24,style:/mobile|code|key|username|name|month/.test(key)?{numFmt:'@'}:{}}));sheet.views=[{state:'frozen',ySplit:1}];
}
function section(sheet:ExcelJS.Worksheet,title:string,columns:string[],rows:string[][]) {
 const t=sheet.addRow([title]);t.font={...FONT,bold:true};const h=sheet.addRow(columns);h.font={...FONT,bold:true};
 for(const r of rows) sheet.addRow(r.map(text));sheet.addRow([]);
}
// Versioned, scope-filtered workbook. Header keys are the stable machine contract; the Guide sheet carries bilingual help.
export async function renderImportTemplate(kind:ImportKind,reference:ReferenceData,brand:{name:string;accent:string}) {
 const spec=importTemplates[kind],book=new ExcelJS.Workbook();book.creator=brand.name;book.title=`${importKindTitles[kind][0]} v${spec.version}`;
 for(const [name,keys] of Object.entries(spec.sheets) as [string,readonly string[]][]) {
  const sheet=book.addWorksheet(name);header(sheet,keys,brand.accent);
  // Range-level validation only: creating cells would make appended rows start after the validated range.
  for(const [key,i] of keys.map((k,i)=>[k,i] as const)) if(key.startsWith('can_')) {const column=sheet.getColumn(i+1).letter;(sheet as unknown as {dataValidations:{add(range:string,v:ExcelJS.DataValidation):void}}).dataValidations.add(`${column}2:${column}${IMPORT_LIMITS.maxRowsPerSheet+1}`,{type:'list',allowBlank:true,formulae:['"Y,N"']});}
 }
 const guide=book.addWorksheet('Guide');guide.columns=[{width:26},{width:70},{width:70}];
 guide.addRow([IMPORT_TEMPLATE_MARKER,importKindTitles[kind][0],importKindTitles[kind][1]]).font={...FONT,bold:true};
 guide.addRow(['version',String(spec.version),String(spec.version)]);
 guide.addRow(['limits',`At most ${IMPORT_LIMITS.maxRowsPerSheet} data rows per sheet and ${Math.floor(IMPORT_LIMITS.maxFileBytes/1024)} KB per file; larger data is split into separate reviewed batches. Plain values only: formulas are rejected. Never enter passwords; new logins receive one-time temporary passwords in the commit result.`,`بحد أقصى ${IMPORT_LIMITS.maxRowsPerSheet} صف بيانات في كل ورقة و${Math.floor(IMPORT_LIMITS.maxFileBytes/1024)} كيلوبايت للملف؛ البيانات الأكبر تتقسم لدفعات منفصلة تتراجع. قيم عادية بس: المعادلات مرفوضة. متكتبش كلمات سر أبدًا؛ حسابات الدخول الجديدة بتاخد كلمات سر مؤقتة لمرة واحدة في نتيجة التنفيذ.`]);
 guide.addRow([]);
 for(const [name,keys] of Object.entries(spec.sheets) as [string,readonly string[]][]) {
  guide.addRow([name,importText('en',importSheetTitles,name),importText('ar-EG',importSheetTitles,name)]).font={...FONT,bold:true};
  for(const key of keys) guide.addRow([key,importText('en',importColumnHelp,key),importText('ar-EG',importColumnHelp,key)]);
  guide.addRow([]);
 }
 const ref=book.addWorksheet('Reference');ref.columns=[{width:24},{width:24},{width:36},{width:16}];
 section(ref,'Branches / الفروع',['branch_code','name'],reference.branches.map(b=>[b.code,b.name]));
 if(kind==='PARENTS_CHILDREN') section(ref,'Classrooms / الفصول',['branch_code','classroom_code','name'],reference.classrooms.map(c=>[c.branchCode,c.code,c.name]));
 if(kind==='OPENING_BALANCES') section(ref,'Fee categories / فئات الرسوم',['category_code','name','kind'],reference.categories.map(c=>[c.code,c.name,c.kind]));
 if(kind==='EMPLOYEES') {section(ref,'Treasury accounts / حسابات الخزينة',['paying_account_code','branch_code','name','type'],reference.accounts.map(a=>[a.code,a.branchCode,a.name,a.type]));section(ref,'Assignable roles / الأدوار المتاحة',['role_name'],reference.roles.map(r=>[r.name]));}
 const meta=book.addWorksheet('Template');meta.addRow([IMPORT_TEMPLATE_MARKER,kind,spec.version]);meta.columns=[{width:20},{width:22},{width:10}];
 for(const sheet of book.worksheets) sheet.eachRow(row=>{row.font={...row.font,...FONT,bold:Boolean(row.font?.bold)};row.alignment={vertical:'top',wrapText:true};});
 return Buffer.from(await book.xlsx.writeBuffer());
}
export const templateFileName=(kind:ImportKind)=>`nursery-import-${kind.toLowerCase().replaceAll('_','-')}-v${importTemplates[kind].version}.xlsx`;
