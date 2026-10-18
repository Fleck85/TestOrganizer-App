import {validateTemplate, initialTemplates, AREAS} from './model.js';

export const tasksOf = template => template.categories.flatMap(c => c.tasks);
const fail = message => { throw Error(message); };
const text = (value, max = 120) => typeof value === 'string' && value.length <= max;
const own = (object, key) => Object.hasOwn(object, key);

export function demoWithUTN() {
  const demo = initialTemplates()[0];
  demo.id = crypto.randomUUID();
  demo.name = 'Synthetische Demo · einschließlich UTN';
  demo.categories[0].tasks.push({id:'demo-utn', originalNumber:90, tCode:'DEMO-UTN',
    title:'Erfundene Zeichenaufgabe · acht Demozeichnungen', kind:'utn', area:null});
  demo.utn = {min:0, max:10, integerOnly:true, scoringBasis:'user-defined',
    items:Array.from({length:8}, (_,i) => ({id:`demo-drawing-${i+1}`, label:`Demozeichnung ${i+1}`, tCode:`DEMO-${i+1}`}))};
  return demo;
}

export function readyForRun(template,{allowEmpty=false}={}) {
  if (!template) return 'Keine Vorlage vorhanden. Bitte unter Vorlagen ein Vorlagenpaket importieren.';
  try{template=validateTemplate(template);}catch(error){return error.message;}
  const tasks=tasksOf(template),issues=[],utn=tasks.filter(t=>t.kind==='utn');
  const label=t=>`Aufgabe Nr. ${t.originalNumber}${t.tCode?' · '+t.tCode:''} (${t.title.slice(0,80)||'ohne Aufgabentext'})`;
  if(!tasks.length&&!allowEmpty)issues.push('Die Vorlage enthält keine bewertbaren Aufgaben.');
  for(const t of tasks){
    if(!['regular','utn'].includes(t.kind))issues.push(`${label(t)}: Bewertungstyp „${t.kind}“ wird nicht unterstützt.`);
    if(t.kind==='regular'&&!AREAS.includes(t.area))issues.push(`${label(t)}: gültiger Bewertungsbereich KM, HM, KOG oder SPR fehlt.`);
    if(t.kind==='utn'&&t.area!==null)issues.push(`${label(t)}: UTN darf keinen zusätzlichen regulären Bewertungsbereich besitzen.`);
  }
  if(utn.length>1)issues.push(`${utn.map(label).join('; ')}: mehrere UTN-Aufgaben werden nicht unterstützt.`);
  if(utn.length&&!template.utn)issues.push(`${utn.map(label).join('; ')}: Definition der acht UTN-Einzelzeichnungen fehlt.`);
  if(!utn.length&&template.utn)issues.push('UTN-Definition ohne zugehörige UTN-Aufgabe.');
  if(utn.length&&template.utn){
    const u=template.utn;
    if(u.min!==0||u.max!==10||u.integerOnly!==true||u.items.length!==8)issues.push(`${utn.map(label).join('; ')}: unterstützt werden acht UTN-Zeichnungen mit ganzen Zahlen von 0 bis 10.`);
  }
  return issues.join('\n');
}

