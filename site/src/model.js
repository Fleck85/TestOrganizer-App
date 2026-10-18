import {validatePrintLayout} from './print-schema.js';
// Seed categories only. Imported templates define their own IDs and order.
export const CATEGORIES = ['I','II','III','IV','V','VI','VII','VIII','IX'];
export const AREAS = ['KM','HM','KOG','SPR'];
const groups = [[2,5,6,7,8,9,10,11,27,28,39,40,47],[1,3,18,36],[4,14,15,17],[23,24,25,26,29],[43,44,45,46,50,51,63,64],[12,30,32,33,34,37,38,41,48],[52,53,54,55,56,57,58,59,60,61,62],[13,19,31,35,49],[16,20,21,22]];
export function initialTemplates() {
 const demo = {id:'synthetic-demo',revision:1,name:'Synthetische Demovorlage',age:'Demo · keine fachliche Alterszuordnung',status:'demo',categories:CATEGORIES.map((id,i)=>({id,materials:i===0?['Stiftführungsblatt','Strichmännchen','Gefaltetes Blatt'].map(caption=>({caption,data:null})):[],tasks:[0,1].map((_,j)=>({id:`D${i*2+j+1}`,originalNumber:i*2+j+1,tCode:null,title:`Erfundene Demoaufgabe ${i*2+j+1}`,kind:'regular',area:AREAS[(i+j)%4]}))}))};
 const incomplete={id:'original-48-60-incomplete',revision:1,name:'48–60 Monate · unvollständiges Gerüst',age:'48–60 Monate',status:'incomplete',categories:CATEGORIES.map((id,i)=>({id,materials:i===0?['Stiftführungsblatt','Strichmännchen','Gefaltetes Blatt'].map(caption=>({caption,data:null})):[],tasks:groups[i].map(n=>({id:`original-${n}`,originalNumber:n,tCode:null,title:n===47?'UTN · Untertest Nachzeichnen':'Originalinhalt fehlt',kind:n===47?'utn':'regular',area:null}))}))};
 return [demo,incomplete];
}
export function move(items,index,delta) {const next=index+delta;if(next<0||next>=items.length)return false;[items[index],items[next]]=[items[next],items[index]];return true;}
export function moveTask(template,taskId,targetCategoryId) {
 const target=template.categories.find(c=>c.id===targetCategoryId);
 const source=template.categories.find(c=>c.tasks.some(t=>t.id===taskId));
 if(!target||!source)throw Error('Aufgabe oder Zielkategorie nicht gefunden.');
 if(source===target)return false;
 const index=source.tasks.findIndex(t=>t.id===taskId);
 target.tasks.push(source.tasks.splice(index,1)[0]);
 return true;
}
export function formatPi(task) {
 if(task.pi===undefined||task.pi===null)return '';
 return 'Pᵢ: '+new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:20,useGrouping:false}).format(task.pi);
}
export function taskReviewNote(task) {
 // Keep substantive review warnings; suppress only the repetitive source locator.
 return (task.sourceNote||'').replace(/^Quelle:[^\n]*?\bOriginalaufgabe\s+\d+\.?\s*/u,'').trim();
}
export function validateTemplate(t) {
 if(!t||typeof t!=='object'||typeof t.id!=='string'||!t.id||typeof t.name!=='string'||!t.name.trim()||t.name.length>120||typeof t.age!=='string'||t.age.length>80||!Number.isInteger(t.revision)||t.revision<1||!['demo','incomplete','verified'].includes(t.status))throw Error('Ungültige Vorlagen-Metadaten.');
 if(!Array.isArray(t.categories)||t.categories.length<1||t.categories.length>30)throw Error('Eine bis dreißig Kategorien erforderlich.');
 const ids=new Set(),numbers=new Set(),categoryIds=new Set();let total=0;
 t.categories.forEach((c,i)=>{if(typeof c.id!=='string'||!c.id.trim()||c.id.length>80||categoryIds.has(c.id)||!Array.isArray(c.tasks)||!Array.isArray(c.materials)||c.materials.length>5)throw Error('Ungültige Kategorien oder mehr als fünf Materialbilder.');categoryIds.add(c.id);
 c.materials.forEach(m=>{if(typeof m.caption!=='string'||m.caption.length>120||!(m.data===null||typeof m.data==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(m.data)&&m.data.length<3000000))throw Error('Material muss PNG, JPEG oder WebP sein (max. 2 MB).');});
 c.tasks.forEach(a=>{total++;const label=`Aufgabe Nr. ${a?.originalNumber??'?'}${a?.tCode?' · '+a.tCode:''}`;if(!a||!['regular','utn'].includes(a.kind))throw Error(label+': Bewertungstyp wird nicht unterstützt.');if(!(a.area===null||AREAS.includes(a.area))||a.kind==='utn'&&a.area!==null)throw Error(label+': ungültiger Bewertungsbereich.');if(total>500||typeof a.id!=='string'||!a.id||ids.has(a.id)||!Number.isInteger(a.originalNumber)||a.originalNumber<1||numbers.has(a.originalNumber)||typeof a.title!=='string'||a.title.length>4096||!(a.tCode===null||typeof a.tCode==='string'&&a.tCode.length<=40)||a.sourceNote!==undefined&&(typeof a.sourceNote!=='string'||a.sourceNote.length>1000))throw Error(label+': ungültige oder doppelte Aufgabendaten.');ids.add(a.id);numbers.add(a.originalNumber);});});
 if(t.reviewNotes!==undefined&&(!Array.isArray(t.reviewNotes)||t.reviewNotes.length>30||t.reviewNotes.some(n=>typeof n!=='string'||n.length>1000)))throw Error('Ungültige Prüfhinweise.');
 if(t.utn!==undefined){const u=t.utn;if(!u||!Array.isArray(u.items)||u.items.length<1||u.items.length>20||!Number.isSafeInteger(u.min)||!Number.isSafeInteger(u.max)||u.min<0||u.max<u.min||u.max>1000||u.integerOnly!==true||!['user-defined','source-verified'].includes(u.scoringBasis))throw Error('Ungültige UTN-Definition.');const seen=new Set();for(const a of u.items){if(!a||typeof a.id!=='string'||!a.id||seen.has(a.id)||typeof a.label!=='string'||a.label.length>120||typeof a.tCode!=='string'||a.tCode.length>40)throw Error('Ungültige UTN-Einzelzeichnung.');seen.add(a.id);}}
 for(const c of t.categories)for(const a of c.tasks)if(a.pi!==undefined&&a.pi!==null&&(typeof a.pi!=='number'||!Number.isFinite(a.pi)||a.pi<0||a.pi>1))throw Error('Pᵢ muss fehlen, leer sein oder eine Zahl zwischen 0 und 1 enthalten.');
 // Explicit schema projection: discard unknown fields, including executable/configuration content.
 return {id:t.id,revision:t.revision,name:t.name,age:t.age,status:t.status,...(t.printLayout?{printLayout:validatePrintLayout(t.printLayout,t)}:{}),...(t.reviewNotes?{reviewNotes:[...t.reviewNotes]}:{}),...(t.utn?{utn:{min:t.utn.min,max:t.utn.max,integerOnly:true,scoringBasis:t.utn.scoringBasis,items:t.utn.items.map(a=>({id:a.id,label:a.label,tCode:a.tCode}))}}:{}),categories:t.categories.map(c=>({id:c.id,materials:c.materials.map(m=>({caption:m.caption,data:m.data})),tasks:c.tasks.map(a=>({id:a.id,originalNumber:a.originalNumber,tCode:a.tCode,title:a.title,kind:a.kind,area:a.area,...(a.pi!==undefined?{pi:a.pi}:{}),...(a.sourceNote?{sourceNote:a.sourceNote}:{})}))}))};
}
export function readPackage(data){if(data?.format!=='testorganizer-template'||data.version!==1)throw Error('Unbekanntes Format oder inkompatible Version.');return validateTemplate(data.template);}
export function packageTemplate(t){return {format:'testorganizer-template',version:1,template:validateTemplate(t)};}
