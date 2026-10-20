import { API_ENDPOINT, LIVE_TIMEOUT_MS, STATUS_ENDPOINT } from './api-config.js';
import { track } from './analytics.js';
import { PROLOGUE, OPENING, LION_DISCOVERY, LION_GREETING, CLUES, LION_REPLIES } from './dialogue.js?v=20261020asmr1';
import { createSoundDesign } from './sound.js?v=20261020crunch4';
import { connectVisualViewport } from './viewport.js?v=20261020keyboard';
import { createLionReactions } from './lion-reactions.js?v=20261020reaction';
import { createBeamEffects } from './beam-effects/controller.js?v=20261020beam3';

const $ = (id) => document.getElementById(id);
const state = { mode:'live', phase:'start', questionMode:'question', composerOpen:false, drafts:{question:'',final_theory:''}, turns:[], knownInsights:[], questionCount:0, reasoningStage:0, cabinetKey:false, doorKey:false, ray:false, cabinetOpen:false, rewardBusy:false, cleared:false, busy:false, generation:0, requestController:null };
const refs = { app:$('app'), start:$('start-screen'), startButton:$('start-button'), conversation:$('conversation'), speaker:$('speaker'), log:$('conversation-log'), actions:$('conversation-actions'), form:$('question-form'), label:$('question-label'), input:$('question-input'), send:$('question-send'), tools:$('conversation-tools'), ask:$('ask-toggle'), theoryToggle:$('theory-toggle'), composerActions:$('composer-actions'), cancel:$('composer-cancel'), note:$('system-note'), lion:$('lion-character-button'), lionImage:$('lion-character') };
const LION_IDLE_SRC='./assets/characters/hon-lion-dialogue.png?v=20261020round';
let greetingMessage = null;
let revealGeneration = -1;
const beatTimers = new Map();
const mediaCleanups = new Set();
const beamEffectsFactory = typeof createBeamEffects === 'function' ? createBeamEffects : null;
let beamEffects = null;
const MEDIA_TIMEOUT_MS = 3000;
const CONNECTION_ERROR = '本ライオンに声が届きませんでした。もう一度送ってください。';
const API_ERROR_MESSAGES = Object.freeze({
  rate_limited: '質問が続いています。1分ほど待って、もう一度送ってください。',
  rate_limit_unavailable: '本ライオンとの接続を確認できません。少し待って、もう一度送ってください。',
  live_unavailable: '本ライオンとの接続がまだ設定されていません。',
  provider_auth: '本ライオンとの接続設定を確認する必要があります。',
  provider_rate_limited: '質問が混み合っています。少し待って、もう一度送ってください。',
  upstream_timeout: '返事に時間がかかっています。もう一度送ってください。',
});
const sound = createSoundDesign(({muted,available,removed,running})=>{
  const toggle=$('sound-toggle');
  const label=available?(muted?'音を出す':'音を消す'):'音声なし';
  toggle.setAttribute('aria-label',label);
  toggle.setAttribute('title',label);
  toggle.dataset.muted=String(muted||!available);
  toggle.disabled=!available;
  toggle.setAttribute('aria-pressed',String(muted));
  refs.app.dataset.audio=removed?'silent':running?'playing':muted?'muted':'idle';
});
const lionReactions=createLionReactions({button:refs.lion,image:refs.lionImage,documentRef:document,idleSrc:LION_IDLE_SRC,setTimeoutFn:setTimeout,clearTimeoutFn:clearTimeout});
const clearLionReaction=()=>lionReactions.clear();
const preloadLionReactions=()=>lionReactions.preload();
const showLionReaction=(choice)=>lionReactions.show(choice);
function setPhase(phase){
  state.phase=phase;
  refs.app.dataset.phase=phase;
  refs.app.dataset.rewardBusy=String(state.rewardBusy);
  refs.lion.hidden=['start','prologue','key','cabinet','cabinet-open','gun-acquired','gun-stowed','door-key','armed','entrance','opening','bug','firing','silence','escaping','clear'].includes(phase);
  refs.lion.disabled=phase!=='question';
  if(refs.lion.hidden)clearLionReaction();
  const itemDialog=['key','cabinet','cabinet-open','gun-acquired','door-key','armed'].includes(phase);
  if(itemDialog){ refs.conversation.setAttribute('role','dialog'); refs.conversation.setAttribute('aria-label','アイテム取得'); }
  else { refs.conversation.removeAttribute('role'); refs.conversation.setAttribute('aria-label','本ライオンとの会話'); }
  $('sound-toggle').hidden=phase==='start'||phase==='clear';
}
function setRewardBusy(value){ state.rewardBusy=value; refs.app.dataset.rewardBusy=String(value); }
function beatDelay(ms,generation){ return new Promise(resolve=>{ const timer=setTimeout(()=>{beatTimers.delete(timer);resolve(generation===state.generation);},ms); beatTimers.set(timer,resolve); }); }
function clearBeat(){ refs.log.replaceChildren(); refs.speaker.textContent=''; setNote(''); }

