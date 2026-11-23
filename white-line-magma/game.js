import { emitGameTelemetry, initializeGameTelemetry } from "../shared/game-telemetry-client.js";
import "./completion-record.js";
import { advance, newRun, restoreRun, signalFor, takeAction } from "./course.js";
import { createRenderer } from "./render.js?v=screen-controls";

const GAME_ID = "white-line-magma";
const qa = new URLSearchParams(location.search).has("qa");
const SAVE_KEY = qa ? "akashic:white-line-magma:qa" : "akashic:white-line-magma";
const STEP = 1 / 120;
const END_TEXT = {
  gap: "白線が途切れて、マグマに落ちた。",
  truck: "トラックにぶつかった。3Dなら脇を通れる。",
  car: "白線から落ちた。",
  dog: "柴犬にぶつかった。ジャンプで飛び越えよう。",
  pusher: "横から押し出された。引きつけて受け流そう。",
};

const element = (id) => document.getElementById(id);
const overlay = element("overlay");
const detail = element("overlay-detail");
const primary = element("primary");
const pauseButton = element("pause");
const shareResult = element("share-result");
const distanceLabel = element("distance");
const resultScores = element("result-scores");
const resultDistance = element("result-distance");
const bestLabel = element("best");
const modeLabel = element("mode");
const viewAction = element("view-action");
const cue = element("cue");
const buttons = { jump: element("jump"), parry: element("parry"), switch: element("switch-view") };
const viewport = window.visualViewport;

function applyViewport() {
  if (viewport && viewport.scale !== 1) {
    return;
  }
  const height = Math.floor(viewport?.height ?? window.innerHeight);
  const root = document.documentElement;
  root.style.setProperty("--vvh", height + "px");
  root.classList.toggle("vvh-tiny", height < 520);
}

window.addEventListener("resize", applyViewport);
viewport?.addEventListener("resize", applyViewport);
applyViewport();
const draw = createRenderer(element("world"), element("controls"));

function readSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

const saved = readSave();
let run = restoreRun(saved);
let best = Math.max(0, Number.isSafeInteger(saved?.best) ? saved.best : 0);
let screen = run ? (run.state === "ended" ? "ended" : "paused") : "ready";
let lastSave = 0;
let lastCue = "";
let dogHintIndex = -1;
let accumulator = 0;
let previousFrame = null;
const titleRun = newRun();
initializeGameTelemetry(GAME_ID);

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, best, run }));
  } catch {
    // The current run remains playable without local storage.
  }
}

function meters(value) {
  return String(Math.floor(value)).padStart(3, "0");
}

function updateHud() {
  const distance = run?.distance ?? 0;
  best = Math.max(best, Math.floor(distance));
  distanceLabel.textContent = meters(distance);
  const is3D = (run?.mode ?? 3) === 3;
  const mode = is3D ? "3D" : "2D";
  if (modeLabel.textContent !== mode) {
    modeLabel.textContent = mode;
    viewAction.textContent = is3D ? "2Dへ" : "3Dへ";
  }

  const active = screen === "playing" && run.state === "playing";
  const signal = active ? signalFor(run) : null;
  const showDogHint = signal?.target?.kind === "dog" && run.index === dogHintIndex;
  const label = showDogHint ? "柴犬はジャンプ！" : signal?.label ?? "";
  if (label !== lastCue) {
    cue.textContent = label;
    lastCue = label;
  }
  cue.toggleAttribute("data-now", Boolean(signal?.now));
}

function setScreen(next, focus = false) {
  screen = next;
  overlay.dataset.state = screen;
  overlay.hidden = screen === "playing";
  resultScores.hidden = screen !== "ended";
  shareResult.hidden = screen !== "ended";
  if (screen === "ended") {
    overlay.setAttribute("role", "dialog");
  } else {
    overlay.removeAttribute("role");
  }
  pauseButton.hidden = screen !== "playing";
  for (const button of Object.values(buttons)) {
    button.disabled = screen !== "playing";
  }

  if (screen === "paused") {
    detail.textContent = "一時停止";
    primary.textContent = "続きを走る →";
  }
  if (screen === "ended") {
    detail.textContent = END_TEXT[run.reason] ?? "白線から落ちた。";
    primary.textContent = "もう一度走る →";
    resultDistance.textContent = meters(run.distance);
    bestLabel.textContent = meters(Math.max(best, run.distance));
    const gameUrl = document.querySelector('link[rel="canonical"]').href;
    shareResult.href = globalThis.AkashicCompletion.createShareIntent(
      `『白線外はマグマ』で ${Math.floor(run.distance)} m 走った！`,
      gameUrl,
      "#白線外はマグマ",
    );
  }
  if (focus) {
    const target = screen === "playing" ? pauseButton : primary;
    target.focus({ preventScroll: true });
  }
  updateHud();
}

function activate() {
  if (screen === "playing") {
    return;
  }
  if (screen !== "paused") {
    run = newRun();
    dogHintIndex = -1;
    emitGameTelemetry(GAME_ID, "start");
  }
  accumulator = 0;
  setScreen("playing", true);
  save();
}

function pause() {
  if (screen !== "playing" || run.state !== "playing") {
    return;
  }
  setScreen("paused", document.activeElement === pauseButton);
  save();
}

function handleAction(action) {
  if (screen !== "playing" || run.state !== "playing") {
    return;
  }
  if (action === "parry" && signalFor(run)?.target?.kind === "dog") {
    dogHintIndex = run.index;
    updateHud();
    return;
  }
  if (takeAction(run, action)) {
    updateHud();
  }
}

primary.addEventListener("click", activate);
pauseButton.addEventListener("click", pause);
for (const [name, button] of Object.entries(buttons)) {
  button.addEventListener("click", () => handleAction(name));
}

const keyActions = { Space: "jump", ArrowUp: "jump", KeyF: "parry", KeyV: "switch" };
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) {
    return;
  }
  const focusedButton = event.target instanceof HTMLButtonElement;
  if (event.code === "Escape" || event.code === "KeyP") {
    if (screen === "playing") {
      pause();
    } else if (screen === "paused" && !event.repeat) {
      activate();
    }
    return;
  }
  if (screen !== "playing") {
    if (!event.repeat && !focusedButton && ["Space", "Enter"].includes(event.code)) {
      event.preventDefault();
      activate();
    }
    return;
  }
  const action = keyActions[event.code];
  if (!action) {
    return;
  }
  event.preventDefault();
  if (!event.repeat) {
    handleAction(action);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pause();
  }
});
window.addEventListener("pagehide", save);

function frame(now) {
  const delta = previousFrame === null ? 0 : Math.min((now - previousFrame) / 1000, 0.084);
  previousFrame = now;
  if (screen === "playing") {
    accumulator += delta;
    while (screen === "playing" && accumulator >= STEP) {
      accumulator -= STEP;
      const event = advance(run, STEP);
      if (event?.type === "progress") {
        emitGameTelemetry(GAME_ID, "progress", { stage: event.stage, step: event.step });
      }
      if (event?.type === "fail") {
        emitGameTelemetry(GAME_ID, "fail");
        updateHud();
        save();
      }
      if (event?.type === "ended") {
        setScreen("ended", true);
        save();
      }
    }
    updateHud();
    if (now - lastSave > 700) {
      lastSave = now;
      save();
    }
  }
  draw(run ?? titleRun, now, screen);
  requestAnimationFrame(frame);
}

setScreen(screen);
requestAnimationFrame(frame);
