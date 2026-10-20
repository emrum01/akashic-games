import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { PROLOGUE, OPENING, LION_DISCOVERY, LION_GREETING, PROBLEM, THEORY_PROMPT, ARRIVAL_OBSERVATION, NOISE_OBSERVATION, DEATH_NARRATION, CLUES, LION_REPLIES } from '../app/dialogue.js';
import { createDeadlineController } from '../app/deadline.js';
import { createObservationController } from '../app/observation.js';
import { createLionReactions } from '../app/lion-reactions.js';
import { mockWorkerResponse } from './server-fixtures.mjs';
import { createPredationTexture } from '../app/sound.js';
import { createCheckpointProgress, normalizeCheckpointIds } from '../app/checkpoint-progress.js';

// State tests with a small DOM double; no browser, media engine or remote API.
class Element {
  children=[]; dataset={}; hidden=false; disabled=false; value=''; textContent=''; className=''; attributes={}; handlers={}; parent=null;
  complete=true; naturalWidth=1; scrollHeight=100; scrollTop=0;
  style={setProperty:(name,value)=>{this[name]=value;},removeProperty:(name)=>{delete this[name];}};
  classList={add:(name)=>{this.className+=' '+name;}};
  get isConnected(){return Boolean(this.parent);}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
  addEventListener(name,callback){this.handlers[name]=callback;}
  setAttribute(name,value){this.attributes[name]=value;}
  removeAttribute(name){delete this.attributes[name];}
  scrollTo({top}){this.scrollTop=top;}
  scrollIntoView(){}
  focus(){this.focused=true;}
  blur(){this.focused=false;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}
  querySelector(selector){return this.children.find(node=>node.className.split(' ').includes(selector.slice(1)))||null;}
}
const source=(await readFile(new URL('../app/game.js',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
function setup({demo=true,configured=true,chat=mockWorkerResponse,arrival,opening,movement,closing,scenePromises={},status,imageState='loaded',checkpointStep}={}) {
  const elements=new Map();
  const get=(id)=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const calls=[];
  const stepCalls=[];
  const audio=[];
  const beamCalls=[];
  const events={};
  const context=vm.createContext({
    console,URLSearchParams,AbortController,AbortSignal,DOMException,TypeError,queueMicrotask,
    setTimeout:(fn)=>setTimeout(fn,5),clearTimeout,
    PROLOGUE,OPENING,LION_DISCOVERY,LION_GREETING,PROBLEM,THEORY_PROMPT,ARRIVAL_OBSERVATION,NOISE_OBSERVATION,DEATH_NARRATION,CLUES,LION_REPLIES,createDeadlineController,createObservationController,createLionReactions,createCheckpointProgress,normalizeCheckpointIds,API_ENDPOINT:'/api/hon-lion/chat',STATUS_ENDPOINT:'/api/hon-lion/status',LIVE_TIMEOUT_MS:9000,track:()=>{},
    createSoundDesign:()=>Object.fromEntries(['start','stop','toggle','reward','reveal','door','stopDoor','shoot','removeInsect','visibility'].map(name=>[name,()=>audio.push(name)])),
    connectVisualViewport:()=>{},
    createBeamEffects:()=>({shotDuration:6,start:()=>beamCalls.push('start'),stop:()=>beamCalls.push('stop'),dispose:()=>beamCalls.push('dispose')}),
    document:{getElementById:get,querySelector:()=>get('question-send'),createElement:(tag)=>{const element=new Element();if(tag==='img'&&imageState!=='loaded'){element.complete=false;element.naturalWidth=0;}return element;},addEventListener:()=>{}},
    window:{location:{search:demo?'?demo=1':''},setTimeout:(fn,delay)=>{const timer=setTimeout(fn,delay);timer.unref?.();return timer;},clearTimeout,addEventListener:(name,handler)=>{events[name]=handler;},__HON_LION_SCENE_RUNTIME__:{
      reset:()=>Promise.resolve({}),
      runCheckpointStep:async(id,context)=>{
        stepCalls.push(id);
        if(checkpointStep)return checkpointStep(id,context);
        const actions={step1:'continue',step2:'continue',step3:'cabinet-key',step4:['unlock-cabinet','take-gun','stow-gun','take-door-key'],step5:'continue'};
        for(const type of (Array.isArray(actions[id])?actions[id]:[actions[id]])){
          const pending=context.onAction?.({type,stepId:id},{signal:context.signal});
          await tick();
          get('conversation-actions').children.at(-1)?.handlers.click();
          await pending;
        }
        return {completed:true};
      },
      setStage:(stage,scene)=>{calls.push({stage,scene});return scenePromises[scene]??(scene==='living'&&movement?movement:scene==='close'&&closing?closing:scene==='entrance'&&arrival?arrival:scene==='bug'&&opening?opening:Promise.resolve({fallback:false}));},
    }},
    fetch:(url,options)=>url==='/api/hon-lion/status'?(status?status():Promise.resolve({ok:true,json:async()=>({configured})})):chat(url,options),
  });
  vm.runInContext(source,context);
  const state=()=>vm.runInContext('state',context);
  const ask=async(question)=>{context.openComposer(state().questionMode);get('question-input').value=question;await context.submitQuestion({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));};
  return {context,get,state,ask,calls,stepCalls,audio,beamCalls,events};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('NO confirmation is credited and fixed IDs survive a history rollover',async()=>{
  const posts=[];
  const x=setup({chat:async(url,init)=>{posts.push(JSON.parse(init.body));return mockWorkerResponse(url,init);}});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('音も幻覚ですか？');
  assert.equal(x.get('conversation-log').children.at(-1).textContent,'いいえ');
  assert.deepEqual(x.state().reachedCheckpointIds,['cp2']);
  for(let i=0;i<8;i++)await x.ask(`関係のない質問${i}`);
  assert.equal(x.state().turns.length,6);
  await x.ask('音は幻覚ですか？');
  assert.deepEqual(x.stepCalls,['step1']);
  assert.deepEqual(posts.at(-1).reachedCheckpointIds,['cp2']);
});

test('old reasoning_progress never substitutes for checkpoint judgments',async()=>{
  const x=setup({chat:async()=>({ok:true,json:async()=>({outcome:{choice:'YES',confidence:1,reasoning_progress:'CAUSAL_LINK'},keyIssued:false})})});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('何らかの質問');
  assert.deepEqual(Array.from(x.state().reachedCheckpointIds),[]);
  assert.deepEqual(x.stepCalls,[]);
});

test('first-turn solution waits for all five procedure ACKs before enabling rewards',async()=>{
  const releases=[];
  const x=setup({checkpointStep:()=>new Promise(resolve=>releases.push(resolve))});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  assert.equal(x.state().phase,'checkpoint_completion');
  assert.equal(x.state().cabinetKey,false);
  assert.deepEqual(x.state().reachedCheckpointIds,[], 'finishing presentation does not claim all five were explicitly understood');
  for(let i=0;i<5;i++){
    assert.equal(x.state().phase,'checkpoint_completion');
    assert.equal(x.get('conversation-actions').children.length,0);
    releases[i]({completed:true});
    await tick();
  }
  assert.deepEqual(x.stepCalls,['step1','step2','step3','step4','step5']);
  assert.equal(x.state().phase,'entrance');
  assert.equal(x.get('conversation-actions').children.length,0,'ACK-only fixtures do not synthesize item acquisition');
});

test('new arrivals and a final solution share an already running queue without duplicates',async()=>{
  const releases=[];
  const x=setup({checkpointStep:()=>new Promise(resolve=>releases.push(resolve))});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('音は自分の耳の中から聞こえますか？');
  await x.ask('見ている洋館は幻覚で、聞こえる音は現実の音ですか？');
  assert.deepEqual(x.state().reachedCheckpointIds,['cp1','cp2','cp3']);
  assert.deepEqual(x.stepCalls,['step1']);
  assert.deepEqual(x.state().checkpointProgress.queuedStepIds,['step2','step3']);
  x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  for(let i=0;i<5;i++){releases[i]({completed:true});await tick();}
  assert.deepEqual(x.stepCalls,['step1','step2','step3','step4','step5']);
  assert.equal(x.state().phase,'entrance');
});



test('unassigned procedures block rewards honestly and reset discards the solved queue',async()=>{
  const x=setup({checkpointStep:async()=>({completed:false,reason:'unassigned'})});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  assert.equal(x.state().phase,'checkpoint_completion');
  assert.equal(x.state().checkpointProgress.blocked.reason,'unassigned');
  assert.deepEqual(x.state().checkpointProgress.completedStepIds,[]);
  x.context.reset();await tick();
  assert.equal(x.state().phase,'start');
  assert.deepEqual(Array.from(x.state().reachedCheckpointIds),[]);
  assert.deepEqual(x.state().checkpointProgress.queuedStepIds,[]);
});

test('reset during the solved drain prevents a stale arrival from issuing rewards',async()=>{
  let finish;
  const x=setup({checkpointStep:()=>new Promise(resolve=>{finish=resolve;})});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  x.context.reset();
  finish({completed:true});await tick();
  assert.equal(x.state().phase,'start');
  assert.equal(x.state().cabinetKey,false);
  assert.deepEqual(x.state().checkpointProgress.completedStepIds,[]);
  assert.deepEqual(x.stepCalls,['step1']);
});

test('touch opens either composer without focus, including Safari taps with a primary mouse or trackpad',()=>{
  const x=setup();
  x.context.window.matchMedia=query=>({matches:query==='(any-pointer: coarse)'});
  x.context.beginGame();x.context.setQuestionFlow();
  for(const mode of ['question','final_theory']){
    for(const pointerType of ['touch','mouse']){
      x.get('question-input').blur();
      x.context.openComposer(mode,{pointerType,detail:1});
      assert.equal(x.get('question-form').hidden,false);
      assert.equal(x.get('question-input').focused,false);
      x.context.closeComposer();
    }
  }
  x.context.openComposer('question',{pointerType:'',detail:0});
  assert.equal(x.get('question-input').focused,true,'keyboard activation still focuses the editor');
});

test('a failed mobile submission preserves the draft without reopening the keyboard',async()=>{
  const x=setup({chat:async()=>({ok:false,json:async()=>({error:'live_unavailable'})})});
  x.context.window.matchMedia=()=>({matches:true});
  x.context.beginGame();x.context.setQuestionFlow();
  x.context.openComposer('final_theory',{pointerType:'touch',detail:1});
  x.get('question-input').value='入力中の推理';
  x.get('question-input').focus();
  await x.context.submitQuestion({preventDefault(){}});
  assert.equal(x.get('question-input').focused,false);
  assert.equal(x.get('question-input').value,'入力中の推理');
  assert.equal(x.get('question-form').hidden,false);
  assert.match(x.get('system-note').textContent,/設定されていません/);
});





test('replay cancels a pending ending and removes its audio and visual effects',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='entrance'; state.ray=true; state.doorKey=true",x.context);
  await x.context.enterBugRoom();
  const ending=x.context.burnBug();
  assert.equal(x.state().phase,'firing');
  x.context.reset();
  await ending;
  assert.equal(x.state().phase,'start');
  assert.equal(x.state().cleared,false);
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
  assert.equal(x.get('app').querySelector('.beam'),null);
  assert.equal(x.get('conversation-log').children.length,0);
  assert.equal(x.audio.at(-1),'stop');
  assert.deepEqual(x.beamCalls,['start','stop','dispose'],'reset disposes the active renderer');
});

test('the insect appears only after the door opens, and resetting cancels that reveal',async()=>{
  let opened;
  const x=setup({opening:new Promise(resolve=>{opened=resolve;})});
  x.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true;state.doorKey=true",x.context);
  const transition=x.context.enterBugRoom();
  assert.equal(x.state().phase,'opening');
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
  await x.context.burnBug();
  assert.equal(x.state().phase,'opening','shooting is unavailable before the target appears');
  x.context.reset();
  opened({cancelled:true});
  await transition;
  assert.equal(x.state().phase,'start');
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
});

test('the room door cannot open with the raygun and cabinet key alone',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true;state.cabinetKey=true;state.doorKey=false",x.context);
  await x.context.enterBugRoom();
  assert.equal(x.state().phase,'entrance');
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
});

test('the insect reveal waits for its image, plays once, and ignores late loads',async()=>{
  const x=setup({imageState:'pending'});
  x.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true;state.doorKey=true",x.context);
  await x.context.enterBugRoom();
  const bug=x.get('app').querySelector('.bug-mark');
  assert.deepEqual(x.audio,['start'],'a pending image cannot reveal early');
  assert.equal(typeof bug.handlers.error,'undefined');
  bug.handlers.load();
  assert.deepEqual(x.audio,['start','reveal']);
  bug.handlers.load();
  vm.runInContext('appendBugMark()',x.context);
  assert.deepEqual(x.audio,['start','reveal'],'duplicate load/append does not duplicate the sting');
  vm.runInContext("state.phase='firing'",x.context);
  bug.handlers.load();
  assert.deepEqual(x.audio,['start','reveal'],'a late load after firing is ignored');

  const reset=setup({imageState:'pending'});
  reset.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true;state.doorKey=true",reset.context);
  await reset.context.enterBugRoom();
  const late=reset.get('app').querySelector('.bug-mark');
  reset.context.reset();
  late.handlers.load();
  assert.deepEqual(reset.audio,['start','stop'],'a late load after reset is ignored');
});

test('door audio follows actual playback and is ignored outside the opening scene',()=>{
  const x=setup();
  const event={detail:{action:'start',duration:3}};
  x.events['hon-lion-door-audio'](event);
  assert.deepEqual(x.audio,[]);
  vm.runInContext("state.phase='opening'",x.context);
  x.events['hon-lion-door-audio'](event);
  x.events['hon-lion-door-audio']({detail:{action:'stop'}});
  assert.deepEqual(x.audio,['door','stopDoor']);
});

test('unrelated questions keep the three-choice reply without adding automatic hints',async()=>{
  const x=setup();
  x.context.beginGame();x.context.setQuestionFlow();
  for(const question of ['赤ですか？','水曜日ですか？','甘いですか？'])await x.ask(question);
  assert.equal(x.state().reasoningStage,0);
  assert.equal(x.get('system-note').textContent,'');
  assert.doesNotMatch(x.get('system-note').textContent,/幻覚|脳|捕食/);
  assert.deepEqual(x.get('conversation-log').children.filter(node=>node.className==='message lion').map(node=>node.textContent),['関係ない','関係ない','関係ない']);
});

test('yes uses the smiling face, replays subtle movements, and returns to rest',async()=>{
  const x=setup();
  const lion=x.get('lion-character');
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  assert.match(lion.src,/hon-lion-yes\.png/);
  assert.equal(x.get('lion-character-button').attributes['data-reaction'],'yes');
  await x.ask('ここは幻覚ですか？');
  assert.match(lion.src,/hon-lion-yes\.png/,'the same answer starts a fresh reaction');
  await wait(15);
  assert.match(lion.src,/hon-lion-dialogue\.png/);
  assert.equal(x.get('lion-character-button').attributes['data-reaction'],undefined);
});



test('the first movement queues one arrival observation only after the scene arrives',async()=>{
  let arrive;
  const x=setup({movement:new Promise(resolve=>{arrive=resolve;})});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  assert.equal(x.get('conversation-log').children.some(node=>node.textContent===ARRIVAL_OBSERVATION),false);
  arrive({fallback:false});
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,1);
  await x.ask('赤ですか？');
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,1);
});

