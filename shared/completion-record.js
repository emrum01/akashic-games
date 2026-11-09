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
