import ExcelJS from 'exceljs';
import { IMPORT_LIMITS,IMPORT_TEMPLATE_MARKER,importTemplates,unsafeImportText,type ImportKind,type ImportRowError } from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import { inspectXlsxZip } from './zip-guard.js';

export type StagedCell=string|number|boolean|null;
export type StagedRow={row:number;values:Record<string,StagedCell>};
export type StagedWorkbook={sheets:Record<string,StagedRow[]>;errors:ImportRowError[]};
const wrongTemplate=()=>new SafeError('VALIDATION_ERROR','imports.templateVersion',false,409);
function plainText(cell:ExcelJS.Cell):string {
 const v=cell.value as unknown;
 if(typeof v==='string') return v;
 if(v&&typeof v==='object'&&'richText' in v) return (v as {richText:{text:string}[]}).richText.map(r=>r.text).join('');
 if(v&&typeof v==='object'&&'text' in v) {const t=(v as {text:unknown}).text;return typeof t==='string'?t:t&&typeof t==='object'&&'richText' in t?(t as {richText:{text:string}[]}).richText.map(r=>r.text).join(''):'';}
 return cell.text;
}
// Formula, error and unknown cells are rejected; typed dates become ISO date-only strings; text is trimmed and bounded.
function readCell(cell:ExcelJS.Cell,sheet:string,row:number,column:string,errors:ImportRowError[]):StagedCell {
 const T=ExcelJS.ValueType;
 switch(cell.type) {
  case T.Null: case T.Merge: return null;
  case T.Formula: errors.push({sheet,row,column,code:'FORMULA'});return null;
  case T.Error: errors.push({sheet,row,column,code:'UNSUPPORTED_CELL'});return null;
  case T.Number: return typeof cell.value==='number'&&Number.isFinite(cell.value)?cell.value:(errors.push({sheet,row,column,code:'INVALID'}),null);
  case T.Boolean: return Boolean(cell.value);
  case T.Date: {const d=cell.value as Date;if(!(d instanceof Date)||Number.isNaN(d.getTime())) {errors.push({sheet,row,column,code:'INVALID'});return null;}return d.toISOString().slice(0,10);}
  case T.String: case T.SharedString: case T.RichText: case T.Hyperlink: {
   const text=plainText(cell).trim();if(!text) return null;
   if(text.length>IMPORT_LIMITS.maxCellChars) {errors.push({sheet,row,column,code:'TOO_LONG'});return null;}
   if(unsafeImportText(text)) {errors.push({sheet,row,column,code:'FORMULA'});return null;}
   return text;
  }
  default: errors.push({sheet,row,column,code:'UNSUPPORTED_CELL'});return null;
 }
}
export async function parseImportWorkbook(kind:ImportKind,bytes:Buffer):Promise<StagedWorkbook> {
 inspectXlsxZip(bytes);
 const book=new ExcelJS.Workbook();
 try {await book.xlsx.load(bytes as unknown as ArrayBuffer);} catch {throw new SafeError('VALIDATION_ERROR','imports.unsupportedFile',false,400);}
 const spec=importTemplates[kind],meta=book.getWorksheet('Template');
 if(!meta||meta.getCell(1,1).text!==IMPORT_TEMPLATE_MARKER||meta.getCell(1,2).text!==kind||Number(meta.getCell(1,3).text)!==spec.version) throw wrongTemplate();
 const errors:ImportRowError[]=[],sheets:Record<string,StagedRow[]>={};
 for(const [name,keys] of Object.entries(spec.sheets) as [string,readonly string[]][]) {
  const sheet=book.getWorksheet(name);sheets[name]=[];
  if(!sheet) {errors.push({sheet:name,row:null,column:null,code:'MISSING_SHEET'});continue;}
  const head=sheet.getRow(1);
  const mismatch=keys.some((key,i)=>head.getCell(i+1).text.trim()!==key)||(head.cellCount>keys.length&&Array.from({length:head.cellCount-keys.length},(_,i)=>head.getCell(keys.length+i+1).text.trim()).some(Boolean));
  if(mismatch) {errors.push({sheet:name,row:1,column:null,code:'HEADER_MISMATCH'});continue;}
  const rows:StagedRow[]=[];let tooMany=false;
  sheet.eachRow({includeEmpty:false},(row,number)=>{
   if(number===1||tooMany) return;
   const values:Record<string,StagedCell>={};let any=false;const rowErrors:ImportRowError[]=[];
   keys.forEach((key,i)=>{const v=readCell(row.getCell(i+1),name,number,key,rowErrors);values[key]=v;if(v!==null) any=true;});
   if(!any&&!rowErrors.length) return;
   if(rows.length>=IMPORT_LIMITS.maxRowsPerSheet) {tooMany=true;errors.push({sheet:name,row:null,column:null,code:'TOO_MANY_ROWS'});return;}
   errors.push(...rowErrors);rows.push({row:number,values});
  });
  sheets[name]=rows;
 }
 return {sheets,errors};
}
