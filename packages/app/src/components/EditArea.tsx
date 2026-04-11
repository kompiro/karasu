import { useState } from "react";
import { EditPane } from "./EditPane.js";

import type { ReactNode } from "react";
import type { editor } from "monaco-editor";
import type { SystemNode } from "@karasu-tools/core";

interface EditAreaProps {
  sidebarContent?: ReactNode;
  previewFocused: boolean;
  // EditPane props
  value: string;
  currentFilePath: string | null;
  onChange: (value: string) => void;
  onEditorReady?: (editor: editor.IStandaloneCodeEditor) => void;
  scopeLabel: string;
  currentProjectId: string | null;
  resolvedSystems: SystemNode[];
  onNavigateViewPath: (path: string[]) => void;
  onFormat?: () => void;
  hasParseErrors?: boolean;
}

export function EditArea({
  sidebarContent,
  previewFocused,
  value,
  currentFilePath,
  onChange,
  onEditorReady,
  scopeLabel,
  currentProjectId,
  resolvedSystems,
  onNavigateViewPath,
  onFormat,
  hasParseErrors,
}: EditAreaProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const hasSidebar = !!sidebarContent;

  const className = [
    "edit-area",
    hasSidebar && "has-sidebar",
    sidebarCollapsed && "sidebar-collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {hasSidebar && <div className="sidebar-area">{sidebarContent}</div>}
      {hasSidebar && !previewFocused && (
        <button
          className="toolbar-btn toolbar-btn--sidebar-toggle"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? "» Expand" : "« Collapse"}
        </button>
      )}
      <EditPane
        value={value}
        currentFilePath={currentFilePath}
        onChange={onChange}
        onEditorReady={onEditorReady}
        scopeLabel={scopeLabel}
        currentProjectId={currentProjectId}
        resolvedSystems={resolvedSystems}
        onNavigateViewPath={onNavigateViewPath}
        onFormat={onFormat}
        hasParseErrors={hasParseErrors}
      />
    </div>
  );
}
