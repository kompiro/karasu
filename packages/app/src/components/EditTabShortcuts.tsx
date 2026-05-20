import type { EditTab } from "./EditTabBar.js";
import { useCommand } from "../keyboard/use-command.js";

interface EditTabShortcutsProps {
  /** Activates an edit-pane tab (wired to `EditPane`'s `setActiveTab`). */
  onSelectTab: (tab: EditTab) => void;
}

/**
 * Registers keyboard shortcuts that switch the active edit-pane tab —
 * `mod+shift+1` for Editor, `mod+shift+2` for Chat, mirroring the
 * `EditTabBar` tab order. Renders nothing. (Issue #1462)
 *
 * Unlike the diagram-view shortcuts (`DiagramViewShortcuts`), these use
 * `whenTextInputFocused: "allow"`: switching away from the Editor implies the
 * Monaco editor (a `<textarea>`) is focused, and switching to the Editor from
 * Chat implies the Chat input is focused — a `"skip"` policy would make the
 * shortcuts dead exactly when they are needed. `mod+shift+1` / `mod+shift+2`
 * are not browser-reserved and are deliberate chords, so firing them while
 * typing is safe.
 *
 * Settings (`mod+shift+3`) is intentionally left unbound — it is a
 * configuration screen, not a primary working tab.
 *
 * Switching to the already-active tab is a harmless no-op.
 */
export function EditTabShortcuts({ onSelectTab }: EditTabShortcutsProps) {
  useCommand({
    id: "editView.showEditor",
    title: "Show Editor",
    keybinding: "mod+shift+1",
    whenTextInputFocused: "allow",
    run: () => onSelectTab("editor"),
  });
  useCommand({
    id: "editView.showChat",
    title: "Show Chat",
    keybinding: "mod+shift+2",
    whenTextInputFocused: "allow",
    run: () => onSelectTab("chat"),
  });
  return null;
}
