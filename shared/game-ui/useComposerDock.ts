import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from "react";
import type { RefObject } from "react";

type DockOptions = {
  enabled: boolean;
  sessionKey: string;
  appRef: RefObject<HTMLElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
};

type PendingMotion = {
  kind: "flip" | "fade";
  fromY: number;
  sessionKey: string;
};

const FOCUS_REVEAL_HOLD_MS = 300;

const readNumber = (value: string | null | undefined, fallback: number) => {
  const parsed = Number.parseFloat(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Raises the composer on actual textarea focus and returns it after keyboard occlusion closes. */
export function useComposerDock({ enabled, sessionKey, appRef, inputRef }: DockOptions) {
  const [raised, setRaised] = useState(false);
  const raisedRef = useRef(false);
  const sawKeyboardInset = useRef(false);
  const rotationPending = useRef(false);
  const lastViewportWidth = useRef<number | null>(null);
  const readFrame = useRef<number | null>(null);
  const currentSessionKey = useRef(sessionKey);
  const pendingMotion = useRef<PendingMotion | null>(null);
  const activeMotion = useRef<Animation | null>(null);
  const focusRevealTimer = useRef<number | null>(null);
  const focusRevealInput = useRef<HTMLTextAreaElement | null>(null);
  const focusRevealRearmPending = useRef(false);
  const actionPress = useRef<number | null>(null);
  const deferredLower = useRef(false);

  const cancelMotion = useCallback(() => {
    const animation = activeMotion.current;
    activeMotion.current = null;
    pendingMotion.current = null;
    if (animation) {
      animation.onfinish = null;
      animation.cancel();
    }
  }, []);

  const setRaisedState = useCallback((value: boolean, animate = true) => {
    // A native button click arrives after focus/keyboard-close events. Keep its
    // target in place through that press; never submit from a pointer event.
    if (!value && actionPress.current !== null) {
      deferredLower.current = true;
      return;
    }
    deferredLower.current = false;
    if (raisedRef.current === value) return;
    const panel = document.getElementById("conversation");
    const oldRect = panel?.getBoundingClientRect();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const coarseOrNarrow = (window.matchMedia?.("(any-pointer: coarse)").matches ?? false) || window.innerWidth <= 650;
    cancelMotion();
    if (animate && panel && !reducedMotion && typeof panel.animate === "function") {
      pendingMotion.current = {
        kind: coarseOrNarrow ? "fade" : "flip",
        fromY: oldRect?.y ?? 0,
        sessionKey,
      };
    }
    raisedRef.current = value;
    setRaised(value);
  }, [cancelMotion, sessionKey]);

  const currentInset = useCallback(() => {
    const app = appRef.current;
    return app ? readNumber(getComputedStyle(app).getPropertyValue("--keyboard-inset"), 0) : 0;
  }, [appRef]);

  const currentViewportWidth = useCallback(() => {
    const viewport = window.visualViewport;
    return readNumber(String(viewport?.width ?? window.innerWidth), window.innerWidth);
  }, []);

  const usesNativeTouchWebKit = useCallback(() =>
    typeof CSS !== "undefined" &&
    CSS.supports("-webkit-touch-callout", "none") &&
    (window.matchMedia?.("(any-pointer: coarse)").matches ?? false),
  []);

  const clearFocusReveal = useCallback(() => {
    if (focusRevealTimer.current !== null) {
      window.clearTimeout(focusRevealTimer.current);
      focusRevealTimer.current = null;
    }
    const input = focusRevealInput.current ?? inputRef.current;
    focusRevealInput.current = null;
    if (input && document.activeElement === input) {
      input.setAttribute("data-focus-reveal-ready", "");
    } else {
      input?.removeAttribute("data-focus-reveal-ready");
    }
  }, [inputRef]);

  const holdNativeFocusReveal = useCallback((input: HTMLTextAreaElement) => {
    clearFocusReveal();
    if (!enabled || input.disabled || !usesNativeTouchWebKit()) return;
    input.removeAttribute("data-focus-reveal-ready");
    input.setAttribute("data-focus-reveal-guard", "");
    focusRevealInput.current = input;
    const expectedSession = sessionKey;
    focusRevealTimer.current = window.setTimeout(() => {
      if (
        !enabled ||
        currentSessionKey.current !== expectedSession ||
        inputRef.current !== input ||
        document.activeElement !== input
      ) return;
      input.setAttribute("data-focus-reveal-ready", "");
      focusRevealInput.current = null;
      focusRevealTimer.current = null;
    }, FOCUS_REVEAL_HOLD_MS);
  }, [clearFocusReveal, enabled, inputRef, sessionKey, usesNativeTouchWebKit]);

  const onFocus = useCallback(() => {
    const input = inputRef.current;
    if (!enabled || !input || document.activeElement !== input) return;
    holdNativeFocusReveal(input);
    if (!raisedRef.current) setRaisedState(true);
    sawKeyboardInset.current = currentInset() > 1;
    lastViewportWidth.current = currentViewportWidth();
    document.getElementById("conversation")?.getBoundingClientRect();
  }, [currentInset, currentViewportWidth, enabled, holdNativeFocusReveal, inputRef, setRaisedState]);

  const onBlur = useCallback((_event?: FocusEvent<HTMLTextAreaElement>) => {
    clearFocusReveal();
    _event?.currentTarget.removeAttribute("data-focus-reveal-ready");
    focusRevealRearmPending.current = false;
    sawKeyboardInset.current = false;
    rotationPending.current = false;
    lastViewportWidth.current = null;
    setRaisedState(false);
  }, [clearFocusReveal, setRaisedState]);

  const focusInput = useCallback(() => {
    const input = inputRef.current;
    if (!input || !enabled || document.activeElement === input) return;
    // The native focus event is the sole focus trigger for raising the dock.
    input.focus({ preventScroll: true });
  }, [enabled, inputRef]);

  useLayoutEffect(() => {
    const app = appRef.current;
    if (!enabled || !app) return;
    let releaseTimer: number | null = null;
    let frozenInput: { input: HTMLTextAreaElement; height: string; pinned: string } | null = null;
    let frozenPanel: { panel: HTMLElement; top: string; pinned: string; height: string; bottom: string; pinnedHeight: string; rows: string; pinnedRows: string } | null = null;
    let frozenShortLayout: { panel: HTMLElement; previous: string | null } | null = null;
    const restoreInputHeight = () => {
      const resizedInput = frozenInput?.input;
      if (frozenShortLayout) {
        const { panel, previous } = frozenShortLayout;
        if (previous === null) panel.removeAttribute("data-short-press");
        else panel.setAttribute("data-short-press", previous);
        frozenShortLayout = null;
      }
      if (frozenPanel) {
        const { panel, top, pinned, height, bottom, pinnedHeight, rows, pinnedRows } = frozenPanel;
        if (panel.style.top === pinned) panel.style.top = top;
        if (panel.style.height === pinnedHeight) panel.style.height = height;
        if (panel.style.bottom === "auto") panel.style.bottom = bottom;
        if (panel.style.gridTemplateRows === pinnedRows) panel.style.gridTemplateRows = rows;
      }
      frozenPanel = null;
      if (frozenInput && frozenInput.input.style.height === frozenInput.pinned) {
        frozenInput.input.style.height = frozenInput.height;
      }
      frozenInput = null;
      resizedInput?.dispatchEvent(new Event("composer-resize"));
    };
    const clearTimer = () => {
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      releaseTimer = null;
    };
    const release = () => {
      clearTimer();
      restoreInputHeight();
      actionPress.current = null;
      if (deferredLower.current) setRaisedState(false);
    };
    const releaseAfter = (delay: number) => {
      clearTimer();
      releaseTimer = window.setTimeout(release, delay);
    };
    const press = (event: globalThis.PointerEvent) => {
      const button = (event.target as Element).closest?.(".composer-footer button");
      if (!event.isPrimary || event.button !== 0 || !button ||
          (button as HTMLButtonElement).disabled || document.activeElement !== inputRef.current) return;
      clearTimer();
      restoreInputHeight();
      const panel = document.getElementById("conversation");
      if (panel) {
        // Keep the same responsive layout until native click, even when blur
        // closes the keyboard midway through this physical button press.
        frozenShortLayout = { panel, previous: panel.getAttribute("data-short-press") };
        panel.setAttribute("data-short-press", String(app.dataset.shortViewport === "true"));
        // Short viewports use a smaller top gap. Freeze it through native click,
        // just like the input height, while keyboard-close events resize the UI.
        const pinned = getComputedStyle(panel).top;
        const pinnedHeight = `${panel.getBoundingClientRect().height}px`;
        const pinnedRows = getComputedStyle(panel).gridTemplateRows;
        frozenPanel = { panel, top: panel.style.top, pinned, height: panel.style.height, bottom: panel.style.bottom, pinnedHeight, rows: panel.style.gridTemplateRows, pinnedRows };
        // A full-height chat changes height when VisualViewport grows on blur.
        // Preserve this physical press's whole frame until its native click.
        panel.style.top = pinned;
        panel.style.height = pinnedHeight;
        frozenPanel.pinnedHeight = panel.style.height;
        panel.style.bottom = "auto";
        panel.style.gridTemplateRows = pinnedRows;
        frozenPanel.pinnedRows = panel.style.gridTemplateRows;
      }
      const input = inputRef.current;
      if (input) {
        // The responsive textarea can grow as the keyboard closes even while
        // the dock stays raised. Pin only this gesture's height, then restore it.
        const pinned = `${input.getBoundingClientRect().height}px`;
        frozenInput = { input, height: input.style.height, pinned };
        input.style.height = pinned;
      }
      actionPress.current = event.pointerId;
    };
    const pointerUp = (event: globalThis.PointerEvent) => {
      if (event.pointerId === actionPress.current) {
        // The native click releases this on the next task. This fallback only
        // restores layout if a browser ends a press without producing a click.
        releaseAfter(500);
      }
    };
    const cancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === actionPress.current) release();
    };
    const click = () => { if (actionPress.current !== null) releaseAfter(0); };
    const visibility = () => { if (document.hidden) release(); };
    app.addEventListener("pointerdown", press, true);
    app.addEventListener("click", click, true);
    window.addEventListener("pointerup", pointerUp, true);
    window.addEventListener("pointercancel", cancel, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimer();
      restoreInputHeight();
      actionPress.current = null;
      deferredLower.current = false;
      app.removeEventListener("pointerdown", press, true);
      app.removeEventListener("click", click, true);
      window.removeEventListener("pointerup", pointerUp, true);
      window.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [appRef, enabled, inputRef, sessionKey, setRaisedState]);

  useLayoutEffect(() => {
    const motion = pendingMotion.current;
    if (!motion) return;
    pendingMotion.current = null;
    if (motion.sessionKey !== sessionKey) return;
    const panel = document.getElementById("conversation");
    if (!panel) return;
    const newY = panel.getBoundingClientRect().y;
    const deltaY = motion.fromY - newY;
    const baseTransform = getComputedStyle(panel).transform;
    const keyframes: Keyframe[] = motion.kind === "flip"
      ? [
        { transform: `${baseTransform === "none" ? "" : baseTransform} translateY(${deltaY}px)` },
        { transform: baseTransform },
      ]
      : [{ opacity: 0.78 }, { opacity: 1 }];
    if (motion.kind === "flip" && Math.abs(deltaY) < 1) return;
    const animation = panel.animate(keyframes, {
      duration: motion.kind === "flip" ? 180 : 120,
      easing: "ease-out",
    });
    activeMotion.current = animation;
    animation.onfinish = () => {
      if (activeMotion.current !== animation) return;
      activeMotion.current = null;
      animation.cancel();
    };
  }, [raised, sessionKey]);

  useEffect(() => {
    const sessionChanged = currentSessionKey.current !== sessionKey;
    currentSessionKey.current = sessionKey;
    if (enabled && !sessionChanged) return;
    clearFocusReveal();
    focusRevealRearmPending.current = false;
    sawKeyboardInset.current = false;
    rotationPending.current = false;
    lastViewportWidth.current = null;
    cancelMotion();
    if (raisedRef.current) setRaisedState(false, false);
  }, [cancelMotion, clearFocusReveal, enabled, sessionKey, setRaisedState]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!enabled || !input || !usesNativeTouchWebKit()) return;
    // Install the focus guard before the input can receive its first native focus.
    input.setAttribute("data-focus-reveal-guard", "");
    const onPointerDown = () => {
      const viewport = window.visualViewport;
      const scale = readNumber(String(viewport?.scale ?? 1), 1);
      if (
        input.disabled ||
        document.activeElement !== input ||
        currentInset() > 1 ||
        Math.abs(scale - 1) > 0.01 ||
        !focusRevealRearmPending.current
      ) return;
      // A retained focus after keyboard dismissal may not emit focus again.
      // Re-arm only after this focused input observed a real keyboard close.
      focusRevealRearmPending.current = false;
      holdNativeFocusReveal(input);
    };
    input.addEventListener("pointerdown", onPointerDown);
    return () => {
      input.removeEventListener("pointerdown", onPointerDown);
      clearFocusReveal();
      input.removeAttribute("data-focus-reveal-guard");
    };
  }, [clearFocusReveal, currentInset, enabled, holdNativeFocusReveal, inputRef, sessionKey, usesNativeTouchWebKit]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onPreferenceChange = () => cancelMotion();
    const viewport = window.visualViewport;
    media?.addEventListener("change", onPreferenceChange);
    viewport?.addEventListener("resize", onPreferenceChange);
    window.addEventListener("resize", onPreferenceChange);
    return () => {
      media?.removeEventListener("change", onPreferenceChange);
      viewport?.removeEventListener("resize", onPreferenceChange);
      window.removeEventListener("resize", onPreferenceChange);
      cancelMotion();
    };
  }, [cancelMotion]);

  useEffect(() => {
    const app = appRef.current;
    if (!enabled || !app) return;
    let disposed = false;
    const viewport = window.visualViewport;
    let rotationCheckScheduled = false;

    const readKeyboardState = (source: "style" | "viewport" | "stable") => {
      if (disposed) return;
      const width = currentViewportWidth();
      const widthChanged = lastViewportWidth.current !== null && Math.abs(width - lastViewportWidth.current) > 1;
      lastViewportWidth.current = width;
      if (widthChanged) rotationPending.current = true;

      const inset = currentInset();
      if (inset > 1) {
        const inputFocused = document.activeElement === inputRef.current;
        sawKeyboardInset.current = inputFocused;
        focusRevealRearmPending.current = false;
        if (inputFocused && !raisedRef.current) setRaisedState(true);
        return;
      }
      if (!sawKeyboardInset.current) return;
      const scale = readNumber(String(viewport?.scale ?? 1), 1);
      if (Math.abs(scale - 1) > 0.01) return;
      // A rotation can transiently report zero occlusion; wait for a stable viewport event.
      if (rotationPending.current) {
        if (widthChanged || source === "style") {
          // Some browsers emit only the resize event that changes width and height.
          // Recheck once on the next frame rather than waiting for a second event.
          if (!rotationCheckScheduled && readFrame.current === null) {
            rotationCheckScheduled = true;
            readFrame.current = window.requestAnimationFrame(() => {
              readFrame.current = null;
              rotationCheckScheduled = false;
              readKeyboardState("stable");
            });
          }
          return;
        }
        if (source !== "viewport" && source !== "stable") return;
        rotationPending.current = false;
      }
      sawKeyboardInset.current = false;
      if (document.activeElement === inputRef.current) {
        focusRevealRearmPending.current = true;
      }
      setRaisedState(false);
    };

    const scheduleViewportRead = () => {
      if (readFrame.current !== null) return;
      readFrame.current = window.requestAnimationFrame(() => {
        readFrame.current = null;
        readKeyboardState("viewport");
      });
    };
    const observer = new MutationObserver(() => readKeyboardState("style"));
    observer.observe(app, { attributes: true, attributeFilter: ["style"] });
    viewport?.addEventListener("resize", scheduleViewportRead);
    viewport?.addEventListener("scroll", scheduleViewportRead);
    window.addEventListener("resize", scheduleViewportRead);
    return () => {
      disposed = true;
      observer.disconnect();
      viewport?.removeEventListener("resize", scheduleViewportRead);
      viewport?.removeEventListener("scroll", scheduleViewportRead);
      window.removeEventListener("resize", scheduleViewportRead);
      if (readFrame.current !== null) window.cancelAnimationFrame(readFrame.current);
      readFrame.current = null;
    };
  }, [appRef, currentInset, currentViewportWidth, enabled, inputRef, sessionKey, setRaisedState]);

  return { raised, onFocus, onBlur, focusInput };
}
