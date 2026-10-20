import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const profiles = ['wide', 'portrait'];
const edges = ['hall-entrance','entrance-rear-door','rear-door-cross','cross-key','key-cabinet','cabinet-open','cabinet-take','cabinet-stow','cabinet-door-key','cabinet-rear-door','rear-door-open'];
const posters = ['hall','entrance','rear-door-locked','cross','cabinet-key','cabinet','cabinet-open','gun-held','gun-stowed','armed','rear-door-ready','bug'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateCaptureReports(info, cameras) {
  for (const [field, value] of Object.entries({ scene:info.scene?.sha256, loadedScene:info.loaded_scene_sha256, gun:info.gun_sha256, padlock:info.padlock_sha256 })) {
    if (!/^[a-f0-9]{64}$/.test(value || '')) throw new Error(`Missing capture identity: ${field}`);
  }
  if (info.loaded_scene_sha256 !== info.scene.sha256) throw new Error('Loaded scene hash does not match manifest identity');
  for (const profile of profiles) {
    const report = cameras[profile];
    if (report?.profile !== profile || report.sourceScene !== info.scene.sha256 || report.loadedSceneSha256 !== info.loaded_scene_sha256 || report.gunSha256 !== info.gun_sha256 || report.padlockSha256 !== info.padlock_sha256) throw new Error(`Capture identity mismatch: ${profile}`);
    if (JSON.stringify(Object.keys(report.records || {}).sort()) !== JSON.stringify([...edges].sort())) throw new Error(`Incomplete capture edges: ${profile}`);
    for (const [edge, record] of Object.entries(report.records)) if (!Number.isFinite(record.seconds) || record.seconds <= 0 || !Number.isInteger(record.frames) || record.frames <= 0) throw new Error(`Incomplete recording: ${profile}/${edge}`);
  }
}

export async function finalizeCapture(root, info, errors = []) {
  if (info?.status !== 'ready') throw new Error('Browser capture did not reach ready state');
  if (errors.length) throw new Error(`Browser console errors: ${JSON.stringify(errors)}`);
  const cameras = Object.fromEntries(await Promise.all(profiles.map(async profile => [profile, JSON.parse(await readFile(path.join(root, `checkpoint-${profile}.json`), 'utf8'))])));
  validateCaptureReports(info, cameras);
  for (const profile of profiles) for (const edge of edges) {
    const input = path.join(root, `checkpoint-${edge}-${profile}.webm`), output = path.join(root, `checkpoint-${edge}-${profile}.mp4`);
    execFileSync(process.env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg', ['-hide_banner','-loglevel','error','-y','-i',input,'-an','-r','30','-c:v','libx264','-preset','medium','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',output]);
  }
  const names = profiles.flatMap(profile => [...edges.map(edge => `checkpoint-${edge}-${profile}.mp4`), ...posters.map(node => `checkpoint-${node}-${profile}.jpg`)]).sort();
  const hashes = Object.fromEntries(await Promise.all(names.map(async name => [name, sha(await readFile(path.join(root, name)))])));
  const manifest = { schema:'hon-lion-checkpoint-media-v1', source_scene_sha256:info.loaded_scene_sha256, source_manifest_sha256:info.sceneManifestSha256, asset_revision:sha(JSON.stringify(hashes)), profiles:{wide:{width:1280,height:720},portrait:{width:720,height:1280}}, clips:Object.fromEntries(edges.map(edge => [edge,Object.fromEntries(profiles.map(profile => [profile,`checkpoint-${edge}-${profile}.mp4`]))])), posters:Object.fromEntries(posters.map(node => [node,Object.fromEntries(profiles.map(profile => [profile,`checkpoint-${node}-${profile}.jpg`]))])), media_sha256:hashes };
  await writeFile(path.join(root, 'checkpoint-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, 'checkpoint-provenance.json'), `${JSON.stringify({schema:'hon-lion-checkpoint-capture-v1',created_at:new Date().toISOString(),source:{scene:info.scene,loaded_scene_sha256:info.loaded_scene_sha256,scene_manifest_sha256:info.sceneManifestSha256,source_path:process.env.SCENE_SOURCE},approved_assets:{gun_sha256:info.gun_sha256,padlock_sha256:info.padlock_sha256,padlock:info.padlock},profiles:cameras,route_audit:info.route_audit,pickup_audit:info.pickup_audit,media_sha256:hashes,console_errors:errors,notes:['rear-door-cross uses the exact reversed corridor route through the approved L path','bug poster is the opened rear-door background; the game owns the existing confrontation overlay','cross escutcheon and matching blade are capture-only gameplay accessories']}, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && process.argv[1].endsWith('finalize-capture.mjs')) {
  const root = process.env.CAPTURE_OUTPUT;
  if (!root) throw new Error('Set CAPTURE_OUTPUT');
  await finalizeCapture(root, JSON.parse(await readFile(path.join(root, 'checkpoint-audit.json'), 'utf8')));
}
