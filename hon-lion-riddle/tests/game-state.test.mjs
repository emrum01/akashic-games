import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { PROLOGUE, OPENING, LION_DISCOVERY, LION_GREETING, CLUES, LION_REPLIES } from '../app/dialogue.js';
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
function setup({demo=true,configured=true,chat=mockWorkerResponse,arrival,opening,status,imageState='loaded'}={}) {
  const elements=new Map();
  const get=(id)=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const calls=[];
  const audio=[];
  const beamCalls=[];
  const events={};
  const context=vm.createContext({
    console,URLSearchParams,AbortController,AbortSignal,DOMException,TypeError,queueMicrotask,
    setTimeout:(fn)=>setTimeout(fn,5),clearTimeout,
    PROLOGUE,OPENING,LION_DISCOVERY,LION_GREETING,CLUES,LION_REPLIES,createLionReactions,API_ENDPOINT:'/api/hon-lion/chat',STATUS_ENDPOINT:'/api/hon-lion/status',LIVE_TIMEOUT_MS:9000,track:()=>{},
    createSoundDesign:()=>Object.fromEntries(['start','stop','toggle','reward','reveal','door','stopDoor','shoot','removeInsect','visibility'].map(name=>[name,()=>audio.push(name)])),
    connectVisualViewport:()=>{},
    createBeamEffects:()=>({shotDuration:6,start:()=>beamCalls.push('start'),stop:()=>beamCalls.push('stop'),dispose:()=>beamCalls.push('dispose')}),
    document:{getElementById:get,querySelector:()=>get('question-send'),createElement:(tag)=>{const element=new Element();if(tag==='img'&&imageState!=='loaded'){element.complete=false;element.naturalWidth=0;}return element;},addEventListener:()=>{}},
    window:{location:{search:demo?'?demo=1':''},addEventListener:(name,handler)=>{events[name]=handler;},__HON_LION_SCENE_RUNTIME__:{reset:()=>Promise.resolve({}),setStage:(stage,scene)=>{calls.push({stage,scene});return scene==='entrance'&&arrival?arrival:scene==='bug'&&opening?opening:Promise.resolve({fallback:false});}}},
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

test('conversation, correct reasoning, media-gated entry, clear and replay form one game',async()=>{
  let arrive;
  const x=setup({arrival:new Promise(resolve=>{arrive=resolve;})});
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
  assert.deepEqual(x.calls.filter(call=>call.stage>0).map(call=>call.stage),[1,2]);
  x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  assert.equal(x.state().phase,'key');
  x.context.grantKey(); await tick();
  assert.equal(x.state().key,true);
  x.context.grantRaygun(); await tick();
  assert.equal(x.get('conversation-actions').children.length,0,'entry stays locked during movement');
  arrive({fallback:false}); await tick();
  assert.equal(x.get('conversation-actions').children.length,1);
  await x.context.enterBugRoom();
  const ending=x.context.burnBug();
  assert.equal(x.state().phase,'firing');
  assert.equal(x.state().cleared,false,'a shot does not immediately announce success');
  await ending;
  assert.equal(x.state().cleared,true);
  assert.equal(x.state().phase,'clear');
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
  assert.equal(x.get('app').querySelector('.beam'),null);
  assert.equal(x.get('app').querySelector('.held-raygun'),null);
  assert.ok(x.get('conversation-log').children.some(node=>node.textContent==='脱出成功'));
  assert.deepEqual(x.audio,['start','reward','reward','reveal','shoot','removeInsect']);
  assert.deepEqual(x.beamCalls,['start','stop','dispose'],'the shot renderer is disposed after its six-second lifecycle');
  x.context.reset();
  assert.equal(x.state().phase,'start');
  assert.equal(x.state().key,false);
  assert.equal(x.get('app').querySelector('.bug-mark'),null);
  x.context.beginGame();
  assert.equal(x.state().phase,'prologue');
  assert.equal(x.get('lion-character-button').hidden,true);
  assert.equal(x.get('conversation-log').children[0].textContent,PROLOGUE[0]);
});

test('replay cancels a pending ending and removes its audio and visual effects',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='entrance'; state.ray=true",x.context);
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
  vm.runInContext("state.phase='entrance';state.ray=true",x.context);
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

test('the insect reveal waits for its image, plays once, and ignores late loads',async()=>{
  const x=setup({imageState:'pending'});
  x.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true",x.context);
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
  vm.runInContext("state.phase='entrance';state.ray=true",reset.context);
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
    assert.equal(x.get('lion-character-button').attributes['data-reaction'],expected);
    x.context.reset();
  }
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
    assert.equal(x.state().key,false);
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
  assert.deepEqual(visible(),['はい']);
  assert.equal(x.get('question-form').hidden,true);
  assert.equal(x.get('theory-toggle').textContent,'推理を直す');
  x.get('theory-toggle').handlers.click();
  assert.equal(x.get('question-input').value,'耳に虫がいる','partial theories remain editable');
  x.get('composer-cancel').handlers.click();
  assert.deepEqual(visible(),['はい'],'cancelling restores the reply');
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
      assert.equal(x.state().key, false);
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
  assert.equal(x.state().key,false);
  assert.match(x.get('system-note').textContent,/まだ設定されていません/);
  assert.equal(x.get('question-input').disabled,false);
});

test('a server-approved solved theory is accepted below the old client confidence gate',async()=>{
  const x=setup({chat:async()=>({ok:true,json:async()=>({outcome:{choice:'SOLVED',confidence:.85,reasoning_progress:'SYNTHESIS'},keyIssued:true})})});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('サーバーが承認した推理');
  assert.equal(x.state().phase,'key');
});

test('a reward image error still exposes text-only continuation',async()=>{
  const x=setup({imageState:'error',arrival:Promise.resolve({fallback:false})});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  x.context.grantKey();
  const media=x.get('conversation-log').children.at(-1);
  media.children[0].handlers.error();
  assert.equal(x.get('conversation-actions').children.length,1);
  x.context.grantRaygun();
  const raygunMedia=x.get('conversation-log').children.at(-1);
  raygunMedia.children[0].handlers.error();
  await tick();
  assert.equal(x.get('conversation-actions').children.length,1,'scene arrival remains the gate');
});

test('a never-loading reward image times out and replay cancels its callback',async()=>{
  const x=setup({imageState:'pending'});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  x.context.grantKey();
  await wait(15);
  assert.equal(x.get('conversation-actions').children.length,1);
  x.context.grantRaygun();
  x.context.reset();
  await wait(15);
  assert.equal(x.state().phase,'start');
  assert.equal(x.get('conversation-actions').children.length,0);
});

test('an immediate scene arrival still waits for the raygun image to settle',async()=>{
  const x=setup({imageState:'pending',arrival:Promise.resolve({fallback:false})});
  x.context.beginGame();x.context.setQuestionFlow();x.context.openComposer('final_theory');
  await x.ask('洋館は幻覚。耳に入った虫が自分の脳を食べていて、心地よく聞こえていたのはその捕食音だ。');
  x.context.grantKey();
  await wait(15);
  x.context.grantRaygun();
  await tick();
  assert.equal(x.get('conversation-actions').children.length,0,'visual arrival does not bypass a pending reward image');
  await wait(15);
  assert.equal(x.get('conversation-actions').children.length,1,'timeout settles the image and enables text-only continuation');
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

test('pagehide stops and disposes an active shot renderer',async()=>{
  const x=setup();
  x.context.beginGame();
  vm.runInContext("state.phase='entrance';state.ray=true",x.context);
  await x.context.enterBugRoom();
  x.context.burnBug();
  assert.equal(x.state().phase,'firing');
  x.events.pagehide();
  assert.deepEqual(x.beamCalls,['start','stop','dispose']);
});
