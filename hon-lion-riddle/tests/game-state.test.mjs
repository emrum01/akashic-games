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
function setup({demo=true,configured=true,chat=mockWorkerResponse,arrival,opening,movement,closing,scenePromises={},status,imageState='loaded'}={}) {
  const elements=new Map();
  const get=(id)=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const calls=[];
  const audio=[];
  const beamCalls=[];
  const events={};
  const context=vm.createContext({
    console,URLSearchParams,AbortController,AbortSignal,DOMException,TypeError,queueMicrotask,
    setTimeout:(fn)=>setTimeout(fn,5),clearTimeout,
    PROLOGUE,OPENING,LION_DISCOVERY,LION_GREETING,PROBLEM,THEORY_PROMPT,ARRIVAL_OBSERVATION,NOISE_OBSERVATION,DEATH_NARRATION,CLUES,LION_REPLIES,createDeadlineController,createObservationController,createLionReactions,API_ENDPOINT:'/api/hon-lion/chat',STATUS_ENDPOINT:'/api/hon-lion/status',LIVE_TIMEOUT_MS:9000,track:()=>{},
    createSoundDesign:()=>Object.fromEntries(['start','stop','toggle','reward','reveal','door','stopDoor','shoot','removeInsect','visibility'].map(name=>[name,()=>audio.push(name)])),
    connectVisualViewport:()=>{},
    createBeamEffects:()=>({shotDuration:6,start:()=>beamCalls.push('start'),stop:()=>beamCalls.push('stop'),dispose:()=>beamCalls.push('dispose')}),
    document:{getElementById:get,querySelector:()=>get('question-send'),createElement:(tag)=>{const element=new Element();if(tag==='img'&&imageState!=='loaded'){element.complete=false;element.naturalWidth=0;}return element;},addEventListener:()=>{}},
    window:{location:{search:demo?'?demo=1':''},setTimeout:(fn,delay)=>{const timer=setTimeout(fn,delay);timer.unref?.();return timer;},clearTimeout,addEventListener:(name,handler)=>{events[name]=handler;},__HON_LION_SCENE_RUNTIME__:{reset:()=>Promise.resolve({}),setStage:(stage,scene)=>{calls.push({stage,scene});return scenePromises[scene]??(scene==='living'&&movement?movement:scene==='close'&&closing?closing:scene==='entrance'&&arrival?arrival:scene==='bug'&&opening?opening:Promise.resolve({fallback:false}));}}},
    fetch:(url,options)=>url==='/api/hon-lion/status'?(status?status():Promise.resolve({ok:true,json:async()=>({configured})})):chat(url,options),
  });
  vm.runInContext(source,context);
  const state=()=>vm.runInContext('state',context);
  const ask=async(question)=>{context.openComposer(state().questionMode);get('question-input').value=question;await context.submitQuestion({preventDefault(){}});};
  return {context,get,state,ask,calls,audio,beamCalls,events};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

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

test('conversation, correct reasoning, cabinet reward route, clear and replay form one game',async()=>{
  const x=setup();
  assert.equal(x.state().phase,'start');
  x.context.beginGame();
  for(const page of PROLOGUE){
    assert.equal(x.state().phase,'prologue');
    assert.equal(x.get('lion-character-button').hidden,true,'the lion is not present before the manor');
    assert.equal(x.get('question-form').hidden,true);
    assert.equal(x.get('conversation-tools').hidden,true);
    x.context.greetLion();
    assert.equal(x.get('conversation-log').children.length,1);
    assert.equal(x.get('conversation-log').children[0].textContent,page);
    x.get('conversation-actions').children[0].handlers.click();
  }
  assert.equal(x.state().phase,'intro');
  assert.equal(x.get('lion-character-button').hidden,false);
  assert.equal(x.get('lion-character-button').disabled,true);
  assert.deepEqual(x.audio,['start'],'the same audio continues through the scene change');
  assert.equal(x.get('conversation-log').children.at(-1).textContent,OPENING);
  x.context.greetLion();
  assert.equal(x.get('conversation-log').children.at(-1).textContent,OPENING,'greeting cannot interrupt the intro');
  x.get('conversation-actions').children[0].handlers.click();
  assert.equal(x.state().phase,'problem');
  assert.equal(x.get('conversation-log').children.at(-1).textContent,PROBLEM);
  assert.equal(x.get('lion-character-button').disabled,true);
  assert.equal(vm.runInContext('deadline.started',x.context),false,'reading the problem does not consume the deadline');
  x.get('conversation-actions').children[0].handlers.click();
  assert.equal(x.get('conversation-log').children.at(-1).textContent,LION_DISCOVERY);
  assert.equal(x.get('lion-character-button').disabled,false);
  x.context.greetLion();
  assert.equal(x.get('conversation-log').children.at(-1).textContent,LION_GREETING);
  assert.doesNotMatch(x.get('question-input').placeholder,/虫/);
  await x.ask('ここは幻覚ですか？');
  assert.equal(x.state().reasoningStage,1);
  await x.ask('天気はどうですか？');
  assert.equal(x.state().reasoningStage,1);
  await x.ask('この洋館は幻覚ですか？');
  assert.equal(x.state().reasoningStage,1,'rephrasing a known insight does not count twice');
  await x.ask('耳に入った虫が自分の脳を食べていますか？');
  assert.equal(x.state().reasoningStage,2);
  assert.deepEqual(x.calls.filter(call=>call.scene==='living'||call.scene==='close').map(call=>call.scene),['living','close']);
  x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  assert.equal(x.state().phase,'key');
  await tick();
  assert.equal(x.get('conversation-log').children.at(-1).textContent,'ランプの下で何か光っている');
  assert.equal(x.get('conversation-log').children.filter(node=>!node.hidden).length,1);
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'調べる');
  await x.context.grantKey(); await tick();
  assert.equal(x.state().cabinetKey,true);
  assert.equal(x.get('conversation-log').children.some(node=>node.className.includes('media')&&node.children.at(-1).textContent==='戸棚のカギを見つけた'),true);
  assert.equal(x.state().phase,'cabinet');
  x.context.moveToCabinet(); await tick();
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'鍵で戸棚を開ける');
  x.context.openCabinet(); await tick();
  assert.equal(x.state().phase,'cabinet-open');
  assert.equal(x.state().ray,false,'the gun is unavailable until the take animation finishes');
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'光線銃を取る');
  x.context.takeRaygun(); await tick();
  assert.equal(x.state().ray,true);
  assert.equal(x.state().phase,'gun-acquired');
  assert.equal(x.get('conversation-log').children.at(-1).textContent,'光線銃を手に入れた。');
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'次へ');
  x.context.stowRaygun(); await tick();
  assert.equal(x.state().phase,'door-key');
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'ドアの鍵を取る');
  x.context.takeDoorKey(); await tick();
  assert.equal(x.state().doorKey,true);
  assert.equal(x.get('conversation-log').children.some(node=>node.textContent==='部屋のドアの鍵を手に入れた。'),true);
  x.context.moveToEntry(); await tick();
  assert.equal(x.state().phase,'entrance');
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'部屋の鍵でドアを開ける');
  await x.context.enterBugRoom();
  const ending=x.context.burnBug();
  assert.equal(x.state().phase,'firing');
  assert.equal(x.state().cleared,false,'a shot does not immediately announce success');
  await ending;
  assert.equal(x.state().cleared,true);
  assert.equal(x.state().phase,'clear');
  assert.equal(vm.runInContext('deadline.started',x.context),false,'removing the insect stops the wall-clock deadline');
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
  assert.equal(x.get('app').querySelector('.beam'),null);
  assert.equal(x.get('app').querySelector('.held-raygun'),null);
  assert.ok(x.get('conversation-log').children.some(node=>node.textContent==='脱出成功'));
  assert.deepEqual(x.audio,['start','reward','reward','reward','reveal','shoot','removeInsect']);
  assert.deepEqual(x.beamCalls,['start','stop','dispose'],'the shot renderer is disposed after its six-second lifecycle');
  x.context.reset();
  assert.equal(x.state().phase,'start');
  assert.equal(x.state().cabinetKey,false);
  assert.equal(x.state().doorKey,false);
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
  x.context.beginGame();
  assert.equal(x.state().phase,'prologue');
  assert.equal(x.get('lion-character-button').hidden,true);
  assert.equal(x.get('conversation-log').children[0].textContent,PROLOGUE[0]);
});

