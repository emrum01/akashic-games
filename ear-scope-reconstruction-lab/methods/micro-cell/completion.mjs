import "../../../shared/completion-record.js?v=20261110-share-newlines";

export const MICRO_CELL_ID = "ear-scope-micro-cell";
export const MICRO_CELL_URL =
  "https://games.escape-safari.com/ear-scope-reconstruction-lab/methods/micro-cell/";

// This game has no optional hint control. Story dialogue remains part of play.
export function createMicroCellCompletion({ open = globalThis.open?.bind(globalThis) } = {}) {
  const attempt = globalThis.AkashicCompletion.createCompletionAttempt(MICRO_CELL_ID);
  let cleared = false;
  return Object.freeze({
    start() {
      cleared = false;
      attempt.reset();
    },
    restoreVictory() {
      cleared = true;
    },
    record(type) {
      if (type === "battle:victory") {
        attempt.complete();
        cleared = true;
      }
    },
    share() {
      if (!cleared || typeof open !== "function") {
        return false;
      }
      const intent = globalThis.AkashicCompletion.createShareIntent(
        attempt.noHints ? "ノーヒントでクリアしました！" : "クリアしました！",
        MICRO_CELL_URL
      );
      open(intent, "_blank", "noopener,noreferrer");
      return true;
    },
  });
}
