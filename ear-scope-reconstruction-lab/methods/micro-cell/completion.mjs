import "../../../shared/completion-record.js";

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
      const intent = new URL("https://twitter.com/intent/tweet");
      intent.searchParams.set(
        "text",
        attempt.noHints ? "ノーヒントでクリアしました！" : "クリアしました！"
      );
      intent.searchParams.set("url", MICRO_CELL_URL);
      open(intent.href, "_blank", "noopener,noreferrer");
      return true;
    },
  });
}
