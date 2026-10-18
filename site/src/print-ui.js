import {syntheticBackground,createResultPdf,printWarnings,inspectPdf,pdfToData} from './pdf.js';
import {calendarAge} from './runs.js';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const fileData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Datei nicht lesbar.'));reader.readAsDataURL(file);});
function download(name,bytes,type='application/json') {
  const data=typeof bytes==='string'||bytes instanceof Uint8Array?bytes:JSON.stringify(bytes,null,2);
  const url=URL.createObjectURL(new Blob([data],{type})),link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function validatePrintAsset(template) {
  if(!template.printLayout)return;
  const actual=await inspectPdf(template.printLayout.pdfData);
  if(actual.some((s,i)=>Math.abs(s.width-template.printLayout.pages[i].width)>0.01||Math.abs(s.height-template.printLayout.pages[i].height)>0.01))throw Error('Druck-PDF und gespeicherte Seitengrößen stimmen nicht überein.');
}
export function renderPrintEditor(container,template,change,status) {
  const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=async()=>{try{await fn();}catch(e){status(e.message,true);}};return b;};
  container.replaceChildren(el('summary','Druckvorlage und Koordinaten · lokal'));
  const layout=template.printLayout;
  container.append(el('p',layout?`Lokale vierseitige Druck-PDF · ${layout.kind==='original'?'Originalscan (Entwurf)':'synthetisch'}. ${layout.fields.length} Druckfelder. Freigabe: ${layout.approved?'im Paket vermerkt':'nicht abgenommen'}.`:'Standard: vierseitiger, deutlich gekennzeichneter synthetischer Demobogen.'));
  const cleanLabel=el('label'),clean=el('input');clean.type='checkbox';cleanLabel.append(clean,document.createTextNode(' Ich importiere einen sauberen, unausgefüllten Scan zur lokalen Vorlagenerstellung. Keine ausgefüllten Testbögen.'));container.append(cleanLabel);
  const input=el('input');input.type='file';input.accept='.pdf,application/pdf';const upload=el('label','Lokale Druck-PDF importieren');upload.className='file-button';upload.append(input);container.append(upload);
  input.onchange=async()=>{try{
    const file=input.files[0];if(!file)return;if(!clean.checked)throw Error('Bitte zuerst bestätigen, dass die Quelle sauber und unausgefüllt ist.');
    if(file.size>25000000)throw Error('Druck-PDF größer als 25 MB.');
    const pdfData=await fileData(file);if(!pdfData.startsWith('data:application/pdf;base64,'))throw Error('Bitte eine PDF-Datei wählen.');
    const pages=await inspectPdf(pdfData);
    await change(t=>{if(t.id!==template.id||t.revision!==template.revision)throw Error('Vorlage zwischenzeitlich geändert. Erneut wählen.');t.printLayout={version:1,kind:'original',approved:false,pdfData,pages,fields:[]};});
  }catch(e){status('Druckimport abgelehnt: '+e.message,true);}finally{input.value='';}};
  const demo=button('Synthetischen Musterbogen herunterladen',async()=>{if(template.status!=='demo')throw Error('Musterbogen bitte mit einer synthetischen Demovorlage erzeugen.');const result=await syntheticBackground(template);download('TestOrganizer-DEMO-Vorlage.pdf',result.bytes,'application/pdf');download('TestOrganizer-DEMO-Koordinaten.json',{format:'testorganizer-print-coordinates',version:1,pages:result.layout.pages,fields:result.layout.fields});});container.append(demo);
  if(!layout)return;
  container.append(el('p','Koordinaten: PDF-Punkte (1/72 Zoll), Ursprung links unten, Seiten 0–3. Positionen müssen am sauberen Scan geprüft werden. PDF-Ersatz setzt die Koordinaten zurück.'));
  const label=el('label','Druckfelder als JSON'),textarea=el('textarea');textarea.rows=10;textarea.value=JSON.stringify(layout.fields,null,2);const savedFields=textarea.value;textarea.oninput=()=>textarea.dataset.unsavedDraft=String(textarea.value!==savedFields);textarea.spellcheck=false;label.append(textarea);container.append(label);
  container.append(button('Koordinaten als Entwurf speichern',()=>change(t=>{t.printLayout={...t.printLayout,approved:false,fields:JSON.parse(textarea.value)};})),button('Koordinaten exportieren',()=>download('TestOrganizer-Druckkoordinaten.json',{format:'testorganizer-print-coordinates',version:1,pages:layout.pages,fields:layout.fields})),button('Druck-PDF entfernen · Demo verwenden',()=>{if(confirm('Druck-PDF aus der aktuellen Vorlage entfernen? Bestehende Tests behalten ihren Snapshot.'))return change(t=>delete t.printLayout);}));
  const coordsInput=el('input');coordsInput.type='file';coordsInput.accept='.json,application/json';const coordsLabel=el('label','Koordinaten importieren');coordsLabel.className='file-button';coordsLabel.append(coordsInput);container.append(coordsLabel);
  coordsInput.onchange=async()=>{try{const file=coordsInput.files[0];if(!file)return;if(file.size>2000000)throw Error('Koordinatendatei zu groß.');const data=JSON.parse(await file.text());if(data.format!=='testorganizer-print-coordinates'||data.version!==1||JSON.stringify(data.pages)!==JSON.stringify(layout.pages))throw Error('Koordinatenformat oder Seitengrößen passen nicht.');await change(t=>{if(t.id!==template.id||t.revision!==template.revision)throw Error('Vorlage wurde geändert. Erneut wählen.');t.printLayout={...t.printLayout,approved:false,fields:data.fields};});}catch(e){status('Koordinatenimport abgelehnt: '+e.message,true);}finally{coordsInput.value='';}};
}