test('a late answer cannot revive the terminal deadline state',async()=>{
  let reply;
  const x=setup({chat:async()=>new Promise(resolve=>{reply=resolve;})});
  x.context.beginGame();x.context.setQuestionFlow();
  const pending=x.ask('ここは幻覚ですか？');
  await tick();
  x.context.expireGame();
  reply({ok:true,json:async()=>({outcome:{choice:'YES',confidence:1,reasoning_progress:'PARTIAL_INSIGHT'},keyIssued:false})});
  await pending;
  assert.equal(x.state().phase,'dead');
  assert.equal(x.state().reasoningStage,0);
  assert.equal(x.get('conversation-actions').children.length,1);
});

test('a superseding movement still offers the sound observation at its actual arrival',async()=>{
  let arrive;
  const x=setup({movement:new Promise(resolve=>{arrive=resolve;})});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  await x.ask('この洋館は幻覚で、自分の耳のカメラ映像ですか？');
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,1);
  arrive({cancelled:true,superseded:true});
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,1);
});





test('every noise increase repeats the observation without duplicating the same level or losing drafts',async()=>{
  const x=setup();
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  x.get('question-input').value='書きかけの推理';
  assert.equal(x.get('question-input').placeholder,THEORY_PROMPT);
  x.context.setNoiseLevel(1);
  x.context.setNoiseLevel(2);
  await wait(12);
  assert.equal(x.get('conversation-log').children.some(node=>node.textContent===NOISE_OBSERVATION),false);
  assert.equal(x.get('question-input').value,'書きかけの推理');
  x.context.closeComposer();
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===NOISE_OBSERVATION).length,2,'both increases during input are retained');
  for(const level of [3,4,5]){
    x.context.setNoiseLevel(level);
    x.context.setNoiseLevel(level);
    await wait(12);
    const observations=x.get('conversation-log').children.filter(node=>node.textContent===NOISE_OBSERVATION);
    assert.equal(observations.length,level);
    assert.equal(observations.filter(node=>!node.hidden).length,1,'only the newest repeated observation stays visible');
  }
  x.context.reset();x.context.beginGame();x.context.setQuestionFlow();
  x.context.setNoiseLevel(1);
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===NOISE_OBSERVATION).length,1);
});

