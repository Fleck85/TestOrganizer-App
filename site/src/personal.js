// Volatile form state only. Never pass this object to storage or backups.
export function emptyPersonal(){return {childName:'',companion:'',birthDate:'',sex:null,multilingual:false};}
export function chooseSex(personal,value){
  if(![null,'girl','boy'].includes(value))throw Error('Ungültige Geschlechtsauswahl.');
  personal.sex=value;
}
