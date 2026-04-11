import type { LeftTab } from "./LeftTabBar.js";

interface LeftPaneToolbarProps {
  activeTab: LeftTab;
  onFormat?: () => void;
  hasParseErrors?: boolean;
}

export function LeftPaneToolbar({ activeTab, onFormat, hasParseErrors }: LeftPaneToolbarProps) {
  if (activeTab !== "editor" || !onFormat) return null;

  return (
    <div className="left-pane-toolbar">
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
