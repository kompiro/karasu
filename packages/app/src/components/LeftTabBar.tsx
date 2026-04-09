export type LeftTab = "editor" | "chat";

interface LeftTabBarProps {
  activeTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
}

export function LeftTabBar({ activeTab, onTabChange }: LeftTabBarProps) {
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
    </div>
  );
}
