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
// Public projection only: game URLs and verified official X posts, never draft IDs.
const akashicCompletionSharePosts = /* BEGIN VERIFIED X POSTS */ {
  "https://games.escape-safari.com/games/nazo-20261104-open-interval/":
    "https://x.com/nazotoki_cafe/status/2125137348518420569",
  "https://games.escape-safari.com/kobako/":
    "https://x.com/nazotoki_cafe/status/2117889641483489451",
  "https://games.escape-safari.com/last-bridge/":
    "https://x.com/nazotoki_cafe/status/2118251997342437577",
  "https://games.escape-safari.com/long-way/":
    "https://x.com/nazotoki_cafe/status/2121513467517759511",
  "https://games.escape-safari.com/moving-editor/":
    "https://x.com/nazotoki_cafe/status/2124412569364611292",
  "https://games.escape-safari.com/mukaiau/":
    "https://x.com/nazotoki_cafe/status/2124050183252234308",
  "https://games.escape-safari.com/nine-minutes/":
    "https://x.com/nazotoki_cafe/status/2121875855404351883",
  "https://games.escape-safari.com/one-heavy/":
    "https://x.com/nazotoki_cafe/status/2120449994834797044",
  "https://games.escape-safari.com/press-all-buttons/":
    "https://x.com/nazotoki_cafe/status/2123325411086213575",
  "https://games.escape-safari.com/symbol-rule/":
    "https://x.com/nazotoki_cafe/status/2119701536263807206",
  "https://games.escape-safari.com/three-cuts/":
    "https://x.com/nazotoki_cafe/status/2120788699990597901",
  "https://games.escape-safari.com/three-forward-two-back/":
    "https://x.com/nazotoki_cafe/status/2122238275972952462",
  "https://games.escape-safari.com/three-pictures/":
    "https://x.com/nazotoki_cafe/status/2118614376290930847",
  "https://games.escape-safari.com/turtle-soup/play/empty-music-room/":
    "https://x.com/nazotoki_cafe/status/2120063925060510010",
  "https://games.escape-safari.com/turtle-soup/play/missing-portrait/":
    "https://x.com/nazotoki_cafe/status/2121151085696160185",
  "https://games.escape-safari.com/turtle-soup/play/nazo-20261101-bedtime-story/":
    "https://x.com/nazotoki_cafe/status/2118976777016180885",
  "https://games.escape-safari.com/turtle-soup/play/nazo-20261103-doorway-load/":
    "https://x.com/nazotoki_cafe/status/2122600635204022348",
  "https://games.escape-safari.com/turtle-soup/play/nazo-20261104-no-sale/":
    "https://x.com/nazotoki_cafe/status/2123687796586226142",
  "https://games.escape-safari.com/two-exits/":
    "https://x.com/nazotoki_cafe/status/2119339142056415708",
  "https://games.escape-safari.com/waterway-inspection/":
    "https://x.com/nazotoki_cafe/status/2122963020561474044",
}; /* END VERIFIED X POSTS */
const akashicCompletionShareUrl = (publicUrl) => {
  if (typeof publicUrl !== "string") {
    return publicUrl;
  }
  const canonical = publicUrl
    .replace(/[?#].*$/, "")
    .replace(/\/index\.html$/, "/")
    .replace(/\/?$/, "/");
  return Object.hasOwn(akashicCompletionSharePosts, canonical)
    ? akashicCompletionSharePosts[canonical]
    : publicUrl;
};
globalThis.AkashicCompletion = {
  createCompletionAttempt: akashicCompletionCreateCompletionAttempt,
  readNoHintCleared: akashicCompletionReadNoHintCleared,
  formatShareText: akashicCompletionFormatShareText,
  shareUrl: akashicCompletionShareUrl,
  createShareIntent(text, publicUrl, hashtags = "#Web謎") {
    const postUrl = akashicCompletionShareUrl(publicUrl);
    return (
      "https://twitter.com/intent/tweet?" +
      new URLSearchParams({
        text: [text, publicUrl, postUrl !== publicUrl ? postUrl : "", hashtags]
          .filter(Boolean)
          .join("\n\n"),
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