test('reward transitions wait for their background edge and reset or double clicks cannot award early',async()=>{
  let resolveClose;
  const close=new Promise(resolve=>{resolveClose=resolve;});
  const x=setup({scenePromises:{close}});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  assert.equal(x.state().phase,'key');
  assert.equal(x.state().rewardBusy,true);
  assert.equal(x.get('conversation-actions').children.length,0);
  x.context.reset();
  resolveClose({cancelled:true});
  await tick();
  assert.equal(x.state().cabinetKey,false);
  assert.equal(x.state().phase,'start');

  let resolveKey;
  const key=new Promise(resolve=>{resolveKey=resolve;});
  const y=setup({scenePromises:{key}});
  y.context.beginGame();y.context.setQuestionFlow();y.context.openComposer('final_theory');
  await y.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await tick();
  y.context.grantKey();y.context.grantKey();
  assert.equal(y.state().cabinetKey,false);
  assert.equal(y.calls.filter(call=>call.scene==='key').length,1);
  y.context.reset();
  resolveKey({cancelled:true});
  await tick();
  assert.equal(y.state().cabinetKey,false);

  let resolveOpen;
  const cabinetOpen=new Promise(resolve=>{resolveOpen=resolve;});
  const z=setup({scenePromises:{'cabinet-open':cabinetOpen}});
  z.context.beginGame();z.context.setQuestionFlow();z.context.openComposer('final_theory');
  await z.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await tick();
  await z.context.grantKey();
  z.context.moveToCabinet();await tick();
  z.context.openCabinet();z.context.openCabinet();
  assert.equal(z.state().phase,'cabinet');
  assert.equal(z.state().cabinetOpen,false);
  assert.equal(z.state().ray,false);
  z.context.reset();
  resolveOpen({cancelled:true});
  await tick();
  assert.equal(z.state().phase,'start');
  assert.equal(z.state().ray,false);

  let resolveGunHeld;
  const gunHeld=new Promise(resolve=>{resolveGunHeld=resolve;});
  const w=setup({scenePromises:{'gun-held':gunHeld}});
  w.context.beginGame();w.context.setQuestionFlow();w.context.openComposer('final_theory');
  await w.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await tick();
  await w.context.grantKey();
  await w.context.moveToCabinet();
  await w.context.openCabinet();
  w.context.takeRaygun();w.context.takeRaygun();
  assert.equal(w.state().ray,false);
  assert.equal(w.state().rewardBusy,true);
  resolveGunHeld({fallback:false});
  await tick();
  assert.equal(w.state().ray,true);
  assert.equal(w.state().phase,'gun-acquired');
  w.context.reset();
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

test('the movement state matches the spoken reply for partial, solved, and clarification results',async()=>{
  for(const [choice,expected] of [['PARTIAL','yes'],['SOLVED','yes'],['NEEDS_CLARIFICATION','irrelevant']]){
    const x=setup({chat:async()=>({ok:true,json:async()=>({outcome:{choice,confidence:1,reasoning_progress:choice==='SOLVED'?'SYNTHESIS':'NONE'},keyIssued:choice==='SOLVED'})})});
    x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
    await x.ask('推理の説明');
    assert.equal(x.get('conversation-log').children.at(-1).textContent,LION_REPLIES[choice]);
    assert.equal(x.get('lion-character-button').attributes['data-reaction'],choice==='SOLVED'?undefined:expected);
    assert.equal(x.get('lion-character-button').hidden,choice==='SOLVED');
    x.context.reset();
  }
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

test('an arrived observation stays deferred through final-theory composition and the lamp transition',async()=>{
  let arrive;
  let close;
  const x=setup({movement:new Promise(resolve=>{arrive=resolve;}),closing:new Promise(resolve=>{close=resolve;})});
  x.context.beginGame();
  x.context.setQuestionFlow();
  await x.ask('ここは幻覚ですか？');
  x.context.openComposer('final_theory');
  arrive({fallback:false});
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,0);
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  assert.equal(x.state().phase,'key');
  assert.equal(x.get('conversation-actions').children.length,0);
  close({fallback:false});
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,1);
  assert.equal(x.get('conversation-actions').children[0].textContent,'調べる');
});

test('a direct solved theory keeps the first arrival observation beside the lamp and its control',async()=>{
  let completeMovement;
  const x=setup();
  x.context.window.__HON_LION_SCENE_RUNTIME__.setStage=()=>{
    // Match the real runtime: a new destination cancels the previous waiter.
    completeMovement?.({cancelled:true,superseded:true});
    return new Promise(resolve=>{completeMovement=resolve;});
  };
  x.context.beginGame();
  x.context.setQuestionFlow();
  x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  assert.equal(x.state().phase,'key');
  await tick();
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,0);
  assert.equal(x.get('conversation-actions').children.length,0,'the lamp waits for scene arrival');
  completeMovement({fallback:false});
  await wait(12);
  assert.equal(x.get('conversation-log').children.filter(node=>node.textContent===ARRIVAL_OBSERVATION).length,1);
  assert.equal(x.get('conversation-log').children.some(node=>node.textContent==='ランプの下で何か光っている'),true);
  assert.equal(x.get('conversation-actions').children[0].textContent,'調べる');
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
    return {ok:true,json:async()=>({outcome:{choice:'YES',confidence:.98,reasoning_progress:progress},keyIssued:false})};
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
  await x.ask('耳の虫に自分の脳を食べられているんですか？');
  assert.equal(x.state().reasoningStage,2);
  assert.equal(posts.length,3,'free-form questions reach the real judging path');
  assert.equal(posts[2].recentTurns[0].turn_outcome.reasoning_progress,'PARTIAL_INSIGHT');
  assert.deepEqual(x.calls.filter(call=>call.stage>0).map(call=>call.stage),[1,2]);
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
    return {ok:true,json:async()=>({outcome:{choice:'PARTIAL',confidence:1,reasoning_progress:repeated?'NONE':'PARTIAL_INSIGHT'},keyIssued:false,knownInsights:repeated?body.knownInsights:[{player_message:body.question,turn_outcome:{choice:'PARTIAL',confidence:1,reasoning_progress:'PARTIAL_INSIGHT'}}]})};
  }});
  x.context.beginGame();x.context.setQuestionFlow();
  for(let i=0;i<2;i++){
    x.context.openComposer('final_theory');
    await x.ask('耳に虫がいる');
    assert.equal(x.state().questionMode,'final_theory','partial explanations remain editable');
    assert.equal(x.get('question-input').value,'耳に虫がいる','the player does not have to rewrite their explanation');
    assert.equal(x.state().reasoningStage,1);
    assert.equal(x.state().cabinetKey,false);
  }
  assert.equal(x.calls.filter(call=>call.stage>0).length,1);
  assert.equal(posts[1].knownInsights.length,1);
  x.context.reset();
  assert.equal(x.state().knownInsights.length,0);
});

