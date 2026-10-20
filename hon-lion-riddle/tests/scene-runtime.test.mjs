import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../app/scene-runtime.js',import.meta.url),'utf8');
const manifests=Object.fromEntries(await Promise.all(['video','door','reward'].map(async name=>[
  `./assets/video/${name}-manifest.json`,JSON.parse(await readFile(new URL(`../app/assets/video/${name}-manifest.json`,import.meta.url)))
])));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(reduced=false){
  const poster={hidden:false,complete:true,naturalWidth:1};
  const video={src:'',currentTime:0,duration:3,readyState:4,pause(){},load(){},removeAttribute(){this.src='';},play(){this.onplay?.();return Promise.resolve();}};
  const warning={hidden:true};
  const elements={'#app':{},'.scene-background':{classList:{add(){},remove(){}}},'#scene-poster':poster,'#scene-video':video,'#scene-error':warning};
  const events={};
  const context=vm.createContext({
    console,URL,structuredClone,clearTimeout(){},setTimeout:()=>1,
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    document:{hidden:false,querySelector:selector=>elements[selector],addEventListener(){}},
    window:{innerWidth:1280,innerHeight:720,location:{href:'http://localhost/'},matchMedia:()=>({matches:reduced}),setTimeout:()=>1,dispatchEvent(){},addEventListener:(name,fn)=>{events[name]=fn;}},
    fetch:async url=>({ok:true,json:async()=>manifests[url]}),
  });
  vm.runInContext(source,context);await tick();
  return {runtime:context.window.__HON_LION_SCENE_RUNTIME__,snapshot:()=>context.window.__HON_LION_SCENE__.snapshot(),video,poster,events};
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
    assert.match(x.poster.src,/pose-a-wide/);
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
