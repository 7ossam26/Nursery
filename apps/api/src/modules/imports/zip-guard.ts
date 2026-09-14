import { inflateRawSync } from 'node:zlib';
import { IMPORT_LIMITS } from '@nursery/contracts';
import { SafeError } from '../../errors.js';

const rejected=(key='imports.unsupportedFile')=>new SafeError('VALIDATION_ERROR',key,false,400);
// Names that can only mean macros, external data or embedded objects; a plain data template never contains them.
const FORBIDDEN=[/^xl\/vbaProject/i,/^xl\/externalLinks\//i,/^xl\/embeddings\//i,/^xl\/activeX/i,/^xl\/ctrlProps\//i,/\.bin$/i,/^xl\/pivotCache\//i,/^xl\/connections\.xml$/i,/^customXml\//i];
export type ZipInspection={entries:number;inflatedBytes:number};
// Every entry is inflated once here under hard output caps, so forged central-directory sizes, zip bombs and
// macro/external-link parts are rejected before the general-purpose workbook parser sees the bytes.
export function inspectXlsxZip(bytes:Buffer):ZipInspection {
 if(bytes.length<22||bytes.length>IMPORT_LIMITS.maxFileBytes||bytes.readUInt32LE(0)!==0x04034b50) throw rejected();
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-22-65535);i--) if(bytes.readUInt32LE(i)===0x06054b50) {eocd=i;break;}
 if(eocd<0) throw rejected();
 const entries=bytes.readUInt16LE(eocd+10),directoryOffset=bytes.readUInt32LE(eocd+16);
 if(entries!==bytes.readUInt16LE(eocd+8)||entries===0||entries>IMPORT_LIMITS.maxZipEntries||directoryOffset>=eocd) throw rejected();
 let cursor=directoryOffset,inflatedBytes=0,workbook=false;
 for(let n=0;n<entries;n++) {
  if(cursor+46>eocd||bytes.readUInt32LE(cursor)!==0x02014b50) throw rejected();
  const method=bytes.readUInt16LE(cursor+10),flags=bytes.readUInt16LE(cursor+8),compressed=bytes.readUInt32LE(cursor+20),uncompressed=bytes.readUInt32LE(cursor+24);
  const nameLength=bytes.readUInt16LE(cursor+28),extraLength=bytes.readUInt16LE(cursor+30),commentLength=bytes.readUInt16LE(cursor+32),localOffset=bytes.readUInt32LE(cursor+42);
  const name=bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
  // Encrypted entries, zip64 markers, absolute/parent paths and forbidden parts are all unsupported.
  if(flags&0x1||compressed===0xffffffff||uncompressed===0xffffffff||localOffset===0xffffffff||name.startsWith('/')||name.includes('..')||name.includes('\\')||FORBIDDEN.some(r=>r.test(name))) throw rejected();
  if(localOffset+30>directoryOffset||bytes.readUInt32LE(localOffset)!==0x04034b50) throw rejected();
  const dataStart=localOffset+30+bytes.readUInt16LE(localOffset+26)+bytes.readUInt16LE(localOffset+28);
  if(dataStart+compressed>directoryOffset) throw rejected();
  const data=bytes.subarray(dataStart,dataStart+compressed);
  let size:number;
  if(method===0) size=data.length;
  else if(method===8) {try {size=inflateRawSync(data,{maxOutputLength:IMPORT_LIMITS.maxEntryBytes}).length;} catch {throw rejected('imports.tooLarge');}}
  else throw rejected();
  if(size!==uncompressed||size>IMPORT_LIMITS.maxEntryBytes) throw rejected('imports.tooLarge');
  inflatedBytes+=size;if(inflatedBytes>IMPORT_LIMITS.maxInflatedBytes) throw rejected('imports.tooLarge');
  if(name==='xl/workbook.xml') workbook=true;
  cursor+=46+nameLength+extraLength+commentLength;
 }
 if(!workbook) throw rejected();
 return {entries,inflatedBytes};
}