test('the visual-novel window alternates between one message and its on-demand editor',async()=>{
  const x=setup();
  const visible=()=>x.get('conversation-log').hidden?[]:x.get('conversation-log').children.filter(node=>!node.hidden).map(node=>node.textContent);
  x.context.beginGame();
  for(const _ of PROLOGUE)x.get('conversation-actions').children[0].handlers.click();
  x.context.setQuestionFlow();
  assert.deepEqual(visible(),[LION_DISCOVERY],'the discovery leads into free questions');
  x.context.greetLion();
  assert.deepEqual(visible(),[LION_GREETING]);
  assert.equal(x.get('question-form').hidden,true,'reading never shows an input field');
  assert.equal(x.get('conversation-tools').hidden,false);
  await x.ask('赤ですか？');
  await x.ask('水曜日ですか？');
  assert.deepEqual(visible(),['関係ない'],'the answer replaces the player question');
  assert.equal(x.state().turns.length,2,'the judge retains the full recent context');
  x.context.greetLion();
  assert.deepEqual(visible(),[LION_GREETING]);
  x.get('theory-toggle').handlers.click();
  assert.deepEqual(visible(),[],'the editor replaces the message area');
  assert.equal(x.get('question-form').hidden,false);
  await x.ask('耳に虫がいる');
  await wait(12);
  assert.deepEqual(visible(),['はい',ARRIVAL_OBSERVATION]);
  assert.equal(x.get('question-form').hidden,true);
  assert.equal(x.get('theory-toggle').textContent,'推理を直す');
  x.get('theory-toggle').handlers.click();
  assert.equal(x.get('question-input').value,'耳に虫がいる','partial theories remain editable');
  x.get('composer-cancel').handlers.click();
  assert.deepEqual(visible(),['はい',ARRIVAL_OBSERVATION],'cancelling restores the reply and the queued arrival observation');
  x.context.setPhase('key');x.context.updateComposer();
  assert.equal(x.get('conversation-tools').hidden,true);
  assert.equal(x.get('composer-actions').hidden,true);
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
  assert.equal(x.state().phase,'key');
});

