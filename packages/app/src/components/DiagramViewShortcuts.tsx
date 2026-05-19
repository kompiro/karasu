import type { ActiveView } from "../state/app-reducer.js";
import { useCommand } from "../keyboard/use-command.js";

interface DiagramViewShortcutsProps {
  /** Switches the active diagram view (wired to `navigateActiveView`). */
  onActiveViewChange: (view: ActiveView) => void;
}

/**
 * Registers keyboard shortcuts that switch the active diagram view —
 * `mod+1..4` for System / Deploy / Org / Matrix, mirroring the
 * `DiagramTabBar` tab order. Renders nothing. (Issue #1423)
 *
 * All four commands use `whenTextInputFocused: "skip"`, so they are ignored
 * while the editor / a text input is focused and never disrupt typing.
 *
 * Switching to a view that has no diagram for the current document is a
 * harmless no-op: the dispatch always succeeds and the preview shows that
 * view's empty state — it never raises an error.
 */
export function DiagramViewShortcuts({ onActiveViewChange }: DiagramViewShortcutsProps) {
  useCommand({
    id: "view.showSystem",
    title: "Show System View",
    keybinding: "mod+1",
    whenTextInputFocused: "skip",
    run: () => onActiveViewChange("system"),
  });
  useCommand({
    id: "view.showDeploy",
    title: "Show Deploy View",
    keybinding: "mod+2",
    whenTextInputFocused: "skip",
    run: () => onActiveViewChange("deploy"),
  });
  useCommand({
    id: "view.showOrg",
    title: "Show Org View",
    keybinding: "mod+3",
    whenTextInputFocused: "skip",
    run: () => onActiveViewChange("org"),
  });
  useCommand({
    id: "view.showMatrix",
    title: "Show CRUD Matrix View",
    keybinding: "mod+4",
    whenTextInputFocused: "skip",
    run: () => onActiveViewChange("matrix"),
  });
  return null;
}
