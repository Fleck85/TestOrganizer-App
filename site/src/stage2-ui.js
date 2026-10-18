import {setRunActive,setTemplatePending} from './pwa.js';
import {showPrintDialog,validatePrintAsset} from './print-ui.js';
import {list,get,save,remove,readAll,importCopies} from './db.js';
import {createRun,demoWithUTN,readyForRun,serializeRun,calculate,calendarAge,localDate,localDateTime,timeWarnings} from './runs.js';
import {makeBackup,validateBackup,copyBackup} from './backup.js';
import {formatPi,taskReviewNote} from './model.js';
import {emptyPersonal,chooseSex} from './personal.js';

const el = (tag,text,cls) => {
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
};
const byId = id => document.getElementById(id);
function download(name,data) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=el('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}

export function mountStage2({db,status,getTemplate,refreshTemplates}) {
  const view=byId('stage2-view'),editor=byId('template-view');
  let active=null,employees=[],screen='templates';
  const action = fn => async (...args) => {setTemplatePending(true);try{await fn(...args);}catch(e){status(e.message,true);}finally{setTemplatePending(false);}};
  const button=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.onclick=action(fn);return b;};
  const field=(label,type,value,handler,id)=>{
    const wrap=el('label',label),input=el('input');input.type=type;input.value=value;input.autocomplete='off';
    if(id)input.id=id;
    input.addEventListener('input',action(()=>handler(input.value,input)));wrap.append(input);
    return {wrap,input};
  };
  const heading=(eyebrow,title)=>{const h=el('div',undefined,'heading');const box=el('div');box.append(el('p',eyebrow,'eyebrow'),el('h2',title));h.append(box);return h;};

  async function flush() {
    if(active){await active.chain;if(active.error)throw active.error;}
    if(view.querySelector('input:invalid'))throw Error('Bitte die markierte Eingabe korrigieren oder leeren.');
  }
  function enqueue(ctx) {
    const draft=serializeRun(ctx.run);ctx.pending++;status('Wird lokal gespeichert …');
    ctx.chain=ctx.chain.then(async()=>{
      if(ctx.error)return;
      draft.revision=ctx.revision+1;draft.updatedAt=new Date().toISOString();
      try {
        await save(db,draft,ctx.revision,'runs');ctx.revision=draft.revision;
        ctx.run.revision=ctx.revision;ctx.run.updatedAt=draft.updatedAt;
      } catch(e){ctx.error=e;}
    }).finally(()=>{
      ctx.pending--;
      if(ctx.error)status('Nicht gespeichert: '+ctx.error.message,true);
      else if(!ctx.pending)status(view.querySelector('input:invalid')?'Gültiger Stand gespeichert; markierte ungültige Eingabe wurde nicht übernommen.':'Test lokal gespeichert · '+new Date().toLocaleTimeString('de-DE'),!!view.querySelector('input:invalid'));
    });
  }
  async function changeScreen(name) {
    await flush();screen=name;
    if(name!=='run'){active=null;setRunActive(false);}
    editor.hidden=name!=='templates';view.hidden=name==='templates';
    byId('workspace-title').textContent={templates:'Vorlagen',runs:'Testdurchläufe',employees:'Mitarbeiter',run:'Durchführung'}[name];
    if(name==='templates')await refreshTemplates();
    if(name==='runs')await overview();
    if(name==='employees')await staff();
  }
  const nav=byId('workspace-nav');
  nav.append(button('Vorlagen',()=>changeScreen('templates')),button('Testdurchläufe',()=>changeScreen('runs')),button('Mitarbeiter',()=>changeScreen('employees')));
  const backupControls=el('div',undefined,'backup-controls');
  backupControls.append(button('Vollständiges Backup exportieren',async()=>{try{await flush();}catch(e){if(!confirm(e.message+' Nur den zuletzt erfolgreich gespeicherten Stand als Backup exportieren?'))return;}download('testorganizer.backup.json',makeBackup(await readAll(db)));status('Backup-Datei erzeugt. Bitte sicher aufbewahren.');}));
  const backupInput=el('input');backupInput.type='file';backupInput.accept='.json,application/json';
  const upload=el('label','Backup importieren','file-button');upload.append(backupInput);backupControls.append(upload);
  byId('save').before(backupControls);
  const persistent=button('Dauerhafte Speicherung anfragen',async()=>{
    const granted=await navigator.storage?.persist?.();
    status(granted?'Browser hat dauerhafte Speicherung gewährt. Zusätzlich Backup sichern.':'Dauerhafte Speicherung nicht gewährt/verfügbar. Bitte regelmäßig Backup sichern.');
  });backupControls.append(persistent);

  backupInput.onchange=action(async()=>{
    try {
      await flush();const file=backupInput.files[0];if(!file)return;
      if(file.size>100000000)throw Error('Backup größer als 100 MB.');
      const data=validateBackup(JSON.parse(await file.text()));for(const t of [...data.templates,...data.runs.map(r=>r.templateSnapshot)])await validatePrintAsset(t);
      for(const t of [...data.templates,...data.runs.map(r=>r.templateSnapshot)])for(const m of t.categories.flatMap(c=>c.materials))if(m.data){const image=new Image();image.src=m.data;await image.decode();}
      const local=await readAll(db);
      const conflicts=['templates','runs','employees'].reduce((n,key)=>n+data[key].filter(v=>local[key].some(old=>old.id===v.id)).length,0);
      const dialog=el('dialog');
      dialog.append(el('h2','Backup wiederherstellen'),el('p',`${data.templates.length} Vorlagen, ${data.runs.length} Tests, ${data.employees.length} Mitarbeiter. ${conflicts} gleiche IDs vorhanden.`),el('p','Alle Datensätze werden als zusätzliche Kopien mit neuen IDs importiert. Vorhandene Daten bleiben erhalten. Testvorlagen-Snapshots und Untersuchernamen bleiben erhalten.'));
      const confirm=button('Als zusätzliche Kopien importieren',async()=>{
        confirm.disabled=true;
        try{await importCopies(db,copyBackup(data));await refreshTemplates();dialog.close();dialog.remove();await changeScreen('runs');status('Backup vollständig als zusätzliche Kopien importiert.');}
        catch(e){confirm.disabled=false;throw e;}
      });
      dialog.append(confirm,button('Abbrechen',()=>{dialog.close();dialog.remove();}));document.body.append(dialog);dialog.showModal();
    } finally{backupInput.value='';}
  });

  async function overview() {
    view.replaceChildren(heading('LOKALER ARBEITSBEREICH','Testdurchläufe'));
    const controls=el('div',undefined,'toolbar');
    const reason=readyForRun(getTemplate());
    const start=button('Neuen Test mit ausgewählter Vorlage beginnen',async()=>{
      const run=createRun(getTemplate());await save(db,run,null,'runs');await openRun(run.id);
    });start.disabled=!!reason;controls.append(start);
    controls.append(button('Synthetische Demo mit UTN anlegen',async()=>{
      const demo=demoWithUTN();await save(db,demo,null);await refreshTemplates();
      const run=createRun(demo);await save(db,run,null,'runs');await openRun(run.id);
    }));view.append(controls);
    if(reason)view.append(el('p',reason,'notice'));
    const runs=await list(db,'runs');
    if(!runs.length)view.append(el('p','Noch keine lokalen Testdurchläufe. Eine technisch vollständige Vorlage auswählen, importieren oder die UTN-Demo anlegen.','notice'));
    for(const run of runs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))) {
      const row=el('section',undefined,'run-card');
      row.append(el('h3',`${run.testDate||'Testdatum offen'} · ${run.startedAt.slice(11)||'Beginn offen'}`),el('p',`${run.templateSnapshot.name} · ${run.templateSnapshot.age}`),el('small','Interne ID: '+run.id));
      row.append(button('Öffnen / fortsetzen',()=>openRun(run.id)),button('Test löschen',async()=>{
        if(confirm('Diesen Test dauerhaft lokal löschen? Bitte zuvor bei Bedarf ein Backup exportieren.')){await remove(db,'runs',run.id,run.revision);await overview();status('Test gelöscht.');}
      }));view.append(row);
    }
  }

  async function openRun(id,discard=false) {
    if(!discard)await flush();
    const value=await get(db,'runs',id);if(!value)throw Error('Test nicht mehr vorhanden.');
    employees=await list(db,'employees');
    active={run:serializeRun(value),revision:value.revision,pending:0,error:null,chain:Promise.resolve()};
    screen='run';setRunActive(true);editor.hidden=true;view.hidden=false;byId('workspace-title').textContent='Durchführung';
    renderRun(active);status('Test geöffnet · flüchtige Stammdaten bitte neu eingeben.');
  }

  function renderRun(ctx) {
    const run=ctx.run,t=run.templateSnapshot;
    // These values never become properties of a run, storage record, URL or backup.
    const volatile=emptyPersonal();
    view.replaceChildren(heading(t.status==='demo'?'TESTDURCHFÜHRUNG · SYNTHETISCHE DEMO':'TESTDURCHFÜHRUNG · LOKALE VORLAGE',t.name));
    view.append(el('p',`Unveränderlicher Vorlagenstand ${t.revision} · ${t.age}. `+(t.status==='demo'?'Alle Demoaufgaben und Zuordnungen sind erfunden.':'Bewertungsdaten technisch verwendbar. Inhalte und Zuordnungen stammen aus der lokalen Vorlage; keine fachliche Validierung durch die App.'),'notice'));
    const toolbar=el('div',undefined,'toolbar');
    toolbar.append(button('Zur Testübersicht',()=>changeScreen('runs')),button('Speichern erneut versuchen',()=>{
      ctx.error=null;enqueue(ctx);
    }),button('Gespeicherten Stand neu laden',async()=>{
      if(confirm('Ungesicherte Änderungen und flüchtige Stammdaten verwerfen und gespeicherten Stand laden?')){await ctx.chain;await openRun(run.id,true);}
    }));view.append(toolbar);
    const memory=el('section',undefined,'category');memory.append(el('h3','Stammdaten · nur für diese Bearbeitung'),el('p','Name, Begleitperson, Geburtsdatum, genaues Alter, Geschlechtsauswahl und Mehrsprachigkeit bleiben nur im Arbeitsspeicher. Nach Schließen oder erneutem Öffnen werden sie neu eingegeben.','small'));
    const memoryGrid=el('div',undefined,'form-grid'),age=el('p','Alter: noch nicht berechnet','age-display');
    const updateAge=()=>{
      if(!volatile.birthDate){age.textContent='Alter: noch nicht berechnet';return;}
      try{const a=calendarAge(volatile.birthDate,run.testDate);age.textContent=`Alter: ${a.years} Jahre, ${a.months} Monate, ${a.days} Tage`;age.className='age-display';}
      catch(e){age.textContent=e.message;age.className='error';}
    };
    for(const [key,label,type] of [['childName','Name des Kindes','text'],['companion','Begleitperson','text'],['birthDate','Geburtsdatum','date']]) {
      const f=field(label,type,'',value=>{volatile[key]=value;updateAge();},key);f.input.maxLength=120;memoryGrid.append(f.wrap);
    }
    const sex=el('fieldset',undefined,'personal-choices');sex.append(el('legend','Geschlecht · optional'));
    for(const [value,label] of [[null,'Keine Angabe'],['girl','Mädchen'],['boy','Junge']]){
      const wrap=el('label'),input=el('input');input.type='radio';input.name='personal-sex';input.id='sex-'+(value||'none');input.value=value||'';input.checked=value===null;input.autocomplete='off';input.onchange=()=>{if(input.checked)chooseSex(volatile,value);};wrap.append(input,document.createTextNode(label));sex.append(wrap);
    }
    const multilingual=el('label',undefined,'personal-checkbox'),multilingualInput=el('input');multilingualInput.type='checkbox';multilingualInput.id='multilingual';multilingualInput.autocomplete='off';multilingualInput.onchange=()=>volatile.multilingual=multilingualInput.checked;multilingual.append(multilingualInput,document.createTextNode('Mehrsprachigkeit'));
    memory.append(memoryGrid,sex,multilingual,age);view.append(memory);toolbar.prepend(button('PDF-Vorschau / Drucken',async()=>{await flush();showPrintDialog(ctx.run,volatile,status);}));
    const dates=el('section',undefined,'category'),grid=el('div',undefined,'form-grid');dates.append(el('h3','Untersuchung · wird lokal gespeichert'));
    const warning=el('div',undefined,'time-warnings');
    const updateWarnings=()=>warning.replaceChildren(...timeWarnings(run).map(w=>el('p',w,'notice')));
    for(const [key,label,type,nowLabel,now] of [['testDate','Testdatum','date','Heute',localDate],['startedAt','Untersuchungsbeginn','datetime-local','Jetzt',localDateTime],['endedAt','Untersuchungsende','datetime-local','Jetzt',localDateTime]]) {
      const f=field(label,type,run[key],(value,input)=>{
        if(input.validity.badInput){status('Ungültige Datums-/Zeiteingabe wurde nicht gespeichert.',true);return;}
        const draft={...run,[key]:value};
        try{serializeRun(draft);input.setCustomValidity('');}
        catch(e){input.setCustomValidity(e.message);status(e.message,true);return;}
        run[key]=value;enqueue(ctx);updateAge();updateWarnings();
      },key);
      f.wrap.append(button(nowLabel,()=>{run[key]=now();f.input.value=run[key];f.input.setCustomValidity('');enqueue(ctx);updateAge();updateWarnings();}));grid.append(f.wrap);
    }
    const examinerLabel=el('label','Untersucher'),examiner=el('select');examiner.id='examiner';
    const empty=el('option','Noch nicht ausgewählt');empty.value='';examiner.append(empty);
    const storedExaminer=structuredClone(run.examiner),options=[...employees];
    if(run.examiner&&!options.some(e=>e.id===run.examiner.id&&e.name===run.examiner.name))options.unshift({...run.examiner,id:'saved-examiner'});
    for(const e of options){const o=el('option',e.name+(e.id==='saved-examiner'?' (gespeicherter Stand)':''));o.value=e.id;examiner.append(o);}
    examiner.value=run.examiner?(options.some(e=>e.id===run.examiner.id&&e.name===run.examiner.name)?run.examiner.id:'saved-examiner'):'';
    examiner.onchange=()=>{const selected=options.find(e=>e.id===examiner.value);run.examiner=selected?(selected.id==='saved-examiner'?storedExaminer:{id:selected.id,name:selected.name}):null;enqueue(ctx);};
    examinerLabel.append(examiner);grid.append(examinerLabel);dates.append(grid,warning);updateWarnings();view.append(dates);
    const results=el('section',undefined,'category results');results.id='results';view.append(results);
    const refreshResults=()=>{
      const result=calculate(run);results.replaceChildren(el('h3','Rohwerte · keine fachliche Interpretation'));
      const values=el('div',undefined,'raw-values');
      for(const key of ['KM','HM','KOG','SPR','SOZ-EMO','UTN'])values.append(el('div',`${key}: ${result.raw[key]??'—'}`));results.append(values);
      results.append(el('p',`${result.open.length} reguläre Aufgaben und ${result.openUTN.length} UTN-Zeichnungen offen. Offene Bewertungen zählen rechnerisch als 0. SOZ-EMO bleibt ohne Eingabe leer.`,'small'));
      const details=el('details');details.append(el('summary','Offene Bewertungen anzeigen'));
      for(const a of result.open)details.append(el('p',`Nr. ${a.number}: ${a.title}`));
      for(const a of result.openUTN)details.append(el('p','UTN: '+a));
      if(result.missingSOZ)details.append(el('p','SOZ-EMO fehlt.'));results.append(details);
    };
    const soz=el('section',undefined,'category');soz.append(el('h3','SOZ-EMO · manueller Rohwert'));
    const sozField=field('Bereits ermittelter SOZ-EMO-Rohwert','text',run.sozEmo??'',(value,input)=>{
      const number=value.trim()===''?null:Number(value.replace(',','.'));
      if(number!==null&&!Number.isFinite(number)){input.setCustomValidity('Bitte eine Zahl eingeben oder das Feld leeren.');status('SOZ-EMO-Eingabe ist ungültig; nicht gespeichert.',true);return;}
      input.setCustomValidity('');run.sozEmo=number;enqueue(ctx);refreshResults();
    },'sozEmo');sozField.input.inputMode='decimal';soz.append(sozField.wrap,el('p','Keine fachlich verifizierten Wertebereiche hinterlegt. Ausdrücklich eingegebene 0 bleibt erhalten.','small'));view.append(soz);
    for(const [ci,c] of t.categories.entries()) {
      const section=el('section',undefined,'category');section.id='run-category-'+ci;section.append(el('h3','Ablaufkategorie '+c.id));
      const materials=el('div',undefined,'materials');
      for(const m of c.materials){const card=el('div',undefined,'material');if(m.data){const img=el('img');img.src=m.data;img.alt=m.caption;card.append(img);}else card.append(el('div','Bild fehlt','placeholder'));card.append(el('p',m.caption,'small'));materials.append(card);}section.append(materials);
      for(const task of c.tasks) {
        const row=el('div',undefined,'task run-task'),label=el('div');label.append(el('span',`Nr. ${task.originalNumber}${task.tCode?' · '+task.tCode:''}`,'number'),el('strong',task.title));
        if(formatPi(task))label.append(el('p',formatPi(task),'pi-value'));
        if(taskReviewNote(task))label.append(el('p',taskReviewNote(task),'source-note'));
        row.append(label,el('span',task.kind==='utn'?'UTN':task.area,'area'));
        if(task.kind==='regular'){
          const group=el('div',undefined,'answer-group');group.setAttribute('role','group');group.setAttribute('aria-label','Bewertung Aufgabe '+task.originalNumber);
          for(const [value,label,accessible] of [['open','Offen','Offen: noch nicht bewertet; Bewertung zurücksetzen'],['yes','Ja','Ja: Aufgabe erfüllt'],['no','Nein','Nein: Aufgabe nicht erfüllt']]){
            const b=button(label,()=>{run.answers[task.id]=value;for(const item of group.children)item.setAttribute('aria-pressed',String(item.dataset.value===value));enqueue(ctx);refreshResults();});
            b.dataset.value=value;b.setAttribute('aria-label',accessible);b.setAttribute('aria-pressed',String(run.answers[task.id]===value));group.append(b);
          }row.append(group);
        }else{
          const drawingGrid=el('div',undefined,'drawing-grid');
          for(const drawing of t.utn.items){
            const f=field(`${drawing.label} · ${drawing.tCode}`,'text',run.utn[drawing.id]??'',(value,input)=>{
              const number=value===''?null:Number(value);
              if(value!==''&&(!/^\d+$/.test(value)||!Number.isInteger(number)||number<t.utn.min||number>t.utn.max)){
                input.setCustomValidity(`Ganze Zahl ${t.utn.min}–${t.utn.max} oder leer erforderlich.`);status('UTN-Eingabe ungültig; nicht gespeichert.',true);return;
              }
              input.setCustomValidity('');run.utn[drawing.id]=number;enqueue(ctx);refreshResults();
            },'drawing-'+drawing.id);f.input.inputMode='numeric';drawingGrid.append(f.wrap);
          }row.append(drawingGrid);
        }section.append(row);
      }view.append(section);
    }
    refreshResults();
  }

  async function staff() {
    view.replaceChildren(heading('LOKALE VERWALTUNG','Mitarbeiter'));
    const form=el('div',undefined,'form-grid'),name=field('Neuer Mitarbeiter','text','',(value,input)=>input.dataset.unsavedDraft=String(value!==''),'employee-name');name.input.maxLength=120;
    form.append(name.wrap,button('Mitarbeiter hinzufügen',async()=>{
      await save(db,{id:crypto.randomUUID(),revision:1,name:name.input.value.trim()},null,'employees');await staff();status('Mitarbeiter lokal gespeichert.');
    }));view.append(form,el('p','Untersuchernamen werden im Test als eigener Stand gesichert. Änderungen dieser Liste ändern bestehende Tests nicht.','notice'));
    for(const employee of await list(db,'employees')){
      const row=el('section',undefined,'category'),edit=field('Mitarbeitername','text',employee.name,(value,input)=>input.dataset.unsavedDraft=String(value!==employee.name));edit.input.maxLength=120;
      row.append(edit.wrap,button('Änderung speichern',async()=>{await save(db,{id:employee.id,revision:employee.revision+1,name:edit.input.value.trim()},employee.revision,'employees');await staff();status('Mitarbeiter aktualisiert.');}),button('Mitarbeiter entfernen',async()=>{
        if(confirm('Mitarbeiter aus dieser Liste entfernen? Gespeicherte Tests behalten ihren Untersuchernamen.')){await remove(db,'employees',employee.id,employee.revision);await staff();}
      }));view.append(row);
    }
  }
  byId('template').addEventListener('change',action(async()=>{if(screen==='runs')await overview();}));
  window.addEventListener('testorganizer-templates-changed',action(async()=>{if(screen==='runs')await overview();}));
  window.addEventListener('beforeunload',event=>{if(active&&(active.pending||active.error)){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pageshow',event=>{if(event.persisted&&active)renderRun(active);});
  window.addEventListener('pagehide',()=>{view.querySelectorAll('#childName,#companion,#birthDate').forEach(input=>input.value='');view.querySelectorAll('[name="personal-sex"],#multilingual').forEach(input=>input.checked=input.id==='sex-none');});
}
