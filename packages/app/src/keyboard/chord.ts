/**
 * True on macOS — where the primary modifier (`mod`) is Cmd rather than Ctrl.
 */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const probe = navigator.platform || navigator.userAgent || "";
  return /mac/i.test(probe);
}

/**
 * Serialize a keydown event into a chord string, e.g. `"mod+shift+b"`.
 * `mod` is Cmd on macOS, Ctrl elsewhere. Modifier order is fixed:
 * `mod`, `alt`, `shift`, then the lower-cased key.
 */
export function eventToChord(event: KeyboardEvent): string {
  const parts: string[] = [];
  const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;
  if (mod) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(event.key.toLowerCase());
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
