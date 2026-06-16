import KarasuEditor, { type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";
import { useTheme } from "../theme/index.js";

interface EditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once when the Monaco editor instance is ready */
  onEditorReady?: (editor: editor.IStandaloneCodeEditor) => void;
  /** Called when the user triggers the Format action (Shift+Alt+F) */
  onFormat?: () => void;
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
      "client",
      "domain",
      "usecase",
      "resource",
      "user",
      "role",
      "description",
      "team",
      "link",
      "deploy",
      "war",
      "jar",
      "oci",
      "lambda",
      "function",
      "assets",
      "job",
      "artifact",
      "store",
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

  // Light counterpart of karasu-dark — selected when the app theme is
  // light (see EditorPane below). Syntax hues mirror karasu-dark but
  // darkened for contrast on a white editor background.
  monaco.editor.defineTheme("karasu-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "0369a1", fontStyle: "bold" },
      { token: "annotation", foreground: "b45309" },
      { token: "string", foreground: "15803d" },
      { token: "comment", foreground: "64748b" },
      { token: "operator", foreground: "db2777" },
      { token: "identifier", foreground: "1e293b" },
      { token: "delimiter.bracket", foreground: "64748b" },
      { token: "delimiter.curly", foreground: "64748b" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1e293b",
      "editor.lineHighlightBackground": "#eef2f7",
      "editorCursor.foreground": "#2563eb",
      "editor.selectionBackground": "#cfe0ff",
    },
  });
}

export function EditorPane({ value, onChange, onEditorReady, onFormat }: EditorPaneProps) {
  const { effectiveTheme } = useTheme();
  const monacoRef = useRef<Monaco | null>(null);
  // Keep a ref so the Shift+Alt+F keybinding always calls the latest onFormat,
  // even after re-renders update the prop (addCommand is only called once at mount).
  const onFormatRef = useRef(onFormat);
  useEffect(() => {
    onFormatRef.current = onFormat;
  }, [onFormat]);

  // Latest onChange in a ref so composition-end handler (registered once at
  // mount) can flush via the current parent callback.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Gate value propagation while an IME composition is in flight. Pushing
  // intermediate values back into the controlled `value` prop disturbs the
  // browser-level composition (e.g. Google JP IME on Blink), causing dropped
  // or duplicated characters. Buffer the latest value and flush on
  // compositionEnd.
  const isComposingRef = useRef(false);
  const pendingValueRef = useRef<string | null>(null);

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    monacoRef.current = monaco;
    registerKrsLanguage(monaco);
  }, []);

  const handleMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      onEditorReady?.(editorInstance);
      const monaco = monacoRef.current;
      if (monaco) {
        // Shift+Alt+F — matches VS Code "Format Document" default binding
        editorInstance.addCommand(
          monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
          () => onFormatRef.current?.(),
        );
      }

      editorInstance.onDidCompositionStart(() => {
        isComposingRef.current = true;
      });
      editorInstance.onDidCompositionEnd(() => {
        isComposingRef.current = false;
        const pending = pendingValueRef.current;
        pendingValueRef.current = null;
        if (pending !== null) {
          onChangeRef.current(pending);
        }
      });
    },
    [onEditorReady],
  );

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      const next = newValue ?? "";
      if (isComposingRef.current) {
        pendingValueRef.current = next;
        return;
      }
      onChange(next);
    },
    [onChange],
  );

  return (
    <div className="editor-pane">
      <KarasuEditor
        height="100%"
        language={KRS_LANGUAGE_ID}
        theme={effectiveTheme === "light" ? "karasu-light" : "karasu-dark"}
        value={value}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
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
