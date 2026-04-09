import { useState } from "react";
import type { editor } from "monaco-editor";
import { EditorPane } from "./EditorPane.js";
import { LeftTabBar, type LeftTab } from "./LeftTabBar.js";
import { ChatPane } from "./ChatPane.js";

interface LeftPaneProps {
  value: string;
  onChange: (value: string) => void;
  onEditorReady?: (editor: editor.IStandaloneCodeEditor) => void;
  viewPath: string[];
  currentProjectId: string | null;
}

export function LeftPane({
  value,
  onChange,
  onEditorReady,
  viewPath,
  currentProjectId,
}: LeftPaneProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>("editor");

  return (
    <div className="left-pane">
      <LeftTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "editor" ? (
        <EditorPane value={value} onChange={onChange} onEditorReady={onEditorReady} />
      ) : (
        <ChatPane viewPath={viewPath} sessionResetKey={currentProjectId} />
      )}
    </div>
  );
}
