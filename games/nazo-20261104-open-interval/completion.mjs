// Shared by classic games and bundled clients. Store flags only, never answers.
const akashicCompletionValid = (id, revision) =>
  typeof id === "string" &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) &&
  (revision === undefined || (typeof revision === "string" && /^[a-z0-9-]{1,48}$/.test(revision)));
const akashicCompletionSuffix = (id, revision) =>
  id + (revision === undefined ? "" : ":" + revision);
const akashicCompletionRead = (key) => {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const akashicCompletionWrite = (key, value) => {
  try {
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
// Keep the published adapter API compatible while retiring hint classification.
// Legacy attempt/no-hint records are neither read nor written.
const akashicCompletionReadNoHintCleared = () => false;
const akashicCompletionCreateCompletionAttempt = (id, revision) => {
  const enabled = akashicCompletionValid(id, revision);
  let completed = false;
  return {
    restored: false,
    hint() {},
    complete() {
      if (enabled && !completed) {
        completed = true;
        akashicCompletionWrite("akashic.clear.v1:" + akashicCompletionSuffix(id, revision), "1");
      }
      return false;
    },
    reset() {
      completed = false;
    },
    noHints: false,
  };
};
const akashicProgressKey = (id) =>
  akashicCompletionValid(id) ? "akashic:progress:" + id + ":v1" : "";
const akashicProgressRead = (id, validate) => {
  const key = akashicProgressKey(id);
  if (!key) {
    return null;
  }
  const raw = akashicCompletionRead(key);
  if (raw === null || raw.length > 32768) {
    return null;
  }
  try {
    const envelope = JSON.parse(raw);
    if (
      !envelope ||
      envelope.version !== 1 ||
      !envelope.data ||
      typeof envelope.data !== "object" ||
      Array.isArray(envelope.data)
    ) {
      return null;
    }
    return typeof validate !== "function" || validate(envelope.data) ? envelope.data : null;
  } catch {
    return null;
  }
};
const akashicProgressWrite = (id, value) => {
  const key = akashicProgressKey(id);
  if (!key || !value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  try {
    const raw = JSON.stringify({ version: 1, data: value });
    return raw.length <= 32768 && akashicCompletionWrite(key, raw);
  } catch {
    return false;
  }
};
const akashicProgressRemove = (id) => {
  const key = akashicProgressKey(id);
  if (!key) {
    return false;
  }
  try {
    globalThis.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};
globalThis.AkashicProgress = {
  readProgress: akashicProgressRead,
  writeProgress: akashicProgressWrite,
  removeProgress: akashicProgressRemove,
};
const akashicCompletionFormatShareText = (text, publicUrl, hashtags = "") =>
  [text, publicUrl, hashtags].filter(Boolean).join("\n");
globalThis.AkashicCompletion = {
  createCompletionAttempt: akashicCompletionCreateCompletionAttempt,
  readNoHintCleared: akashicCompletionReadNoHintCleared,
  formatShareText: akashicCompletionFormatShareText,
  createShareIntent(text, publicUrl, hashtags = "") {
    return (
      "https://twitter.com/intent/tweet?" +
      new URLSearchParams({
        text: akashicCompletionFormatShareText(text, publicUrl, hashtags),
      })
    );
  },
};


const gameId = "nazo-20261104-open-interval";
const title = "傘と本とはさみ";
const publicUrl = "https://games.escape-safari.com/games/nazo-20261104-open-interval/";
const attempt = globalThis.AkashicCompletion.createCompletionAttempt(gameId);
let hasObservedUnsolvedPlay = false;
let previousWonState = null;
const draftKey = `akashic:progress:${gameId}:answer:v1`;
let draftRestored = false;
let restoringDraft = false;
function restoreDraft() {
  const input = document.querySelector("input#answer");
  if (draftRestored || !input) {
    return;
  }
  draftRestored = true;
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
    if (saved?.version !== 1 || typeof saved.value !== "string" || saved.value.length > 2048) {
      return;
    }
    // Synchronize just the controlled answer field. Do not submit or replay play actions.
    restoringDraft = true;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      input,
      saved.value
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } catch {
    /* Corrupt or unavailable storage leaves the ordinary field usable. */
  } finally {
    restoringDraft = false;
  }
}
document.addEventListener("input", (event) => {
  if (!restoringDraft && event.target instanceof HTMLInputElement && event.target.id === "answer") {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ version: 1, value: event.target.value.slice(0, 2048) })
      );
    } catch {
      /* Play in memory. */
    }
  }
});

function shareHref() {
  const text = `「${title}」を${attempt.noHints ? "ノーヒントでクリアしました！" : "クリアしました！"}`;
  return globalThis.AkashicCompletion.createShareIntent(text, publicUrl, "#Web謎");
}

function updateShareLinks() {
  for (const link of document.querySelectorAll("a.completion-share")) {
    const href = shareHref();
    if (link.href !== href) {
      link.href = href;
    }
  }
}

function observeClearState() {
  const main = document.querySelector("main[data-won]");
  if (!main) {
    return;
  }
  const won = main.getAttribute("data-won") === "true";
  if (previousWonState === null) {
    hasObservedUnsolvedPlay = !won;
  } else if (!won) {
    hasObservedUnsolvedPlay = true;
  } else if (previousWonState === false && hasObservedUnsolvedPlay) {
    attempt.complete();
  }
  previousWonState = won;
  updateShareLinks();
}

function observeDisplayedHint() {
  const dialog = document.querySelector("dialog.hint-dialog");
  const clue = dialog?.querySelector("p")?.textContent?.trim();
  if (dialog?.open && clue) {
    attempt.hint();
  }
}

function resetAttempt() {
  attempt.reset();
  try {
    localStorage.removeItem(draftKey);
  } catch {
    /* Play in memory. */
  }
  hasObservedUnsolvedPlay = true;
  updateShareLinks();
}

document.addEventListener(
  "click",
  (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const link = event.target.closest("a.completion-share");
    if (link) {
      updateShareLinks();
      return;
    }
    const button = event.target.closest("button");
    if (!button) {
      return;
    }
    const label = button.textContent?.replace(/\s+/gu, " ").trim();
    if (label === "最初から" || label === "もう一度遊ぶ") {
      resetAttempt();
      return;
    }
    if (label === "ヒント" || label === "次のヒント") {
      queueMicrotask(observeDisplayedHint);
    }
  },
  true
);

const observer = new MutationObserver(() => {
  restoreDraft();
  observeClearState();
  observeDisplayedHint();
});
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["data-won", "open"],
});
observeClearState();
observeDisplayedHint();
restoreDraft();
