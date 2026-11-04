import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CompositionEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { chooseNaturalPageEnd } from "../../hon-lion-riddle/app/dialogue-pagination.js";
import { COMPLETION_MESSAGE } from "../../../../packages/book-ui/game-completion.js";
import { CompletionPanel, CreatorLinks } from "../../../../packages/book-ui/Completion";

const TRANSCRIPT_SCROLL_KEYS = new Set([
  " ",
  "Spacebar",
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);
const INTERACTIVE_TRANSCRIPT_SELECTOR =
  'a, button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

function isInteractiveTranscriptTarget(target: EventTarget | null, currentTarget: Element) {
  return (
    target instanceof Element &&
    target !== currentTarget &&
    target.closest(INTERACTIVE_TRANSCRIPT_SELECTOR) !== null
  );
}

export {
  ActionRow,
  ConfirmationActions,
  GameButton,
  GameSurface,
  HintList,
  HistoryList,
} from "./components";
export type {
  ActionItem,
  GameButtonProps,
  GameSurfaceProps,
  HintItem,
  HistoryItem,
} from "./components";
export { DEFAULT_GAME_ACCENT, gameThemeStyle, parseGameAccent } from "./theme";
export type { GameAccent, GameTheme, GameThemeStyle } from "./theme";

export type ComposerMode = "question" | "final_theory";
export function CompletionInfo({
  cleared,
  shareUrl,
  message = false,
}: {
  cleared: boolean;
  shareUrl?: string | null;
  message?: boolean;
}) {
  return (
    <aside
      className={`completion-info${message ? " completion-info--message" : ""}`}
      aria-label="制作元とクリア状況"
    >
      <div className="completion-meta">
        {cleared ? <span className="completion-cleared">{COMPLETION_MESSAGE}</span> : null}
        <CreatorLinks />
      </div>
      {shareUrl ? (
        <a
          id="clear-share"
          className="clear-share completion-share"
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="公開予定のURLでXの投稿画面を開く"
        >
          Xでクリアを共有
        </a>
      ) : null}
    </aside>
  );
}
export function CompletionScreen({
  shareUrl,
  onReplay,
}: {
  shareUrl: string;
  onReplay: () => void;
}) {
  return <CompletionPanel mode="chat" shareUrl={shareUrl} onReplay={onReplay} />;
}
export type ConversationMessage = {
  id: string;
  kind: "problem" | "player" | "character" | "error";
  speaker: string;
  text: string;
};

type Page = { text: string; start: number; end: number; overflow: boolean };

function splitMessage(
  text: string,
  kind: ConversationMessage["kind"],
  log: HTMLDivElement,
  probe: HTMLParagraphElement
): Page[] {
  const characters = Array.from(text);
  if (kind === "problem" || characters.length === 0) {
    return [{ text, start: 0, end: characters.length, overflow: true }];
  }
  const width = Number(window.innerWidth) || 0;
  const fallbackLength = width > 0 && width <= 650 ? 64 : 96;
  const availableHeight =
    Number(log.clientHeight) || Number(log.getBoundingClientRect().height) || 0;
  const fits = (start: number, end: number) => {
    probe.textContent = characters.slice(start, end).join("");
    const height = Number(probe.scrollHeight) || 0;
    return availableHeight > 0 && height > 0
      ? height <= availableHeight + 1
      : end - start <= fallbackLength;
  };
  if (fits(0, characters.length)) {
    return [{ text, start: 0, end: characters.length, overflow: false }];
  }

  const pages: Page[] = [];
  let start = 0;
  while (start < characters.length) {
    let low = start + 1;
    let high = characters.length;
    let best = start + 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(start, middle)) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const fittingEnd = Math.max(best, start + 1);
    let end = chooseNaturalPageEnd(characters, start, fittingEnd);
    if (end <= start) {
      end = characters.length;
    }
    pages.push({
      text: characters.slice(start, end).join(""),
      start,
      end,
      overflow: !fits(start, end),
    });
    start = end;
  }
  return pages.length ? pages : [{ text, start: 0, end: characters.length, overflow: false }];
}

function samePages(left: Page[], right: Page[]) {
  return (
    left.length === right.length &&
    left.every((page, index) => {
      const other = right[index];
      return (
        page.text === other.text &&
        page.start === other.start &&
        page.end === other.end &&
        page.overflow === other.overflow
      );
    })
  );
}

