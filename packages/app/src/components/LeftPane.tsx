import { useState, useCallback } from "react";
import type { editor } from "monaco-editor";
import { EditorPane } from "./EditorPane.js";
import { LeftTabBar, type LeftTab } from "./LeftTabBar.js";
import { ChatPane } from "./ChatPane.js";
import { SettingsPane } from "./SettingsPane.js";
import { getStoredApiKey } from "../utils/api-key-storage.js";

interface LeftPaneProps {
  value: string;
  onChange: (value: string) => void;
  onEditorReady?: (editor: editor.IStandaloneCodeEditor) => void;
  scopeLabel: string;
  currentProjectId: string | null;
  onNavigateViewPath: (path: string[]) => void;
}

export function LeftPane({
  value,
  onChange,
  onEditorReady,
  scopeLabel,
  currentProjectId,
  onNavigateViewPath,
}: LeftPaneProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>("editor");
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());

  const handleApiKeyChange = useCallback(() => {
    setApiKey(getStoredApiKey());
  }, []);

  const handleNavigateToSettings = useCallback(() => {
    setActiveTab("settings");
  }, []);

  return (
    <div className="left-pane">
      <LeftTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "editor" && (
        <EditorPane value={value} onChange={onChange} onEditorReady={onEditorReady} />
      )}
      {activeTab === "chat" && (
        <ChatPane
          scopeLabel={scopeLabel}
          sessionResetKey={currentProjectId}
          fileContent={value}
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
