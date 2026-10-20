import test from 'node:test';
import assert from 'node:assert/strict';
import { saveJpg } from '../scripts/capture-rewards/capture-io.js';
import { validateCaptureReports } from '../scripts/capture-rewards/finalize-capture.mjs';

const edges=['c-key','key-cabinet','cabinet-open','cabinet-take','cabinet-stow','cabinet-door-key','cabinet-entry'];
function fixture(){
  const info={scene:{sha256:'a'.repeat(64)},gun_sha256:'b'.repeat(64),padlock_sha256:'c'.repeat(64)};
  const cameras=Object.fromEntries(['wide','portrait'].map(profile=>[profile,{
    profile,sourceScene:info.scene.sha256,gunSha256:info.gun_sha256,padlockSha256:info.padlock_sha256,
    records:Object.fromEntries(edges.map(edge=>[edge,{seconds:3,frames:90}]))
  }]));
  return {info,cameras};
}
test('JPEG encoding and upload failures reject instead of hanging the capture',async()=>{
  await assert.rejects(saveJpg({toBlob:cb=>cb(null)},'frame.jpg',()=>assert.fail('must not upload an empty image')),/JPEG encoding failed/);
  await assert.rejects(saveJpg({toBlob:cb=>cb(new Blob(['image']))},'frame.jpg',async()=>{throw Error('disk full');}),/disk full/);
  const calls=[];await saveJpg({toBlob:cb=>cb(new Blob(['image']))},'frame.jpg',async(name,blob)=>calls.push([name,blob.size]));
  assert.deepEqual(calls,[['frame.jpg',5]]);
});
test('finalization rejects stale profile identities and incomplete recordings',()=>{
  const good=fixture();assert.doesNotThrow(()=>validateCaptureReports(good.info,good.cameras));
  for(const field of ['profile','sourceScene','gunSha256','padlockSha256']){
    const {info,cameras}=fixture();cameras.portrait[field]='stale';
    assert.throws(()=>validateCaptureReports(info,cameras),/identity mismatch/);
  }
  const missing=fixture();delete missing.cameras.wide.records['cabinet-stow'];
  assert.throws(()=>validateCaptureReports(missing.info,missing.cameras),/Incomplete capture edges/);
  const empty=fixture();empty.cameras.portrait.records['cabinet-open'].frames=0;
  assert.throws(()=>validateCaptureReports(empty.info,empty.cameras),/Incomplete capture recording/);
});