test('noise waits for a pending answer and cannot appear after death',async()=>{
  let reply;
  const x=setup({chat:async()=>new Promise(resolve=>{reply=resolve;})});
  x.context.beginGame();x.context.setQuestionFlow();
  const pending=x.ask('音ですか？');await tick();
  x.context.setNoiseLevel(1);await wait(12);
  assert.equal(x.get('conversation-log').children.some(node=>node.textContent===NOISE_OBSERVATION),false);
  reply({ok:true,json:async()=>({outcome:{choice:'YES',confidence:1,reasoning_progress:'NONE'},keyIssued:false})});
  await pending;
  assert.equal(x.get('conversation-log').children.at(-1).textContent,NOISE_OBSERVATION);
  x.context.reset();x.context.beginGame();x.context.setQuestionFlow();
  x.context.setNoiseLevel(1);x.context.expireGame();await wait(12);
  assert.equal(x.get('conversation-log').children.length,1);
  assert.equal(x.get('conversation-log').children[0].textContent,DEATH_NARRATION);
});

test('noise queued while the door opens is shown after entering the bug room',async()=>{
  let opened;
  const x=setup({opening:new Promise(resolve=>{opened=resolve;})});
  x.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true;state.doorKey=true",x.context);
  const transition=x.context.enterBugRoom();
  assert.equal(x.state().phase,'opening');
  x.context.setNoiseLevel(1);
  await wait(12);
  assert.equal(x.get('conversation-log').children.some(node=>node.textContent===NOISE_OBSERVATION),false);
  opened({fallback:false});
  await transition;
  assert.equal(x.state().phase,'bug');
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===NOISE_OBSERVATION).length,1);
});

