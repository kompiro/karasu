import { useState, useCallback } from "react";
import type { editor } from "monaco-editor";
import { EditorPane } from "./EditorPane.js";
import { LeftTabBar, type LeftTab } from "./LeftTabBar.js";
import { ChatPane } from "./ChatPane.js";
import { SettingsPane } from "./SettingsPane.js";
import { getStoredApiKey } from "../utils/api-key-storage.js";

interface LeftPaneProps {
  value: string;
  currentFilePath: string | null;
  onChange: (value: string) => void;
  onEditorReady?: (editor: editor.IStandaloneCodeEditor) => void;
  scopeLabel: string;
  currentProjectId: string | null;
  onNavigateViewPath: (path: string[]) => void;
  /** Called when the user clicks Format or presses Shift+Alt+F */
  onFormat?: () => void;
  /** When true, the Format button is disabled (source has parse errors) */
  hasParseErrors?: boolean;
}

export function LeftPane({
  value,
  currentFilePath,
  onChange,
  onEditorReady,
  scopeLabel,
  currentProjectId,
  onNavigateViewPath,
  onFormat,
  hasParseErrors,
}: LeftPaneProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>("editor");
  const [apiKey, setApiKey] = useState<string | null>(() => getStoredApiKey());

  const handleApiKeyChange = useCallback(() => {
    setApiKey(getStoredApiKey());
  }, []);

  const handleNavigateToSettings = useCallback(() => {
    setActiveTab("settings");
  }, []);

  const formatButton =
    activeTab === "editor" && onFormat ? (
      <button
        className="toolbar-btn toolbar-btn--actionable toolbar-btn--format"
        onClick={onFormat}
        disabled={hasParseErrors}
        title={
          hasParseErrors
            ? "Cannot format: source has parse errors"
            : "Format document (Shift+Alt+F)"
        }
      >
        ⌥ Format
      </button>
    ) : null;

  return (
    <div className="left-pane">
      <LeftTabBar activeTab={activeTab} onTabChange={setActiveTab} rightContent={formatButton} />
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
