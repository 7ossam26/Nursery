import { z } from 'zod';
import { parseDisplayDate } from '@nursery/domain';

const uuid=z.uuid().transform(v=>v.toLowerCase());
export const importKinds=['PARENTS_CHILDREN','OPENING_BALANCES','EMPLOYEES'] as const;
export type ImportKind=typeof importKinds[number];
export const importKindSchema=z.enum(importKinds);
// Bounded batches: larger files must be split into explicitly separate reviewed batches.
export const IMPORT_LIMITS={maxFileBytes:1024*1024,maxRowsPerSheet:500,maxCellChars:500,previewHours:24,maxFamilyGuardians:4,maxFamilyChildren:10,maxZipEntries:200,maxEntryBytes:8*1024*1024,maxInflatedBytes:24*1024*1024} as const;
export const IMPORT_TEMPLATE_MARKER='NURSERY_IMPORT';
// Stable machine header keys. A template's version changes whenever its columns or semantics change.
export const importTemplates={
 PARENTS_CHILDREN:{version:1,sheets:{Parents:['parent_key','username','full_name','mobile'],Children:['child_code','full_name','birth_date','branch_code','classroom_code','contact_name','contact_mobile','contact_relationship'],Links:['parent_key','child_code','relationship','can_read','can_finance','can_pickup','can_notify']}},
 OPENING_BALANCES:{version:1,sheets:{Balances:['child_code','category_code','amount_egp','description','issued_on','due_on']}},
 EMPLOYEES:{version:1,sheets:{Employees:['employee_code','full_name','basic_salary_egp','effective_month','paying_branch_code','paying_account_code','login_username','role_name','branch_codes']}}
} as const;
export type ImportSheetName<K extends ImportKind>=keyof typeof importTemplates[K]['sheets'] & string;
export const importUploadSchema=z.object({kind:importKindSchema,fileName:z.string().trim().min(1).max(200).refine(v=>!/[\\/:*?"<>|]/.test(v)&&!hasControlCharacters(v)),contentBase64:z.string().min(4).max(4*Math.ceil(IMPORT_LIMITS.maxFileBytes/3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict();
export const importCommitSchema=z.object({operationId:uuid,expectedPreviewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const importListQuerySchema=z.object({limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
export const importErrorCodes=['MISSING_SHEET','HEADER_MISMATCH','TOO_MANY_ROWS','REQUIRED','INVALID','TOO_LONG','FORMULA','UNSUPPORTED_CELL','DUPLICATE','EXISTS','UNKNOWN_REFERENCE','OUT_OF_SCOPE','UNLINKED','FAMILY_TOO_LARGE','CAPACITY','MODULE_DISABLED','NOT_PERMITTED'] as const;
export type ImportErrorCode=typeof importErrorCodes[number];
export type ImportRowError={sheet:string;row:number|null;column:string|null;code:ImportErrorCode};
export type ImportSeatSummary={capacity:number|null;reserved:number;required:number};
export type ImportPreview={
 templateVersion:number;rowCounts:Record<string,number>;errors:ImportRowError[];errorCount:number;canCommit:boolean;
 creates:{guardians:number;children:number;links:number;obligations:number;employees:number;logins:number;assignments:number};
 obligationsTotal:string;seats:{parent:ImportSeatSummary;employee:ImportSeatSummary};warnings:string[];
 rows:{sheet:string;row:number;key:string;label:string;detail:string}[];
};
export type ImportCredential={username:string;temporaryPassword:string};
export type ImportCommitResult={batchId:string;replayed:boolean;creates:ImportPreview['creates'];obligationsTotal:string;credentials:ImportCredential[]|null};
export type ImportBatch={id:string;kind:ImportKind;templateVersion:number;fileName:string;status:'PREVIEWED'|'COMMITTED'|'EXPIRED';rowCount:number;createdAt:string;expiresAt:string;committedAt:string|null;preview:ImportPreview|null;previewHash:string|null;result:ImportCommitResult|null};
export type ImportBatchSummary=Omit<ImportBatch,'preview'|'result'|'previewHash'>;
export type ImportOptions={kinds:{kind:ImportKind;templateVersion:number;enabled:boolean;sheets:Record<string,readonly string[]>}[];limits:typeof IMPORT_LIMITS;recent:ImportBatchSummary[]};

// Exact EGP text/number to integer piastres. Accepts "2,500", "2500.5", "2500.50"; rejects more than two decimals, signs and non-finite input.
export function parseEgpToPiastres(raw:string|number):string|null {
 const text=typeof raw==='number'?(Number.isFinite(raw)?raw.toFixed(2):''):raw.trim().replaceAll(',','').replace(/\s*(EGP|egp|ج\.?م\.?|جنيه)\s*$/u,'').trim();
 const match=/^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(text);
 if(!match)return null;
 if(typeof raw==='number'&&Math.abs(raw*100-Math.round(raw*100))>1e-6)return null;
 const whole=BigInt(match[1]),fraction=BigInt((match[2]??'').padEnd(2,'0'));
 return (whole*100n+fraction).toString();
}
export function parseImportBoolean(raw:string|boolean|number):boolean|null {
 if(typeof raw==='boolean')return raw;if(typeof raw==='number')return raw===1?true:raw===0?false:null;
 const v=raw.trim().toLowerCase();
 if(['y','yes','true','1','نعم','ايوه','أيوه'].includes(v))return true;if(['n','no','false','0','لا','لأ'].includes(v))return false;return null;
}
// Accepts ISO YYYY-MM-DD, the dd/MM/yyyy display form (D06) or a JS Date produced by a typed spreadsheet date cell.
export function parseImportDate(raw:string|Date):string|null {
 if(raw instanceof Date){if(Number.isNaN(raw.getTime()))return null;return raw.toISOString().slice(0,10);}
 const v=raw.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return z.iso.date().safeParse(v).success?v:null;
 return parseDisplayDate(v);
}
export function parseImportMonth(raw:string|Date):string|null {
 if(raw instanceof Date)return parseImportDate(raw)?.slice(0,7)??null;
 const v=raw.trim();if(/^\d{4}-(0[1-9]|1[0-2])$/.test(v))return v;const iso=parseImportDate(v);return iso?iso.slice(0,7):null;
}
// Formula-like or control-character text is rejected before it is stored or echoed back (A37).
export function hasControlCharacters(v:string):boolean {for(const c of v){const n=c.codePointAt(0)!;if(n<32&&n!==9&&n!==10&&n!==13)return true;if((n>=0x202a&&n<=0x202e)||(n>=0x2066&&n<=0x2069))return true;}return false;}
// Leading = or @ is always formula-like; leading + or - is allowed only for numeric text such as +20 mobiles or -5.
export function unsafeImportText(v:string):boolean {return /^\s*(?:[=@]|[-+](?=[^\d\s]))/u.test(v)||hasControlCharacters(v);}
