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
const akashicCompletionReadNoHintCleared = (id, revision) =>
  akashicCompletionValid(id, revision) &&
  akashicCompletionRead("akashic.clear.no-hints.v1:" + akashicCompletionSuffix(id, revision)) ===
    "1";
const akashicCompletionCreateCompletionAttempt = (id, revision) => {
  const enabled = akashicCompletionValid(id, revision);
  const key = enabled ? "akashic.attempt.v1:" + akashicCompletionSuffix(id, revision) : "";
  let state = { hinted: false, completed: false, noHints: false };
  const raw = enabled ? akashicCompletionRead(key) : null;
  if (raw !== null) {
    try {
      const saved = JSON.parse(raw);
      if (
        typeof saved.hinted !== "boolean" ||
        typeof saved.completed !== "boolean" ||
        typeof saved.noHints !== "boolean" ||
        (saved.hinted && saved.noHints)
      ) {
        throw Error();
      }
      state = saved;
      // A reloaded board can be played again while its previous clear remains
      // shareable. Only the next successful clear replaces that achievement.
      if (state.completed) {
        state = { hinted: false, completed: false, noHints: false };
      }
    } catch {
      // Unknown usage must never turn into an unearned no-hint result.
      state.hinted = true;
    }
  }
  const persist = () => enabled && akashicCompletionWrite(key, JSON.stringify(state));
  persist();
  return {
    restored: raw !== null,
    hint() {
      if (!state.completed) {
        state.hinted = true;
        persist();
      }
    },
    complete() {
      if (!state.completed) {
        state.completed = true;
        state.noHints = enabled && !state.hinted;
        persist();
        if (enabled) {
          akashicCompletionWrite("akashic.clear.v1:" + akashicCompletionSuffix(id, revision), "1");
          akashicCompletionWrite(
            "akashic.clear.no-hints.v1:" + akashicCompletionSuffix(id, revision),
            state.noHints ? "1" : "0"
          );
        }
      }
      return state.noHints;
    },
    reset() {
      state = { hinted: false, completed: false, noHints: false };
      persist();
    },
    get noHints() {
      return state.completed ? state.noHints : akashicCompletionReadNoHintCleared(id, revision);
    },
  };
};
globalThis.AkashicCompletion = {
  createCompletionAttempt: akashicCompletionCreateCompletionAttempt,
  readNoHintCleared: akashicCompletionReadNoHintCleared,
};


const gameId = "nazo-20261104-open-interval";
const title = "傘と本とはさみ";
const publicUrl = "https://games.escape-safari.com/games/nazo-20261104-open-interval/";
const attempt = globalThis.AkashicCompletion.createCompletionAttempt(gameId);
let hasObservedUnsolvedPlay = false;
let previousWonState = null;

function shareHref() {
  const text = `「${title}」を${attempt.noHints ? "ノーヒントでクリアしました！" : "クリアしました！"} #Web謎`;
  return `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url: publicUrl })}`;
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
