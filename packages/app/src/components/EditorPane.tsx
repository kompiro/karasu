import KarasuEditor, { type Monaco } from "@monaco-editor/react";
import { useCallback, useRef } from "react";

interface EditorPaneProps {
  value: string;
  onChange: (value: string) => void;
}

const KRS_LANGUAGE_ID = "krs";

function registerKrsLanguage(monaco: Monaco): void {
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === KRS_LANGUAGE_ID)) {
    return;
  }

  monaco.languages.register({ id: KRS_LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(KRS_LANGUAGE_ID, {
    keywords: [
      "system",
      "service",
      "domain",
      "usecase",
      "resource",
      "user",
      "role",
      "deploy",
      "war",
      "jar",
      "oci",
      "lambda",
      "function",
      "assets",
      "job",
      "artifact",
      "runtime",
      "realizes",
      "schedule",
      "image",
      "type",
      "import",
      "from",
    ],
    tokenizer: {
      root: [
        [/@@import/, "keyword"],
        [/@@\w+/, "annotation"],
        [/-->/, "operator"],
        [/->/, "operator"],
        [/\[/, "delimiter.bracket"],
        [/\]/, "delimiter.bracket"],
        [/\{/, "delimiter.curly"],
        [/\}/, "delimiter.curly"],
        [
          /[a-zA-Z_\u00C0-\u024F\u0370-\u03FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]+[\w\u00C0-\u024F\u0370-\u03FF\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        [/"[^"]*"/, "string"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });

  monaco.editor.defineTheme("karasu-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "7dd3fc", fontStyle: "bold" },
      { token: "annotation", foreground: "fbbf24" },
      { token: "string", foreground: "86efac" },
      { token: "comment", foreground: "64748b" },
      { token: "operator", foreground: "f472b6" },
      { token: "identifier", foreground: "e2e8f0" },
      { token: "delimiter.bracket", foreground: "94a3b8" },
      { token: "delimiter.curly", foreground: "94a3b8" },
    ],
    colors: {
      "editor.background": "#0f172a",
      "editor.foreground": "#e2e8f0",
      "editor.lineHighlightBackground": "#1e293b",
      "editorCursor.foreground": "#38bdf8",
      "editor.selectionBackground": "#334155",
    },
  });
}

export function EditorPane({ value, onChange }: EditorPaneProps) {
  const monacoRef = useRef<Monaco | null>(null);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    monacoRef.current = monaco;
    registerKrsLanguage(monaco);
  }, []);

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      onChange(newValue ?? "");
    },
    [onChange],
  );

  return (
    <div className="editor-pane">
      <KarasuEditor
        height="100%"
        language={KRS_LANGUAGE_ID}
        theme="karasu-dark"
        value={value}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        options={{
          fontSize: 14,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 16 },
          lineNumbers: "on",
          renderWhitespace: "none",
          bracketPairColorization: { enabled: true },
          automaticLayout: true,
        }}
      />
    </div>
  );
}
