import { useState, useCallback } from "react";
import type { editor } from "monaco-editor";
import type { SystemNode, OrganizationBlock } from "@karasu-tools/core";
import { EditorPane } from "./EditorPane.js";
import { EditTabBar, type EditTab } from "./EditTabBar.js";
import { EditTabShortcuts } from "./EditTabShortcuts.js";
import { EditPaneToolbar } from "./EditPaneToolbar.js";
import { ChatPane } from "./ChatPane.js";
import { SettingsPane } from "./SettingsPane.js";
import { getStoredApiKey } from "../utils/api-key-storage.js";

interface EditPaneProps {
  value: string;
  currentFilePath: string | null;
  onChange: (value: string) => void;
  onEditorReady?: (editor: editor.IStandaloneCodeEditor) => void;
  scopeLabel: string;
  viewPath: string[];
  currentProjectId: string | null;
  resolvedSystems: SystemNode[];
  organizations: OrganizationBlock[];
  ownerIndex: Map<string, string>;
  onNavigateViewPath: (path: string[]) => void;
  /** Called when the user clicks Format or presses Shift+Alt+F */
  onFormat?: () => void;
  /**
   * Called when the user clicks Tidy on a `.krs.style` file. Only shown
   * by `EditPaneToolbar` when the active file is a `.krs.style`.
   */
  onTidyStyle?: () => void;
  /** When true, the Format button is disabled (source has parse errors) */
  hasParseErrors?: boolean;
}

export function EditPane({
  value,
  currentFilePath,
  onChange,
  onEditorReady,
  scopeLabel,
  viewPath,
  currentProjectId,
  resolvedSystems,
  organizations,
  ownerIndex,
  onNavigateViewPath,
  onFormat,
  onTidyStyle,
  hasParseErrors,
}: EditPaneProps) {
  const [activeTab, setActiveTab] = useState<EditTab>("editor");
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());

  const handleApiKeyChange = useCallback(() => {
    setApiKey(getStoredApiKey());
  }, []);

  const handleNavigateToSettings = useCallback(() => {
    setActiveTab("settings");
  }, []);

  return (
    <div className="edit-pane">
      <EditTabShortcuts onSelectTab={setActiveTab} />
      <EditTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <EditPaneToolbar
        activeTab={activeTab}
        onFormat={onFormat}
        onTidyStyle={onTidyStyle}
        hasParseErrors={hasParseErrors}
      />
      {activeTab === "editor" && (
        <EditorPane
          value={value}
          onChange={onChange}
          onEditorReady={onEditorReady}
          onFormat={onFormat}
        />
      )}
      {activeTab === "chat" && (
        <ChatPane
          scopeLabel={scopeLabel}
          viewPath={viewPath}
          sessionResetKey={currentProjectId}
          fileContent={value}
          currentFilePath={currentFilePath}
          resolvedSystems={resolvedSystems}
          organizations={organizations}
          ownerIndex={ownerIndex}
          apiKey={apiKey}
          onNavigateViewPath={onNavigateViewPath}
          onEditorChange={onChange}
          onNavigateToSettings={handleNavigateToSettings}
        />
      )}
      {activeTab === "settings" && <SettingsPane onApiKeyChange={handleApiKeyChange} />}
    </div>
  );
}
