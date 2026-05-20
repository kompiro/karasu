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
 * True when focus is in a text input, textarea, or contenteditable element.
 * The Monaco editor's focus target is a `<textarea>`, so editor focus is
 * covered by the textarea check.
 */
export function isTextInputFocused(): boolean {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return (el as HTMLElement).isContentEditable === true;
}
