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
