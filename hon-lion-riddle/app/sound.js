// The same quiet texture plays before and after the truth is understood.
// It stops only when the insect is removed. No external sound files are used.
export function createPredationTexture(sampleRate = 24_000, seconds = 13) {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  let seed = 0x51c0ffee;
  let soft = 0;
  let warm = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0x80000000 - 1;
    soft = .82 * soft + .18 * noise;
    warm = .97 * warm + .03 * noise;
    const t = i / sampleRate;
    const p = t % 2.6;
    const pulse = [0.28, 0.63, 1.07, 1.75, 2.03].reduce((sum, start, index) => {
      const x = (p - start) / (.11 + index * .008);
      return sum + Math.exp(-x * x * 3.5) * (.65 + .06 * index);
    }, 0);
    const edge = Math.min(1, i / 800, (samples.length - 1 - i) / 800);
    samples[i] = (soft * .65 + warm * .8) * (.04 + pulse * .72) * edge;
  }
  return samples;
}

export function createSoundDesign(onState = () => {}) {
  let context;
  let master;
  let ambience;
  let ambienceGain;
  let muted = false;
  let active = false;
  let removed = false;
  let available = true;
  const voices = new Set();
  const publish = () => onState({ muted, active, removed, available, running: context?.state === 'running' && active && !muted && !removed });

  function prepare() {
    if (context) return true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { available = false; publish(); return false; }
    try {
      context = new Audio();
      master = context.createGain();
      master.gain.value = muted ? 0 : .38;
      master.connect(context.destination);
      context.addEventListener('statechange', publish);
      return true;
    } catch { available = false; publish(); return false; }
  }

  function tone(from, to, duration, gain) {
    if (!context || muted || context.state !== 'running') return;
    const voice = context.createOscillator();
    const envelope = context.createGain();
    const now = context.currentTime;
    voice.type = 'sine';
    voice.frequency.setValueAtTime(from, now);
    voice.frequency.exponentialRampToValueAtTime(to, now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + .014);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    voice.connect(envelope).connect(master);
    voices.add(voice);
    voice.onended = () => { voices.delete(voice); voice.disconnect(); envelope.disconnect(); };
    voice.start(now);
    voice.stop(now + duration + .02);
  }

  function start() {
    removed = false;
    active = true;
    if (!prepare()) return;
    context.resume().then(publish).catch(() => { available = false; publish(); });
    if (!ambience) {
      const texture = createPredationTexture(context.sampleRate);
      const buffer = context.createBuffer(1, texture.length, context.sampleRate);
      buffer.copyToChannel(texture, 0);
      ambience = context.createBufferSource();
      ambienceGain = context.createGain();
      ambienceGain.gain.value = .85;
      ambience.buffer = buffer;
      ambience.loop = true;
      ambience.connect(ambienceGain).connect(master);
      ambience.start();
    }
    publish();
  }

  function stop() {
    active = false;
    if (ambience) {
      ambience.stop();
      ambience.disconnect();
      ambienceGain.disconnect();
      ambience = undefined;
      ambienceGain = undefined;
    }
    for (const voice of voices) { try { voice.stop(); } catch {} }
    voices.clear();
    publish();
  }

  return {
    start,
    stop,
    toggle() {
      muted = !muted;
      if (prepare()) {
        context.resume().catch(() => {});
        master.gain.setTargetAtTime(muted ? 0 : .38, context.currentTime, .03);
      }
      publish();
    },
    reward() { tone(660, 1040, .24, .11); },
    shoot() { tone(190, 1800, .22, .32); },
    removeInsect() { stop(); removed = true; publish(); },
    visibility(hidden) {
      if (!context) return;
      if (hidden) context.suspend().catch(() => {});
      else if (active) context.resume().then(publish).catch(() => {});
    },
  };
}
