/**
 * True on macOS — where the primary modifier (`mod`) is Cmd rather than Ctrl.
 */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const probe = navigator.platform || navigator.userAgent || "";
  return /mac/i.test(probe);
}

/**
 * The chord's key segment. Digit-row keys are taken from `event.code`
 * (`Digit0`–`Digit9`) rather than `event.key`, so that `shift` does not turn
 * `1` into a layout-dependent symbol (`!` on a US keyboard) — without this a
 * `mod+shift+1` keybinding would never match. Everything else uses the
 * lower-cased `event.key`. `code` is absent in some synthetic events (e.g. a
 * jsdom `fireEvent` with no `code`), so the fallback keeps bare-digit chords
 * like `mod+1` resolving there too.
 */
function chordKey(event: KeyboardEvent): string {
  const digit = /^Digit([0-9])$/.exec(event.code);
  if (digit) return digit[1];
  return event.key.toLowerCase();
}

/**
 * Serialize a keydown event into a chord string, e.g. `"mod+shift+b"`.
 * `mod` is Cmd on macOS, Ctrl elsewhere. Modifier order is fixed:
 * `mod`, `alt`, `shift`, then the key.
 */
export function eventToChord(event: KeyboardEvent): string {
  const parts: string[] = [];
  const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;
  if (mod) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(chordKey(event));
  return parts.join("+");
}

/**
 * True when focus is in a text input, textarea, contenteditable element, or an
 * element with an attached EditContext.
 *
 * The last is the Monaco editor in Chromium: it takes input through the
 * EditContext API on a plain `<div class="native-edit-context">`, which is
 * neither a textarea nor contenteditable. Checking only those two let every
 * `skip` shortcut fire while typing in the editor (#3207). Where EditContext
 * is not available Monaco still focuses a `<textarea>`.
 */
export function isTextInputFocused(): boolean {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((el as HTMLElement & { editContext?: unknown }).editContext) return true;
  return (el as HTMLElement).isContentEditable === true;
}
