import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type EditTab = "editor" | "chat" | "settings";

interface EditTabBarProps {
  activeTab: EditTab;
  onTabChange: (tab: EditTab) => void;
}

function tabClass(active: boolean) {
  return active ? "edit-tab edit-tab--active" : "edit-tab";
}

/**
 * Migrated to shadcn/ui `Tabs` (Issue #1368). Radix adds arrow-key navigation
 * between triggers — a free a11y baseline upgrade over the bespoke buttons.
 * Legacy class names (`edit-tab-bar`, `edit-tab`, `edit-tab--active`,
 * `edit-tab-icon`) are kept so existing CSS continues to apply.
 */
export function EditTabBar({ activeTab, onTabChange }: EditTabBarProps) {
  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as EditTab)}>
      {/* justify-start overrides shadcn TabsList's default justify-center —
          karasu's tab bars are left-aligned nav bars, not centered. */}
      <TabsList className="edit-tab-bar justify-start">
        <TabsTrigger value="editor" className={tabClass(activeTab === "editor")}>
          <span className="edit-tab-icon">✏</span>
          Editor
        </TabsTrigger>
        <TabsTrigger value="chat" className={tabClass(activeTab === "chat")}>
          <span className="edit-tab-icon">💬</span>
          Chat
        </TabsTrigger>
        <TabsTrigger value="settings" className={tabClass(activeTab === "settings")}>
          <span className="edit-tab-icon">⚙</span>
          Settings
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
