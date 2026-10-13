// The entry of the `karasu serve` build (`vite.serve.config.ts`, #3138). Serve
// mode never shows the editor, so this entry leaves out `monaco-setup` — and
// with it Monaco, most of the app build — and fixes the mode instead of
// detecting it. The serve build fails if a `monaco-editor` module gets in.
import { mountApp } from "./mount-app.js";

mountApp({ mode: "serve" });