test('an answer reaction is cleared when the character is hidden or the game is reset',async()=>{
  const x=setup();
  const lion=x.get('lion-character');
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  assert.match(lion.src,/hon-lion-yes\.png/);
  x.context.setPhase('entrance');
  assert.match(lion.src,/hon-lion-dialogue\.png/);
  assert.equal(x.get('lion-character-button').attributes['data-reaction'],undefined);
  x.context.setPhase('question');
  await x.ask('音の主は人間ですか？');
  assert.match(lion.src,/hon-lion-no-quiet\.png/);
  x.context.reset();
  assert.match(lion.src,/hon-lion-dialogue\.png/);
  assert.equal(x.get('lion-character-button').attributes['data-reaction'],undefined);
});

test('Japanese composition and shifted Enter never submit an unfinished theory',()=>{
  const x=setup();let submitted=0;
  x.get('question-form').requestSubmit=()=>{submitted++;};
  const keydown=x.get('question-input').handlers.keydown;
  const event=extra=>({key:'Enter',isComposing:false,shiftKey:false,preventDefault(){},...extra});
  keydown(event({isComposing:true}));keydown(event({shiftKey:true}));
  assert.equal(submitted,0);
  keydown(event({}));assert.equal(submitted,1);
});

test('the audible clue has a bounded signal and a quiet seamless loop boundary',()=>{
  const texture=createPredationTexture();
  let energy=0,peak=0;
  for(const sample of texture){assert.ok(Number.isFinite(sample));energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
  const rms=Math.sqrt(energy/texture.length);
  assert.ok(rms>.005&&rms<.15,`texture RMS ${rms}`);
  assert.ok(peak<.65,`texture peak ${peak}`);
  assert.equal(Math.abs(texture[0]),0);
  assert.equal(Math.abs(texture.at(-1)),0);
  const zeroSamples=texture.filter(sample=>sample===0).length;
  assert.ok(zeroSamples>texture.length*.8,`sparse fallback has ${zeroSamples/texture.length*100}% exact silence`);
  let longest=0,current=0;
  for(const sample of texture){ current=sample===0?current+1:0; longest=Math.max(longest,current); }
  assert.ok(longest>2*24_000,'fallback keeps multi-second gaps between crunch clusters');
});

test('a configured old demo link uses JEV and accumulates separate discoveries after checking the connection',async()=>{
  let ready;
  const posts=[];
  const x=setup({demo:true,status:()=>new Promise(resolve=>{ready=resolve;}),chat:async(_url,init)=>{
    posts.push(JSON.parse(init.body));
    const progress=posts.length===2?'NONE':'PARTIAL_INSIGHT';
    return {ok:true,json:async()=>({outcome:{choice:'YES',confidence:.98,reasoning_progress:progress},keyIssued:false,reachedCheckpointIds:posts.length<3?['cp1']:['cp1','cp3']})};
  }});
  x.context.beginGame();x.context.setQuestionFlow();
  const first=x.ask('この屋敷は幻覚ですか？');
  assert.equal(posts.length,0,'the first question waits for mode selection');
  x.context.greetLion();
  assert.equal(x.get('conversation-log').children.at(-1).textContent,'この屋敷は幻覚ですか？','clicking the character while waiting does not replace the pending question');
  ready({ok:true,json:async()=>({configured:true})});
  await first;
  assert.equal(x.state().mode,'live');
  assert.equal(x.state().reasoningStage,1);
  await x.ask('では、幻覚を見ているんですか？');
  assert.equal(x.state().reasoningStage,1,'repeated insight never starts another walk');
  await x.ask('音は自分の体内で鳴っているんですか？');
  assert.equal(x.state().reasoningStage,2);
  assert.equal(posts.length,3,'free-form questions reach the real judging path');
  assert.equal(posts[2].recentTurns[0].turn_outcome.reasoning_progress,'PARTIAL_INSIGHT');
  assert.deepEqual(x.stepCalls,['step1','step2']);
  x.context.reset();
  assert.equal(x.state().reasoningStage,0);
  assert.equal(x.state().mode,'live');
});

test('a provider failure on a configured preview link never falls back to example judging',async()=>{
  const x=setup({demo:true,configured:true,chat:async()=>({ok:false,json:async()=>({error:'provider_auth'})})});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  assert.equal(x.state().mode,'live');
  assert.equal(x.state().reasoningStage,0);
  assert.equal(x.get('conversation-log').children.filter(node=>node.className==='message lion').length,0);
  assert.match(x.get('system-note').textContent,/接続設定/);
  assert.equal(x.get('question-input').disabled,false);
});

test('repeating the same partial final theory does not accumulate discoveries',async()=>{
  const posts=[];
  const x=setup({chat:async(_url,init)=>{
    const body=JSON.parse(init.body);posts.push(body);
    const repeated=posts.length>1;
    return {ok:true,json:async()=>({outcome:{choice:'PARTIAL',confidence:1,reasoning_progress:repeated?'NONE':'PARTIAL_INSIGHT'},keyIssued:false,reachedCheckpointIds:['cp3'],knownInsights:repeated?body.knownInsights:[{player_message:body.question,turn_outcome:{choice:'PARTIAL',confidence:1,reasoning_progress:'PARTIAL_INSIGHT'}}]})};
  }});
  x.context.beginGame();x.context.setQuestionFlow();
  for(let i=0;i<2;i++){
    x.context.openComposer('final_theory');
    await x.ask('音は自分の内部で鳴っている');
    assert.equal(x.state().questionMode,'final_theory','partial explanations remain editable');
    assert.equal(x.get('question-input').value,'音は自分の内部で鳴っている','the player does not have to rewrite their explanation');
    assert.equal(x.state().reasoningStage,1);
    assert.equal(x.state().cabinetKey,false);
  }
  assert.equal(x.stepCalls.length,1);
  assert.equal(posts[1].knownInsights.length,1);
  x.context.reset();
  assert.equal(x.state().knownInsights.length,0);
});



test('question and theory drafts survive cancelling independently and reset on replay',()=>{
  const x=setup();x.context.beginGame();x.context.setQuestionFlow();
  x.context.openComposer('question');x.get('question-input').value='ここは屋内ですか？';x.context.closeComposer();
  x.context.openComposer('final_theory');
  assert.equal(x.get('question-input').value,'');
  x.get('question-input').value='自分の推理の途中';x.context.closeComposer();
  x.context.openComposer('question');
  assert.equal(x.get('question-input').value,'ここは屋内ですか？');
  x.context.closeComposer();x.context.openComposer('final_theory');
  assert.equal(x.get('question-input').value,'自分の推理の途中');
  x.context.reset();
  assert.equal(x.get('question-input').value,'');
  assert.equal(x.state().composerOpen,false);
  assert.equal(x.state().drafts.question,'');assert.equal(x.state().drafts.final_theory,'');
});

test('a live timeout restores input, preserves the theory, and never fakes a lion reply',async()=>{
  const x=setup({demo:false,chat:(_url,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')));})});
  x.context.beginGame();x.context.setQuestionFlow();
  x.context.openComposer('final_theory');
  await x.ask('自分の推理を送った');
  assert.equal(x.state().busy,false);
  assert.equal(x.state().questionMode,'final_theory');
  assert.equal(x.get('question-input').disabled,false);
  assert.equal(x.get('question-send').disabled,false);
  assert.equal(x.get('theory-toggle').disabled,false);
  assert.equal(x.get('question-input').value,'自分の推理を送った');
  assert.match(x.get('system-note').textContent,/時間がかかって/);
  assert.equal(x.get('conversation-log').children.filter(node=>node.className==='message lion').length,0);
});

for (const [code, message] of [
  ['rate_limited', /1分ほど待って/],
  ['rate_limit_unavailable', /接続を確認できません/],
  ['toString', /^本ライオンに声が届きませんでした。もう一度送ってください。$/],
]) {
  test(`${code} preserves both draft modes and never advances the game`, async () => {
    const x = setup({ demo: false, chat: async () => ({ ok: false, json: async () => ({ error: code }) }) });
    x.context.beginGame();
    x.context.setQuestionFlow();
    for (const mode of ['question', 'final_theory']) {
      x.context.openComposer(mode);
      await x.ask('入力を残して再送する');
      assert.equal(x.get('question-input').value, '入力を残して再送する');
      assert.equal(x.state().drafts[mode], '入力を残して再送する');
      assert.equal(x.state().questionMode, mode);
      assert.equal(x.state().busy, false);
      assert.equal(x.get('question-input').disabled, false);
      assert.equal(x.get('question-send').disabled, false);
      assert.equal(x.state().reasoningStage, 0);
      assert.equal(x.state().cabinetKey, false);
      assert.equal(x.state().turns.length, 0);
      assert.equal(x.get('conversation-log').children.filter(node => node.className === 'message lion').length, 0);
      assert.match(x.get('system-note').textContent, message);
    }
  });
}

test('an unconfigured live connection is retryable and does not silently use the demo',async()=>{
  const x=setup({demo:false,chat:async()=>({ok:false,json:async()=>({error:'live_unavailable'})})});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('虫ですか？');
  assert.equal(x.state().reasoningStage,0);
  assert.equal(x.state().cabinetKey,false);
  assert.match(x.get('system-note').textContent,/まだ設定されていません/);
  assert.equal(x.get('question-input').disabled,false);
});

test('a server-approved solved theory is accepted below the old client confidence gate',async()=>{
  const x=setup({chat:async()=>({ok:true,json:async()=>({outcome:{choice:'SOLVED',confidence:.85,reasoning_progress:'SYNTHESIS'},keyIssued:true})})});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('サーバーが承認した推理');
  await wait(100);
  assert.equal(x.state().phase,'entrance');
});



test('a pending checkpoint action is cancelled by replay and cannot award a late item',async()=>{
  let click;
  const x=setup({checkpointStep:async(id,ctx)=>{
    if(id!=='step3')return {completed:true};
    const pending=ctx.onAction({type:'cabinet-key',stepId:id},{signal:ctx.signal});
    click=x.get('conversation-actions').children.at(-1)?.handlers.click;
    return pending;
  }});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await wait(5);
  assert.equal(x.state().phase,'checkpoint_step');
  x.context.reset();
  click?.();
  await wait(15);
  assert.equal(x.state().phase,'start');
  assert.equal(x.state().cabinetKey,false);
  assert.equal(x.get('conversation-actions').children.length,0);
});



test('a persisted page returns to the start from firing and a normal scene',()=>{
  const firing=setup();
  firing.context.beginGame();
  vm.runInContext("state.phase='firing';state.cleared=false",firing.context);
  firing.events.pageshow({persisted:true});
  assert.equal(firing.state().phase,'start');
  const scene=setup();
  scene.context.beginGame();scene.context.setQuestionFlow();
  scene.events.pageshow({persisted:true});
  assert.equal(scene.state().phase,'start');
});

test('death during a checkpoint action cancels it and ignores the late click',async()=>{
  const x=setup();
  x.context.beginGame();
  const controller=new AbortController();
  vm.runInContext("state.phase='checkpoint_completion';state.cabinetKey=true;state.cabinetOpen=true;deadline.start()",x.context);
  const pending=x.context.handleCheckpointAction({type:'take-gun'},{signal:controller.signal});
  assert.equal(x.state().rewardBusy,true);
  x.context.expireGame();
  controller.abort();
  assert.equal((await pending).cancelled,true);
  assert.equal(x.state().phase,'dead');
  assert.equal(x.state().ray,false);
  assert.equal(x.state().rewardBusy,false);
});

test('a checkpoint action is idempotent under a double click',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='checkpoint_completion';state.cabinetKey=true;state.cabinetOpen=true",x.context);
  const pending=x.context.handleCheckpointAction({type:'take-gun'},{signal:new AbortController().signal});
  const button=x.get('conversation-actions').children.at(-1);
  button.handlers.click();
  button.handlers.click();
  assert.equal((await pending).completed,true);
  assert.equal(x.state().ray,true);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent==='光線銃を手に入れた。').length,1);
});

test('pagehide stops and disposes an active shot renderer',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true;state.doorKey=true",x.context);
  await x.context.enterBugRoom();
  x.context.burnBug();
  assert.equal(x.state().phase,'firing');
  x.events.pagehide();
  assert.deepEqual(x.beamCalls,['start','stop','dispose']);
});


