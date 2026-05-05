import { useCallback, useEffect, useRef, useState } from "react";
import { EditPane } from "./EditPane.js";

import type { CSSProperties, ReactNode } from "react";
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

const SIDEBAR_WIDTH_STORAGE_KEY = "karasu:sidebar:width";
const SIDEBAR_DEFAULT_WIDTH = 210;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;

function readPersistedWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const raw = window.localStorage?.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  if (!raw) return SIDEBAR_DEFAULT_WIDTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, parsed));
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
  const [sidebarWidth, setSidebarWidth] = useState<number>(readPersistedWidth);
  const hasSidebar = !!sidebarContent;
  const toggle = useCallback(() => setSidebarCollapsed((v) => !v), []);

  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStateRef.current = {
      startX: e.clientX,
      startWidth:
        e.currentTarget.parentElement?.getBoundingClientRect().width ?? SIDEBAR_DEFAULT_WIDTH,
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, state.startWidth + (e.clientX - state.startX)),
      );
      setSidebarWidth(next);
    };
    const onUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const handleResizeReset = useCallback(() => {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
  }, []);

  const className = [
    "edit-area",
    hasSidebar && "has-sidebar",
    sidebarCollapsed && "sidebar-collapsed",
    isDragging && "sidebar-dragging",
  ]
    .filter(Boolean)
    .join(" ");

  const style = { "--sidebar-w": `${sidebarWidth}px` } as CSSProperties;

  return (
    <div className={className} style={style}>
      {hasSidebar && !previewFocused && (
        <nav className="activity-bar" aria-label="Activity Bar">
          <button
            type="button"
            className={`activity-bar-btn${sidebarCollapsed ? "" : " activity-bar-btn--active"}`}
            onClick={toggle}
            aria-label={sidebarCollapsed ? "Show files" : "Hide files"}
            aria-pressed={!sidebarCollapsed}
            title={sidebarCollapsed ? "Show files" : "Hide files"}
          >
            <span className="activity-bar-btn__icon" aria-hidden="true">
              {/* File-tree glyph */}
              <svg
                viewBox="0 0 16 16"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <path d="M2 3.5h4l1.5 1.5H14v8H2z" />
                <path d="M2 6.5h12" />
              </svg>
            </span>
            <span className="activity-bar-btn__label">Files</span>
          </button>
        </nav>
      )}
      {hasSidebar && !sidebarCollapsed && (
        <div className="sidebar-area">
          {sidebarContent}
          {!previewFocused && (
            <div
              className="sidebar-resize-handle"
              onMouseDown={handleResizeStart}
              onDoubleClick={handleResizeReset}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
          )}
        </div>
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