export type ConversationShellProps = {
  visible: boolean;
  transcript?: ConversationMessage[];
  leadingContent?: ReactNode;
  trailingContent?: ReactNode;
  defaultSpeaker: string;
  turnLabel: string;
  composerVisible: boolean;
  keyboardRaised: boolean;
  chatPending: boolean;
  draft: string;
  message: ConversationMessage | null;
  actionLabel: string | null;
  inputDisabled: boolean;
  submitDisabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSubmit: (mode: ComposerMode, text?: string) => void;
  onAction: (messageId: string) => void;
  onEditorFocusChange: (focused: boolean) => void;
};

export function ConversationShell({
  visible,
  transcript,
  leadingContent,
  trailingContent,
  defaultSpeaker,
  turnLabel,
  composerVisible,
  keyboardRaised,
  chatPending,
  draft,
  message,
  actionLabel,
  inputDisabled,
  submitDisabled,
  inputRef,
  onDraftChange,
  onSubmit,
  onAction,
  onEditorFocusChange,
}: ConversationShellProps) {
  const composing = useRef(false);
  const pendingSubmit = useRef<{ mode: ComposerMode; input: HTMLTextAreaElement } | null>(null);
  const commitFrame = useRef<number | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const lastTranscriptId = useRef<string | null>(null);
  const followTranscript = useRef(false);
  const transcriptScrollIntentUntil = useRef(0);
  const lastTranscriptScrollSize = useRef<{ height: number; viewport: number } | null>(null);
  const probe = useRef<HTMLParagraphElement>(null);
  const preserveScrollOnNextRender = useRef(false);
  const visibleOffset = useRef(0);
  const offsetMessageId = useRef<string | null>(null);
  const measuredWidth = useRef(0);
  const [pagination, setPagination] = useState<{
    messageId: string | null;
    pages: Page[];
    pageIndex: number;
  }>({
    messageId: null,
    pages: [],
    pageIndex: 0,
  });
  const [measureVersion, setMeasureVersion] = useState(0);
  const hasTranscript = Boolean(transcript);
  const hasMessage = message !== null;
  const messageId = message?.id ?? null;
  const messageText = message?.text ?? "";
  const messageKind = message?.kind ?? null;
  const transcriptLength = transcript?.length ?? 0;
  const transcriptLastEntry = transcript?.[transcriptLength - 1] ?? null;
  const transcriptLastId = transcriptLastEntry?.id ?? null;
  const transcriptLastKind = transcriptLastEntry?.kind ?? null;
  const markTranscriptScrollIntent = useCallback(() => {
    const target = log.current;
    if (target) {
      lastTranscriptScrollSize.current = {
        height: target.scrollHeight,
        viewport: target.clientHeight,
      };
    }
    transcriptScrollIntentUntil.current = performance.now() + 400;
  }, []);
  const handleTranscriptScroll = useCallback(() => {
    const target = log.current;
    const currentTime = performance.now();
    if (!target) {
      return;
    }
    const previousSize = lastTranscriptScrollSize.current;
    const nextSize = { height: target.scrollHeight, viewport: target.clientHeight };
    lastTranscriptScrollSize.current = nextSize;
    // A reply or viewport resize can emit a scroll event without new user input.
    if (
      !previousSize ||
      previousSize.height !== nextSize.height ||
      previousSize.viewport !== nextSize.viewport ||
      currentTime > transcriptScrollIntentUntil.current
    ) {
      return;
    }
    followTranscript.current = target.scrollHeight - target.scrollTop - target.clientHeight < 40;
    transcriptScrollIntentUntil.current = currentTime + 400;
  }, []);
  const handleTranscriptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!TRANSCRIPT_SCROLL_KEYS.has(event.key)) {
        return;
      }
      if (isInteractiveTranscriptTarget(event.target, event.currentTarget)) {
        return;
      }
      markTranscriptScrollIntent();
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        const target = log.current;
        if (target) {
          const distance = Math.max(40, target.clientHeight * 0.9);
          target.scrollBy({ top: event.shiftKey ? -distance : distance, behavior: "auto" });
        }
      }
    },
    [markTranscriptScrollIntent]
  );
  const handleTranscriptKeyUp = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (
        TRANSCRIPT_SCROLL_KEYS.has(event.key) &&
        !isInteractiveTranscriptTarget(event.target, event.currentTarget)
      ) {
        markTranscriptScrollIntent();
      }
    },
    [markTranscriptScrollIntent]
  );
  const handleTranscriptPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const verticalTrack =
        target.scrollHeight > target.clientHeight && x >= target.clientWidth - 14;
      const horizontalTrack =
        target.scrollWidth > target.clientWidth && y >= target.clientHeight - 14;
      if (verticalTrack || horizontalTrack) {
        markTranscriptScrollIntent();
      }
    },
    [markTranscriptScrollIntent]
  );
  const handleTranscriptPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.buttons !== 0) {
        markTranscriptScrollIntent();
      }
    },
    [markTranscriptScrollIntent]
  );
  const paginationMatchesMessage = hasMessage && pagination.messageId === messageId;
  const fallbackPage: Page | null = hasMessage
    ? { text: messageText, start: 0, end: Array.from(messageText).length, overflow: true }
    : null;
  const measuredPages = paginationMatchesMessage
    ? pagination.pages
    : fallbackPage
      ? [fallbackPage]
      : [];
  const measuredPageIndex = paginationMatchesMessage ? pagination.pageIndex : 0;
  const measuredActivePage = measuredPages[measuredPageIndex] ?? null;
  const freezePagination = !hasTranscript && (composerVisible || chatPending);
  const preserveFrozenPageScroll =
    freezePagination &&
    paginationMatchesMessage &&
    measuredActivePage !== null &&
    !measuredActivePage.overflow;
  const pages =
    freezePagination && measuredActivePage
      ? [{ ...measuredActivePage, overflow: true }]
      : measuredPages;
  const pageIndex = freezePagination ? 0 : measuredPageIndex;
  const activePage = pages[pageIndex] || null;
  const activePageStart = activePage?.start ?? null;
  const activePageText = activePage?.text ?? null;
  const activePageOverflow = activePage?.overflow ?? false;
  const hasMore = pageIndex + 1 < pages.length;
  const pageAction = composerVisible || chatPending ? null : hasMore ? "次へ" : actionLabel;

  const resizeComposerInput = useCallback(() => {
    const input = inputRef.current;
    const panel = input?.closest<HTMLElement>("#conversation");
    if (
      !hasTranscript ||
      !composerVisible ||
      !input ||
      !panel ||
      panel.hasAttribute("data-short-press")
    ) {
      return;
    }
    if (input.closest<HTMLElement>("#composer")?.hidden) {
      return;
    }
    const footer = panel.querySelector<HTMLElement>(".composer-footer");
    const header = panel.closest(".game-ui")?.querySelector<HTMLElement>(".topbar");
    const composer = input.parentElement;
    if (!footer || !header || !composer) {
      return;
    }
    const numeric = (value: string) => Number.parseFloat(value) || 0;
    const frameStyle = getComputedStyle(panel);
    const style = getComputedStyle(input);
    const viewportOwner = panel.closest<HTMLElement>(".game-ui");
    const visibleHeight = viewportOwner
      ? numeric(getComputedStyle(viewportOwner).getPropertyValue("--chat-visible-height"))
      : 0;
    const available =
      (visibleHeight || window.visualViewport?.height || window.innerHeight) -
      header.getBoundingClientRect().height -
      footer.getBoundingClientRect().height -
      numeric(frameStyle.paddingTop) -
      numeric(frameStyle.paddingBottom) -
      numeric(frameStyle.rowGap) -
      numeric(getComputedStyle(composer).rowGap) -
      24;
    const limit = Math.max(44, Math.min(176, available));
    const previousScroll = input.scrollTop;
    const caretAtEnd =
      document.activeElement === input && input.selectionEnd === input.value.length;
    input.style.height = "0px";
    const natural =
      input.scrollHeight + numeric(style.borderTopWidth) + numeric(style.borderBottomWidth);
    input.style.maxHeight = `${limit}px`;
    input.style.height = `${Math.ceil(Math.min(limit, Math.max(44, natural)))}px`;
    input.style.overflowY = natural > limit ? "auto" : "hidden";
    input.scrollTop = caretAtEnd ? input.scrollHeight : previousScroll;
  }, [hasTranscript, composerVisible, inputRef]);

  // The changed draft and measurement version intentionally trigger external
  // DOM remeasurement after React commits; neither changes the measurement function.
  useLayoutEffect(() => {
    resizeComposerInput();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- These values are DOM remeasurement triggers.
  }, [draft, measureVersion, resizeComposerInput]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!hasTranscript || !composerVisible || !input) {
      return;
    }
    input.addEventListener("input", resizeComposerInput);
    input.addEventListener("composer-resize", resizeComposerInput);
    window.addEventListener("resize", resizeComposerInput);
    window.visualViewport?.addEventListener("resize", resizeComposerInput);
    return () => {
      input.removeEventListener("input", resizeComposerInput);
      input.removeEventListener("composer-resize", resizeComposerInput);
      window.removeEventListener("resize", resizeComposerInput);
      window.visualViewport?.removeEventListener("resize", resizeComposerInput);
    };
  }, [hasTranscript, composerVisible, inputRef, resizeComposerInput]);

  useLayoutEffect(() => {
    if (hasTranscript) {
      return; // A scrolling transcript is never paginated like a speech bubble.
    }
    if (
      !hasMessage ||
      messageId === null ||
      messageKind === null ||
      !log.current ||
      !probe.current
    ) {
      if (probe.current) {
        probe.current.textContent = "";
      }
      visibleOffset.current = 0;
      offsetMessageId.current = null;
      return;
    }

    if (freezePagination) {
      return;
    }

    const previousOffset = messageId === offsetMessageId.current ? visibleOffset.current : 0;
    const nextPages = splitMessage(messageText, messageKind, log.current, probe.current);
    const matchingIndex = nextPages.findIndex(
      (page) => page.start <= previousOffset && previousOffset < page.end
    );
    const nextIndex = matchingIndex >= 0 ? matchingIndex : 0;
    setPagination((current) => {
      if (
        current.messageId === messageId &&
        current.pageIndex === nextIndex &&
        samePages(current.pages, nextPages)
      ) {
        return current;
      }
      return { messageId, pages: nextPages, pageIndex: nextIndex };
    });
    visibleOffset.current = nextPages[nextIndex]?.start || 0;
    offsetMessageId.current = messageId;
  }, [
    hasTranscript,
    hasMessage,
    messageId,
    messageText,
    messageKind,
    // This version intentionally triggers a fresh DOM split after layout changes.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- DOM remeasurement trigger.
    measureVersion,
    freezePagination,
  ]);

  useLayoutEffect(() => {
    if (preserveFrozenPageScroll) {
      preserveScrollOnNextRender.current = true;
    }
  }, [preserveFrozenPageScroll]);

  useLayoutEffect(() => {
    if (hasTranscript) {
      return;
    }
    const target = log.current;
    if (!target || !hasMessage || messageId === null || activePageText === null) {
      return;
    }
    visibleOffset.current = activePageStart ?? 0;
    offsetMessageId.current = messageId;
    if (preserveScrollOnNextRender.current) {
      preserveScrollOnNextRender.current = false;
      return;
    }
    if (activePageOverflow) {
      target.scrollTo({ top: 0, behavior: "auto" });
    } else {
      target.scrollTo({ top: target.scrollHeight, behavior: "auto" });
    }
  }, [hasTranscript, hasMessage, messageId, activePageStart, activePageText, activePageOverflow]);

  useLayoutEffect(() => {
    const target = log.current;
    if (!target || !hasTranscript) {
      return;
    }
    if (lastTranscriptId.current === transcriptLastId) {
      return;
    }
    if (!lastTranscriptId.current || transcriptLastKind === "problem") {
      target.scrollTop = 0;
      followTranscript.current = false;
    } else if (followTranscript.current || transcriptLastKind === "player") {
      target.scrollTop = target.scrollHeight;
      followTranscript.current = true;
    }
    lastTranscriptId.current = transcriptLastId;
  }, [hasTranscript, transcriptLastId, transcriptLastKind]);

  useLayoutEffect(() => {
    const target = log.current;
    if (!target || !hasTranscript) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (followTranscript.current) {
        target.scrollTop = target.scrollHeight;
      }
    });
    observer.observe(target);
    const transcriptMessages = target.querySelectorAll<HTMLElement>(".message:not(.message-probe)");
    const lastTranscriptMessage =
      transcriptLastId === null ? null : transcriptMessages.item(transcriptLength - 1);
    if (lastTranscriptMessage) {
      observer.observe(lastTranscriptMessage);
    }
    return () => observer.disconnect();
  }, [hasTranscript, transcriptLength, transcriptLastId]);

  useLayoutEffect(() => {
    const target = log.current;
    if (!target) {
      return;
    }
    measuredWidth.current = target.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = target.clientWidth;
      if (hasMessage && nextWidth !== measuredWidth.current) {
        measuredWidth.current = nextWidth;
        setMeasureVersion((current) => current + 1);
      }
    });
    observer.observe(target);
    const remeasure = () => {
      if (hasMessage) {
        setMeasureVersion((current) => current + 1);
      }
    };
    window.addEventListener("resize", remeasure);
    window.visualViewport?.addEventListener("resize", remeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
      window.visualViewport?.removeEventListener("resize", remeasure);
    };
  }, [hasMessage]);

  useLayoutEffect(() => {
    if (!composerVisible || inputDisabled || chatPending) {
      composing.current = false;
      pendingSubmit.current = null;
      if (commitFrame.current !== null) {
        cancelAnimationFrame(commitFrame.current);
      }
      commitFrame.current = null;
    }
  }, [composerVisible, inputDisabled, chatPending]);
  useLayoutEffect(
    () => () => {
      pendingSubmit.current = null;
      if (commitFrame.current !== null) {
        cancelAnimationFrame(commitFrame.current);
      }
    },
    []
  );

  const submitCommittedText = (mode: ComposerMode) => {
    if (!composerVisible || inputDisabled || chatPending || submitDisabled) {
      return;
    }
    const text = inputRef.current?.value ?? draft;
    onDraftChange(text);
    onSubmit(mode, text);
  };
  const requestSubmit = (mode: ComposerMode) => {
    if (
      pendingSubmit.current ||
      !composerVisible ||
      inputDisabled ||
      chatPending ||
      submitDisabled
    ) {
      return;
    }
    const input = inputRef.current;
    if (composing.current && input) {
      // Let the IME commit in its native order, retaining the first chosen
      // action. Never send its provisional text or require another tap.
      pendingSubmit.current = { mode, input };
      input.blur();
      return;
    }
    submitCommittedText(mode);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !composing.current &&
      !event.nativeEvent.isComposing &&
      event.nativeEvent.keyCode !== 229
    ) {
      event.preventDefault();
      requestSubmit("question");
    }
  };
  const handleCompositionStart = (_event: CompositionEvent<HTMLTextAreaElement>) => {
    composing.current = true;
  };
  const handleCompositionEnd = (_event: CompositionEvent<HTMLTextAreaElement>) => {
    composing.current = false;
    if (!pendingSubmit.current) {
      return;
    }
    // Some engines dispatch the final input after compositionend. Read the DOM
    // on the following frame, after that input has updated the current draft.
    commitFrame.current = requestAnimationFrame(() => {
      commitFrame.current = null;
      const pending = pendingSubmit.current;
      pendingSubmit.current = null;
      if (pending && pending.input === inputRef.current && !composing.current) {
        submitCommittedText(pending.mode);
      }
    });
  };
  const advance = () => {
    if (composerVisible || chatPending) {
      return;
    }
    if (hasMore) {
      setPagination((current) => ({
        ...current,
        pageIndex: Math.min(current.pageIndex + 1, current.pages.length - 1),
      }));
      return;
    }
    if (message && actionLabel) {
      onAction(message.id);
    }
  };

  return (
    <section
      id="conversation"
      className="conversation game-ui-conversation"
      aria-label="会話"
      data-has-message={hasMessage ? "true" : "false"}
      data-composer-visible={composerVisible ? "true" : "false"}
      data-keyboard-raised={keyboardRaised ? "true" : undefined}
      hidden={!visible}
    >
      <div className="conversation-heading">
        <span id="speaker" className="speaker">
          {message?.speaker || defaultSpeaker}
        </span>
        <span id="turn-count" className="turn-count">
          {turnLabel}
        </span>
      </div>
      {leadingContent}
      <div
        id="log"
        className="log conversation-log"
        aria-live="polite"
        aria-atomic="false"
        data-page-overflow={activePageOverflow ? "true" : undefined}
        data-page-index={activePage ? String(pageIndex + 1) : undefined}
        data-page-count={pages.length ? String(pages.length) : undefined}
        data-page-start={activePage ? String(activePage.start) : undefined}
        data-page-end={activePage ? String(activePage.end) : undefined}
        ref={log}
        role={hasTranscript ? "log" : undefined}
        tabIndex={hasTranscript ? 0 : undefined}
        onScroll={hasTranscript ? handleTranscriptScroll : undefined}
        onWheelCapture={hasTranscript ? markTranscriptScrollIntent : undefined}
        onTouchMoveCapture={hasTranscript ? markTranscriptScrollIntent : undefined}
        onPointerDownCapture={hasTranscript ? handleTranscriptPointerDown : undefined}
        onPointerMoveCapture={hasTranscript ? handleTranscriptPointerMove : undefined}
        onKeyDownCapture={hasTranscript ? handleTranscriptKeyDown : undefined}
        onKeyUpCapture={hasTranscript ? handleTranscriptKeyUp : undefined}
      >
        {hasTranscript
          ? transcript?.map((entry) => (
              <p key={entry.id} className={`message ${entry.kind}`}>
                {entry.text}
              </p>
            ))
          : activePage && (
              <p className={`message ${message?.kind || "character"}`}>{activePage.text}</p>
            )}
        {trailingContent}
        <p
          className={`message ${message?.kind || "character"} message-probe`}
          aria-hidden="true"
          ref={probe}
        />
      </div>
      <output id="chat-pending" className="chat-pending-status" hidden={!chatPending}>
        回答を待っています…
      </output>
      <div id="actions" className="actions conversation-actions">
        {pageAction && (
          <button
            type="button"
            className={`primary-action${pageAction === "次へ" ? " advance-action" : ""}`}
            aria-label={pageAction}
            onClick={advance}
          >
            {pageAction === "次へ" ? (
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <path d="m4 7 6 7 6-7z" fill="currentColor" />
              </svg>
            ) : (
              pageAction
            )}
          </button>
        )}
      </div>
      <div id="composer" className="composer" hidden={!composerVisible}>
        <label id="input-label" htmlFor="question-input">
          質問・解答を入力
        </label>
        <textarea
          ref={inputRef}
          id="question-input"
          rows={2}
          maxLength={1000}
          value={draft}
          disabled={inputDisabled}
          placeholder="質問や答えを入力"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onFocus={() => {
            onEditorFocusChange(true);
            resizeComposerInput();
          }}
          onBlur={() => onEditorFocusChange(false)}
        />
        <div className="composer-footer">
          <button
            id="send-button"
            className="send-button"
            type="button"
            disabled={submitDisabled}
            onClick={() => requestSubmit("question")}
          >
            質問する
          </button>
          <button
            id="submit-answer-button"
            className="send-button"
            type="button"
            disabled={submitDisabled}
            onClick={() => requestSubmit("final_theory")}
          >
            解答する
          </button>
        </div>
      </div>
    </section>
  );
}

