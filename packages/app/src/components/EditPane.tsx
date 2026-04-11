import { useState, useCallback } from "react";
import type { editor } from "monaco-editor";
import type { SystemNode } from "@karasu-tools/core";
import { EditorPane } from "./EditorPane.js";
import { EditTabBar, type EditTab } from "./EditTabBar.js";
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
  currentProjectId: string | null;
  resolvedSystems: SystemNode[];
  onNavigateViewPath: (path: string[]) => void;
  /** Called when the user clicks Format or presses Shift+Alt+F */
  onFormat?: () => void;
  /** When true, the Format button is disabled (source has parse errors) */
  hasParseErrors?: boolean;
}

export function EditPane({
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
      <EditTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <EditPaneToolbar activeTab={activeTab} onFormat={onFormat} hasParseErrors={hasParseErrors} />
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
          sessionResetKey={currentProjectId}
          fileContent={value}
          currentFilePath={currentFilePath}
          resolvedSystems={resolvedSystems}
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