test('five independent understandings drain all five procedures but do not open the final door',async()=>{
  const x=setup();
  x.context.beginGame();x.context.setQuestionFlow();
  for(const question of [
    '音は自分の耳の中から聞こえますか？','ここは幻覚ですか？',
    '音も幻覚ですか？','音を出しているのは自分ですか？',
    '音を生む出来事が認知機能を低下させていますか？',
  ]) { await x.ask(question); await wait(12); }
  await wait(120);
  assert.deepEqual(x.state().reachedCheckpointIds,['cp1','cp2','cp3','cp4','cp5']);
  assert.deepEqual(x.stepCalls,['step1','step2','step3','step4','step5']);
  assert.equal(x.state().cabinetKey,true);
  assert.equal(x.state().ray,true);
  assert.equal(x.state().doorKey,true);
  assert.equal(x.state().phase,'question');
  assert.equal(x.get('conversation-actions').children.length,0);
});

test('a first-turn solved theory drains every procedure once and enables the final door',async()=>{
  const x=setup();
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await wait(120);
  assert.deepEqual(x.stepCalls,['step1','step2','step3','step4','step5']);
  assert.equal(x.state().phase,'entrance');
  assert.equal(x.state().cabinetKey,true);
  assert.equal(x.state().cabinetOpen,true);
  assert.equal(x.state().ray,true);
  assert.equal(x.state().doorKey,true);
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'部屋の鍵でドアを開ける');
  await x.context.enterBugRoom();
  assert.equal(x.state().phase,'bug');
  x.context.reset();
  assert.equal(x.state().phase,'start');
});

