let runActive=false,pending=0,frozen=false,registration,deferredInstall;
let freezeTimer;
function releaseFreeze(){clearTimeout(freezeTimer);frozen=false;document.body.inert=false;}
let statusNode,updateButton,installButton,readyButton;
const BUSY_TEXT='Update erst möglich, wenn alle Tests geschlossen und Änderungen gespeichert sind.';
export function setRunActive(value){runActive=value;refreshButtons();}
export function setTemplatePending(value){pending+=value?1:-1;pending=Math.max(0,pending);refreshButtons();}
function busy(){return runActive||pending>0||!!document.querySelector('[data-unsaved-draft="true"]');}
function refreshButtons(){if(updateButton){updateButton.hidden=!registration?.waiting;updateButton.disabled=busy();updateButton.title=busy()?BUSY_TEXT:'';}}
function message(worker,data,timeout=5000){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Offline-Prüfung ohne Antwort. Bitte erneut prüfen.')),timeout);channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data);channel.port1.close();};worker.postMessage(data,[channel.port2]);});}
async function checkReady(){
  if(!registration?.active||!navigator.serviceWorker.controller){statusNode.textContent='Offline-Vorbereitung läuft. Nach vollständigem Laden erneut prüfen.';return false;}
  const state=await message(registration.active,{type:'CHECK_CACHE'});
  statusNode.textContent=state.ok?`Offline bereit · ${state.count} Programmressourcen geprüft${navigator.onLine?'':' · Gerät offline'}.`:'Offline nicht bereit: Programmressourcen fehlen. Mit Internet erneut laden und prüfen.';
  return state.ok;
}
export async function mountPWA(container) {
  const make=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  statusNode=make('p','Offline-Vorbereitung wird geprüft …');statusNode.id='offline-status';statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');
  readyButton=make('button','Offline-Bereitschaft prüfen');readyButton.type='button';readyButton.onclick=()=>checkReady().catch(e=>statusNode.textContent=e.message);
  updateButton=make('button','Update jetzt anwenden');updateButton.type='button';updateButton.hidden=true;
  updateButton.onclick=()=>{
    if(busy()){statusNode.textContent=BUSY_TEXT;return;}
    const dialog=make('dialog',''),title=make('h2','Update anwenden?');
    dialog.append(title,make('p','Die App prüft alle geöffneten Tabs. Laufende Tests und ausstehende Änderungen blockieren das Update. Bereite Tabs werden nach Ihrer Bestätigung neu geladen.'));
    const cancel=make('button','Weiterarbeiten'),apply=make('button','Jetzt aktualisieren');
    cancel.onclick=()=>dialog.close();apply.onclick=()=>{dialog.close();if(!busy())registration.waiting?.postMessage({type:'REQUEST_ACTIVATION'});else statusNode.textContent=BUSY_TEXT;};
    dialog.append(cancel,apply);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  };
  const checkUpdate=make('button','Nach Updates suchen');checkUpdate.type='button';checkUpdate.onclick=async()=>{try{await registration?.update();refreshButtons();statusNode.textContent=registration?.waiting?'Update heruntergeladen. Tests schließen und Update ausdrücklich anwenden.':'Update-Prüfung abgeschlossen. Neue Versionen erscheinen nach dem Herunterladen.';}catch{statusNode.textContent='Update-Prüfung benötigt eine Verbindung. Offline weiterarbeiten ist möglich.';}};
  installButton=make('button','App installieren');installButton.type='button';installButton.onclick=async()=>{if(deferredInstall){await deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;}else alert('Installation: Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. Auf dem iPad in Safari: Teilen → Zum Home-Bildschirm. HTTPS oder localhost erforderlich.');};
  container.append(statusNode,readyButton,installButton,checkUpdate,updateButton);
  document.addEventListener('input',refreshButtons);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;});
  if(!('serviceWorker' in navigator)||!window.isSecureContext){statusNode.textContent='PWA benötigt HTTPS oder localhost und Service-Worker-Unterstützung.';readyButton.disabled=true;updateButton.disabled=true;return;}
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='PREPARE_UPDATE'){
      if(busy()){event.ports[0]?.postMessage({ready:false});return;}
      frozen=true;document.body.inert=true;clearTimeout(freezeTimer);freezeTimer=setTimeout(()=>{releaseFreeze();statusNode.textContent="Update nicht abgeschlossen. Weiterarbeiten ist möglich; später erneut prüfen.";},10000);event.ports[0]?.postMessage({ready:true});
    }
    if(event.data?.type==='CANCEL_UPDATE'){releaseFreeze();statusNode.textContent=BUSY_TEXT;}
    if(event.data?.type==='UPDATE_ACTIVATED'){
      if(frozen&&!busy())location.reload();
      else {releaseFreeze();statusNode.textContent='Neue Version aktiviert. Aktuelle Bearbeitung bleibt geöffnet; später manuell neu laden.';}
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{checkReady().catch(e=>statusNode.textContent=e.message);});
  try {
    registration=await navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname,updateViaCache:'none'});
    registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{refreshButtons();if(worker.state==='installed'){if(registration.waiting)statusNode.textContent='Update heruntergeladen. Aktivierung erst nach ausdrücklicher Auswahl.';else checkReady().catch(()=>{});}if(worker.state==='redundant')statusNode.textContent=registration.active?'Update nicht vollständig geladen. Vorhandene Version bleibt verfügbar; später erneut prüfen.':'Offline-Vorbereitung fehlgeschlagen. Verbindung prüfen, neu laden und Bereitschaft erneut prüfen.';});});
    refreshButtons();await navigator.serviceWorker.ready;await checkReady();
    for(const event of ['online','offline','focus'])window.addEventListener(event,()=>checkReady().catch(e=>statusNode.textContent=e.message));
  }catch(e){statusNode.textContent='Offline nicht vorbereitet. Statischen Build über HTTPS/localhost öffnen. '+e.message;}
}
