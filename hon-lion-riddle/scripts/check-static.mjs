import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
const root=resolve(process.argv[2] || new URL('../dist/public', import.meta.url).pathname);
const allowed=new Set(['.html','.css','.js','.json','.txt','.png','.jpg','.jpeg','.webp','.svg','.ico','.mp4','.ogg','.m4a']);
const forbidden=/(worker|\.dev\.vars|\.env|\.test\.|package(-lock)?\.json|README|DESIGN|ADR|CREDITS|source-snapshot)/i;
const files=[];
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await scan(p);else files.push(p)}}
await scan(root);
if(!files.some(p=>p.endsWith('/index.html')))throw new Error('static output missing index.html');
const bad=files.filter(p=>{
  const rel=relative(root,p);
  return !allowed.has(p.slice(p.lastIndexOf('.')).toLowerCase())||forbidden.test(rel)||rel.endsWith('.glb')||rel.endsWith('.gltf')||rel.endsWith('.bin')||rel.startsWith('assets/scene/')||rel.startsWith('assets/scenes/')||rel.startsWith('vendor/');
});
for (const p of files) { const info=await stat(p); if(info.size >= 25*1024*1024) throw new Error(`static asset exceeds 25MiB: ${relative(root,p)}`); }
if(bad.length)throw new Error(`static allowlist violation:\n${bad.join('\n')}`);
const localPath = /(?:^|["'])(?:\/(?:Users|home)\/|[A-Za-z]:[\\/])/;
const forbiddenDemoFixture = /demoJudge|洋館は幻覚|耳に入った虫が自分の脳を食べ|捕食音/;
for (const p of files.filter(file => file.endsWith('.json'))) {
  if (localPath.test(await readFile(p, 'utf8'))) throw new Error(`public metadata contains a local absolute path: ${relative(root,p)}`);
}
for (const p of files.filter(file => /\.(?:html|css|js|json|txt)$/i.test(file))) {
  if (forbiddenDemoFixture.test(await readFile(p, 'utf8'))) throw new Error(`public output contains demo judging or solution fixture text: ${relative(root,p)}`);
}
console.log(`static allowlist OK (${files.length} files)`);
