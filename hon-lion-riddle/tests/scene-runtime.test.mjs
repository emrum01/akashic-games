import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createCheckpointStepRunner } from '../app/checkpoint-procedures.js';

const source=(await readFile(new URL('../app/scene-runtime.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
const manifests=Object.fromEntries(await Promise.all(['video','door','reward'].map(async name=>[
  `./assets/video/${name}-manifest.json`,JSON.parse(await readFile(new URL(`../app/assets/video/${name}-manifest.json`,import.meta.url)))
])));
manifests['./assets/video/checkpoint-manifest.json']={
  asset_revision:'a'.repeat(64),
  clips:Object.fromEntries(['hall-entrance','entrance-rear-door','rear-door-cross','cross-key','key-cabinet','cabinet-open','cabinet-take','cabinet-stow','cabinet-door-key','cabinet-rear-door','rear-door-open'].map(key=>[key,{wide:`checkpoint-${key}-wide.mp4`,portrait:`checkpoint-${key}-portrait.mp4`}])),
  posters:Object.fromEntries(['hall','entrance','rear-door-locked','cross','cabinet-key','cabinet','cabinet-open','gun-held','gun-stowed','armed','rear-door-ready','bug'].map(key=>[key,{wide:`checkpoint-${key}-wide.jpg`,portrait:`checkpoint-${key}-portrait.jpg`}])),
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(reduced=false, checkpointManifest=manifests['./assets/video/checkpoint-manifest.json']){
  const poster={hidden:false,complete:true,naturalWidth:1};
  const video={src:'',currentTime:0,duration:3,readyState:4,pause(){},load(){},removeAttribute(){this.src='';},play(){this.onplay?.();return Promise.resolve();}};
  const warning={hidden:true};
  const elements={'#app':{},'.scene-background':{classList:{add(){},remove(){}}},'#scene-poster':poster,'#scene-video':video,'#scene-error':warning};
  const events={};
  const context=vm.createContext({
    console,URL,AbortController,structuredClone,createCheckpointStepRunner,clearTimeout(){},setTimeout:()=>1,
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    document:{hidden:false,querySelector:selector=>elements[selector],addEventListener(){}},
    window:{innerWidth:1280,innerHeight:720,location:{href:'http://localhost/'},matchMedia:()=>({matches:reduced}),setTimeout:()=>1,dispatchEvent(){},addEventListener:(name,fn)=>{events[name]=fn;}},
    fetch:async url=>({ok:true,json:async()=>url==='./assets/video/checkpoint-manifest.json'?checkpointManifest:manifests[url]}),
  });
  vm.runInContext(source,context);await tick();
  return {runtime:context.window.__HON_LION_SCENE_RUNTIME__,snapshot:()=>context.window.__HON_LION_SCENE__.snapshot(),video,poster,events,context};
}
const rewardRoute=[['key','c-key'],['cabinet','key-cabinet'],['cabinet-open','cabinet-open'],['gun-held','cabinet-take'],['gun-stowed','cabinet-stow'],['armed','cabinet-door-key'],['entry','cabinet-entry']];

for(const reduced of [false,true]){
  test(`reward route survives ${reduced?'reduced motion':'failed reward videos'} and resets to the hall`,async()=>{
    const x=await setup(reduced);
    const arrival=x.runtime.setStage(2,'close');
    if(!reduced){x.video.onended();x.video.onended();}
    await arrival;
    for(const [target,edge] of rewardRoute){
      const pending=x.runtime.setStage(2,target);
      if(!reduced){
        assert.equal(x.snapshot().media.clip,edge);
        assert.notEqual(x.snapshot().currentNode,target,'arrival cannot happen before playback or failure');
        x.video.onerror();
      }
      const result=await pending;
      assert.equal(result.fallback,true);
      assert.equal(result.cancelled,false);
      assert.equal(x.snapshot().currentNode,target);
      assert.match(x.poster.src,new RegExp(target==='entry'?'pose-entry-wide':`reward-${target}-wide`));
    }
    await x.runtime.reset();
    assert.equal(x.snapshot().currentNode,'a');
    assert.equal(x.snapshot().media.clip,null);
    assert.match(x.poster.src,/checkpoint-hall-wide/);
  });
}

test('reset cancels a reward clip and ignores its late completion',async()=>{
  const x=await setup();
  const pending=x.runtime.setStage(2,'gun-held');
  const lateEnd=x.video.onended;
  await x.runtime.reset();
  assert.equal((await pending).cancelled,true);
  lateEnd();
  assert.equal(x.snapshot().currentNode,'a');
  assert.equal(x.snapshot().media.playing,false);
});

test('checkpoint media requires an explicit action ACK and follows the directed route',async()=>{
  const x=await setup();
  const actions=[];
  const pending=x.runtime.runCheckpointStep('step1',{onAction:async action=>{actions.push(action.type);return {completed:true};}});
  await tick();
  assert.equal(x.snapshot().media.clip,'hall-entrance');
  assert.match(x.video.src,/checkpoint-hall-entrance-wide\.mp4\?v=/);
  x.video.onended();
  assert.deepEqual(await pending,{completed:true,target:'entrance'});
  assert.deepEqual(actions,['continue']);
  const aborted=new AbortController();
  const cancelled=x.runtime.runCheckpointStep('step2',{signal:aborted.signal,onAction:async()=>({completed:true})});
  aborted.abort();
  assert.equal((await cancelled).cancelled,true);
});

test('checkpoint reduced motion uses its poster but still requires the action ACK',async()=>{
  const x=await setup(true);
  let action;
  const pending=x.runtime.runCheckpointStep('step1',{onAction:async value=>{action=value.type;return {completed:true};}});
  const result=await pending;
  assert.equal(result.completed,true);
  assert.equal(action,'continue');
  assert.equal(x.snapshot().media.playing,false);
  assert.equal(x.snapshot().media.clip,'hall-entrance');
});

test('checkpoint video failure uses a decoded poster and still requires the action ACK',async()=>{
  const x=await setup();
  const actions=[];
  const pending=x.runtime.runCheckpointStep('step1',{onAction:async action=>{actions.push(action.type);return {completed:true};}});
  await tick();
  assert.equal(x.snapshot().media.clip,'hall-entrance');
  x.video.onerror();
  assert.deepEqual(await pending,{completed:true,target:'entrance'});
  assert.deepEqual(actions,['continue']);
  assert.equal(x.snapshot().currentNode,'entrance');
});

test('checkpoint with neither a decoded poster nor playable video stays retryable',async()=>{
  const x=await setup();
  x.poster.complete=false;
  x.poster.naturalWidth=0;
  const actions=[];
  const pending=x.runtime.runCheckpointStep('step1',{onAction:async action=>{actions.push(action.type);return {completed:true};}});
  await tick();
  x.poster.onerror();
  assert.deepEqual(await pending,{completed:false,reason:'poster_unavailable'});
  assert.deepEqual(actions,[]);
  assert.equal(x.snapshot().currentNode,'a');
});

test('a retry resumes after the last acknowledged checkpoint action',async()=>{
  const x=await setup();
  vm.runInContext("state.checkpointNode='cross'",x.context);
  const actions=[];
  const pending=x.runtime.runCheckpointStep('step4',{onAction:async action=>{
    actions.push(action.type);
    if(action.type==='unlock-cabinet'){x.poster.complete=false;x.poster.naturalWidth=0;}
    return {completed:true};
  }});
  await tick();
  assert.equal(x.snapshot().media.clip,'key-cabinet');
  x.video.onended();
  await tick();
  x.poster.onerror();
  assert.deepEqual(await pending,{completed:false,reason:'poster_unavailable'});
  assert.deepEqual(actions,['unlock-cabinet']);
  x.poster.complete=true;
  x.poster.naturalWidth=1;
  const retry=x.runtime.runCheckpointStep('step4',{onAction:async action=>{actions.push(action.type);return {completed:true};}});
  await tick();
  assert.equal(x.snapshot().media.clip,'cabinet-open');
  for(let index=0;index<4;index+=1){x.video.onended();await tick();}
  assert.deepEqual(await retry,{completed:true,target:'armed'});
  assert.deepEqual(actions,['unlock-cabinet','take-gun','stow-gun','take-door-key']);
});

test('reset cancels a checkpoint waiting for poster decode',async()=>{
  const x=await setup();
  x.poster.complete=false;
  x.poster.naturalWidth=0;
  const pending=x.runtime.runCheckpointStep('step1',{onAction:async()=>({completed:true})});
  await tick();
  await x.runtime.reset();
  assert.equal((await pending).cancelled,true);
  x.poster.onload?.();
  assert.equal(x.snapshot().currentNode,'a');
});

test('missing checkpoint media manifest refuses to run the clip',async()=>{
  const x=await setup();
  vm.runInContext("state.checkpointManifest=null",x.context);
  const result=await x.runtime.runCheckpointStep('step1',{onAction:async()=>({completed:true})});
  assert.deepEqual(result,{completed:false,reason:'unassigned'});
});

test('rear-door procedure state selects the checkpoint door-opening clip',async()=>{
  const x=await setup();
  const finish=async(pending,count)=>{for(let i=0;i<count;i++){await tick();x.video.onended();await tick();}return pending;};
  await finish(x.runtime.runCheckpointStep('step1',{onAction:async()=>({completed:true})}),1);
  await finish(x.runtime.runCheckpointStep('step2',{onAction:async()=>({completed:true})}),1);
  await finish(x.runtime.runCheckpointStep('step3',{onAction:async()=>({completed:true})}),2);
  await finish(x.runtime.runCheckpointStep('step4',{onAction:async()=>({completed:true})}),5);
  await finish(x.runtime.runCheckpointStep('step5',{onAction:async()=>({completed:true})}),1);
  const pending=x.runtime.setStage(2,'bug');
  await tick();
  assert.equal(x.snapshot().media.clip,'rear-door-open');
  x.video.onended();
  assert.equal((await pending).target,'bug');
  assert.equal(x.snapshot().currentNode,'bug');
  assert.match(x.poster.src,/checkpoint-bug-wide/);
  const clear=await x.runtime.setStage(2,'clear');
  assert.equal(clear.target,'bug');
  assert.match(x.poster.src,/checkpoint-bug-wide/);
  assert.equal(x.snapshot().media.clip,'rear-door-open');
});
