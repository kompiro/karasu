import { useState } from "react";
import type { editor } from "monaco-editor";
import { EditorPane } from "./EditorPane.js";
import { LeftTabBar, type LeftTab } from "./LeftTabBar.js";
import { ChatPane } from "./ChatPane.js";

interface LeftPaneProps {
  value: string;
  onChange: (value: string) => void;
  onEditorReady?: (editor: editor.IStandaloneCodeEditor) => void;
  scopeLabel: string;
  currentProjectId: string | null;
}

export function LeftPane({
  value,
  onChange,
  onEditorReady,
  scopeLabel,
  currentProjectId,
}: LeftPaneProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>("editor");

  return (
    <div className="left-pane">
      <LeftTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "editor" ? (
        <EditorPane value={value} onChange={onChange} onEditorReady={onEditorReady} />
      ) : (
        <ChatPane scopeLabel={scopeLabel} sessionResetKey={currentProjectId} />
      )}
    </div>
  );
}