test('checkpoint action controls are serialized and reset cancels their pending reward',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='checkpoint_completion';state.cabinetKey=true;deadline.start()",x.context);
  const pending=x.context.handleCheckpointAction({type:'unlock-cabinet'},{signal:new AbortController().signal});
  const button=x.get('conversation-actions').children.at(-1);
  button.handlers.click();button.handlers.click();
  assert.equal((await pending).completed,true);
  assert.equal(x.state().cabinetOpen,true);
  const stale=x.context.handleCheckpointAction({type:'take-gun'},{signal:new AbortController().signal});
  x.context.reset();
  assert.equal((await stale).cancelled,true);
  assert.equal(x.state().ray,false);
});

test('checkpoint responses preserve ordinary movement while final solve starts the independent drain',async()=>{
  const x=setup({chat:async()=>({ok:true,json:async()=>({outcome:{choice:'PARTIAL',confidence:1,reasoning_progress:'PARTIAL_INSIGHT'},keyIssued:false,reachedCheckpointIds:['cp1']})})});
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  assert.equal(x.state().reasoningStage,1);
  assert.equal(x.state().reachedCheckpointIds.length,1);
  assert.equal(x.state().phase,'question');
  x.context.reset();
  const y=setup();
  y.context.beginGame();y.context.setQuestionFlow();y.context.openComposer('final_theory');
  await y.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await wait(120);
  assert.equal(y.state().phase,'entrance');
  assert.deepEqual(y.stepCalls,['step1','step2','step3','step4','step5']);
});

