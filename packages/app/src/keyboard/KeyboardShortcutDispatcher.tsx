import { useEffect } from "react";
import { useCommandRegistry } from "./command-context.js";
import { eventToChord, isTextInputFocused } from "./chord.js";

/**
 * Installs the single document-level `keydown` listener that drives keyboard
 * shortcuts. Renders nothing. Mount once, inside a `CommandProvider`.
 *
 * A shortcut whose command is `whenTextInputFocused: "skip"` (the default) is
 * ignored while a text input / the editor is focused, so typing is never
 * disrupted.
 */
export function KeyboardShortcutDispatcher() {
  const { resolveChord } = useCommandRegistry();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveChord(eventToChord(event));
      if (!command) return;
      const policy = command.whenTextInputFocused ?? "skip";
      if (policy === "skip" && isTextInputFocused()) return;
      event.preventDefault();
      command.run();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [resolveChord]);

  return null;
}
