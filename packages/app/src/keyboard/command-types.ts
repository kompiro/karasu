/**
 * A user-invokable action. A `Command` is both a keybinding target and a
 * future command-palette entry — see `docs/design/app-keyboard-shortcuts.md`.
 */
export interface Command {
  /** Stable, unique, dot-namespaced id (e.g. `"view.toggleSidebar"`). */
  id: string;
  /** Human-readable title, shown in the command palette. */
  title: string;
  /**
   * Key chord that triggers the command, e.g. `"mod+b"` or `"mod+shift+p"`.
   * `mod` is Cmd on macOS, Ctrl elsewhere. Modifier order is fixed:
   * `mod`, `alt`, `shift`, then the key. Omit for palette-only commands.
   */
  keybinding?: string;
  /**
   * Whether the shortcut fires while a text input / the editor is focused.
   * - `"skip"` (default) — ignored, so typing is never disrupted.
   * - `"allow"` — fires regardless (e.g. opening the command palette).
   */
  whenTextInputFocused?: "skip" | "allow";
  /** Performs the command. */
  run: () => void;
}