test('arrival observations coexist with the final checkpoint drain and door control',async()=>{
  const x=setup();
  x.context.beginGame();x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await wait(140);
  assert.equal(x.state().phase,'entrance');
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length>=1,true);
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'部屋の鍵でドアを開ける');
});

test('the visual-novel window alternates between one message and its on-demand editor',async()=>{
  const x=setup();
  x.context.beginGame();
  for(const _ of PROLOGUE)x.get('conversation-actions').children[0].handlers.click();
  x.context.setQuestionFlow();
  assert.deepEqual(x.get('conversation-log').children.filter(node=>!node.hidden).map(node=>node.textContent),[LION_DISCOVERY]);
  x.context.greetLion();
  assert.equal(x.get('question-form').hidden,true);
  x.get('theory-toggle').handlers.click();
  assert.equal(x.get('question-form').hidden,false);
  x.get('question-input').value='書きかけの推理';
  x.context.closeComposer();
  x.context.openComposer('final_theory');
  assert.equal(x.get('question-input').value,'書きかけの推理');
  x.context.closeComposer();
});

test('a checkpoint media failure blocks only its procedure and never invents an item',async()=>{
  const x=setup({checkpointStep:async()=>({completed:false,reason:'media_error'})});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await wait(20);
  assert.equal(x.state().checkpointProgress.blocked.reason,'media_error');
  assert.equal(x.state().cabinetKey,false);
  assert.equal(x.state().ray,false);
});

