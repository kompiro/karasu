import { useCallback, useMemo, useState } from "react";
import { EditPane } from "./EditPane.js";
import { SidebarCollapseContext } from "./sidebar-collapse-context.js";

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
  viewPath: string[];
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
  viewPath,
  currentProjectId,
  resolvedSystems,
  onNavigateViewPath,
  onFormat,
  hasParseErrors,
}: EditAreaProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const hasSidebar = !!sidebarContent;
  const toggle = useCallback(() => setSidebarCollapsed((v) => !v), []);
  const collapseValue = useMemo(
    () => ({ collapsed: sidebarCollapsed, toggle }),
    [sidebarCollapsed, toggle],
  );

  const className = [
    "edit-area",
    hasSidebar && "has-sidebar",
    sidebarCollapsed && "sidebar-collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {hasSidebar && (
        <SidebarCollapseContext.Provider value={collapseValue}>
          <div className="sidebar-area">{sidebarContent}</div>
        </SidebarCollapseContext.Provider>
      )}
      {hasSidebar && sidebarCollapsed && !previewFocused && (
        <button
          className="toolbar-btn toolbar-btn--sidebar-toggle"
          onClick={toggle}
          aria-label="Expand sidebar"
        >
          » Expand
        </button>
      )}
      <EditPane
        value={value}
        currentFilePath={currentFilePath}
        onChange={onChange}
        onEditorReady={onEditorReady}
        scopeLabel={scopeLabel}
        viewPath={viewPath}
        currentProjectId={currentProjectId}
        resolvedSystems={resolvedSystems}
        onNavigateViewPath={onNavigateViewPath}
        onFormat={onFormat}
        hasParseErrors={hasParseErrors}
      />
    </div>
  );
}
