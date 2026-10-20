// The same quiet texture plays before and after the truth is understood.
// It stops only when the insect is removed. This texture is the offline fallback.
// Keep the fallback as dry, intermittent bursts so a failed recording cannot
// turn the clue into a continuous low rumble.
export function createPredationTexture(sampleRate = 24_000, seconds = 21) {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  let seed = 0x51c0ffee;
  let previous = 0;
  const bursts = [
    [0.38, 0.19], [0.69, 0.11],
    [4.08, 0.21], [4.43, 0.12],
    [8.88, 0.2], [9.22, 0.12],
    [12.08, 0.2], [12.42, 0.11],
    [16.78, 0.22], [17.14, 0.12],
  ];
  let burstIndex = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    const t = i / sampleRate;
    while (burstIndex < bursts.length && t >= bursts[burstIndex][0] + bursts[burstIndex][1]) burstIndex += 1;
    const burst = bursts[burstIndex];
    if (!burst || t < burst[0]) {
      previous = noise;
      continue;
    }
    const progress = (t - burst[0]) / burst[1];
    const envelope = Math.sin(Math.PI * progress);
    // A first-difference high-pass keeps the fallback in the dry, papery range.
    const highpassed = noise - previous * .94;
    previous = noise;
    samples[i] = Math.max(-.58, Math.min(.58, highpassed * envelope * .24));
  }
  return samples;
}

const CUES = Object.freeze({
  key: Object.freeze({ name: 'key', level: .68 }),
  raygun: Object.freeze({ name: 'weapon-ready', level: .68 }),
  door: Object.freeze({ name: 'door', level: .55, group: 'door' }),
  reveal: Object.freeze({ name: 'presence', level: .72, group: 'reveal' }),
  discharge: Object.freeze({ name: 'discharge', level: .8 }),
});
const PRELOAD_NAMES = Object.freeze([...new Set(Object.values(CUES).map(cue => cue.name))]);

