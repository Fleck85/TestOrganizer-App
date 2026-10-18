import {validateTemplate} from './model.js';
import {serializeRun,employeeRecord} from './runs.js';

export function validateBackup(value) {
  if (!value || value.format!=='testorganizer-backup' || value.version!==1) throw Error('Unbekanntes Backupformat oder inkompatible Version.');
  const result={};
  for(const [name,fn] of Object.entries({templates:validateTemplate,runs:serializeRun,employees:employeeRecord})) {
    if (!Array.isArray(value[name]) || value[name].length>10000) throw Error('Ungültige Backup-Sammlung: '+name);
    result[name]=value[name].map(fn);
    if(new Set(result[name].map(v=>v.id)).size!==result[name].length)throw Error('Doppelte IDs im Backup: '+name);
  }
  return result;
}
export function makeBackup(data,now=new Date()) {
  const clean=validateBackup({format:'testorganizer-backup',version:1,...data});
  return {format:'testorganizer-backup',version:1,createdAt:now.toISOString(),...clean};
}
export function copyBackup(data,id=()=>crypto.randomUUID()) {
  const clean=validateBackup({format:'testorganizer-backup',version:1,...data});
  const employeeIds=new Map(clean.employees.map(e=>[e.id,id()]));
  return {
    templates:clean.templates.map(t=>({...t,id:id(),revision:1})),
    employees:clean.employees.map(e=>({...e,id:employeeIds.get(e.id),revision:1})),
    runs:clean.runs.map(r=>({...r,id:id(),revision:1,examiner:r.examiner?{...r.examiner,id:employeeIds.get(r.examiner.id)??r.examiner.id}:null}))
  };
}
