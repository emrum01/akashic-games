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
function stopMedia(unload = false) {
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
    diagnostics.media.duration = Number(video.duration || 0);
    armRouteTimeout(video.duration, generation);
  };
  video.oncanplay = () => {
    if (generation !== state.generation) return;
    video.play().catch(() => failClip(generation, '屋敷の映像を再生できません。静止画で続けます。'));
  };
  video.onplay = () => {
    if (generation !== state.generation) return;
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
    if (generation !== state.generation || state.playing || Number(video.currentTime || 0) > 0) return;
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
  if (!state.ready || state.playing) return;
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
    setPoster(target);
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
function reset() {
  state.generation += 1;
  diagnostics.generation = state.generation;
  const generation = state.generation;
  resolveWaiters({ generation }, true);
  state.desiredNode = 'a';
  state.currentNode = 'a';
  state.route = [];
  stopMedia(true);
  diagnostics.currentNode = 'a';
  diagnostics.requestedStage = 0;
  diagnostics.appliedStage = 0;
  diagnostics.transitionRevision += 1;
  clearError();
  setPoster('a');
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
  if (video.readyState < 3) state.loadTimer = window.setTimeout(() => failClip(state.generation, '屋敷の映像の読み込みに時間がかかっています。静止画で続けます。'), 5000);
  armRouteTimeout(video.duration, state.generation);
  video.play().catch(() => failClip(state.generation, '屋敷の映像を再生できません。静止画で続けます。'));
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
    diagnostics.version = state.manifest.version ?? state.manifest.manifest_version ?? state.manifest.manifest?.version ?? null;
    diagnostics.sourceHash = state.manifest.source?.sha256 ?? state.manifest.source_scene_sha256 ?? state.manifest.source_scene?.sha256 ?? null;
    state.ready = true;
    diagnostics.ready = true;
    diagnostics.status = 'ready';
    clearError();
    setPoster(state.currentNode);
    processTarget();
  } catch (error) {
    state.manifest = null;
    state.ready = true;
    diagnostics.ready = true;
    setError('屋敷の映像を表示できません。静止画で続けます。');
    // Resolve queued visual work so a missing local asset can never block the game.
    fallbackToTarget(state.desiredNode, '屋敷の映像を表示できません。静止画で続けます。');
    console.error('[HON LION] video manifest failed', error);
  }
}
window.__HON_LION_SCENE__ = Object.freeze({ snapshot: () => clone(diagnostics) });
window.__HON_LION_SCENE_RUNTIME__ = Object.freeze({ setStage, reset });
window.addEventListener('resize', () => { diagnostics.profile = currentProfile(); });
document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', () => { state.generation += 1; resolveWaiters({ generation: state.generation }, true); stopMedia(true); });
window.addEventListener('pageshow', (event) => { if (event.persisted) reset(); });
setPoster('a');
loadManifest();
