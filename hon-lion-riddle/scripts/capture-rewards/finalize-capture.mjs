import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const edges=['c-key','key-cabinet','cabinet-open','cabinet-take','cabinet-stow','cabinet-door-key','cabinet-entry'];
const posters=['key','cabinet','cabinet-open','gun-held','gun-stowed','armed'];
const profiles=['wide','portrait'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateCaptureReports(info,cameras) {
  for(const [field,value] of Object.entries({scene:info.scene?.sha256,gun:info.gun_sha256,padlock:info.padlock_sha256})) {
    if(!/^[a-f0-9]{64}$/.test(value||''))throw Error(`Missing capture identity: ${field}`);
  }
  for(const profile of profiles) {
    const report=cameras[profile];
    if(report?.profile!==profile||report.sourceScene!==info.scene.sha256||
      report.gunSha256!==info.gun_sha256||report.padlockSha256!==info.padlock_sha256)
      throw Error(`Capture identity mismatch: ${profile}`);
    if(JSON.stringify(Object.keys(report.records||{}).sort())!==JSON.stringify([...edges].sort()))
      throw Error(`Incomplete capture edges: ${profile}`);
    for(const [edge,record] of Object.entries(report.records)) {
      if(!Number.isFinite(record.seconds)||record.seconds<=0||!Number.isInteger(record.frames)||record.frames<=0)
        throw Error(`Incomplete capture recording: ${profile}/${edge}`);
    }
  }
}
export async function finalizeCapture(root,info,errors=[]) {
  if(info.status!=='ready'||!info.padlock_sha256)throw Error('A complete licensed-padlock capture audit is required');
  if(errors.length)throw Error(JSON.stringify(errors));
  const cameras=Object.fromEntries(await Promise.all(profiles.map(async profile=>
    [profile,JSON.parse(await readFile(path.join(root,`reward-${profile}.json`),'utf8'))])));
  validateCaptureReports(info,cameras);
  for(const profile of profiles) {
    for(const edge of edges) {
      const name=`reward-${edge}-${profile}`;
      execFileSync(process.env.FFMPEG_BIN||'ffmpeg',['-hide_banner','-loglevel','error','-y',
        '-i',path.join(root,name+'.webm'),'-an','-r','30','-c:v','libx264','-preset','medium',
        '-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,name+'.mp4')]);
    }
  }
  const names=profiles.flatMap(profile=>[
    ...edges.map(edge=>`reward-${edge}-${profile}.mp4`),
    ...posters.map(poster=>`reward-${poster}-${profile}.jpg`)]).sort();
  const hashes=Object.fromEntries(await Promise.all(names.map(async name=>[name,sha(await readFile(path.join(root,name)))])));
  const manifest={schema:'hon-lion-reward-capture-v1',asset_revision:sha(JSON.stringify(hashes)),
    profiles:{wide:{width:1280,height:720},portrait:{width:720,height:1280}},
    clips:Object.fromEntries(edges.map(edge=>[edge,Object.fromEntries(profiles.map(p=>[p,`reward-${edge}-${p}.mp4`]))])),
    posters:Object.fromEntries(posters.map(node=>[node,Object.fromEntries(profiles.map(p=>[p,`reward-${node}-${p}.jpg`]))]))};
  await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(path.join(root,'provenance.json'),JSON.stringify({
    schema:'hon-lion-cabinet-reward-capture-v1',created_at:new Date().toISOString(),...info,
    profiles:cameras,media_sha256:hashes,console_errors:errors},null,2)+'\n');
  console.log(JSON.stringify({status:'ok',media_files:names.length,asset_revision:manifest.asset_revision}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const root=process.env.CAPTURE_OUTPUT;
  if(!root)throw Error('Set CAPTURE_OUTPUT to the completed browser capture directory');
  await finalizeCapture(root,JSON.parse(await readFile(path.join(root,'reward-audit.json'),'utf8')));
}
