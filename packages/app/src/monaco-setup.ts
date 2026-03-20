import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

// ローカルの monaco-editor を使用（CDN ではなく Vite 経由で配信 → source map 有効）
loader.config({ monaco });

// Web Worker の設定（カスタム言語のみ使用のため editor.worker のみ）
self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(
      new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
      {
        type: "module",
      },
    );
  },
};