export type GameOption = { id: string; title: string };
export function SceneStage({
  background,
  guide,
  guideName,
  title,
  guideNode,
}: {
  background: string;
  guide: string;
  guideName: string;
  title: string;
  guideNode?: ReactNode;
}) {
  return (
    <>
      <div
        className="backdrop"
        aria-hidden="true"
        style={{ backgroundImage: `url("${background}")` }}
      />
      <div className="shade" aria-hidden="true" />
      <section className="stage" aria-label="物語の場面">
        {guideNode ?? <img id="guide" className="guide" src={guide} alt={guideName} />}
        <h1 id="game-title" className="sr-only">
          {title}
        </h1>
      </section>
    </>
  );
}

export function GameToolbar({
  showSelector = true,
  games,
  selectedId,
  timerLabel,
  status,
  statusState,
  menuOpen,
  onSelect,
  onProblem,
  onToggleMenu,
  selectRef,
  problemButtonRef,
  menuToggleRef,
}: {
  showSelector?: boolean;
  games: GameOption[];
  selectedId: string;
  timerLabel: string;
  status: string;
  statusState: string;
  menuOpen: boolean;
  onSelect: (id: string) => void;
  onProblem: () => void;
  onToggleMenu: () => void;
  selectRef?: RefObject<HTMLSelectElement | null>;
  problemButtonRef?: RefObject<HTMLButtonElement | null>;
  menuToggleRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="topbar">
      {showSelector && (
        <select
          id="game-select"
          aria-label="ゲームを選ぶ"
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
          ref={selectRef}
        >
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.title}
            </option>
          ))}
        </select>
      )}
      <button
        id="problem-button"
        className="problem-button"
        type="button"
        onClick={onProblem}
        ref={problemButtonRef}
      >
        問題文を見る
      </button>
      {timerLabel && (
        <span id="timer-label" className="timer-label" aria-label="残り時間">
          {timerLabel}
        </span>
      )}
      <output id="connection" className="connection sr-only" data-state={statusState}>
        {status}
      </output>
      <button
        id="menu-toggle"
        className="menu-toggle"
        type="button"
        aria-label="メニュー"
        aria-expanded={menuOpen}
        aria-controls="game-menu"
        onClick={onToggleMenu}
        ref={menuToggleRef}
      >
        ☰
      </button>
    </header>
  );
}