function setScene(scene){ refs.app.dataset.scene=scene; const runtime=window.__HON_LION_SCENE_RUNTIME__; if(scene==='hall'&&(state.phase==='intro'||state.phase==='start')) return runtime?.reset?.(); return runtime?.setStage(state.reasoningStage,scene); }
function updateScene(){ if(state.phase==='entrance'||state.phase==='bug'||state.phase==='clear')return; setScene(state.reasoningStage===0?'hall':state.reasoningStage===1?'living':'close'); }
function applyReasoningProgress(progress,cumulative=false){ const next=progress==='SYNTHESIS'||progress==='CAUSAL_LINK'?2:progress==='PARTIAL_INSIGHT'?(cumulative?Math.min(2,state.reasoningStage+1):1):state.reasoningStage; if(next>state.reasoningStage){ state.reasoningStage=next; refs.app.dataset.reasoningStage=String(state.reasoningStage); updateScene(); } }
function setNote(text=''){ refs.note.textContent=text; }
function setActions(actions=[]){ refs.actions.replaceChildren(); actions.forEach(({label,onClick,primary=false})=>{ const button=document.createElement('button'); button.type='button'; button.textContent=label; if(primary)button.className='primary-action'; if(label==='次へ'){ button.classList.add('advance-action'); button.setAttribute('aria-label',label); button.innerHTML='<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m4 7 6 7 6-7z" fill="currentColor"/></svg>'; } button.addEventListener('click',onClick); refs.actions.append(button); }); }
function scrollLogToEnd(){ refs.log.scrollTo({top:refs.log.scrollHeight,left:0,behavior:'auto'}); }
// Keep the conversation context while showing only the current exchange.
function hidePreviousMessages(){ for(const message of refs.log.children)message.hidden=true; }
function appendMessage(kind,text){ const message=document.createElement('p'); message.className=`message ${kind}`; message.textContent=text; refs.log.append(message); scrollLogToEnd(); if(kind==='lion')refs.speaker.textContent='本ライオン'; else if(kind==='player')refs.speaker.textContent='あなた'; else refs.speaker.textContent=''; return message; }
function appendMedia(kind,text,src,alt,extra='',onReady=()=>{}){ const message=document.createElement('div'); message.className=`message media ${kind}`; const image=document.createElement('img'); image.src=src; image.alt=alt; image.decoding='async'; if(extra)image.classList.add(extra); const label=document.createElement('strong'); label.textContent=text; message.append(image,label); refs.log.append(message); scrollLogToEnd(); const generation=state.generation; let settled=false; let timer=0; const cleanup=()=>{ clearTimeout(timer); mediaCleanups.delete(cleanup); }; const settle=(ok,reason='')=>{ if(settled)return; settled=true; cleanup(); if(generation!==state.generation)return; scrollLogToEnd(); onReady(ok,reason); }; mediaCleanups.add(cleanup); timer=setTimeout(()=>settle(false,'timeout'),MEDIA_TIMEOUT_MS); if(image.complete&&image.naturalWidth>0)queueMicrotask(()=>settle(true)); else { image.addEventListener('load',()=>settle(true),{once:true}); image.addEventListener('error',()=>settle(false,'error'),{once:true}); } return message; }
function appendBeam(){
  removeBeam();
  const target=refs.app.querySelector('.bug-mark'), weapon=refs.app.querySelector('.held-raygun'), muzzle=weapon?.querySelector('.muzzle');
  if(!target||!weapon||!muzzle||!beamEffectsFactory)return;
  beamEffects=beamEffectsFactory({app:refs.app,target,weapon,muzzle,getBackground:()=>refs.app.querySelector('.scene-background')?.classList.contains('video-playing')?$('scene-video'):$('scene-poster'),reducedMotion:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true});
  beamEffects.start();
}
function removeBeam(){ beamEffects?.stop?.(); beamEffects?.dispose?.(); beamEffects=null; refs.app.querySelector('.beam')?.remove(); }
function appendBugMark(){
  if(refs.app.querySelector('.bug-mark')) return;
  const generation=state.generation;
  const bug=document.createElement('img');
  bug.className='bug-mark'; bug.width=1254; bug.height=1254;
  const reveal=()=>{
    if (revealGeneration===generation || generation!==state.generation || state.phase!=='bug') return;
    revealGeneration=generation;
    sound.reveal();
  };
  bug.addEventListener('load',()=>{ aimWeapon(); reveal(); },{once:true});
  bug.src='./assets/creatures/insect.png?v=20261018hallucination';
  bug.alt='開かずの間で見える、お茶目な白い人型';
  refs.app.append(bug);
  if (bug.complete && bug.naturalWidth>0) queueMicrotask(reveal);
  const weapon=document.createElement('div');
  weapon.className='held-raygun';
  const art=document.createElement('img');
  art.src='./assets/items/giant-raygun-first-person.png?v=20261018handgun';
  art.alt='一人称で奥の相手に構えた巨大なハンドガン型の光線銃';
  const muzzle=document.createElement('span');
  muzzle.className='muzzle';
  muzzle.setAttribute('aria-hidden','true');
  weapon.append(art,muzzle);
  refs.app.append(weapon);
  aimWeapon();
}
function aimWeapon(){
  const weapon=refs.app.querySelector('.held-raygun'),bug=refs.app.querySelector('.bug-mark');
  if(!weapon?.getBoundingClientRect||!bug||!refs.app.getBoundingClientRect)return;
  const g=weapon.getBoundingClientRect(),origin=refs.app.getBoundingClientRect();
  weapon.style.left=`${origin.width-g.width*.72}px`;
  weapon.style.top=`${origin.height-g.height*.72}px`;
}
function updateComposer(){
  const active=state.phase==='question',open=active&&state.composerOpen;
  refs.form.hidden=!open;
  refs.composerActions.hidden=!open;
  refs.tools.hidden=!active||open;
  refs.theoryToggle.hidden=!active;
  refs.log.hidden=open;
  refs.ask.disabled=state.busy;
  refs.cancel.disabled=state.busy;
  refs.theoryToggle.disabled=state.busy;
  if(!active)return;
  const theory=state.questionMode==='final_theory';
  refs.label.textContent=theory?'あなたの推理':'本ライオンへの質問';
  refs.input.rows=theory?3:2;
  refs.input.placeholder=theory?'推理を入力':'質問を入力';
  refs.send.textContent=state.busy?'…':'送信';
  refs.send.setAttribute('aria-label',theory?'推理を送信':'質問を送信');
  refs.theoryToggle.textContent=state.drafts.final_theory.trim()?'推理を直す':'答えを伝える';
  refs.form.dataset.mode=theory?'theory':'question';
}
function restoreSpeaker(){ const latest=[...refs.log.children].filter(message=>!message.hidden).at(-1); refs.speaker.textContent=latest?.className.includes('lion')?'本ライオン':latest?.className.includes('player')?'あなた':''; }
function focusComposer(event){
  // Touch users choose when to open the soft keyboard by tapping the textarea.
  // Keyboard activation (detail === 0) still moves focus into the editor.
  // Safari may label a tap "mouse", even with a trackpad as the primary pointer.
  const touch=event?.pointerType==='touch'||event?.pointerType==='pen'||
    window.matchMedia?.('(any-pointer: coarse)').matches;
  if(!touch||event?.detail===0)refs.input.focus({preventScroll:true});
}
function openComposer(mode,event){
  if(state.phase!=='question'||state.busy)return;
  if(state.composerOpen)state.drafts[state.questionMode]=refs.input.value;
  state.questionMode=mode; state.composerOpen=true;
  refs.input.value=state.drafts[mode]; refs.speaker.textContent='あなた';
  setNote(''); updateComposer(); focusComposer(event);
}
function closeComposer(){
  if(state.busy)return;
  state.drafts[state.questionMode]=refs.input.value; state.composerOpen=false;
  restoreSpeaker(); setNote(''); updateComposer(); refs.input.blur?.(); refs.ask.focus({preventScroll:true});
}
function greetLion(){
  if(state.busy||state.phase!=='question')return;
  if(state.composerOpen){state.drafts[state.questionMode]=refs.input.value;state.composerOpen=false;updateComposer();}
  hidePreviousMessages(); setNote('');
  if(greetingMessage?.isConnected){greetingMessage.hidden=false;refs.speaker.textContent='本ライオン';scrollLogToEnd();return;}
  greetingMessage=appendMessage('lion',LION_GREETING); greetingMessage.classList.add('greeting');
}
function setQuestionFlow(){
  setPhase('question');
  state.questionMode='question';
  state.composerOpen=false;
  hidePreviousMessages();
  appendMessage('narration',LION_DISCOVERY);
  updateComposer();
  setActions([]);
  setNote('');
}
function showNarrationPage(text,onNext){
  clearBeat();
  appendMessage('narration',text);
  setActions([{label:'次へ',primary:true,onClick:onNext}]);
  updateComposer();
  refs.log.scrollTo({top:0,left:0,behavior:'auto'});
}
function showPrologue(index=0){
  setPhase('prologue');
  const onNext=index+1<PROLOGUE.length?()=>showPrologue(index+1):showIntro;
  showNarrationPage(PROLOGUE[index],onNext);
}
function showIntro(){
  greetingMessage=null;
  setPhase('intro');
  state.questionMode='question';
  state.composerOpen=false;
  state.reasoningStage=0;
  refs.app.dataset.reasoningStage='0';
  state.cabinetKey=false;
  state.doorKey=false;
  state.cabinetOpen=false;
  setRewardBusy(false);
  state.ray=false;
  state.cleared=false;
  setScene('hall');
  showNarrationPage(OPENING,setQuestionFlow);
}
function showStart(){ greetingMessage=null; setPhase('start'); state.questionMode='question'; state.composerOpen=false; refs.input.value=''; refs.start.hidden=false; refs.conversation.hidden=true; refs.lion.hidden=true; setActions([]); setNote(''); refs.log.replaceChildren(); setScene('hall'); }
function beginGame(){
  if(state.phase!=='start')return;
  sound.start();
  refs.start.hidden=true;
  refs.conversation.hidden=false;
  showPrologue();
}
function appendTurn(question,result){ state.turns.push({player_message:question,turn_outcome:{choice:result.choice,confidence:result.confidence,reasoning_progress:result.reasoning_progress}}); if(state.turns.length>6)state.turns.shift(); }
async function liveJudge(mode, question, controller) {
  const timer=setTimeout(()=>controller.abort(),LIVE_TIMEOUT_MS);
  try {
    const response=await fetch(API_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode,question,recentTurns:state.turns.slice(-6),knownInsights:state.knownInsights.slice(0,4)}),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) {
      const message = Object.hasOwn(API_ERROR_MESSAGES, data.error) ? API_ERROR_MESSAGES[data.error] : CONNECTION_ERROR;
      throw new Error(message);
    }
    if(!data.outcome||!LION_REPLIES[data.outcome.choice]||!Number.isFinite(data.outcome.confidence)||data.outcome.confidence<0||data.outcome.confidence>1)throw new Error('返事を受け取れませんでした。もう一度送ってください。');
    return {...data.outcome,keyIssued:data.keyIssued===true,knownInsights:Array.isArray(data.knownInsights)?data.knownInsights:null};
  } catch(error) {
    if(error.name==='AbortError')throw new Error('返事に時間がかかっています。もう一度送ってください。');
    if(error instanceof TypeError)throw new Error('本ライオンに声が届きませんでした。接続を確認して、もう一度送ってください。');
    throw error;
  } finally { clearTimeout(timer); }
}
function invalidatePending(){ state.generation+=1; clearLionReaction(); if(state.requestController){state.requestController.abort();state.requestController=null;} for(const [timer,resolve] of beatTimers){clearTimeout(timer);resolve(false);} beatTimers.clear(); for(const cleanup of mediaCleanups)cleanup(); mediaCleanups.clear(); state.busy=false; refs.input.disabled=false; refs.send.disabled=false; refs.theoryToggle.disabled=false; refs.form.removeAttribute('aria-busy'); }
async function submitQuestion(event) {
  event.preventDefault();
  if(state.phase!=='question'||state.busy)return;
  const question=refs.input.value.trim();
  if(!question)return;
  clearLionReaction();
  refs.input.blur?.();
  state.busy=true;
  refs.input.disabled=true;
  refs.send.disabled=true;
  refs.theoryToggle.disabled=true;
  refs.form.setAttribute('aria-busy','true');
  state.drafts[state.questionMode]=question;
  state.composerOpen=false;
  updateComposer();
  setNote('');
  const mode=state.questionMode;
  const generation=state.generation;
  const controller=new AbortController();
  state.requestController=controller;
  // A timeout is still the current request and must restore the composer.
  // Only reset/supersession cancels its right to update the UI.
  const current=()=>generation===state.generation&&state.requestController===controller;
  hidePreviousMessages();
  appendMessage('player',question);
  try {
    await connectionReady;
    if(!current())return;
    const result=await liveJudge(mode,question,controller);
    if(!current())return;
    showLionReaction(result.choice);
    appendTurn(question,result);
    if(result.knownInsights)state.knownInsights=result.knownInsights.slice(0,4);
    const solvedGate=mode==='final_theory'&&result.choice==='SOLVED'&&result.keyIssued===true;
    const safeProgress=result.reasoning_progress==='SYNTHESIS'&&!solvedGate?'NONE':result.reasoning_progress;
    hidePreviousMessages();
    appendMessage('lion',LION_REPLIES[result.choice]||LION_REPLIES.NEEDS_CLARIFICATION);
    // Question progress denotes a new discovery; a final theory assesses its whole explanation.
    applyReasoningProgress(safeProgress,mode==='question');
    if(solvedGate&&state.reasoningStage<2){
      state.reasoningStage=2;
      refs.app.dataset.reasoningStage='2';
      updateScene();
    }
    state.questionCount+=1;
    if(mode==='question'||solvedGate){refs.input.value='';state.drafts[mode]='';}
    if(solvedGate) {
      setPhase('key');
      clearBeat();
      appendMessage('lion','はい');
      updateComposer();
      setActions([]);
      prepareKeyArrival();
      track('theory_solved',{confidence:result.confidence});
    } else {
      state.questionMode=mode;
    }
  } catch(error) {
    if(!current())return;
    state.composerOpen=true;
    setNote(error.message);
  } finally {
    if(!current())return;
    state.busy=false;
    state.requestController=null;
    refs.input.disabled=false;
    refs.send.disabled=false;
    refs.theoryToggle.disabled=false;
    refs.form.removeAttribute('aria-busy');
    updateComposer();
    if(state.phase==='question'&&state.composerOpen)focusComposer();
    else refs.input.blur?.();
  }
}
async function waitForScene(scene,generation,phase){
  const current=()=>generation===state.generation&&state.phase===phase;
  try {
    const result=await setScene(scene);
    if(!current()||result?.cancelled||result?.superseded)return null;
    setNote(result?.fallback?'屋敷の映像を静止画で表示しています。':'');
    return result||{};
  } catch {
    if(!current())return null;
    setNote('屋敷の映像を静止画で表示しています。');
    return {fallback:true};
  }
}
// A transition owns the controls until arrival. Reset cancels its completion;
// an old completion must never unlock a newer playthrough's transition.
async function playRewardScene(scene,narration='',{keepMessage=false}={}){
  const generation=state.generation,phase=state.phase;
  setRewardBusy(true);
  setActions([]);
  if(!keepMessage)clearBeat();
  if(narration)appendMessage('narration',narration);
  try {
    return await waitForScene(scene,generation,phase);
  } finally {
    if(generation===state.generation)setRewardBusy(false);
  }
}
async function prepareKeyArrival(){
  if(!await playRewardScene('close','',{keepMessage:true}))return;
  hidePreviousMessages();
  appendMessage('narration','ランプの下で何か光っている');
  setActions([{label:'調べる',primary:true,onClick:grantKey}]);
}
async function grantKey(){
  if(state.phase!=='key'||state.cabinetKey||state.rewardBusy)return;
  if(!await playRewardScene('key'))return;
  state.cabinetKey=true;
  sound.reward();
  appendMedia('system','戸棚のカギを見つけた','./assets/items/key.png','戸棚のカギ','',(ok)=>{
    if(!ok&&state.phase==='cabinet')setNote('鍵の画像を読み込めませんでした。');
  });
  setPhase('cabinet');
  setActions([{label:'奥の戸棚へ',primary:true,onClick:moveToCabinet}]);
}
async function moveToCabinet(){
  if(state.phase!=='cabinet'||!state.cabinetKey||state.rewardBusy)return;
  if(!await playRewardScene('cabinet','奥の部屋の左側にある戸棚へ向かう。'))return;
  hidePreviousMessages();
  appendMessage('narration','戸棚の前に着いた。');
  setActions([{label:'鍵で戸棚を開ける',primary:true,onClick:openCabinet}]);
}
async function openCabinet(){
  if(state.phase!=='cabinet'||!state.cabinetKey||state.cabinetOpen||state.rewardBusy)return;
  if(!await playRewardScene('cabinet-open','鍵を差し込み、戸棚の扉を開ける。'))return;
  state.cabinetOpen=true;
  setPhase('cabinet-open');
  hidePreviousMessages();
  appendMessage('system','戸棚が開いた。棚の奥に光線銃が見える。');
  setActions([{label:'光線銃を取る',primary:true,onClick:takeRaygun}]);
}
async function takeRaygun(){
  if(state.phase!=='cabinet-open'||!state.cabinetOpen||state.ray||state.rewardBusy)return;
  if(!await playRewardScene('gun-held','戸棚の中へ手を伸ばし、光線銃を取る。'))return;
  state.ray=true;
  sound.reward('raygun');
  setPhase('gun-acquired');
  hidePreviousMessages();
  appendMessage('system','光線銃を手に入れた。');
  setActions([{label:'次へ',primary:true,onClick:stowRaygun}]);
}
async function stowRaygun(){
  if(state.phase!=='gun-acquired'||!state.ray||state.rewardBusy)return;
  if(!await playRewardScene('gun-stowed'))return;
  setPhase('door-key');
  appendMessage('narration','戸棚の奥に、部屋のドアの鍵が残っている。');
  setActions([{label:'ドアの鍵を取る',primary:true,onClick:takeDoorKey}]);
}
async function takeDoorKey(){
  if(state.phase!=='door-key'||state.doorKey||state.rewardBusy)return;
  if(!await playRewardScene('armed'))return;
  state.doorKey=true;
  setPhase('armed');
  sound.reward();
  appendMessage('system','部屋のドアの鍵を手に入れた。');
  setActions([{label:'入口へ',primary:true,onClick:moveToEntry}]);
}
async function moveToEntry(){
  if(state.phase!=='armed'||!state.ray||!state.doorKey||state.rewardBusy)return;
  if(!await playRewardScene('entry','光線銃を持って入口へ戻る。'))return;
  setPhase('entrance');
  setActions([{label:'部屋の鍵でドアを開ける',primary:true,onClick:enterBugRoom}]);
}
async function enterBugRoom(){
  if (state.phase!=='entrance' || !state.ray || !state.doorKey) return;
  const generation=state.generation;
  setPhase('opening');
  clearBeat();
  setActions([]);
  if(!await waitForScene('bug',generation,'opening'))return;
  setPhase('bug');
  clearBeat();
  appendBugMark();
  appendMessage('narration',CLUES.bugroom);
  setActions([{label:'光線銃を撃つ',primary:true,onClick:burnBug}]);
}
async function burnBug(){
  if(state.phase!=='bug'||state.cleared)return;
  const generation=state.generation;
  setPhase('firing'); setActions([]); clearBeat(); sound.shoot(); appendBeam();
  if(!await beatDelay(4450,generation))return;
  sound.removeInsect();
  if(!await beatDelay((beamEffects?.shotDuration||6)*1000-4450,generation))return;
  refs.app.querySelector('.bug-mark')?.remove();
  refs.app.querySelector('.held-raygun')?.remove();
  removeBeam(); setPhase('silence'); clearBeat();
  appendMessage('system','虫を焼き払った。聞こえていた音も、止まった。');
  if(!await beatDelay(1300,generation))return;
  setPhase('escaping');
  if(!await beatDelay(1500,generation))return;
  state.cleared=true; setPhase('clear'); setScene('clear'); clearBeat();
  const clear=appendMessage('system','脱出成功'); clear.classList.add('clear-message');
  setActions([{label:'もう一度',primary:true,onClick:reset}]); track('game_clear');
}
function reset(){ invalidatePending(); clearLionReaction(); sound.stop(); refs.send.disabled=false; removeBeam(); refs.app.querySelector('.bug-mark')?.remove(); refs.app.querySelector('.held-raygun')?.remove(); Object.assign(state,{phase:'start',questionMode:'question',composerOpen:false,drafts:{question:'',final_theory:''},turns:[],knownInsights:[],questionCount:0,reasoningStage:0,cabinetKey:false,doorKey:false,ray:false,cabinetOpen:false,rewardBusy:false,cleared:false,busy:false,generation:state.generation,requestController:null}); showStart(); }
refs.startButton?.addEventListener('click',beginGame); refs.form.addEventListener('submit',submitQuestion); refs.lion?.addEventListener('click',greetLion);
refs.ask.addEventListener('click',event=>openComposer('question',event));
refs.theoryToggle.addEventListener('click',event=>openComposer('final_theory',event));
refs.cancel.addEventListener('click',closeComposer);
window.addEventListener('hon-lion-scene-warning',(event)=>{ if(state.phase!=='clear'&&event.detail?.message)setNote(event.detail.message); });
window.addEventListener('hon-lion-door-audio',(event)=>{
  if(event.detail?.action==='stop')sound.stopDoor();
  else if(event.detail?.action==='start'&&state.phase==='opening')sound.door({duration:event.detail.duration});
});
$('sound-toggle').addEventListener('click',()=>sound.toggle());
document.addEventListener('visibilitychange',()=>sound.visibility(document.hidden));
window.addEventListener('pagehide',()=>{invalidatePending();removeBeam();sound.stop();});
window.addEventListener('pageshow',event=>{if(event.persisted)reset();});
window.addEventListener('resize',()=>{if(state.phase==='bug'||state.phase==='firing')aimWeapon();});
connectVisualViewport(refs.app);
refs.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!state.busy)refs.form.requestSubmit();}});
preloadLionReactions();
async function checkConnection() {
  const note=$('connection-note');
  try {
    const response=await fetch(STATUS_ENDPOINT,{signal:AbortSignal.timeout(3000)});
    const data=await response.json();
    if(!response.ok||!data.configured)throw new Error('unavailable');
    // Older preview links must not lock a configured game into example-only judging.
    state.mode='live';
    note.hidden=true;
  } catch { note.textContent='本ライオンとの接続を準備中です。'; note.hidden=false; }
}
showStart();
const connectionReady=checkConnection();
