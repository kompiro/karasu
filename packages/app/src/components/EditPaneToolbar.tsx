import type { EditTab } from "./EditTabBar.js";

interface EditPaneToolbarProps {
  activeTab: EditTab;
  onFormat?: () => void;
  onTidyStyle?: () => void;
  hasParseErrors?: boolean;
}

export function EditPaneToolbar({
  activeTab,
  onFormat,
  onTidyStyle,
  hasParseErrors,
}: EditPaneToolbarProps) {
  if (activeTab !== "editor") return null;
  if (!onFormat && !onTidyStyle) return null;

  return (
    <div className="edit-pane-toolbar">
      {onFormat && (
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
      )}
      {onTidyStyle && (
        <button
          className="toolbar-btn toolbar-btn--actionable toolbar-btn--tidy-style"
          onClick={onTidyStyle}
          title="Tidy this .krs.style file (merge duplicates, group properties by axis)"
        >
          ✨ Tidy
        </button>
      )}
    </div>
  );
}