export function localDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function localDateTime(now = new Date()) {
  return `${localDate(now)}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}
export function dateParts(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d] = value.split('-').map(Number);
  const dt = new Date(`${value}T00:00:00Z`);
  return y > 0 && dt.getUTCFullYear() === y && dt.getUTCMonth()+1 === m && dt.getUTCDate() === d ? {y,m,d} : null;
}
export function validDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && dateParts(value.slice(0,10)) && +value.slice(11,13)<24 && +value.slice(14,16)<60;
}
function monthAnchor({y,m,d}, months) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m-1+months, 1); dt.setUTCHours(0,0,0,0);
  const last = new Date(dt); last.setUTCMonth(last.getUTCMonth()+1,0);
  dt.setUTCDate(Math.min(d,last.getUTCDate()));
  return dt;
}
export function calendarAge(birth, test) {
  const b = dateParts(birth), t = dateParts(test);
  if (!b || !t) fail('Bitte gültiges Geburts- und Testdatum eingeben.');
  if (birth > test) fail('Geburtsdatum liegt nach dem Testdatum.');
  const end = new Date(`${test}T00:00:00Z`);
  let months = (t.y-b.y)*12+t.m-b.m;
  if (monthAnchor(b,months)>end) months--;
  return {years:Math.floor(months/12), months:months%12, days:Math.round((end-monthAnchor(b,months))/86400000)};
}

export function createRun(template, now = new Date(), id = crypto.randomUUID()) {
  const readiness=readyForRun(template);if(readiness)fail(readiness);
  const snapshot = validateTemplate(structuredClone(template));
  const reason = readyForRun(snapshot); if (reason) fail(reason);
  return serializeRun({id, revision:1, createdAt:now.toISOString(), updatedAt:now.toISOString(),
    templateSnapshot:snapshot, testDate:localDate(now), startedAt:localDateTime(now), endedAt:'', examiner:null,
    answers:Object.fromEntries(tasksOf(snapshot).filter(t=>t.kind==='regular').map(t=>[t.id,'open'])),
    utn:Object.fromEntries((snapshot.utn?.items || []).map(t=>[t.id,null])), sozEmo:null});
}

export function employeeRecord(value) {
  if (!value || !text(value.id,200) || !value.id || !text(value.name) || !value.name.trim() || !Number.isSafeInteger(value.revision) || value.revision<1) fail('Ungültiger Mitarbeiterdatensatz.');
  return {id:value.id, revision:value.revision, name:value.name};
}

// Persistence boundary: enumerate durable fields; never spread a form object.
export function serializeRun(value) {
  if (!value || !text(value.id,200) || !value.id || !Number.isSafeInteger(value.revision) || value.revision<1 ||
      !text(value.createdAt,40) || !Number.isFinite(Date.parse(value.createdAt)) ||
      !text(value.updatedAt,40) || !Number.isFinite(Date.parse(value.updatedAt))) fail('Ungültige Test-Metadaten.');
  const snapshot = validateTemplate(value.templateSnapshot);
  const reason=readyForRun(snapshot,{allowEmpty:true});if(reason)fail('Testvorlage technisch nicht verwendbar: '+reason);
  if (!(value.testDate==='' || dateParts(value.testDate)) || !(value.startedAt==='' || validDateTime(value.startedAt)) || !(value.endedAt==='' || validDateTime(value.endedAt))) fail('Ungültige Zeitangaben.');
  if (value.sozEmo!==null && (typeof value.sozEmo!=='number' || !Number.isFinite(value.sozEmo))) fail('SOZ-EMO muss leer oder eine endliche Zahl sein.');
  const regular = tasksOf(snapshot).filter(t=>t.kind==='regular');
  if (!value.answers || typeof value.answers!=='object' || regular.some(t=>!own(value.answers,t.id) || !['open','yes','no'].includes(value.answers[t.id])) || Object.keys(value.answers).some(id=>!regular.some(t=>t.id===id))) fail('Ungültige Antworten oder Aufgabenreferenzen.');
  const drawings = snapshot.utn?.items || [];
  if (!value.utn || typeof value.utn!=='object' || drawings.some(t=>!own(value.utn,t.id) || value.utn[t.id]!==null && (!Number.isInteger(value.utn[t.id]) || value.utn[t.id]<snapshot.utn.min || value.utn[t.id]>snapshot.utn.max)) || Object.keys(value.utn).some(id=>!drawings.some(t=>t.id===id))) fail('Ungültige UTN-Werte oder Zeichnungsreferenzen.');
  let examiner = null;
  if (value.examiner!==null) {
    if (!value.examiner || !text(value.examiner.id,200) || !text(value.examiner.name) || !value.examiner.name.trim()) fail('Ungültiger Untersucher.');
    examiner = {id:value.examiner.id,name:value.examiner.name};
  }
  return {id:value.id,revision:value.revision,createdAt:value.createdAt,updatedAt:value.updatedAt,
    templateSnapshot:snapshot,testDate:value.testDate,startedAt:value.startedAt,endedAt:value.endedAt,examiner,
    answers:Object.fromEntries(regular.map(t=>[t.id,value.answers[t.id]])),
    utn:Object.fromEntries(drawings.map(t=>[t.id,value.utn[t.id]])),sozEmo:value.sozEmo};
}

export function calculate(run) {
  const t = run.templateSnapshot, raw = Object.fromEntries(AREAS.map(a=>[a,0])), open = [];
  for (const task of tasksOf(t).filter(a=>a.kind==='regular')) {
    if (run.answers[task.id]==='yes') raw[task.area]++;
    if (run.answers[task.id]==='open') open.push({number:task.originalNumber,title:task.title});
  }
  raw.UTN = Object.values(run.utn).reduce((sum,n)=>sum+(n ?? 0),0);
  raw['SOZ-EMO'] = run.sozEmo;
  return {raw,open,openUTN:(t.utn?.items || []).filter(a=>run.utn[a.id]===null).map(a=>a.label), missingSOZ:run.sozEmo===null};
}

export function timeWarnings(run) {
  const warnings = [];
  if (run.startedAt && run.testDate && run.startedAt.slice(0,10)!==run.testDate) warnings.push('Testdatum und Datum des Untersuchungsbeginns weichen ab.');
  if (run.endedAt && run.testDate && run.endedAt.slice(0,10)!==run.testDate) warnings.push('Testdatum und Datum des Untersuchungsendes weichen ab.');
  if (run.startedAt && run.endedAt && run.endedAt<run.startedAt) warnings.push('Untersuchungsende liegt vor dem Untersuchungsbeginn.');
  return warnings;
}
export function convertNorms() { return null; }
