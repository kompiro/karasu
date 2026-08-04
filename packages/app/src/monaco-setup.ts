import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

// ローカルの monaco-editor を使用（CDN ではなく Vite 経由で配信 → source map 有効）
loader.config({ monaco });

// Web Worker の設定（カスタム言語のみ使用のため editor.worker のみ）
//
// The specifier below is coupled to the monaco-editor version. Its `exports`
// map changed shape in 0.56.0:
//
//   0.55.x  "./*"    -> "./*"              (paths are package-root relative)
//   0.56.0  "./*.js" -> "./esm/vs/*.js"    (the esm/vs prefix is now implicit)
//
// So the pre-0.56 spelling "monaco-editor/esm/vs/editor/editor.worker.js" now
// resolves to a doubled "esm/vs/esm/vs/..." path and fails the build. The two
// spellings are mutually exclusive — bump the dependency and this line together.
self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(new URL("monaco-editor/editor/editor.worker.js", import.meta.url), {
      type: "module",
    });
  },
};
