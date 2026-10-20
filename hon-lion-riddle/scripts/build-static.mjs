import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const source = join(root, 'app');
const out = join(root, 'dist', 'public');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
async function copy(dir, rel='') { for (const entry of await readdir(dir, { withFileTypes:true })) { const src=join(dir,entry.name); const target=join(out,rel,entry.name); if(entry.isDirectory()){await mkdir(target,{recursive:true});await copy(src,join(rel,entry.name));} else await cp(src,target); } }
await copy(source);
console.log(`static output: ${out}`);
