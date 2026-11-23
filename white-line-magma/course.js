const INTRO = [
  { kind: "truck", at: 14 },
  { kind: "gap", at: 24 },
  { kind: "fold", at: 45 },
  { kind: "dog", at: 67 },
  { kind: "pusher", at: 87 },
];

const KINDS = ["gap", "truck", "pusher", "dog", "fold"];
const JUMP_TIME = 0.9;
const PARRY_TIME = 0.33;
const PARRY_COOLDOWN = 0.53;
export const PARRY_ANIMATION = { hold: 0.11, landing: 0.82, finish: 1.52 };
const FALL_TIME = 0.58;
const TRUCK_DEPTH = -1.48;
const BRIDGE_DEPTH = 0.66;
const DOG_BARK_AT = 6.3;

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function eventFor(index) {
  const intro = INTRO[index];
  const offset = Math.max(0, index - INTRO.length + 1);
  const group = Math.floor(offset / KINDS.length);
  const kind = intro?.kind ?? KINDS[(offset + group * 3) % KINDS.length];
  const at = intro?.at ?? 87 + 15.5 * offset + 35 * (1 - Math.exp(-offset / 6));
  const length = { gap: index < INTRO.length ? 2.7 : 3.1, fold: 9.1 }[kind] ?? 0;
  return { index, kind, at, length, side: index % 2 === 0 ? -1 : 1 };
}

export function speedAt(distance) {
  return 5.9 + 7.4 * (1 - Math.exp(-distance / 240));
}

export function positionOf(event, distance) {
  const ahead = event.at - distance;
  if (event.kind === "truck") {
    return { ahead: ahead * 1.13, depth: TRUCK_DEPTH };
  }
  if (event.kind === "dog") {
    return { ahead: ahead * 1.42, depth: 0 };
  }
  if (event.kind === "pusher") {
    const approach = clamp(1 - ahead / 7.4);
    return { ahead, depth: event.side * (3.65 - 3.45 * approach) };
  }
  return { ahead, depth: event.kind === "fold" ? BRIDGE_DEPTH : 0 };
}

export function newRun() {
  return {
    state: "playing",
    mode: 3,
    distance: 0,
    index: 0,
    jump: null,
    parry: 0,
    parryLock: 0,
    deflected: -1,
    deflectTime: 0,
    fall: 0,
    fallSide: 1,
    reason: "",
  };
}

export function restoreRun(saved) {
  if (saved?.version !== 1 || !saved.run || !Number.isFinite(saved.run.distance)) {
    return null;
  }
  const { run } = saved;
  if (!["playing", "falling", "ended"].includes(run.state) || ![2, 3].includes(run.mode)) {
    return null;
  }
  if (!Number.isSafeInteger(run.index) || run.distance < 0 || run.index < 0) {
    return null;
  }
  if (eventFor(run.index).at < run.distance - 12) {
    return null;
  }
  const restored = { ...newRun(), ...run };
  if (restored.state === "falling") {
    restored.state = "ended";
  }
  return restored;
}

export function heightOf(run) {
  if (run.state !== "playing") {
    return 0.22 * run.fall - 2.2 * run.fall ** 2;
  }
  if (run.jump === null) {
    return 0;
  }
  const phase = run.jump / JUMP_TIME;
  return 6.9 * phase * (1 - phase);
}

export function takeAction(run, action) {
  if (run.state !== "playing") {
    return false;
  }
  if (action === "jump" && run.jump === null) {
    run.jump = 0;
    return true;
  }
  if (action === "parry" && run.parryLock <= 0) {
    run.parry = PARRY_TIME;
    run.parryLock = PARRY_COOLDOWN;
    return true;
  }
  if (action === "switch") {
    run.mode = run.mode === 3 ? 2 : 3;
    return true;
  }
  return false;
}

export function parryBeat(run) {
  const t = run.deflectTime;
  if (run.deflected < 0 || t >= PARRY_ANIMATION.finish) {
    return "";
  }
  if (t < PARRY_ANIMATION.hold) {
    return "contact";
  }
  return t < PARRY_ANIMATION.landing ? "flight" : "splash";
}

function startFall(run, reason, side = 1) {
  run.state = "falling";
  run.reason = reason;
  run.fallSide = side;
}

