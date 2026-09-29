// Spike #2993: the preview column alone, for a document served under
// `Content-Security-Policy: sandbox allow-scripts` (opaque origin). No editor,
// no network: the source comes from an embedded JSON <script>.
import { StrictMode, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { InMemoryFileSystemProvider } from "@karasu-tools/core";
import { AppShell } from "./components/AppShell.js";
import { AppProvider, useAppContext } from "./state/app-context.js";
import { CommandProvider } from "./keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "./keyboard/KeyboardShortcutDispatcher.js";
import { TranslateProvider } from "./components/TranslateProvider.js";
import { ObservableFileSystemProvider } from "./fs/observable-provider.js";
import { useFileSelection } from "./hooks/useFileSelection.js";
import { LocaleProvider } from "./i18n/index.js";
import { ThemeProvider } from "./theme/index.js";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/index.css";

const VIEW_PATH = "/gallery/index.krs";

const mark = (name: string) => {
  performance.mark(name);
  (window as unknown as { __spike: Record<string, number> }).__spike ??= {};
  (window as unknown as { __spike: Record<string, number> }).__spike[name] = performance.now();
};
mark("viewer:boot");

function readEmbeddedSource(): string {
  const el = document.getElementById("krs-source");
  if (!el?.textContent) return "";
  return JSON.parse(el.textContent) as string;
}

function ViewerApp() {
  const { dispatch, fs } = useAppContext();
  const { selectFileWithContent } = useFileSelection(fs, dispatch);
  const recompileRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    (async () => {
      const krs = readEmbeddedSource();
      mark("viewer:source-read");
      await fs.writeFile(VIEW_PATH, krs);
      selectFileWithContent(VIEW_PATH, krs);
      dispatch({ type: "SET_LOADING", loading: false });
      recompileRef.current?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <AppShell entryPath={VIEW_PATH} hideEditor recompileRef={recompileRef} />;
}

function Viewer() {
  const fs = useMemo(() => new ObservableFileSystemProvider(new InMemoryFileSystemProvider()), []);
  return (
    <AppProvider fs={fs}>
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <TranslateProvider>
          <ViewerApp />
        </TranslateProvider>
      </CommandProvider>
    </AppProvider>
  );
}

// First SVG in the preview = first paint of the diagram.
new MutationObserver((_, observer) => {
  if (document.querySelector(".preview-container svg")) {
    mark("viewer:first-svg");
    observer.disconnect();
  }
}).observe(document.documentElement, { childList: true, subtree: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <Viewer />
        </TooltipProvider>
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
