import { BookButton } from "../../../../packages/book-ui/react";
import { forwardRef, type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { gameThemeStyle } from "./theme";

export type GameSurfaceProps = Omit<ComponentPropsWithoutRef<"main">, "style"> & {
  theme?: { accent?: string };
};

/** Root element for an opt-in full-screen game UI and its isolated theme. */
export const GameSurface = forwardRef<HTMLElement, GameSurfaceProps>(function GameSurface(
  { className = "", theme, ...props },
  ref,
) {
  const classes = ["app", "game-ui", className].filter(Boolean).join(" ");
  return <main {...props} className={classes} style={gameThemeStyle(theme?.accent)} ref={ref} />;
});

export type GameButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function GameButton({ children, className = "", ...props }: GameButtonProps) {
  const classes = ["game-ui-button", className].filter(Boolean).join(" ");
  return <BookButton asChild {...props} className={classes}><button type="button">{children}</button></BookButton>;
}

export type ActionItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

export function ActionRow({
  actions,
  className = "dialog-row",
}: {
  actions: ActionItem[];
  className?: string;
}) {
  return (
    <div className={className}>
      {actions.map((action) => (
        <GameButton key={action.id} disabled={action.disabled} onClick={action.onSelect}>
          {action.label}
        </GameButton>
      ))}
    </div>
  );
}

export type HistoryItem = { id: string; speaker?: string; text: string };

export function HistoryList({ entries, emptyLabel = "まだ会話はありません。" }: {
  entries: HistoryItem[];
  emptyLabel?: string;
}) {
  if (!entries.length) return <p>{emptyLabel}</p>;
  return <>{entries.map((entry) => (
    <article className="history-entry" key={entry.id}>
      {entry.speaker && <p className="history-speaker">{entry.speaker}</p>}
      <p>{entry.text}</p>
    </article>
  ))}</>;
}

export type HintItem = { id: string; label: string; level: number; used: number; count: number };

export function HintList({
  topics,
  disabled = false,
  onSelect,
}: {
  topics: HintItem[];
  disabled?: boolean;
  onSelect: (topicId: string) => void;
}) {
  if (!topics.length) return <p>この物語にはヒントがありません。</p>;
  return <>{topics.map((topic) => (
    <GameButton
      className="hint-option"
      key={topic.id}
      disabled={disabled}
      onClick={() => onSelect(topic.id)}
    >
      {topic.label === "ヒント" ? `ヒント ${topic.level}` : `${topic.label} — ヒント ${topic.level}`}{topic.used >= topic.count ? "（もう一度読む）" : ""}
    </GameButton>
  ))}</>;
}

export function ConfirmationActions({ actions }: { actions: ActionItem[] }) {
  if (actions.length === 1) {
    const action = actions[0];
    return <GameButton disabled={action.disabled} onClick={action.onSelect}>{action.label}</GameButton>;
  }
  return <ActionRow actions={actions} />;
}
