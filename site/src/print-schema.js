const scalarBindings=['childName','companion','birthDate','examiner','testDate','startedTime','endedTime','multilingual'];
const rawAreas=['KM','HM','KOG','SPR','SOZ-EMO','UTN'];
export function validatePrintLayout(layout,template) {
  if(!layout||layout.version!==1||!['synthetic','original'].includes(layout.kind)||typeof layout.approved!=='boolean'||typeof layout.pdfData!=='string'||layout.pdfData.length>36000000||!/^data:application\/pdf;base64,[A-Za-z0-9+/]+=*$/.test(layout.pdfData))throw Error('Ungültige lokale Druck-PDF oder Druckformat-Version.');
  if(!Array.isArray(layout.pages)||layout.pages.length!==4)throw Error('Druckvorlage benötigt vier Seiten.');
  const pages=layout.pages.map(p=>{
    if(!p||!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<100||p.height<100||p.width>2000||p.height>2000)throw Error('Ungültige Seitengröße.');
    return {width:p.width,height:p.height};
  });
  if(!Array.isArray(layout.fields)||layout.fields.length>2000)throw Error('Ungültige Druckkoordinaten.');
  const tasks=template.categories.flatMap(c=>c.tasks),drawings=template.utn?.items||[];
  const fields=layout.fields.map(f=>{
    if(!f||!Number.isInteger(f.page)||f.page<0||f.page>=4||!Number.isFinite(f.x)||!Number.isFinite(f.y)||!Number.isFinite(f.width)||!Number.isFinite(f.size)||f.x<0||f.y<0||f.width<8||f.size<4||f.size>28||f.x+f.width>pages[f.page].width||f.y+f.size>pages[f.page].height)throw Error('Druckkoordinate liegt außerhalb der Seite oder ist ungültig.');
    const b=f.binding;let binding;
    if(!b||typeof b!=='object')throw Error('Druckfeld-Zuordnung fehlt.');
    if(scalarBindings.includes(b.type))binding={type:b.type};
    else if(b.type==='sex'&&['girl','boy'].includes(b.value))binding={type:'sex',value:b.value};
    else if(b.type==='age'&&['years','months','days'].includes(b.unit))binding={type:'age',unit:b.unit};
    else if(b.type==='raw'&&rawAreas.includes(b.area))binding={type:'raw',area:b.area};
    else if(b.type==='answer'&&['yes','no'].includes(b.state)&&tasks.some(t=>t.id===b.taskId&&t.kind==='regular'))binding={type:'answer',taskId:b.taskId,state:b.state};
    else if(b.type==='utn'&&drawings.some(t=>t.id===b.drawingId))binding={type:'utn',drawingId:b.drawingId};
    else if(b.type==='utnSubtotal'&&Array.isArray(b.drawingIds)&&b.drawingIds.length>0&&new Set(b.drawingIds).size===b.drawingIds.length&&b.drawingIds.every(id=>drawings.some(t=>t.id===id)))binding={type:'utnSubtotal',drawingIds:[...b.drawingIds]};
    else throw Error('Ungültige Druckfeld-Referenz.');
    return {page:f.page,x:f.x,y:f.y,width:f.width,size:f.size,binding};
  });
  return {version:1,kind:layout.kind,approved:layout.approved,pdfData:layout.pdfData,pages,fields};
}
export function bindingKey(b) {
  if(b.type==='sex')return `sex:${b.value}`;
  if(b.type==='answer')return `answer:${b.taskId}:${b.state}`;
  if(b.type==='utn')return `utn:${b.drawingId}`;
  if(b.type==='utnSubtotal')return 'utnSubtotal:'+b.drawingIds.join(',');
  return b.type+(b.area?':'+b.area:b.unit?':'+b.unit:'');
}
export function missingPrintFields(template,layout) {
  const expected=scalarBindings.map(type=>({type}));
  expected.push({type:'sex',value:'girl'},{type:'sex',value:'boy'});
  for(const unit of ['years','months','days'])expected.push({type:'age',unit});
  for(const area of rawAreas)expected.push({type:'raw',area});
  for(const t of template.categories.flatMap(c=>c.tasks).filter(t=>t.kind==='regular'))for(const state of ['yes','no'])expected.push({type:'answer',taskId:t.id,state});
  const drawings=template.utn?.items||[];
  for(const d of drawings)expected.push({type:'utn',drawingId:d.id});
  if(drawings.length){expected.push({type:'utnSubtotal',drawingIds:drawings.slice(0,4).map(d=>d.id)},{type:'utnSubtotal',drawingIds:drawings.slice(4).map(d=>d.id)});}
  const existing=new Set(layout.fields.map(f=>bindingKey(f.binding)));
  return expected.filter(b=>!existing.has(bindingKey(b))).map(bindingKey);
}
