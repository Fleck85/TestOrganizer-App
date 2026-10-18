import {PDFDocument,rgb} from './vendor/pdf-lib.mjs';
import fontkit from './vendor/fontkit.mjs';
import {calculate,calendarAge,timeWarnings} from './runs.js';
import {validatePrintLayout,missingPrintFields} from './print-schema.js';

export const FONT_URL=new URL('./fonts/LiberationSans-Regular.ttf',import.meta.url);
const INK=rgb(0.12,0.24,0.21),MUTED=rgb(0.35,0.43,0.39),LINE=rgb(0.74,0.8,0.76);
let fontPromise;
async function loadFont(bytes){if(bytes)return bytes;return fontPromise??=fetch(FONT_URL).then(r=>{if(!r.ok)throw Error('Lokale PDF-Schrift nicht verfügbar. Offline-Vorbereitung prüfen.');return r.arrayBuffer();});}
export function pdfToData(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:application/pdf;base64,'+btoa(binary);}
export function dataToPdf(value){return Uint8Array.from(atob(value.split(',')[1]),c=>c.charCodeAt(0));}
export async function inspectPdf(data) {
  const doc=await PDFDocument.load(dataToPdf(data),{updateMetadata:false});
  if(doc.isEncrypted||doc.getPageCount()!==4)throw Error('Bitte eine unverschlüsselte vierseitige PDF wählen.');
  if(doc.getPages().some(p=>p.getRotation().angle!==0))throw Error('PDF-Seiten zuerst dauerhaft aufrecht ausrichten; rotierte Seiten werden noch nicht unterstützt.');
  // Embedding page content into a fresh document omits source scripts, links and annotations.
  const probe=await PDFDocument.create();await probe.embedPdf(dataToPdf(data),[0,1,2,3]);
  return doc.getPages().map(p=>({width:p.getWidth(),height:p.getHeight()}));
}
function printableText(value){return String(value??'').replace(/[\r\n\t]/g,' ').replace(/[\u0000-\u001f]/g,'');}
function text(page,font,value,x,y,size=10,width=520) {
  const str=printableText(value);if(!str)return;
  const chars=new Set(font.getCharacterSet());
  for(const c of str)if(!chars.has(c.codePointAt(0)))throw Error(`PDF-Schrift unterstützt Zeichen U+${c.codePointAt(0).toString(16).toUpperCase()} nicht. Eingabe prüfen.`);
  let actual=size;while(actual>4&&font.widthOfTextAtSize(str,actual)>width)actual-=0.25;
  if(font.widthOfTextAtSize(str,actual)>width)throw Error('Ein Druckfeld ist für den Text zu schmal. Koordinaten bzw. Text prüfen.');
  page.drawText(str,{x,y,size:actual,font,color:INK});
}
function shorten(font,value,maxWidth,size) {
  let str=printableText(value).split('  ')[0];
  if(font.widthOfTextAtSize(str,size)<=maxWidth)return str;
  while(str.length&&font.widthOfTextAtSize(str+'...',size)>maxWidth)str=str.slice(0,-1);
  return str+'...';
}
async function fontFor(doc,bytes){doc.registerFontkit(fontkit);return doc.embedFont(await loadFont(bytes),{subset:true});}

export async function syntheticBackground(template,options={}) {
  const doc=await PDFDocument.create(),font=await fontFor(doc,options.fontBytes),pages=Array.from({length:4},()=>doc.addPage([595.28,841.89]));
  const fields=[];
  const add=(page,x,y,width,binding,size=10)=>fields.push({page,x,y,width,size,binding});
  pages.forEach((page,i)=>{
    text(page,font,'DEMO - SYNTHETISCHE DRUCKVORLAGE',36,799,16);
    text(page,font,'Keine Originaldruckvorlage. Ausdruck nicht als Original abgenommen.',36,777,10);
    page.drawLine({start:{x:36,y:763},end:{x:559,y:763},color:LINE,thickness:1});
    text(page,font,`TestOrganizer | Synthetische Vorlage | Seite ${i+1} von 4`,36,25,8);
  });
  const cover=pages[0];text(cover,font,shorten(font,template.name,520,13),36,735,13);
  const metadata=[['Name des Kindes','childName'],['Begleitperson','companion'],['Geburtsdatum','birthDate'],['Untersucher','examiner'],['Testdatum','testDate'],['Beginn (Uhrzeit)','startedTime']];
  metadata.forEach(([label,type],i)=>{const y=694-i*43;text(cover,font,label,36,y,9);cover.drawLine({start:{x:190,y:y-3},end:{x:555,y:y-3},color:LINE,thickness:0.6});add(0,192,y,360,{type});});
  for(const [x,label,binding] of [[36,'Mädchen',{type:'sex',value:'girl'}],[162,'Junge',{type:'sex',value:'boy'}],[306,'Mehrsprachigkeit',{type:'multilingual'}]]){
    cover.drawRectangle({x,y:442,width:10,height:10,borderColor:LINE,borderWidth:0.6});text(cover,font,label,x+18,443,10);add(0,x+1,443,9,binding,9);
  }
  text(cover,font,'Kalenderalter (ohne Korrektur)',36,410,10);
  ['years','months','days'].forEach((unit,i)=>{text(cover,font,['Jahre','Monate','Tage'][i],200+i*110,389,9);add(0,200+i*110,410,90,{type:'age',unit});});
  text(cover,font,'Rohwerte',36,345,14);
  ['KM','HM','KOG','SPR','SOZ-EMO','UTN'].forEach((area,i)=>{const x=36+(i%3)*177,y=305-Math.floor(i/3)*70;cover.drawRectangle({x,y:y-30,width:160,height:58,borderWidth:0.7,borderColor:LINE});text(cover,font,area,x+10,y+9,9);add(0,x+10,y-15,135,{type:'raw',area},15);});
  text(cover,font,'EQ, Prozentränge und Entwicklungsprofil bleiben unbefüllt.',36,160,10);
  text(cover,font,'Offene Aufgaben und UTN-Werte zählen rechnerisch als 0.',36,132,10);
  text(cover,font,'Ohne Eingabe bleibt SOZ-EMO leer.',36,112,10);
  const tasks=template.categories.flatMap(c=>c.tasks).filter(t=>t.kind==='regular').sort((a,b)=>a.originalNumber-b.originalNumber);
  if(tasks.length>64)throw Error('Der synthetische Vierseitenbogen unterstützt bis zu 64 reguläre Aufgaben. Eigene Druckvorlage erforderlich.');
  for(let pi=1;pi<=2;pi++){
    const page=pages[pi];text(page,font,'Originalnummer / Kurzbezeichnung (ggf. gekürzt)',36,739,10);text(page,font,'Bereich',410,739,9);text(page,font,'Ja',480,739,9);text(page,font,'Nein',524,739,9);
    tasks.slice((pi-1)*32,pi*32).forEach((task,i)=>{
      const y=714-i*18;
      text(page,font,`${task.originalNumber}.`,36,y,8.5,30);text(page,font,shorten(font,task.title,330,8.5),67,y,8.5,330);text(page,font,task.area,413,y,8.5,44);
      for(const [state,x] of [['yes',480],['no',524]]){page.drawRectangle({x:x-1,y:y-1,width:10,height:10,borderColor:LINE,borderWidth:0.6});add(pi,x,y,9,{type:'answer',taskId:task.id,state},9);}
    });
    text(page,font,'Gesamtrohwerte:',36,89,9);
    ['KM','HM','KOG','SPR'].forEach((area,i)=>{text(page,font,area,128+i*105,89,8.5);add(pi,160+i*105,89,54,{type:'raw',area},9);});
  }
  text(pages[2],font,'Untersuchungsende (Uhrzeit):',36,57,10);add(2,235,57,150,{type:'endedTime'});
  const last=pages[3];text(last,font,'UTN - acht Einzelzeichnungen',36,735,14);
  const drawings=template.utn?.items||[];
  drawings.forEach((d,i)=>{const x=36+(i>=4?270:0),y=688-(i%4)*64;text(last,font,shorten(font,`${d.label} (${d.tCode})`,190,10),x,y,10,190);last.drawRectangle({x:x+205,y:y-6,width:40,height:25,borderColor:LINE,borderWidth:0.7});add(3,x+214,y,23,{type:'utn',drawingId:d.id},12);});
  if(drawings.length){for(let i=0;i<2;i++){text(last,font,`Teilsumme ${i+1}`,36+i*270,415,11);add(3,182+i*270,415,60,{type:'utnSubtotal',drawingIds:drawings.slice(i*4,i*4+4).map(d=>d.id)},12);}}
  text(last,font,'UTN-Gesamtsumme',36,363,13);add(3,230,363,100,{type:'raw',area:'UTN'},15);
  text(last,font,'Skala 0-10 je Zeichnung: Anwenderanforderung, nicht fachlich validiert.',36,332,9);
  text(last,font,'Bemerkungen (bleiben in Version 1 unbefüllt)',36,275,10);
  for(const y of [245,205,165,125])last.drawLine({start:{x:36,y},end:{x:555,y},color:LINE,thickness:0.5});
  const bytes=await doc.save();
  return {bytes,layout:{version:1,kind:'synthetic',approved:false,pdfData:pdfToData(bytes),pages:pages.map(p=>({width:p.getWidth(),height:p.getHeight()})),fields}};
}

export function printWarnings(run) {
  const result=calculate(run),warnings=[];
  for(const a of result.open)warnings.push(`Offen: Nr. ${a.number} - ${a.title}`);
  for(const label of result.openUTN)warnings.push('Offene UTN-Zeichnung: '+label);
  if(result.missingSOZ)warnings.push('SOZ-EMO ist nicht eingegeben und bleibt leer.');
  warnings.push(...timeWarnings(run));
  if(run.templateSnapshot.printLayout){const layout=run.templateSnapshot.printLayout;
    if(!layout.approved)warnings.push('Druckkoordinaten sind ein Entwurf und nicht abgenommen.');
    const missing=missingPrintFields(run.templateSnapshot,layout);if(missing.length)warnings.push('Fehlende Druckzuordnungen: '+missing.map(key=>({'sex:girl':'Mädchen','sex:boy':'Junge',multilingual:'Mehrsprachigkeit'}[key]||key)).join(', '));
  } else warnings.push('Synthetische DEMO-Druckvorlage: keine Originaltreue.');
  return warnings;
}
export function overlayValue(binding,run,volatile) {
  const raw=calculate(run).raw;
  if(['childName','companion','birthDate'].includes(binding.type))return volatile[binding.type]||'';
  if(binding.type==='sex')return volatile.sex===binding.value?'x':'';
  if(binding.type==='multilingual')return volatile.multilingual===true?'x':'';
  if(binding.type==='examiner')return run.examiner?.name||'';
  if(binding.type==='testDate')return run.testDate;
  if(binding.type==='startedTime')return run.startedAt.slice(11);
  if(binding.type==='endedTime')return run.endedAt.slice(11);
  if(binding.type==='raw')return raw[binding.area]??'';
  if(binding.type==='answer')return run.answers[binding.taskId]===binding.state?'x':'';
  if(binding.type==='utn')return run.utn[binding.drawingId]??'';
  if(binding.type==='utnSubtotal')return binding.drawingIds.reduce((sum,id)=>sum+(run.utn[id]??0),0);
  if(binding.type==='age'){if(!volatile.birthDate||!run.testDate)return '';return calendarAge(volatile.birthDate,run.testDate)[binding.unit];}
  return '';
}
export async function createResultPdf(run,volatile={},options={}) {
  if(volatile.birthDate)calendarAge(volatile.birthDate,run.testDate);
  const supplied=run.templateSnapshot.printLayout;
  const layout=supplied?validatePrintLayout(supplied,run.templateSnapshot):(await syntheticBackground(run.templateSnapshot,options)).layout;
  const sizes=await inspectPdf(layout.pdfData);
  if(sizes.some((s,i)=>Math.abs(s.width-layout.pages[i].width)>0.01||Math.abs(s.height-layout.pages[i].height)>0.01))throw Error('PDF und Koordinaten besitzen unterschiedliche Seitengrößen.');
  const doc=await PDFDocument.create(),font=await fontFor(doc,options.fontBytes),background=await doc.embedPdf(dataToPdf(layout.pdfData),[0,1,2,3]);
  background.forEach((embedded,i)=>{const p=doc.addPage([sizes[i].width,sizes[i].height]);p.drawPage(embedded);if(layout.kind==='original'&&!layout.approved)text(p,font,'ENTWURF - Druckpositionen nicht abgenommen',12,sizes[i].height-18,10,sizes[i].width-24);});
  for(const f of layout.fields)text(doc.getPage(f.page),font,overlayValue(f.binding,run,volatile),f.x,f.y,f.size,f.width);
  doc.setTitle(layout.kind==='synthetic'?'DEMO - Synthetischer Testbogen':'Lokaler Testbogen');doc.setProducer('TestOrganizer - lokale PDF-Erstellung');doc.setCreator('TestOrganizer');
  return doc.save();
}
