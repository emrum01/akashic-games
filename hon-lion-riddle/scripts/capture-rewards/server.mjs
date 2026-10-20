import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = process.env.CAPTURE_OUTPUT;
if (!output) throw new Error('Set CAPTURE_OUTPUT to an empty output directory');
const source = process.env.SCENE_SOURCE;
if (!source) throw new Error('Set SCENE_SOURCE to the approved ear-scope-free-scene directory');
const gun = process.env.GUN_ASSET || path.resolve(here, '../../assets/models/tripo-raygun.glb');
const padlock = process.env.PADLOCK_ASSET;
const types = {
  '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.mp4': 'video/mp4',
};
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('CAPTURE_OUTPUT must be empty; use a new directory for each capture session');

function captureName(name) {
  return name === 'reward-audit.json' || /^reward-padlock-[0-9]{1,3}-(?:wide|portrait)\.jpg$/.test(name) || /^reward-(?:c-key|key-cabinet|cabinet-open|cabinet-take|cabinet-stow|cabinet-door-key|cabinet-entry)-(?:wide|portrait)\.(?:webm|jpg|json)$/.test(name)
    || /^reward-(?:c|key|cabinet|cabinet-open|gun-held|gun-stowed|armed|entry)-(?:wide|portrait)\.jpg$/.test(name)
    || /^reward-(?:wide|portrait)\.json$/.test(name);
}
function route(pathname) {
  if (pathname === '/') return `${here}/index.html`;
  if (['/capture-harness.js','/capture-io.js'].includes(pathname)) return `${here}${pathname}`;
  if (pathname === '/scene.glb') return `${source}/public/scene.glb`;
  if (pathname === '/scene-manifest.json') return `${source}/public/scene-manifest.json`;
  if (pathname === '/gun.glb') return gun;
  if (pathname === '/padlock.glb') return padlock || null;
  if (pathname.startsWith('/vendor/') && !pathname.includes('..')) return `${source}/node_modules/three/${pathname.slice(8)}`;
  return null;
}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8812');
    if (req.method === 'POST' && url.pathname.startsWith('/save/')) {
      const name = path.basename(url.pathname.slice('/save/'.length));
      if (!captureName(name)) { res.writeHead(400).end('invalid capture name'); return; }
      const chunks = []; let total = 0;
      for await (const chunk of req) { total += chunk.length; if (total > 90e6) throw new Error('capture too large'); chunks.push(chunk); }
      const target = `${output}/${name}`;
      await writeFile(`${target}.partial`, Buffer.concat(chunks));
      await rename(`${target}.partial`, target);
      res.end('saved');
      console.log(`Saved ${name} (${total} bytes)`);
      return;
    }
    const file = route(url.pathname);
    if (!file) { res.writeHead(404).end(); return; }
    if (url.pathname === '/gun.glb') {
      try { await stat(file); } catch { res.writeHead(424).end('Tripo gun.glb is required'); return; }
    }
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    createReadStream(file).on('error', () => res.end()).pipe(res);
  } catch (error) { res.writeHead(500).end(String(error)); }
}).listen(8812, '127.0.0.1', () => console.log('Cabinet capture preview http://127.0.0.1:8812/'));
