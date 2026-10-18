import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
const expected=['.nojekyll','icon-192.png','icon-512.png','icon.svg','index.html','manifest.webmanifest','sw.js','version.json','src/app.js','src/backup.js','src/db.js','src/model.js','src/pdf.js','src/personal.js','src/print-schema.js','src/print-ui.js','src/pwa.js','src/runs.js','src/stage2-ui.js','src/style.css','src/fonts/LiberationSans-Regular.ttf','src/fonts/LICENSE_LIBERATION','src/vendor/FONTKIT-LICENSE.txt','src/vendor/fontkit.mjs','src/vendor/PAKO-LICENSE.txt','src/vendor/pako.mjs','src/vendor/PDF-LIB-LICENSE.md','src/vendor/pdf-lib.mjs'].sort();
async function walk(dir){let all=[];for(const name of await readdir(dir)){const p=resolve(dir,name),s=await lstat(p);if(s.isSymbolicLink())throw Error('Symlink verboten');if(s.isDirectory())all.push(...await walk(p));else if(s.isFile())all.push(p);else throw Error('Unzulässige Datei');}return all;}
const root=resolve(import.meta.dirname),site=resolve(root,'site'),manifest=JSON.parse(await readFile(resolve(root,'release-manifest.json'),'utf8'));
const actual=(await walk(site)).map(p=>relative(site,p).replaceAll('\\','/')).sort();
if(manifest.format!=='testorganizer-public-release'||JSON.stringify(actual)!==JSON.stringify(expected)||JSON.stringify(manifest.files.map(f=>f.path).sort())!==JSON.stringify(expected))throw Error('Öffentliche Dateiliste stimmt nicht überein.');
for(const file of manifest.files){const bytes=await readFile(resolve(site,file.path));if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Prüfsumme falsch: '+file.path);}
console.log(`Release ${manifest.version}: ${actual.length} öffentliche App-Dateien geprüft.`);