export function GameMenu({
  open,
  answerDisabled,
  onRules,
  onHistory,
  onHints,
  onAnswer,
  onReset,
  footer,
}: {
  open: boolean;
  answerDisabled: boolean;
  onRules: () => void;
  onHistory?: () => void;
  onHints: () => void;
  onAnswer: () => void;
  onReset: () => void;
  footer?: ReactNode;
}) {
  return (
    <nav id="game-menu" className="menu" hidden={!open} aria-label="ゲームメニュー">
      <button id="rules-button" type="button" onClick={onRules}>
        遊び方
      </button>
      {onHistory ? (
        <button id="history-button" type="button" onClick={onHistory}>
          会話履歴
        </button>
      ) : null}
      <button id="hints-button" type="button" onClick={onHints}>
        ヒント
      </button>
      <button id="answer-button" type="button" disabled={answerDisabled} onClick={onAnswer}>
        真相を見る
      </button>
      <button id="reset-button" type="button" onClick={onReset}>
        最初から
      </button>
      {footer}
    </nav>
  );
}

export function ReaderDialog({
  dialog,
  onClose,
  onCancel,
  children,
  footer,
}: {
  dialog: { title: string } | null;
  onClose: () => void;
  onCancel: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const element = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) {
      return;
    }
    if (dialog) {
      if (!node.open) {
        node.showModal();
        closeButton.current?.focus({ preventScroll: true });
      } else {
        // A fetched hint or new help page must retain an actual modal focus.
        content.current?.scrollTo({ top: 0 });
        content.current?.focus({ preventScroll: true });
      }
      const trapTab = (event: globalThis.KeyboardEvent) => {
        if (event.key !== "Tab" || !node.open) {
          return;
        }
        const targets = [
          ...node.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, [tabindex]"
          ),
        ].filter(
          (target) =>
            target.tabIndex >= 0 &&
            !target.matches(":disabled") &&
            target.getClientRects().length > 0
        );
        const first = targets[0];
        const last = targets.at(-1);
        const active = document.activeElement;
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const index = targets.indexOf(active as HTMLElement);
        if (index === -1) {
          (event.shiftKey ? last : first).focus();
        } else {
          targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
        }
      };
      // Native <dialog> modal focus navigation can escape to <body> in WebKit.
      // Listen on document so Tab is trapped even after the browser has moved
      // focus outside the dialog; a dialog-local handler cannot see that key.
      document.addEventListener("keydown", trapTab, true);
      return () => document.removeEventListener("keydown", trapTab, true);
    } else if (node.open) {
      node.close();
    }
  }, [dialog]);
  return (
    <dialog
      id="dialog"
      aria-labelledby="dialog-title"
      ref={element}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header className="dialog-header">
        <button
          className="dialog-close"
          ref={closeButton}
          type="button"
          aria-label="閉じる"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div id="dialog-content" ref={content} tabIndex={-1}>
        <h2 id="dialog-title">{dialog?.title || ""}</h2>
        {children}
      </div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </dialog>
  );
}

export function DialogParagraphs({ paragraphs }: { paragraphs: string[] }) {
  return (
    <>
      {paragraphs.map((text, index) => (
        <p key={`${index}-${text}`}>{text}</p>
      ))}
    </>
  );
}
