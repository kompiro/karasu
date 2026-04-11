export type EditTab = "editor" | "chat" | "settings";

interface EditTabBarProps {
  activeTab: EditTab;
  onTabChange: (tab: EditTab) => void;
}

export function EditTabBar({ activeTab, onTabChange }: EditTabBarProps) {
  return (
    <div className="edit-tab-bar" role="tablist">
      <button
        className={`edit-tab ${activeTab === "editor" ? "edit-tab--active" : ""}`}
        role="tab"
        aria-selected={activeTab === "editor"}
        onClick={() => onTabChange("editor")}
      >
        <span className="edit-tab-icon">✏</span>
        Editor
      </button>
      <button
        className={`edit-tab ${activeTab === "chat" ? "edit-tab--active" : ""}`}
        role="tab"
        aria-selected={activeTab === "chat"}
        onClick={() => onTabChange("chat")}
      >
        <span className="edit-tab-icon">💬</span>
        Chat
      </button>
      <button
        className={`edit-tab ${activeTab === "settings" ? "edit-tab--active" : ""}`}
        role="tab"
        aria-selected={activeTab === "settings"}
        onClick={() => onTabChange("settings")}
      >
        <span className="edit-tab-icon">⚙</span>
        Settings
      </button>
    </div>
  );
}