function checkHazard(run, obstacle, finish) {
  const { ahead } = positionOf(obstacle, run.distance);
  const height = heightOf(run);
  switch (obstacle.kind) {
    case "gap":
    case "fold":
      if (ahead <= 0 && run.distance < finish && height < 0.09) {
        if (obstacle.kind === "gap" || run.mode === 3) {
          startFall(run, "gap");
        }
      }
      break;
    case "truck":
      if (Math.abs(ahead) < 1.24 && run.mode === 2) {
        startFall(run, "truck", -1);
      }
      break;
    case "dog":
      if (Math.abs(ahead) < 0.62 && height < 0.48) {
        startFall(run, "dog", -obstacle.side);
      }
      break;
    case "pusher":
      if (ahead > 0 || run.deflected === obstacle.index) {
        break;
      }
      if (run.parry > 0) {
        run.deflected = obstacle.index;
        run.deflectTime = 0;
        run.parry = 0;
      } else {
        startFall(run, "pusher", -obstacle.side);
      }
      break;
  }
}

// The render loop advances the same small step at every refresh rate.
export function advance(run, dt) {
  if (run.state === "falling") {
    run.fall = Math.min(FALL_TIME, run.fall + dt);
    if (run.fall >= FALL_TIME) {
      run.state = "ended";
      return { type: "ended" };
    }
    return null;
  }

  if (run.state !== "playing") {
    return null;
  }
  if (run.deflected >= 0) {
    const beat = parryBeat(run);
    run.deflectTime = Math.min(PARRY_ANIMATION.finish, run.deflectTime + dt);
    if (beat === "contact") {
      return null;
    }
  }
  run.distance += speedAt(run.distance) * dt;
  run.parry = Math.max(0, run.parry - dt);
  run.parryLock = Math.max(0, run.parryLock - dt);
  if (run.jump !== null) {
    run.jump += dt;
    if (run.jump >= JUMP_TIME) {
      run.jump = null;
    }
  }

  const obstacle = eventFor(run.index);
  const finish = obstacle.at + (obstacle.length || (obstacle.kind === "truck" ? 1.25 : 0.7));
  checkHazard(run, obstacle, finish);
  if (run.state === "falling") {
    return { type: "fail" };
  }
  if (run.distance >= finish) {
    run.index += 1;
    return { type: "progress", stage: obstacle.kind, step: Math.min(run.index, 9999) };
  }
  return null;
}

export function visibleEvents(run) {
  const events = [];
  for (let index = Math.max(0, run.index - 3); ; index += 1) {
    const event = eventFor(index);
    if (event.at - run.distance > 51) {
      return events;
    }
    if (event.at + event.length - run.distance >= -16) {
      events.push(event);
    }
  }
}

const TIPS = {
  gap: ["白線が途切れる", "ジャンプ！"],
  fold: ["白線がずれている · 2Dへ", "2Dへ！"],
  truck: ["トラックと重なる · 3Dへ", "3Dへ！"],
  dog: ["柴犬が来る · ジャンプ", "ジャンプ！"],
  pusher: ["狙われている · 引きつける", "受け流す！"],
};

function hazardSignal(run) {
  const event = eventFor(run.index);
  const seconds = (event.at - run.distance) / speedAt(run.distance);
  if (seconds > 1.62 || seconds < -0.15) {
    return null;
  }
  if (event.kind === "fold" && run.mode === 2) {
    return { label: "白線がつながった", action: "", now: false };
  }
  if (event.kind === "truck" && run.mode === 3) {
    return { label: "トラックは左を通る", action: "", now: false };
  }
  const nowAt = { gap: 0.29, fold: 0.46, truck: 0.48, dog: 0.33, pusher: 0.27 };
  const actions = { gap: "jump", fold: "switch", truck: "switch", dog: "jump", pusher: "parry" };
  const now = seconds <= nowAt[event.kind];
  const action = actions[event.kind];
  if (now && ((action === "jump" && run.jump !== null) || (action === "parry" && run.parry > 0))) {
    return null;
  }
  return { label: TIPS[event.kind][Number(now)], action, now, target: event };
}

export function signalFor(run) {
  if (run.state !== "playing") {
    return null;
  }
  const cue = hazardSignal(run);
  const beat = parryBeat(run);
  // At higher speeds the next input can come due before the splash ends.
  if (!beat || (beat === "splash" && cue?.now)) {
    return cue;
  }
  const label = beat === "splash" ? "マグマに落とした！" : "受け流し成功！";
  return { label, action: "", now: false };
}

// The dog runs throughout the encounter. Only the bark changes its pose.
export function dogPhase(event, distance) {
  const ahead = event.at - distance;
  return ahead <= DOG_BARK_AT && ahead > DOG_BARK_AT - 1.8 ? "bark" : "run";
}