export function showPrintDialog(run,volatile,status) {
  if(volatile.birthDate)calendarAge(volatile.birthDate,run.testDate);
  const dialog=el('dialog');dialog.className='print-dialog';
  dialog.append(el('h2','Vor dem Druck prüfen'),el('p','Offene reguläre Aufgaben und UTN-Zeichnungen gehen rechnerisch mit 0 ein. Ihre Kästchen bzw. Einzelwerte bleiben leer. SOZ-EMO bleibt ohne Eingabe auch im Ausdruck leer.'));
  const list=el('ul');for(const warning of printWarnings(run))list.append(el('li',warning));dialog.append(list);
  const back=el('button','Zurück zur Bearbeitung'),proceed=el('button','Trotzdem drucken');back.onclick=()=>dialog.close();dialog.append(back,proceed);
  let blobUrl;
  dialog.onclose=()=>{if(blobUrl)URL.revokeObjectURL(blobUrl);dialog.remove();};
  proceed.onclick=async()=>{
    proceed.disabled=true;
    try{
      const bytes=await createResultPdf(run,volatile);blobUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      const heading=el('h2','PDF-Vorschau · lokal erzeugt'),note=el('p','Die Ergebnis-PDF wird nur im Arbeitsspeicher gehalten. Öffnen, Speichern und physischer Druck erfolgen über die Möglichkeiten dieses Geräts. Falls keine eingebettete Vorschau erscheint, bitte „PDF öffnen“ verwenden.');
      const toolbar=el('div');toolbar.className='toolbar';
      const open=el('a','PDF öffnen');open.href=blobUrl;open.target='_blank';open.rel='noopener';open.className='file-button';
      const save=el('a','PDF herunterladen');save.href=blobUrl;save.download='TestOrganizer-Ergebnis.pdf';save.className='file-button';save.id='pdf-download';
      const frame=el('iframe');frame.src=blobUrl;frame.title='Lokale PDF-Vorschau';
      const print=el('button','Druckdialog öffnen');print.onclick=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();status('Druckdialog angefordert. Die tatsächliche Ausgabe bitte am Gerät prüfen.');}catch{status('Bitte PDF öffnen und den Druckbefehl des PDF-Betrachters verwenden.',true);}};
      const close=el('button','Vorschau schließen');close.onclick=()=>dialog.close();toolbar.append(open,save,print,close);
      dialog.replaceChildren(heading,note,toolbar,frame);status('PDF offlinefähig lokal erzeugt; nicht intern archiviert.');
    }catch(e){proceed.disabled=false;status('PDF konnte nicht erstellt werden: '+e.message,true);}
  };
  document.body.append(dialog);dialog.showModal();return dialog;
}
