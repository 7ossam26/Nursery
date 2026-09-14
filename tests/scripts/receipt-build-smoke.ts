import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import type { Receipt } from '@nursery/contracts';

// Run after the workspace build. Exercises the emitted API module and its actual bundled font.
const compiled=await import(pathToFileURL(resolve('dist/modules/finance/receipts.js')).href);
const receipt:Receipt={id:crypto.randomUUID(),reference:'FIN-000000000001',branchId:crypto.randomUUID(),branchCode:'A',accountId:crypto.randomUUID(),accountCode:'A-CASH',method:'CASH',collectedOn:'2026-09-14',payerName:'محمد عبد الرحمن',externalReference:'',amount:'100',kind:'PAYMENT',lines:[{childId:crypto.randomUUID(),childCode:'BUILD',childName:'عبد الرحمن محمد',classroomId:null,installmentId:crypto.randomUUID(),categoryName:'Tuition',amount:'100'}]};
const bytes=await compiled.renderReceipt({receipt,nurseryName:'حضانة الاختبار',contactPhone:null,remaining:'100',balanceOn:'2026-09-14',accent:'#BE185D'});
const pdf=await PDFDocument.load(bytes,{updateMetadata:false});assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getCreationDate(),undefined);assert(bytes.length>10000);
console.log(`Compiled Arabic A4 receipt passed (${bytes.length} bytes).`);
