import { createRequire } from 'node:module';
import { dirname,resolve } from 'node:path';
import { access } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { PDFDocument,rgb } from 'pdf-lib';
import sharp from 'sharp';
import { SafeError } from '../../errors.js';
import { reportHasMoney,reportText,reportDetailValue,reportCategoryText,type ReportExportInput,type ReportPage } from '@nursery/contracts';
import { formatDateOnly,formatEgp,piastres } from '@nursery/domain';

const fontfile=resolve(dirname(createRequire(import.meta.url).resolve('@nursery/api/package.json')),'assets/fonts/NotoSansArabic.ttf');
export const reportMoney=(v:string)=>formatEgp(piastres(BigInt(v)));
export function safeSpreadsheetText(v:string) {let leading=v.trimStart();while(leading.length&&leading.charCodeAt(0)<32)leading=leading.slice(1).trimStart();return /^[=+\-@]/u.test(leading)?`'${v}`:v;}
const escape=(s:string)=>Array.from(s).filter(c=>{const n=c.codePointAt(0)!;return (n>=32||n===9||n===10)&&!(n>=0x202a&&n<=0x202e)&&!(n>=0x2066&&n<=0x2069);}).join('').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export type ReportBrand={name:string;phone:string|null;accent:string;branchName?:string|null;classroomName?:string|null;categoryName?:string|null};
const terms={en:{title:'Management report',date:'Generated',from:'From',to:'To',branch:'Branch',classroom:'Classroom',total:'Total (EGP)',count:'Rows',category:'Category',headers:['Date','Label','Category','Amount (EGP)','Exact piastres','Branch','Classroom','Details']},'ar-EG':{title:'تقرير الإدارة',date:'تاريخ إصدار التقرير',from:'من',to:'إلى',branch:'الفرع',classroom:'الفصل',total:'الإجمالي (جنيه)',count:'عدد السجلات',category:'الفئة',headers:['التاريخ','البيان','الفئة','المبلغ (جنيه)','القروش بالضبط','الفرع','الفصل','التفاصيل']}};
export async function renderReportXlsx(input:ReportExportInput,page:ReportPage,brand:ReportBrand) {
 const t=terms[input.locale],book=new ExcelJS.Workbook();book.creator=brand.name;book.title=`${t.title}: ${reportText(input.locale,page.kind)}`;
 const sheet=book.addWorksheet(input.locale==='en'?'Report':'التقرير',{views:[{rightToLeft:input.locale==='ar-EG',state:'frozen',ySplit:7}]});
 sheet.addRow([safeSpreadsheetText(brand.name)]);sheet.addRow([t.title,reportText(input.locale,page.kind)]);sheet.addRow([t.from,new Date(`${page.from}T00:00:00Z`),t.to,new Date(`${page.to}T00:00:00Z`)]);
 sheet.addRow([t.branch,brand.branchName??input.branchId??(input.locale==='en'?'All permitted':'كل المسموح به'),t.classroom,brand.classroomName??input.classroomId??(input.locale==='en'?'All permitted':'كل المسموح به')]);
 sheet.addRow([t.count,page.totalCount,reportHasMoney(page.kind)?t.total:null,reportHasMoney(page.kind)?excelMoney(page.totals.amount??'0'):null]);sheet.addRow([t.date,new Date(),t.category,safeSpreadsheetText(brand.categoryName??input.categoryId??(input.locale==='en'?'All permitted':'كل المسموح به'))]);sheet.addRow(t.headers);
 for(const r of page.rows) sheet.addRow([r.date?new Date(`${r.date}T00:00:00Z`):null,safeSpreadsheetText(r.label),safeSpreadsheetText(reportCategoryText(input.locale,page.kind,r.category??'')),r.amount===null?null:excelMoney(r.amount),r.amount===null?null:`'${r.amount}`,safeSpreadsheetText(r.details.branch??r.branchId),safeSpreadsheetText(r.details.classroom??''),safeSpreadsheetText(Object.entries(r.details).filter(([k])=>k!=='branch'&&k!=='classroom').map(([k,v])=>`${reportText(input.locale,k)}: ${reportDetailValue(input.locale,k,v??'',formatDateOnly)}`).join('\n'))]);
 sheet.columns=[{width:16},{width:36},{width:26},{width:23},{width:26},{width:24},{width:24},{width:65}];
 for(const row of sheet.getRows(1,sheet.rowCount)??[]) {row.font={name:'Noto Sans Arabic',size:11};row.alignment={vertical:'top',wrapText:true};row.height=row.number>7?Math.max(32,20*(String(row.getCell(8).value??'').split('\n').length)):26;}
 sheet.getRow(7).font={name:'Noto Sans Arabic',bold:true,color:{argb:'FFFFFFFF'},size:11};sheet.getRow(7).fill={type:'pattern',pattern:'solid',fgColor:{argb:brand.accent.replace('#','FF')}};
 sheet.getColumn(1).numFmt='dd/mm/yyyy';sheet.getColumn(4).numFmt='#,##0.00 "EGP"';sheet.getCell('B3').numFmt=sheet.getCell('D3').numFmt='dd/mm/yyyy';sheet.getCell('B6').numFmt='dd/mm/yyyy hh:mm';sheet.getCell('D5').numFmt='#,##0.00 "EGP"';sheet.autoFilter={from:'A7',to:`H${Math.max(7,sheet.rowCount)}`};
 return Buffer.from(await book.xlsx.writeBuffer());
}
// Excel stores at most 15 significant digits. Larger values retain their exact decimal text,
// and every monetary row also carries exact integer piastres as text; no silent rounding.
function excelMoney(v:string):number|string {return BigInt(v)<1000000000000000n&&BigInt(v)>-1000000000000000n?Number(v)/100:(BigInt(v)<0n?'-':'')+`${(BigInt(v)<0n?-BigInt(v):BigInt(v))/100n}.${((BigInt(v)<0n?-BigInt(v):BigInt(v))%100n).toString().padStart(2,'0')}`;}
export async function renderReportPdf(input:ReportExportInput,report:ReportPage,brand:ReportBrand) {
 const textSize=report.rows.reduce((n,r)=>n+r.label.length+Object.values(r.details).reduce((m,v)=>m+(v?.length??0),0),0);
 if(textSize>500_000)throw new SafeError('VALIDATION_ERROR','reports.tooLarge',false,409);
 const deadline=Date.now()+60_000;
 await access(fontfile);const t=terms[input.locale],pdf=await PDFDocument.create({updateMetadata:false});pdf.setTitle(`${t.title}: ${reportText(input.locale,report.kind)}`);pdf.setAuthor(brand.name);pdf.setSubject(JSON.stringify({kind:report.kind,from:report.from,to:report.to,branch:input.branchId??null,classroom:input.classroomId??null,rows:report.totalCount,totals:report.totals,locale:input.locale}));
 const width=595.276,height=841.89,margin=42,content=width-2*margin;let page=pdf.addPage([width,height]),y=height-margin;
 async function paragraph(text:string,size=10,gap=7) {
  // Bounded paragraphs prevent a single long row from exceeding a page's printable height.
  const chars=Array.from(text);for(let start=0;start<chars.length;start+=350) {
   if(Date.now()>deadline||pdf.getPageCount()>100)throw new SafeError('VALIDATION_ERROR','reports.tooLarge',false,409);
   const {data,info}=await sharp({text:{text:`<span foreground="#111827">${escape(chars.slice(start,start+350).join(''))}</span>`,font:`Noto Sans Arabic ${size}`,fontfile,width:Math.floor(content*300/72),dpi:300,rgba:true,align:input.locale==='ar-EG'?'right':'left',wrap:'word-char'}}).png().toBuffer({resolveWithObject:true});
   const h=info.height*72/300;if(y-h<margin+24){if(pdf.getPageCount()>=100)throw new SafeError('VALIDATION_ERROR','reports.tooLarge',false,409);page=pdf.addPage([width,height]);y=height-margin;}const image=await pdf.embedPng(data);page.drawImage(image,{x:input.locale==='ar-EG'?width-margin-info.width*72/300:margin,y:y-h,width:info.width*72/300,height:h});y-=h+gap;
  }
 }
 await paragraph(brand.name,18);await paragraph(`${t.title}: ${reportText(input.locale,report.kind)}`,15);const c=/^#[0-9a-f]{6}$/i.test(brand.accent)?brand.accent:'#BE185D';page.drawRectangle({x:margin,y:y-2,width:content,height:2,color:rgb(...c.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255) as [number,number,number])});y-=14;
 await paragraph(`${t.date}: ${formatDateOnly(new Date().toISOString().slice(0,10))}\n${t.from}: ${formatDateOnly(report.from)} - ${t.to}: ${formatDateOnly(report.to)}\n${t.branch}: ${brand.branchName??input.branchId??(input.locale==='en'?'All permitted branches':'كل الفروع المسموح بها')}\n${t.classroom}: ${brand.classroomName??input.classroomId??(input.locale==='en'?'All permitted classrooms':'كل الفصول المسموح بها')}\n${t.category}: ${brand.categoryName??input.categoryId??(input.locale==='en'?'All permitted':'كل المسموح به')}`);
 await paragraph(`${t.count}: ${report.totalCount}${reportHasMoney(report.kind)?`\n${t.total}: ${reportMoney(report.totals.amount??'0')}`:''}`,12);
 for(const r of report.rows) {await paragraph(`${r.date?formatDateOnly(r.date):''} ${r.label}\n${reportCategoryText(input.locale,report.kind,r.category??'')} ${r.amount===null?'':reportMoney(r.amount)}`,11);for(const [k,v] of Object.entries(r.details))if(v!==null&&v!=='')await paragraph(`${reportText(input.locale,k)}: ${reportDetailValue(input.locale,k,v,formatDateOnly)}`,9,4);y-=8;}
 if(brand.phone)await paragraph(brand.phone,9);const pages=pdf.getPages();for(let i=0;i<pages.length;i++){const bytes=await sharp({text:{text:escape(reportText(input.locale,report.kind)),font:'Noto Sans Arabic 8',fontfile,dpi:300,rgba:true}}).png().toBuffer();const img=await pdf.embedPng(bytes),d=img.scale(72/300);pages[i].drawImage(img,{x:input.locale==='ar-EG'?width-margin-d.width:margin,y:22,width:d.width,height:d.height});pages[i].drawText(`${i+1} / ${pages.length}`,{x:input.locale==='ar-EG'?margin:width-margin-30,y:22,size:8});}return Buffer.from(await pdf.save());
}