test('reward image failures never block the background cabinet route',async()=>{
  const x=setup({imageState:'error'});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await tick();
  await x.context.grantKey();
  const media=x.get('conversation-log').children.at(-1);
  media.children[0].handlers.error();
  assert.equal(x.get('conversation-actions').children.length,1);
  x.context.moveToCabinet(); await tick();
  x.context.openCabinet(); await tick();
  assert.equal(x.get('conversation-log').children.at(-1).textContent,'戸棚が開いた。棚の奥に光線銃が見える。');
  await tick();
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'光線銃を取る');
});

test('a never-loading reward image times out and replay cancels its callback',async()=>{
  const x=setup({imageState:'pending'});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await tick();
  x.context.grantKey();
  await wait(15);
  assert.equal(x.get('conversation-actions').children.length,1);
  x.context.moveToCabinet();
  x.context.reset();
  await wait(15);
  assert.equal(x.state().phase,'start');
  assert.equal(x.get('conversation-actions').children.length,0);
});

test('a pending key thumbnail does not block the gun in the cabinet',async()=>{
  const x=setup({imageState:'pending'});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  await tick();
  x.context.grantKey();
  await wait(15);
  x.context.moveToCabinet();
  await tick();
  x.context.openCabinet();
  await tick();
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'光線銃を取る','cabinet opening does not wait for the key thumbnail');
  await wait(15);
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'光線銃を取る');
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

