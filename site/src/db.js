import {validateTemplate,initialTemplates} from './model.js';
import {serializeRun,employeeRecord} from './runs.js';
const project = {templates:validateTemplate,runs:serializeRun,employees:employeeRecord};
const request = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const storageError = error => Error(error?.name==='QuotaExceededError' ? 'Lokaler Speicher voll. Bitte Backup exportieren und Speicherplatz prüfen.' : error?.message || 'Lokale Speicherung fehlgeschlagen.');

export async function openDB(name='testorganizer') {
  const r = indexedDB.open(name,3);
  r.onupgradeneeded = event => {
    for (const name of Object.keys(project)) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name,{keyPath:'id'});
    if(!r.result.objectStoreNames.contains('meta'))r.result.createObjectStore('meta',{keyPath:'id'});
    // Existing installations, including intentionally empty databases, are never reseeded.
    if(event.oldVersion>0)r.transaction.objectStore('meta').put({id:'templatesInitialized',done:true});
  };
  const db = await new Promise((resolve,reject)=>{
    let blocked=false;
    r.onsuccess=()=>{if(blocked)r.result.close();else resolve(r.result);};
    r.onerror=()=>reject(r.error);
    r.onblocked=()=>{blocked=true;reject(Error('Datenbankaktualisierung blockiert. Bitte andere TestOrganizer-Tabs schließen und neu laden.'));};
  });
  db.onversionchange=()=>db.close();
  return db;
}
export function initializeTemplates(db){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['templates','meta'],'readwrite'),templates=tx.objectStore('templates'),meta=tx.objectStore('meta');
    const flag=meta.get('templatesInitialized');
    flag.onsuccess=()=>{if(flag.result)return;const count=templates.count();count.onsuccess=()=>{if(count.result===0)for(const t of initialTemplates())templates.add(t);meta.put({id:'templatesInitialized',done:true});};};
    tx.oncomplete=resolve;tx.onabort=()=>reject(storageError(tx.error));tx.onerror=()=>{};
  });
}
export async function list(db,store='templates') {return request(db.transaction(store).objectStore(store).getAll());}
export async function get(db,store,id) {return request(db.transaction(store).objectStore(store).get(id));}

export function save(db,value,expected,storeName='templates') {
  const clean=project[storeName](value);
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readwrite'), store=tx.objectStore(storeName);let reason;
    const r=store.get(clean.id);
    r.onsuccess=()=>{
      const old=r.result;
      if (old ? old.revision!==expected : expected!==null) reason='Der Datensatz wurde in einem anderen Tab geändert oder gelöscht. Gespeicherten Stand neu laden.';
      if (old && clean.revision!==old.revision+1) reason='Ungültige Datensatzrevision.';
      if (old && storeName==='runs' && JSON.stringify(old.templateSnapshot)!==JSON.stringify(clean.templateSnapshot)) reason='Der Vorlagenstand eines Tests darf nicht verändert werden.';
      if (reason) {tx.abort();return;}
      store.put(clean);
    };
    tx.oncomplete=()=>resolve(clean);
    tx.onabort=()=>reject(reason?Error(reason):storageError(tx.error));tx.onerror=()=>{};
  });
}
export function remove(db,storeName,id,expected) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName);let reason;
    const r=store.get(id);
    r.onsuccess=()=>{if(!r.result || r.result.revision!==expected){reason='Datensatz wurde zwischenzeitlich geändert. Bitte neu öffnen.';tx.abort();}else store.delete(id);};
    tx.oncomplete=resolve;tx.onabort=()=>reject(reason?Error(reason):storageError(tx.error));tx.onerror=()=>{};
  });
}
export function readAll(db) {
  return new Promise((resolve,reject)=>{
    const names=Object.keys(project),tx=db.transaction(names),result={};
    for(const name of names){const r=tx.objectStore(name).getAll();r.onsuccess=()=>result[name]=r.result;}
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(storageError(tx.error));tx.onerror=()=>{};
  });
}
export function importCopies(db,data) {
  const clean=Object.fromEntries(Object.entries(project).map(([name,fn])=>[name,data[name].map(fn)]));
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(Object.keys(project),'readwrite');
    for(const [name,values] of Object.entries(clean)) for(const value of values) tx.objectStore(name).add(value);
    tx.oncomplete=resolve;tx.onabort=()=>reject(storageError(tx.error));tx.onerror=()=>{};
  });
}