test('a blocked checkpoint exposes retry and keeps the solved drain alive',async()=>{
  let failures=1;
  const x=setup({checkpointStep:async id=>{
    x.stepCalls.push(`runtime:${id}`);
    if(id==='step1'&&failures-- > 0)return {completed:false,reason:'poster_unavailable'};
    return {completed:true};
  }});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await wait(20);
  assert.equal(x.state().phase,'checkpoint_completion');
  assert.equal(x.state().checkpointProgress.blocked.reason,'poster_unavailable');
  const retry=x.get('conversation-actions').children.at(-1);
  assert.equal(retry.textContent,'映像を再試行');
  retry.handlers.click();
  await wait(40);
  assert.equal(x.state().phase,'entrance');
  assert.deepEqual(x.state().checkpointProgress.completedStepIds,['step1','step2','step3','step4','step5']);
  assert.deepEqual(x.stepCalls.filter(value=>value.startsWith('runtime:')),['runtime:step1','runtime:step1','runtime:step2','runtime:step3','runtime:step4','runtime:step5']);
});

test('checkpoint action presentation does not depend on a reward thumbnail',async()=>{
  const x=setup({imageState:'pending'});
  x.context.beginGame();
  vm.runInContext("state.phase='checkpoint_completion';state.cabinetKey=true;deadline.start()",x.context);
  const pending=x.context.handleCheckpointAction({type:'unlock-cabinet'},{signal:new AbortController().signal});
  const button=x.get('conversation-actions').children.at(-1);
  assert.equal(button.textContent,'戸棚を開ける');
  button.handlers.click();
  assert.equal((await pending).completed,true);
  assert.equal(x.state().cabinetOpen,true);
});

test('reset cancels the final checkpoint actions without duplicate rewards',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='checkpoint_completion';state.ray=true;state.cabinetOpen=true;deadline.start()",x.context);
  const pending=x.context.handleCheckpointAction({type:'take-door-key'},{signal:new AbortController().signal});
  const button=x.get('conversation-actions').children.at(-1);
  button.handlers.click();button.handlers.click();
  assert.equal((await pending).completed,true);
  assert.equal(x.state().doorKey,true);
  const stale=x.context.handleCheckpointAction({type:'stow-gun'},{signal:new AbortController().signal});
  x.context.reset();
  assert.equal((await stale).cancelled,true);
  assert.equal(x.state().ray,false);
});
