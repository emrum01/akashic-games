import type { CSSProperties } from "react";

declare const gameAccentBrand: unique symbol;
export type GameAccent = string & { readonly [gameAccentBrand]: true };
export type GameTheme = { accent?: GameAccent };
export type GameThemeStyle = CSSProperties & { "--game-ui-accent": string };

export const DEFAULT_GAME_ACCENT = "#c6a56c" as GameAccent;

/** Parse untrusted theme input into the only accent value accepted by GameTheme. */
export function parseGameAccent(value: string): GameAccent | null {
  return /^#[\da-f]{6}$/i.test(value) ? value as GameAccent : null;
}

/** The shared UI intentionally supports only six-digit sRGB accent colors. */
export function gameThemeStyle(accent?: string | null): GameThemeStyle {
  const supportedAccent = typeof accent === "string" ? parseGameAccent(accent) || DEFAULT_GAME_ACCENT : DEFAULT_GAME_ACCENT;
  return { "--game-ui-accent": supportedAccent } as GameThemeStyle;
}
