import type { ReactNode } from "react";

export type LeftTab = "editor" | "chat" | "settings";

interface LeftTabBarProps {
  activeTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  /** Optional content rendered on the right side of the tab bar */
  rightContent?: ReactNode;
}

export function LeftTabBar({ activeTab, onTabChange, rightContent }: LeftTabBarProps) {
  return (
    <div className="left-tab-bar" role="tablist">
      <button
        className={`left-tab ${activeTab === "editor" ? "left-tab--active" : ""}`}
        role="tab"
        aria-selected={activeTab === "editor"}
        onClick={() => onTabChange("editor")}
      >
        <span className="left-tab-icon">✏</span>
        Editor
      </button>
      <button
        className={`left-tab ${activeTab === "chat" ? "left-tab--active" : ""}`}
        role="tab"
        aria-selected={activeTab === "chat"}
        onClick={() => onTabChange("chat")}
      >
        <span className="left-tab-icon">💬</span>
        Chat
      </button>
      <button
        className={`left-tab ${activeTab === "settings" ? "left-tab--active" : ""}`}
        role="tab"
        aria-selected={activeTab === "settings"}
        onClick={() => onTabChange("settings")}
      >
        <span className="left-tab-icon">⚙</span>
        Settings
      </button>
      {rightContent && <div className="left-tab-bar__right">{rightContent}</div>}
    </div>
  );
}
