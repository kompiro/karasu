import type { EditTab } from "./EditTabBar.js";

interface EditPaneToolbarProps {
  activeTab: EditTab;
  onFormat?: () => void;
  hasParseErrors?: boolean;
}

export function EditPaneToolbar({ activeTab, onFormat, hasParseErrors }: EditPaneToolbarProps) {
  if (activeTab !== "editor" || !onFormat) return null;

  return (
    <div className="edit-pane-toolbar">
      <button
        className="toolbar-btn toolbar-btn--actionable toolbar-btn--format"
        onClick={onFormat}
        disabled={hasParseErrors}
        title={
          hasParseErrors
            ? "Cannot format: source has parse errors"
            : "Format document (Shift+Alt+F)"
        }
      >
        ⌥ Format
      </button>
    </div>
  );
}
