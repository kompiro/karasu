import { useCommand } from "../keyboard/use-command.js";

interface PreviewFocusShortcutProps {
  /** Toggles the preview's Focus (full-width) mode — wired to `togglePreviewFocus`. */
  onToggle: () => void;
}

/**
 * Registers the `mod+shift+f` "Toggle Preview Focus" keyboard command. It
 * toggles the preview's Focus mode (`previewFocused`), collapsing the editor
 * so the preview fills the full width — the same effect as the `↗ Focus` /
 * `↙ Exit Focus` toolbar button in `PreviewColumn`. Renders nothing.
 * (Issue #1458)
 *
 * Uses `whenTextInputFocused: "skip"`, so the shortcut is ignored while the
 * editor / a text input is focused and never disrupts typing.
 */
export function PreviewFocusShortcut({ onToggle }: PreviewFocusShortcutProps) {
  useCommand({
    id: "view.togglePreviewFocus",
    title: "Toggle Preview Focus",
    keybinding: "mod+shift+f",
    whenTextInputFocused: "skip",
    run: onToggle,
  });
  return null;
}
