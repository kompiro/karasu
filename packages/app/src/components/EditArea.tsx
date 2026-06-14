import { useCallback, useState, type MouseEvent } from "react";
import { useCommand } from "../keyboard/use-command.js";
import { usePersistedPanelWidth } from "../hooks/usePersistedPanelWidth.js";

import type { CSSProperties, ReactNode } from "react";

type SidebarView = "files" | "outline";

interface EditAreaProps {
  /** Files view content (the file tree). */
  sidebarContent?: ReactNode;
  /** Outline view content (the AST outline). Enables the Outline activity-bar button. */
  outlineContent?: ReactNode;
  previewFocused: boolean;
  /**
   * The editor pane (`<EditPane />`), composed by the host. EditArea only owns
   * the sidebar / activity-bar / resize chrome and renders this in the main
   * column — it does not thread editor or chat props (#1545).
   */
  editorContent: ReactNode;
}

const SIDEBAR_WIDTH_STORAGE_KEY = "karasu:sidebar:width";
const SIDEBAR_DEFAULT_WIDTH = 210;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 480;

const clampSidebarWidth = (width: number): number =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));

export function EditArea({
  sidebarContent,
  outlineContent,
  previewFocused,
  editorContent,
}: EditAreaProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarView, setSidebarView] = useState<SidebarView>("files");
  const measureSidebarStart = useCallback(
    (e: MouseEvent) =>
      e.currentTarget.parentElement?.getBoundingClientRect().width ?? SIDEBAR_DEFAULT_WIDTH,
    [],
  );
  const {
    width: sidebarWidthRaw,
    isDragging,
    onMouseDown: handleResizeStart,
    onDoubleClick: handleResizeReset,
  } = usePersistedPanelWidth({
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    clamp: clampSidebarWidth,
    measureStart: measureSidebarStart,
    // Fixed min/max — safe to clamp the persisted value on hydration (matches
    // the prior read-time clamp).
    clampInitial: true,
  });
  // defaultWidth is a number, so width is never null here.
  const sidebarWidth = sidebarWidthRaw ?? SIDEBAR_DEFAULT_WIDTH;
  const hasSidebar = !!sidebarContent;
  const hasOutline = !!outlineContent;

  // Activity-bar click: re-clicking the active view toggles collapse;
  // clicking an inactive view switches to it and ensures the sidebar is open.
  const handleActivityClick = useCallback(
    (view: SidebarView) => {
      if (sidebarView === view) {
        setSidebarCollapsed((v) => !v);
      } else {
        setSidebarView(view);
        setSidebarCollapsed(false);
      }
    },
    [sidebarView],
  );

  const className = [
    "edit-area",
    hasSidebar && "has-sidebar",
    sidebarCollapsed && "sidebar-collapsed",
    isDragging && "sidebar-dragging",
  ]
    .filter(Boolean)
    .join(" ");

  const style = { "--sidebar-w": `${sidebarWidth}px` } as CSSProperties;

  const showSidebarView = useCallback((view: SidebarView) => {
    setSidebarView(view);
    setSidebarCollapsed(false);
  }, []);

  return (
    <div className={className} style={style}>
      {hasSidebar && <SidebarToggleCommand onToggle={() => setSidebarCollapsed((v) => !v)} />}
      {hasSidebar && (
        <SidebarViewCommand
          id="view.showFiles"
          title="Show Files"
          keybinding="mod+shift+e"
          onShow={() => showSidebarView("files")}
        />
      )}
      {hasOutline && (
        <SidebarViewCommand
          id="view.showOutline"
          title="Show Outline"
          keybinding="mod+shift+o"
          onShow={() => showSidebarView("outline")}
        />
      )}
      {hasSidebar && !previewFocused && (
        <nav className="activity-bar" aria-label="Activity Bar">
          <ActivityBarButton
            label="Files"
            active={sidebarView === "files" && !sidebarCollapsed}
            onClick={() => handleActivityClick("files")}
            icon={
              /* File-tree glyph */
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
            }
          />
          {hasOutline && (
            <ActivityBarButton
              label="Outline"
              active={sidebarView === "outline" && !sidebarCollapsed}
              onClick={() => handleActivityClick("outline")}
              icon={
                /* Outline / tree glyph */
                <svg
                  viewBox="0 0 16 16"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path d="M3 4h10" />
                  <path d="M6.5 8h6.5" />
                  <path d="M6.5 12h6.5" />
                  <circle cx="3.4" cy="8" r="1" fill="currentColor" stroke="none" />
                  <circle cx="3.4" cy="12" r="1" fill="currentColor" stroke="none" />
                </svg>
              }
            />
          )}
        </nav>
      )}
      {hasSidebar && !sidebarCollapsed && (
        <div className="sidebar-area">
          {sidebarView === "outline" && hasOutline ? outlineContent : sidebarContent}
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
      {editorContent}
    </div>
  );
}

/**
 * Registers the `mod+B` "Toggle Sidebar" keyboard command. Rendered only when
 * the sidebar exists, so the command is absent in modes without one. Renders
 * nothing. Expanding restores the last `sidebarView` (it is separate state).
 */
function SidebarToggleCommand({ onToggle }: { onToggle: () => void }) {
  useCommand({
    id: "view.toggleSidebar",
    title: "Toggle Sidebar",
    keybinding: "mod+b",
    whenTextInputFocused: "skip",
    run: onToggle,
  });
  return null;
}

/**
 * Registers a keyboard command that focuses the sidebar on a given view,
 * expanding it if collapsed. Rendered conditionally (Outline only when an
 * outline exists), so the hook is never called conditionally. Renders nothing.
 */
function SidebarViewCommand({
  id,
  title,
  keybinding,
  onShow,
}: {
  id: string;
  title: string;
  keybinding: string;
  onShow: () => void;
}) {
  useCommand({
    id,
    title,
    keybinding,
    whenTextInputFocused: "skip",
    run: onShow,
  });
  return null;
}

interface ActivityBarButtonProps {
  label: string;
  /** True when this view is the active sidebar view and the sidebar is open. */
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
}

function ActivityBarButton({ label, active, icon, onClick }: ActivityBarButtonProps) {
  // When active+open, clicking collapses; otherwise clicking reveals the view.
  const action = active ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`;
  return (
    <button
      type="button"
      className={`activity-bar-btn${active ? " activity-bar-btn--active" : ""}`}
      onClick={onClick}
      aria-label={action}
      aria-pressed={active}
      title={action}
    >
      <span className="activity-bar-btn__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="activity-bar-btn__label">{label}</span>
    </button>
  );
}
