import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const manifest=JSON.parse(await readFile(join(root,'assets','source-snapshot.json'),'utf8'));
const activeFiles=manifest.files.filter((item)=>item.retired!==true);
for(const item of activeFiles){const p=resolve(root,item.destination);const digest=createHash('sha256').update(await readFile(p)).digest('hex');if(digest!==item.sha256)throw new Error(`hash mismatch: ${item.destination}`);if((await stat(p)).size===0)throw new Error(`empty snapshot: ${item.destination}`)}
console.log(`source snapshot OK (${activeFiles.length} active files; ${manifest.files.length-activeFiles.length} retired)`);
