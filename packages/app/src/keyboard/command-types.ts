type Letter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type NamedKey =
  | "escape"
  | "enter"
  | "tab"
  | "backspace"
  | "delete"
  | "arrowup"
  | "arrowdown"
  | "arrowleft"
  | "arrowright"
  | "home"
  | "end"
  | "pageup"
  | "pagedown";

/**
 * The key segment of a chord, as `eventToChord` writes it: a lower-case
 * `event.key`, or the digit of a `Digit0`–`Digit9` code. A closed union, so a
 * chord with an upper-case key or a key the dispatcher never produces does not
 * type-check. Add a key here when a command needs it.
 */
export type ChordKey = Letter | Digit | NamedKey;

/**
 * A key chord in the one order `eventToChord` produces: `mod`, `alt`, `shift`,
 * then the key (TPL-1419). Each modifier is optional, but the order is fixed
 * by the type, so `"shift+mod+b"` or `"ctrl+b"` cannot be written as a
 * keybinding and silently never match.
 */
export type Chord = `${"" | "mod+"}${"" | "alt+"}${"" | "shift+"}${ChordKey}`;

/**
 * A user-invokable action. A `Command` is both a keybinding target and a
 * future command-palette entry — see ADR-1411.
 */
export interface Command {
  /** Stable, unique, dot-namespaced id (e.g. `"view.toggleSidebar"`). */
  id: string;
  /** Human-readable title, shown in the command palette. */
  title: string;
  /**
   * Key chord that triggers the command, e.g. `"mod+b"` or `"mod+shift+p"`.
   * `mod` is Cmd on macOS, Ctrl elsewhere. Modifier order is fixed:
   * `mod`, `alt`, `shift`, then the key; the `Chord` type enforces it. Omit
   * for palette-only commands.
   */
  keybinding?: Chord;
  /**
   * Whether the shortcut fires while a text input / the editor is focused.
   * - `"skip"` (default) — ignored, so typing is never disrupted.
   * - `"allow"` — fires regardless (e.g. opening the command palette).
   */
  whenTextInputFocused?: "skip" | "allow";
  /** Performs the command. */
  run: () => void;
}