for(const target of ['gun-stowed','armed']) {
  test(`reset cancels pending ${target} and repeated clicks cannot collect twice`,async()=>{
    let finish;const transition=new Promise(resolve=>{finish=resolve;});
    const x=setup({scenePromises:{[target]:transition}});
    x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
    await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
    await tick();await x.context.grantKey();await x.context.moveToCabinet();await x.context.openCabinet();await x.context.takeRaygun();
    await x.context.moveToEntry();
    assert.equal(x.calls.filter(call=>call.scene==='entry').length,0,'gun alone cannot advance to the room');
    if(target==='armed')await x.context.stowRaygun();
    const action=target==='gun-stowed'?'stowRaygun':'takeDoorKey';
    const pending=x.context[action]();x.context[action]();
    assert.equal(x.calls.filter(call=>call.scene===target).length,1);
    assert.equal(x.state().doorKey,false);
    assert.equal(x.state().rewardBusy,true);
    x.context.reset();finish({cancelled:true});await pending;
    assert.equal(x.state().phase,'start');assert.equal(x.state().doorKey,false);assert.equal(x.state().ray,false);
    assert.equal(x.get('conversation-actions').children.length,0);
  });
}

test('deadline expiry during a reward video exposes retry and rejects its late completion',async()=>{
  let finish;
  const x=setup({scenePromises:{'gun-held':new Promise(resolve=>{finish=resolve;})}});
  x.context.beginGame();
  vm.runInContext("state.phase='cabinet-open';state.cabinetOpen=true;deadline.start()",x.context);
  const pending=x.context.takeRaygun();
  assert.equal(x.state().rewardBusy,true);
  x.context.expireGame();
  assert.equal(x.state().phase,'dead');
  assert.equal(x.state().rewardBusy,false);
  assert.equal(x.get('app').dataset.rewardBusy,'false');
  assert.equal(x.get('conversation-actions').children.at(-1).textContent,'もう一度');
  finish({fallback:false});
  await pending;
  assert.equal(x.state().phase,'dead');
  assert.equal(x.state().ray,false);
  x.get('conversation-actions').children.at(-1).handlers.click();
  assert.equal(x.state().phase,'start');
});

test('a rejected reward continuation checks the wall clock before it can award an item',async()=>{
  let reject;
  const x=setup({scenePromises:{'gun-held':new Promise((resolve,fail)=>{reject=fail;})}});
  x.context.beginGame();
  vm.runInContext("state.phase='cabinet-open';state.cabinetOpen=true;setActions([]);deadline.check=()=>false",x.context);
  const pending=x.context.takeRaygun();
  vm.runInContext('deadline.check=()=>true',x.context);
  reject(new Error('late video failure'));
  await pending;
  assert.equal(x.state().phase,'cabinet-open');
  assert.equal(x.state().ray,false);
  assert.equal(x.state().rewardBusy,false);
  assert.equal(x.get('conversation-actions').children.length,0);
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

for(const failure of ['throw','reject']) {
  test(`a scene ${failure} falls back without locking reward controls`,async()=>{
    const x=setup();
    x.context.beginGame();
    vm.runInContext("state.phase='cabinet-open';state.cabinetOpen=true",x.context);
    x.context.window.__HON_LION_SCENE_RUNTIME__.setStage=()=>{
      if(failure==='throw')throw Error('media unavailable');
      return Promise.reject(Error('media unavailable'));
    };
    await x.context.takeRaygun();
    assert.equal(x.state().phase,'gun-acquired');
    assert.equal(x.state().rewardBusy,false);
    assert.equal(x.state().ray,true);
    assert.equal(x.get('conversation-actions').children[0].attributes['aria-label'],'次へ');
    assert.match(x.get('system-note').textContent,/静止画/);
    await x.context.stowRaygun();await x.context.takeDoorKey();await x.context.moveToEntry();
    await x.context.enterBugRoom();
    assert.equal(x.state().phase,'bug','the final room follows the same failure policy');
  });
}
