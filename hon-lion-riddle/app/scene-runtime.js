import { createCheckpointStepRunner } from './checkpoint-procedures.js?v=20261021checkpoint1';

const app = document.querySelector('#app');
const background = document.querySelector('.scene-background');
const poster = document.querySelector('#scene-poster');
const video = document.querySelector('#scene-video');
const errorBox = document.querySelector('#scene-error');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const diagnostics = {
  ready: false,
  status: 'idle',
  version: null,
  sourceHash: null,
  profile: null,
  currentNode: 'a',
  checkpointNode: 'hall',
  requestedStage: 0,
  appliedStage: 0,
  generation: 0,
  transitionRevision: 0,
  error: null,
  context: 'active',
  media: { kind: 'video', clip: null, currentTime: 0, duration: 0, playing: false, posterLoaded: null },
};
const state = {
  manifest: null,
  doorManifest: null,
  rewardManifest: null,
  checkpointManifest: null,
  ready: false,
  currentNode: 'a',
  desiredNode: 'a',
  route: [],
  playing: false,
  generation: 0,
  pausedForHidden: false,
  pendingWaiters: [],
  loadTimer: 0,
  routeTimer: 0,
  mediaGeneration: 0,
  checkpointNode: 'hall',
  // A failed procedure resumes at its first unfinished segment. This keeps an
  // acknowledged item action from being offered (and rewarded) a second time.
  checkpointProcedure: null,
  // Keep the active checkpoint promise cancellable across reset/pagehide.
  activeCheckpointFinish: null,
};
const edges = {
  'a-b': ['a', 'b'],
  'b-c': ['b', 'c'],
  'c-entry': ['c', 'entry'],
  'entry-bug': ['entry', 'bug'],
  'c-key': ['c', 'key'],
  'key-cabinet': ['key', 'cabinet'],
  'cabinet-open': ['cabinet', 'cabinet-open'],
  'cabinet-take': ['cabinet-open', 'gun-held'],
  'cabinet-stow': ['gun-held', 'gun-stowed'],
  'cabinet-door-key': ['gun-stowed', 'armed'],
  'cabinet-entry': ['armed', 'entry'],
};
const rewardEdges = new Set(['c-key', 'key-cabinet', 'cabinet-open', 'cabinet-take', 'cabinet-stow', 'cabinet-door-key', 'cabinet-entry']);
const rewardNodes = new Set(['key', 'cabinet', 'cabinet-open', 'gun-held', 'gun-stowed', 'armed']);

