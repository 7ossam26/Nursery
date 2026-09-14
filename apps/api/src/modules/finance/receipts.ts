import { dirname,resolve } from 'node:path';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import sharp from 'sharp';
import { PDFDocument,rgb } from 'pdf-lib';
import type { Receipt } from '@nursery/contracts';
import { cairoIsoDate,formatDateOnly,formatEgp,piastres } from '@nursery/domain';
import type { PaymentService } from './payments.js';
import { financeScope } from './core.js';

const fontfile=resolve(dirname(createRequire(import.meta.url).resolve('@nursery/api/package.json')),'assets/fonts/NotoSansArabic.ttf');
const escape=(text:string)=>Array.from(text).filter(character=>{
 const point=character.codePointAt(0)!;
 return (point>=32||point===9||point===10)&&!(point>=0x202a&&point<=0x202e)&&!(point>=0x2066&&point<=0x2069);
}).join('').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const money=(value:string)=>formatEgp(piastres(BigInt(value)));
export type ReceiptPrintData={receipt:Receipt;nurseryName:string;contactPhone:string|null;remaining:string;balanceOn:string;accent:string};

// Pango shapes and lays out Arabic/bidirectional text with a bundled OFL font. Text is rendered
// at 300 dpi before embedding, so PDFs do not depend on the viewer's fonts or shaping engine.
export async function renderReceipt(data:ReceiptPrintData) {
 await access(fontfile);
 const pdf=await PDFDocument.create({updateMetadata:false});pdf.setTitle(data.receipt.reference);pdf.setSubject('Nursery collection receipt');
 const width=595.276,height=841.89,margin=42,content=width-margin*2;let page=pdf.addPage([width,height]),y=height-margin;
 async function paragraph(text:string,size=11,align:'left'|'right'|'centre'='left',gap=8) {
  const {data:bytes,info}=await sharp({text:{text:`<span foreground="#111827">${escape(text)}</span>`,font:`Noto Sans Arabic ${size}`,fontfile,width:Math.floor(content*300/72),dpi:300,rgba:true,align,wrap:'word-char'}}).png().toBuffer({resolveWithObject:true});
  const h=info.height*72/300,w=info.width*72/300;
  if(y-h<margin+24) {page=pdf.addPage([width,height]);y=height-margin;}
  const image=await pdf.embedPng(bytes);page.drawImage(image,{x:margin+(align==='right'?content-w:align==='centre'?(content-w)/2:0),y:y-h,width:w,height:h});y-=h+gap;
 }
 await paragraph(data.nurseryName,19,'centre',12);
 await paragraph('إيصال تحصيل / Collection receipt',15,'centre',16);
 const color=data.accent.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255);
 page.drawRectangle({x:margin,y:y-2,width:content,height:2,color:rgb(color[0],color[1],color[2])});y-=18;
 await paragraph(`Receipt / رقم الإيصال: ${data.receipt.reference}`);
 await paragraph(`Collection date / تاريخ التحصيل: ${formatDateOnly(data.receipt.collectedOn)}`);
 await paragraph(`Payer / اللي دفع: ${data.receipt.payerName}`);
 await paragraph(`Branch / الفرع: ${data.receipt.branchCode}    Account / الحساب: ${data.receipt.accountCode}`);
 const methods={CASH:'نقدي / Cash',BANK:'بنك / Bank',WALLET:'محفظة / Wallet'};
 await paragraph(`Method / طريقة التحصيل: ${methods[data.receipt.method]}`);
 if(data.receipt.externalReference) await paragraph(`External reference / المرجع الخارجي: ${data.receipt.externalReference}`);
 await paragraph(`Received / المبلغ المستلم: ${money(data.receipt.amount)}`,14,'right',16);
 await paragraph(data.receipt.kind==='CREDIT'?'رصيد مقدم منفصل / Separately confirmed credit':'تفاصيل السداد / Settlement details',13,'right');
 for(const line of data.receipt.lines) {
  await paragraph(`${line.childCode} - ${line.childName}\n${line.categoryName}\n${money(line.amount)}`,11,'right',12);
 }
 await paragraph(`${data.receipt.kind==='CREDIT'?'Available credit / الرصيد المقدم المتاح':'Remaining in permitted child accounts / المتبقي في حسابات الأطفال المسموح بعرضها'}: ${money(data.remaining)}`,12,'right');
 await paragraph(`Balance date / تاريخ الرصيد: ${formatDateOnly(data.balanceOn)}`,10,'right');
 if(data.contactPhone) await paragraph(`Contact the nursery / كلم إدارة الحضانة: ${data.contactPhone}`,10,'right');
 await paragraph('Recorded external payment; the app does not initiate a transfer.\nتحصيل اتسجل خارج البرنامج؛ البرنامج مش بيحول فلوس.',9,'right');
 // Every page gets a footer; no technical audit timestamps, actor IDs, recipient lists or internal notes.
 const pages=pdf.getPages();for(let i=0;i<pages.length;i++) {
  const bytes=await sharp({text:{text:escape(`${data.receipt.reference} | ${i+1} / ${pages.length}`),font:'Noto Sans Arabic 8',fontfile,dpi:300,rgba:true}}).png().toBuffer();const image=await pdf.embedPng(bytes);const dimensions=image.scale(72/300);
  pages[i].drawImage(image,{x:margin,y:22,width:dimensions.width,height:dimensions.height});
 }
 return Buffer.from(await pdf.save());
}
export class ReceiptService {
 constructor(readonly payments:PaymentService) {}
 async download(token:string,id:string) {
  return this.payments.core.children.withPolicy(token,async(tx,p)=>{
   const receipt=await this.payments.receiptInTransaction(tx,p,id);
   const brand=(await tx.query<{name:string;phone:string|null;accent:string}>("select name,contact_phone as phone,theme->>'strongPinkButton' as accent from nursery_settings where singleton")).rows[0];
   const ids=[...new Set(receipt.lines.map(l=>l.childId))];
   let remaining:string;
   if(receipt.kind==='CREDIT') remaining=(await tx.query<{remaining:string}>('select remaining::text from credit_balances where id=(select id from credits where receipt_id=$1)',[id])).rows[0].remaining;
   else {
    const scope=p.account.kind==='GUARDIAN'?{sql:'true',values:[] as unknown[]}:financeScope(p,'finance.read','o');
    remaining=(await tx.query<{remaining:string}>(`select coalesce(sum(b.remaining),0)::text as remaining from obligation_balances b join obligations o on o.id=b.id where ${scope.sql} and o.child_id=any($${scope.values.length+1}::uuid[])`,[...scope.values,ids])).rows[0].remaining;
   }
   const bytes=await renderReceipt({receipt,nurseryName:brand.name,contactPhone:brand.phone,remaining,balanceOn:cairoIsoDate(),accent:brand.accent});
   // Zero generated-file retention: memory only, never a web-root file, public URL or durable bearer link.
   return {bytes,filename:`${receipt.reference}.pdf`};
  });
 }
}