export function createSoundDesign(onState = () => {}) {
  let context;
  let master;
  let ambience;
  let muted = false;
  let active = false;
  let removed = false;
  let available = true;
  let hidden = false;
  let generation = 0;
  let doorVoice;
  let revealVoice;
  const voices = new Set();
  const buffers = new Map();
  const loading = new Map();
  const revision = '20261020-crunch-2';
  const masterLevel = .65;
  const publish = () => onState({ muted, active, removed, available, running: context?.state === 'running' && active && !muted && !removed });

  // Keep all playback on one Web Audio bus: mute, visibility and replay must
  // affect samples and fallback audio together. Never queue late one-shots.
  async function load(name) {
    if (buffers.has(name)) return buffers.get(name);
    if (loading.has(name)) return loading.get(name);
    const promise = (async () => {
      for (const extension of ['ogg', 'm4a']) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        try {
          const url = new URL(`./assets/audio/${name}.${extension}?v=${revision}`, import.meta.url);
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) continue;
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          buffers.set(name, buffer);
          return buffer;
        } catch { /* Try AAC when Opus is unsupported or the first file fails. */ }
        finally { clearTimeout(timeout); }
      }
      return null;
    })();
    loading.set(name, promise);
    promise.then(() => {
      if (loading.get(name) === promise) loading.delete(name);
    }, () => {
      if (loading.get(name) === promise) loading.delete(name);
    });
    return promise;
  }

  function prepare() {
    if (context) return true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { available = false; publish(); return false; }
    try {
      context = new Audio();
      master = context.createGain();
      master.gain.value = muted ? 0 : masterLevel;
      master.connect(context.destination);
      context.addEventListener('statechange', publish);
      return true;
    } catch { available = false; publish(); return false; }
  }

  function cleanupVoice(voice) {
    if (!voice || voice.cleaned) return;
    voice.cleaned = true;
    try { voice.source.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
    voices.delete(voice);
    if (voice.group === 'door' && doorVoice === voice) doorVoice = undefined;
    if (voice.group === 'reveal' && revealVoice === voice) revealVoice = undefined;
  }

  function retire(voice) {
    if (!voice || voice.cleaned) return;
    try { voice.source.stop(); } catch {}
    cleanupVoice(voice);
  }

  function registerVoice(source, gain, group) {
    const voice = { source, gain, group, cleaned: false };
    voices.add(voice);
    if (group === 'door') { retire(doorVoice); doorVoice = voice; }
    if (group === 'reveal') { retire(revealVoice); revealVoice = voice; }
    source.onended = () => cleanupVoice(voice);
    return voice;
  }

  function sample(buffer, cue, duration) {
    if (!context || !active || removed || muted || hidden || context.state !== 'running') return;
    const voice = context.createBufferSource();
    const envelope = context.createGain();
    const now = context.currentTime;
    voice.buffer = buffer;
    const seconds = duration || buffer.duration;
    voice.playbackRate.value = buffer.duration / seconds;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(cue.level, now + .008);
    envelope.gain.setValueAtTime(cue.level, now + Math.max(.009, seconds - .035));
    envelope.gain.linearRampToValueAtTime(0, now + seconds);
    voice.connect(envelope).connect(master);
    const tracked = registerVoice(voice, envelope, cue.group);
    voice.start(now);
    voice.stop(now + seconds + .01);
    return tracked;
  }

  // Missing Foley stays silent: reusing the clue's noise for a key or door
  // confuses the sound's meaning. Only the continuous clue needs a fallback.
  function cue(cueData, duration) {
    const buffer = buffers.get(cueData.name);
    if (buffer) sample(buffer, cueData, duration);
  }

  function loop(buffer, level, fadeIn = .4) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + fadeIn);
    source.connect(gain).connect(master);
    const voice = registerVoice(source, gain);
    source.start();
    return voice;
  }

  function useRecordedTexture(buffer, session) {
    if (!buffer || session !== generation || !active || removed) return;
    const old = ambience;
    const next = loop(buffer, .72);
    ambience = next;
    if (old) {
      const now = context.currentTime;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, .08);
      try { old.source.stop(now + .4); } catch {}
    }
  }

  function start() {
    if (active) return;
    const session = ++generation;
    removed = false;
    active = true;
    if (!prepare()) return;
    if (!hidden) context.resume().then(publish).catch(() => { available = false; publish(); });
    const recorded = buffers.get('room-texture');
    if (recorded) {
      const next = loop(recorded, .72);
      ambience = next;
    } else {
      const texture = createPredationTexture(context.sampleRate);
      const buffer = context.createBuffer(1, texture.length, context.sampleRate);
      buffer.copyToChannel(texture, 0);
      const next = loop(buffer, .5);
      ambience = next;
      load('room-texture').then(buffer => useRecordedTexture(buffer, session));
    }
    for (const name of PRELOAD_NAMES) void load(name);
    publish();
  }

  function stop() {
    generation += 1;
    active = false;
    for (const voice of [...voices]) retire(voice);
    ambience = undefined;
    doorVoice = undefined;
    revealVoice = undefined;
    publish();
  }

  return {
    start,
    stop,
    toggle() {
      muted = !muted;
      if (prepare()) {
        if (active && !hidden) context.resume().catch(() => {});
        master.gain.setTargetAtTime(muted ? 0 : masterLevel, context.currentTime, .03);
      }
      publish();
    },
    reward(kind = 'key') { cue(kind === 'raygun' ? CUES.raygun : CUES.key); },
    reveal() { cue(CUES.reveal); },
    door({ duration } = {}) {
      cue(CUES.door, Number.isFinite(duration) && duration > 0 ? Math.min(4, Math.max(1, duration)) : undefined);
    },
    stopDoor() { retire(doorVoice); doorVoice = undefined; },
    shoot() { retire(revealVoice); revealVoice = undefined; cue(CUES.discharge); },
    removeInsect() { stop(); removed = true; publish(); },
    visibility(isHidden) {
      hidden = isHidden;
      if (!context) return;
      if (hidden) context.suspend().catch(() => {});
      else if (active) context.resume().then(publish).catch(() => {});
    },
  };
}