function currentProfile() {
  return window.innerWidth <= window.innerHeight ? 'portrait' : 'wide';
}
function stageForNode(node) {
  return node === 'b' ? 1 : node !== 'a' ? 2 : 0;
}
function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function dispatchWarning(message) {
  window.dispatchEvent(new CustomEvent('hon-lion-scene-warning', { detail: { message } }));
}
function setError(message, notify = true) {
  diagnostics.error = message;
  diagnostics.status = 'error';
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
  if (notify) dispatchWarning(message);
}
function clearError() {
  diagnostics.error = null;
  if (errorBox) errorBox.hidden = true;
}
function manifestValue(section, key, profile) {
  const source = state.manifest?.[section] ?? state.manifest?.[section === 'clips' ? 'videos' : 'posters'];
  const value = source?.[key];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value[profile] ?? value.default ?? null;
  return null;
}
function assetUrl(value, fallback, revision = state.manifest?.asset_revision) {
  const file = value || fallback;
  if (!file) return null;
  if (/^(https?:|data:)/.test(file)) return file;
  const url = file.startsWith('/') ? file : file.startsWith('./') ? file : file.startsWith('assets/video/') ? `./${file}` : `./assets/video/${file}`;
  if (!/^[a-f0-9]{64}$/i.test(String(revision || ''))) return url;
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const revisionValue = encodeURIComponent(revision);
  if (/(?:\?|&)v=[^&#]*/.test(beforeHash)) {
    return `${beforeHash.replace(/([?&])v=[^&#]*/, `$1v=${revisionValue}`)}${hash}`;
  }
  const separator = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${separator}v=${revisionValue}${hash}`;
}
function clipUrl(edge, profile) {
  if(edge==='entry-bug')return assetUrl(state.doorManifest?.clips?.[profile],`door-open-${profile}.mp4`,state.doorManifest?.asset_revision);
  if(rewardEdges.has(edge))return assetUrl(state.rewardManifest?.clips?.[edge]?.[profile],`reward-${edge}-${profile}.mp4`,state.rewardManifest?.asset_revision);
  return assetUrl(manifestValue('clips', edge, profile), `walk-${edge}-${profile}.mp4`);
}
function posterUrl(node, profile) {
  if(node==='bug')return assetUrl(state.doorManifest?.posters?.[profile],`door-open-${profile}.jpg`,state.doorManifest?.asset_revision);
  if(rewardNodes.has(node))return assetUrl(state.rewardManifest?.posters?.[node]?.[profile],`reward-${node}-${profile}.jpg`,state.rewardManifest?.asset_revision);
  return assetUrl(manifestValue('posters', node, profile), `pose-${node}-${profile}.jpg`);
}
function setPoster(node) {
  const profile = currentProfile();
  diagnostics.profile = profile;
  const src = posterUrl(node, profile);
  if (!poster || !src) {
    diagnostics.media.posterLoaded = false;
    return;
  }
  diagnostics.media.posterLoaded = false;
  poster.onload = () => { diagnostics.media.posterLoaded = true; };
  poster.onerror = () => {
    diagnostics.media.posterLoaded = false;
    if (!state.playing) dispatchWarning('屋敷の背景画像を読み込めません。');
  };
  if (poster.src !== new URL(src, window.location.href).href) poster.src = src;
  if (poster.complete && poster.naturalWidth > 0) diagnostics.media.posterLoaded = true;
  if (poster) poster.hidden = false;
  background?.classList.remove('video-playing');
}
function checkpointManifestValue(section, key, profile) {
  const value = state.checkpointManifest?.[section]?.[key];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value[profile] ?? value.default ?? null;
  return null;
}
function checkpointClipUrl(clip, profile) {
  return assetUrl(checkpointManifestValue('clips', clip, profile), null, state.checkpointManifest?.asset_revision);
}
function checkpointPosterUrl(key, profile) {
  return assetUrl(checkpointManifestValue('posters', key, profile), null, state.checkpointManifest?.asset_revision);
}
function setCheckpointPoster(key) {
  const profile = currentProfile();
  diagnostics.profile = profile;
  const src = checkpointPosterUrl(key, profile);
  if (!poster || !src) {
    diagnostics.media.posterLoaded = false;
    return false;
  }
  diagnostics.media.posterLoaded = false;
  poster.onload = () => { diagnostics.media.posterLoaded = true; };
  poster.onerror = () => { diagnostics.media.posterLoaded = false; };
  if (poster.src !== new URL(src, window.location.href).href) poster.src = src;
  if (poster.complete && poster.naturalWidth > 0) diagnostics.media.posterLoaded = true;
  poster.hidden = false;
  background?.classList.remove('video-playing');
  return true;
}
function waitForCheckpointPoster(key, signal) {
  const profile = currentProfile();
  const src = checkpointPosterUrl(key, profile);
  if (!poster || !src || signal?.aborted) return Promise.resolve(false);
  diagnostics.profile = profile;
  // Preload a future arrival without replacing the current view while its
  // movie is still loading. Browsers provide Image; the DOM-double fallback
  // keeps this module independently testable.
  const candidate = typeof Image === 'function' ? new Image() : poster;
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', cancel);
      diagnostics.media.posterLoaded = loaded;
      resolve(loaded);
    };
    const cancel = () => finish(false);
    const verify = () => {
      if (signal?.aborted) return finish(false);
      if (!candidate.naturalWidth) return finish(false);
      if (typeof candidate.decode !== 'function') return finish(true);
      Promise.resolve(candidate.decode()).then(() => finish(Boolean(candidate.naturalWidth)), () => finish(false));
    };
    candidate.onload = verify;
    candidate.onerror = () => finish(false);
    signal?.addEventListener?.('abort', cancel, { once: true });
    if (candidate.src !== new URL(src, window.location.href).href) candidate.src = src;
    if (candidate.complete) verify();
    timer = window.setTimeout(() => finish(false), 5000);
  });
}
function setHallPoster() {
  if (state.checkpointManifest && setCheckpointPoster('hall')) return true;
  setPoster('a');
  return false;
}
function stopMedia(unload = false) {
  const checkpointFinish = state.activeCheckpointFinish;
  if (checkpointFinish) checkpointFinish({ completed: false, cancelled: true });
  if (diagnostics.media.clip === 'entry-bug') window.dispatchEvent(new CustomEvent('hon-lion-door-audio', { detail: { action: 'stop' } }));
  state.mediaGeneration += 1;
  state.pausedForHidden = false;
  clearTimeout(state.loadTimer);
  clearTimeout(state.routeTimer);
  state.loadTimer = 0;
  state.routeTimer = 0;
  state.playing = false;
  diagnostics.status = 'ready';
  diagnostics.media.playing = false;
  if (!video) return;
  video.onloadedmetadata = null;
  video.oncanplay = null;
  video.onplay = null;
  video.onplaying = null;
  video.ontimeupdate = null;
  video.onended = null;
  video.onerror = null;
  video.pause();
  if (unload) {
    video.removeAttribute('src');
    video.load();
    diagnostics.media.clip = null;
    diagnostics.media.currentTime = 0;
    diagnostics.media.duration = 0;
  }
  background?.classList.remove('video-playing');
}
function resolveWaiters(result, cancelled = false) {
  const remaining = [];
  for (const waiter of state.pendingWaiters) {
    if (cancelled || waiter.target === state.currentNode) waiter.resolve({ ...result, target: waiter.target, posterLoaded: diagnostics.media.posterLoaded, cancelled });
    else remaining.push(waiter);
  }
  state.pendingWaiters = remaining;
}
function fallbackToTarget(target, message = '') {
  stopMedia(true);
  state.route = [];
  state.currentNode = target;
  diagnostics.currentNode = target;
  diagnostics.appliedStage = stageForNode(target);
  diagnostics.transitionRevision += 1;
  setPoster(target);
  if (message) {
    diagnostics.error = message;
    dispatchWarning(message);
  }
  resolveWaiters({ fallback: true, played: false });
}
function routeFrom(current, target) {
  if (current === target) return [];
  if (target === 'a') return [];
  // Keep routes explicit and finite: a desired destination can be changed
  // while a previous clip is playing, so a small graph search is safer than
  // concatenating scene-specific paths by hand.
  const queue = [[current, []]];
  const visited = new Set([current]);
  while (queue.length) {
    const [node, route] = queue.shift();
    for (const [edge, [from, to]] of Object.entries(edges)) {
      if (from !== node || visited.has(to)) continue;
      const next = [...route, edge];
      if (to === target) return next;
      visited.add(to);
      queue.push([to, next]);
    }
  }
  return [];
}
function armRouteTimeout(duration, generation) {
  clearTimeout(state.routeTimer);
  const timeout = Math.max(10000, (Number.isFinite(duration) && duration > 0 ? duration * 1000 + 5000 : 15000));
  state.routeTimer = window.setTimeout(() => {
    if (generation !== state.generation) return;
    fallbackToTarget(state.desiredNode, '屋敷の映像が時間内に再生できません。静止画で続けます。');
  }, timeout);
}
function finishClip(edge, generation) {
  if (generation !== state.generation) return;
  if (edge === 'entry-bug') window.dispatchEvent(new CustomEvent('hon-lion-door-audio', { detail: { action: 'stop' } }));
  clearTimeout(state.loadTimer);
  clearTimeout(state.routeTimer);
  state.loadTimer = 0;
  state.routeTimer = 0;
  state.playing = false;
  diagnostics.status = 'ready';
  const [, destination] = edges[edge] || [state.currentNode, state.desiredNode];
  state.currentNode = destination;
  diagnostics.currentNode = destination;
  diagnostics.appliedStage = stageForNode(destination);
  diagnostics.media.playing = false;
  diagnostics.media.currentTime = Number(video?.currentTime || 0);
  diagnostics.media.duration = Number(video?.duration || 0);
  state.route = routeFrom(state.currentNode, state.desiredNode);
  diagnostics.transitionRevision += 1;
  if (state.currentNode === state.desiredNode) {
    resolveWaiters({ fallback: false, played: true });
    return;
  }
  startNextRoute(generation);
}
function failClip(generation, message) {
  if (generation !== state.generation) return;
  const fallbackMessage = rewardEdges.has(diagnostics.media.clip) ? '報酬演出の映像を再生できません。到着静止画で続けます。' : '屋敷の映像を再生できません。静止画で続けます。';
  fallbackToTarget(state.desiredNode, message || fallbackMessage);
}
function startClip(edge, generation) {
  if (!video || generation !== state.generation) return;
  const mediaGeneration = ++state.mediaGeneration;
  let audioStarted = false;
  const profile = currentProfile();
  diagnostics.profile = profile;
  diagnostics.media.clip = edge;
  diagnostics.media.currentTime = 0;
  diagnostics.media.duration = 0;
  setPoster(state.currentNode);
  const src = clipUrl(edge, profile);
  video.src = src;
  video.currentTime = 0;
  video.onloadedmetadata = () => {
    if (generation !== state.generation) return;
    clearTimeout(state.loadTimer);
    state.loadTimer = 0;
    diagnostics.media.duration = Number(video.duration || 0);
    armRouteTimeout(video.duration, generation);
  };
  video.oncanplay = () => {
    if (generation !== state.generation) return;
    clearTimeout(state.loadTimer);
    state.loadTimer = 0;
    video.play().catch(() => failClip(generation, '屋敷の映像を再生できません。静止画で続けます。'));
  };
  video.onplay = () => {
    if (generation !== state.generation) return;
    clearTimeout(state.loadTimer);
    state.loadTimer = 0;
    state.playing = true;
    diagnostics.status = 'playing';
    diagnostics.media.playing = true;
    background?.classList.add('video-playing');
  };
  video.onplaying = () => {
    if (generation !== state.generation || mediaGeneration !== state.mediaGeneration || audioStarted || document.hidden) return;
    audioStarted = true;
    if (edge === 'entry-bug') window.dispatchEvent(new CustomEvent('hon-lion-door-audio', {
      detail: { action: 'start', duration: Number(video.duration || 0) },
    }));
  };
  video.ontimeupdate = () => {
    if (generation !== state.generation) return;
    diagnostics.media.currentTime = Number(video.currentTime || 0);
  };
  video.onended = () => finishClip(edge, generation);
  video.onerror = () => failClip(generation, '屋敷の映像を読み込めません。静止画で続けます。');
  clearTimeout(state.loadTimer);
  state.loadTimer = window.setTimeout(() => {
    // Route ownership starts before media is ready. Only actual playback
    // progress can cancel this fallback when no media events arrive.
    if (generation !== state.generation || Number(video.currentTime || 0) > 0) return;
    failClip(generation, '屋敷の映像の読み込みに時間がかかっています。静止画で続けます。');
  }, 5000);
  video.load();
  video.play().catch(() => { /* oncanplay retries after metadata */ });
}
function startNextRoute(generation) {
  if (generation !== state.generation) return;
  if (state.desiredNode === state.currentNode) {
    state.route = [];
    resolveWaiters({ fallback: false, played: true });
    return;
  }
  if (!state.route.length) state.route = routeFrom(state.currentNode, state.desiredNode);
  if (!state.route.length) {
    fallbackToTarget(state.desiredNode);
    return;
  }
  const edge = state.route.shift();
  if (!edges[edge]) {
    fallbackToTarget(state.desiredNode);
    return;
  }
  state.playing = true;
  startClip(edge, generation);
}
function processTarget() {
  if (!state.ready || state.playing || diagnostics.context === 'stopped') return;
  if (reducedMotion.matches) {
    fallbackToTarget(state.desiredNode);
    return;
  }
  state.route = routeFrom(state.currentNode, state.desiredNode);
  if (!state.route.length) {
    if (state.currentNode !== state.desiredNode) fallbackToTarget(state.desiredNode);
    else resolveWaiters({ fallback: false, played: false });
    return;
  }
  startNextRoute(state.generation);
}
function setStage(stage, sceneName = '') {
  if (diagnostics.context === 'stopped') return Promise.resolve({ cancelled: true });
  // The checkpoint route reaches the rear door through its own manifest. Do
  // not send its final opening back through the retired a→b→c graph.
  const checkpointFinal = (sceneName === 'bug' || sceneName === 'clear') && state.checkpointNode === 'rear-door-ready' && state.checkpointManifest;
  if (checkpointFinal && state.currentNode === 'bug' && !state.playing) {
    const generation = state.generation;
    return waitForCheckpointPoster('bug').then(posterLoaded => {
      if (posterLoaded && generation === state.generation) setCheckpointPoster('bug');
      return { target: 'bug', cancelled: generation !== state.generation,
        completed: posterLoaded, fallback: posterLoaded, played: false, posterLoaded,
        reason: posterLoaded ? undefined : 'poster_unavailable' };
    });
  }
  if (checkpointFinal) {
    const generation = state.generation;
    return playCheckpointClip('rear-door-open', 'bug', null).then(result => {
      if (generation !== state.generation || result?.cancelled) return { target: 'bug', cancelled: true };
      if (result?.completed !== true) return { target: 'bug', completed: false, fallback: false, played: false, posterLoaded: diagnostics.media.posterLoaded, reason: result?.reason || 'media_unconfirmed' };
      state.currentNode = 'bug';
      state.desiredNode = 'bug';
      state.route = [];
      diagnostics.currentNode = 'bug';
      diagnostics.requestedStage = 2;
      diagnostics.appliedStage = 2;
      diagnostics.transitionRevision += 1;
      return { target: 'bug', completed: true, fallback: Boolean(result.fallback), played: Boolean(result.played), posterLoaded: diagnostics.media.posterLoaded };
    });
  }
  const target = sceneName === 'bug' || sceneName === 'clear' ? 'bug' : sceneName === 'entrance' || sceneName === 'entry' ? 'entry' : rewardNodes.has(sceneName) ? sceneName : Math.max(0, Math.min(2, Number(stage) || 0)) === 2 ? 'c' : Math.max(0, Math.min(2, Number(stage) || 0)) === 1 ? 'b' : 'a';
  const targetStage = stageForNode(target);
  diagnostics.requestedStage = targetStage;
  if (state.desiredNode !== target) {
    const superseded = state.pendingWaiters.filter((waiter) => waiter.target !== target);
    state.pendingWaiters = state.pendingWaiters.filter((waiter) => waiter.target === target);
    for (const waiter of superseded) waiter.resolve({ target: waiter.target, posterLoaded: diagnostics.media.posterLoaded, cancelled: true, superseded: true });
  }
  state.desiredNode = target;
  if (!state.ready) {
    return new Promise((resolve) => state.pendingWaiters.push({ target, resolve }));
  }
  if (target === state.currentNode && !state.playing) {
    diagnostics.appliedStage = targetStage;
    if (checkpointFinal && target === 'bug') setCheckpointPoster('bug');
    else setPoster(target);
    return Promise.resolve({ target, fallback: false, played: false, posterLoaded: diagnostics.media.posterLoaded });
  }
  const promise = new Promise((resolve) => state.pendingWaiters.push({ target, resolve }));
  if (reducedMotion.matches) {
    fallbackToTarget(target);
  } else if (!state.playing) {
    processTarget();
  }
  return promise;
}
function halt() {
  state.generation += 1;
  diagnostics.generation = state.generation;
  resolveWaiters({ generation: state.generation }, true);
  state.desiredNode = state.currentNode;
  state.route = [];
  state.checkpointProcedure = null;
  stopMedia();
  clearError();
  diagnostics.context = 'stopped';
  diagnostics.status = 'stopped';
}
function reset() {
  diagnostics.context = 'active';
  state.generation += 1;
  diagnostics.generation = state.generation;
  const generation = state.generation;
  resolveWaiters({ generation }, true);
  state.desiredNode = 'a';
  state.currentNode = 'a';
  state.checkpointNode = 'hall';
  diagnostics.checkpointNode = 'hall';
  state.checkpointProcedure = null;
  state.route = [];
  stopMedia(true);
  diagnostics.currentNode = 'a';
  diagnostics.requestedStage = 0;
  diagnostics.appliedStage = 0;
  diagnostics.transitionRevision += 1;
  clearError();
  setHallPoster();
  return Promise.resolve({ target: 'a', generation, fallback: true, posterLoaded: diagnostics.media.posterLoaded, cancelled: false });
}
function onVisibilityChange() {
  if (document.hidden) {
    if (state.playing && video) {
      state.pausedForHidden = true;
      video.pause();
      clearTimeout(state.loadTimer);
      clearTimeout(state.routeTimer);
    }
    return;
  }
  if (!state.pausedForHidden || !video || !state.playing) return;
  state.pausedForHidden = false;
  const generation = state.generation;
  const mediaGeneration = state.mediaGeneration;
  if (state.checkpointManifest?.clips && Object.hasOwn(state.checkpointManifest.clips, diagnostics.media.clip)) {
    const failCheckpoint = (result) => {
      if (mediaGeneration !== state.mediaGeneration) return;
      state.activeCheckpointFinish?.(result);
    };
    if (video.readyState < 3) state.loadTimer = window.setTimeout(() => failCheckpoint({ completed: false, reason: 'media_timeout' }), 5000);
    state.routeTimer = window.setTimeout(() => failCheckpoint({ completed: false, reason: 'media_timeout' }), Math.max(10000, (Number(video.duration || 0) || 15) * 1000 + 5000));
    video.play().catch(() => failCheckpoint({ completed: false, reason: 'media_error' }));
    return;
  }
  const failResume = (message) => {
    if (mediaGeneration !== state.mediaGeneration) return;
    failClip(generation, message);
  };
  if (video.readyState < 3) state.loadTimer = window.setTimeout(() => failResume('屋敷の映像の読み込みに時間がかかっています。静止画で続けます。'), 5000);
  armRouteTimeout(video.duration, generation);
  video.play().catch(() => failResume('屋敷の映像を再生できません。静止画で続けます。'));
}
async function playCheckpointClip(clip, posterKey, signal) {
  if (signal?.aborted) return Promise.resolve({ completed: false, cancelled: true });
  const generation = state.generation;
  const posterAbort = new AbortController();
  const cancelPoster = () => posterAbort.abort();
  const previousFinish = state.activeCheckpointFinish;
  const finishPoster = () => {
    cancelPoster();
    previousFinish?.({ completed: false, cancelled: true });
  };
  state.activeCheckpointFinish = finishPoster;
  signal?.addEventListener?.('abort', cancelPoster, { once: true });
  const profile = currentProfile();
  const src = checkpointClipUrl(clip, profile);
  if (!state.checkpointManifest) {
    if (state.activeCheckpointFinish === finishPoster) state.activeCheckpointFinish = null;
    signal?.removeEventListener?.('abort', cancelPoster);
    return { completed: false, reason: 'unassigned' };
  }
  const posterLoaded = await waitForCheckpointPoster(posterKey, posterAbort.signal);
  signal?.removeEventListener?.('abort', cancelPoster);
  if (state.activeCheckpointFinish === finishPoster) state.activeCheckpointFinish = null;
  if (signal?.aborted || posterAbort.signal.aborted || generation !== state.generation) return { completed: false, cancelled: true };
  if (!posterLoaded) return { completed: false, reason: 'poster_unavailable' };
  // A validated poster is a finite arrival fallback. An absent movie must not
  // deadlock the game, but an absent movie *and* poster remains retryable.
  if (!src || !video) return { completed: true, fallback: true, played: false };
  if (reducedMotion.matches) {
    setCheckpointPoster(posterKey);
    diagnostics.media.clip = clip;
    diagnostics.media.playing = false;
    diagnostics.status = 'ready';
    return { completed: true, fallback: true, played: false };
  }
  stopMedia(true);
  const mediaGeneration = ++state.mediaGeneration;
  diagnostics.profile = profile;
  diagnostics.media.clip = clip;
  diagnostics.media.currentTime = 0;
  diagnostics.media.duration = 0;
  state.playing = true;
  diagnostics.status = 'loading';
  video.src = src;
  video.currentTime = 0;
  return new Promise((resolve) => {
    let settled = false;
    let cancel;
    const cleanup = () => {
      clearTimeout(state.loadTimer);
      clearTimeout(state.routeTimer);
      state.loadTimer = 0;
      state.routeTimer = 0;
      signal?.removeEventListener?.('abort', cancel);
      video.onloadedmetadata = null;
      video.oncanplay = null;
      video.onplay = null;
      video.onplaying = null;
      video.ontimeupdate = null;
      video.onended = null;
      video.onerror = null;
      if (state.activeCheckpointFinish === finish) state.activeCheckpointFinish = null;
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (generation !== state.generation || mediaGeneration !== state.mediaGeneration) {
        resolve({ completed: false, cancelled: true });
        return;
      }
      state.playing = false;
      diagnostics.status = 'ready';
      diagnostics.media.playing = false;
      diagnostics.media.currentTime = Number(video.currentTime || 0);
      diagnostics.media.duration = Number(video.duration || 0);
      background?.classList.remove('video-playing');
      if (result?.completed === true && !result?.cancelled) setCheckpointPoster(posterKey);
      resolve(result);
    };
    state.activeCheckpointFinish = finish;
    cancel = () => finish({ completed: false, cancelled: true });
    signal?.addEventListener?.('abort', cancel, { once: true });
    video.onloadedmetadata = () => {
      if (generation !== state.generation || mediaGeneration !== state.mediaGeneration) return;
      clearTimeout(state.loadTimer);
      state.loadTimer = 0;
      diagnostics.media.duration = Number(video.duration || 0);
      state.routeTimer = window.setTimeout(() => finish({ completed: false, reason: 'media_timeout' }), Math.max(10000, (Number(video.duration || 0) || 15) * 1000 + 5000));
    };
    const fallback = () => finish({ completed: true, fallback: true, played: false });
    video.oncanplay = () => {
      if (generation !== state.generation || mediaGeneration !== state.mediaGeneration) return;
      clearTimeout(state.loadTimer);
      state.loadTimer = 0;
      video.play().catch(fallback);
    };
    video.onplay = () => {
      if (generation !== state.generation || mediaGeneration !== state.mediaGeneration) return;
      clearTimeout(state.loadTimer);
      state.loadTimer = 0;
      diagnostics.status = 'playing';
      diagnostics.media.playing = true;
      background?.classList.add('video-playing');
    };
    video.onplaying = () => { diagnostics.media.playing = true; };
    video.ontimeupdate = () => {
      if (generation !== state.generation || mediaGeneration !== state.mediaGeneration) return;
      diagnostics.media.currentTime = Number(video.currentTime || 0);
    };
    video.onended = () => finish({ completed: true, played: true });
    video.onerror = fallback;
    state.loadTimer = window.setTimeout(fallback, 5000);
    video.load();
    video.play().catch(() => { /* oncanplay retries after metadata */ });
  });
}
async function playCheckpointProcedure(procedure, context = {}) {
  const { signal, onAction } = context;
  if (signal?.aborted) return { completed: false, cancelled: true };
  if (!state.checkpointManifest) return { completed: false, reason: 'unassigned' };
  if (state.checkpointNode !== procedure.from) return { completed: false, reason: 'route_mismatch' };
  let progress = state.checkpointProcedure;
  if (!progress || progress.id !== procedure.id) {
    progress = { id: procedure.id, segmentIndex: 0 };
    state.checkpointProcedure = progress;
  }
  for (let index = progress.segmentIndex; index < (procedure.segments || []).length; index += 1) {
    const segment = procedure.segments[index];
    const result = await playCheckpointClip(segment.clip, segment.poster, signal);
    if (signal?.aborted || result?.cancelled) return { completed: false, cancelled: true };
    if (result?.completed !== true) return { completed: false, reason: result?.reason || 'media_unconfirmed' };
    if (segment.action) {
      if (typeof onAction !== 'function') return { completed: false, reason: 'action_unassigned' };
      const actionResult = await onAction({ ...segment, type: segment.action, stepId: procedure.id }, context);
      if (signal?.aborted || actionResult?.cancelled) return { completed: false, cancelled: true };
      if (actionResult?.completed !== true) return { completed: false, reason: actionResult?.reason || 'action_unconfirmed' };
    }
    progress.segmentIndex = index + 1;
  }
  state.checkpointNode = procedure.to;
  state.currentNode = procedure.to;
  state.desiredNode = procedure.to;
  diagnostics.checkpointNode = procedure.to;
  diagnostics.currentNode = procedure.to;
  diagnostics.appliedStage = stageForNode(procedure.to);
  state.checkpointProcedure = null;
  return { completed: true, target: procedure.to };
}
async function loadManifest() {
  try {
    diagnostics.status = 'loading';
    const response = await fetch('./assets/video/video-manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
    state.manifest = await response.json();
    const doorResponse=await fetch('./assets/video/door-manifest.json',{cache:'no-store'});
    if(!doorResponse.ok)throw new Error(`door manifest HTTP ${doorResponse.status}`);
    state.doorManifest=await doorResponse.json();
    try {
      const rewardResponse=await fetch('./assets/video/reward-manifest.json',{cache:'no-store'});
      if(rewardResponse.ok)state.rewardManifest=await rewardResponse.json();
    } catch (error) {
      state.rewardManifest=null;
      console.warn('[HON LION] reward manifest unavailable', error);
    }
    try {
      const checkpointResponse=await fetch('./assets/video/checkpoint-manifest.json',{cache:'no-store'});
      if(checkpointResponse.ok)state.checkpointManifest=await checkpointResponse.json();
    } catch (error) {
      state.checkpointManifest=null;
      console.warn('[HON LION] checkpoint manifest unavailable', error);
    }
    diagnostics.version = state.checkpointManifest?.schema ?? state.checkpointManifest?.version ?? state.checkpointManifest?.manifest_version ?? state.manifest.version ?? state.manifest.manifest_version ?? state.manifest.manifest?.version ?? null;
    diagnostics.sourceHash = state.checkpointManifest?.source?.sha256 ?? state.checkpointManifest?.source_scene_sha256 ?? state.manifest.source?.sha256 ?? state.manifest.source_scene_sha256 ?? state.manifest.source_scene?.sha256 ?? null;
    state.ready = true;
    diagnostics.ready = true;
    if (diagnostics.context === 'stopped') return;
    diagnostics.status = 'ready';
    clearError();
    if (state.currentNode === 'a' && state.checkpointNode === 'hall') setHallPoster();
    else setPoster(state.currentNode);
    processTarget();
  } catch (error) {
    state.manifest = null;
    state.ready = true;
    diagnostics.ready = true;
    if (diagnostics.context === 'stopped') return;
    setError('屋敷の映像を表示できません。静止画で続けます。');
    // Resolve queued visual work so a missing local asset can never block the game.
    fallbackToTarget(state.desiredNode, '屋敷の映像を表示できません。静止画で続けます。');
    console.error('[HON LION] video manifest failed', error);
  }
}
window.__HON_LION_SCENE__ = Object.freeze({ snapshot: () => clone(diagnostics) });
const runCheckpointStep = createCheckpointStepRunner({
  arrive: async (procedure, context) => {
    return playCheckpointProcedure(procedure, context);
  },
});
window.__HON_LION_SCENE_RUNTIME__ = Object.freeze({ setStage, reset, halt, runCheckpointStep });
window.addEventListener('resize', () => { diagnostics.profile = currentProfile(); });
document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', () => { state.generation += 1; resolveWaiters({ generation: state.generation }, true); stopMedia(true); });
window.addEventListener('pageshow', (event) => { if (event.persisted) reset(); });
setHallPoster();
loadManifest();
