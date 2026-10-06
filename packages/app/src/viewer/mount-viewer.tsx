import { StrictMode, useEffect, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppShell } from "../components/AppShell.js";
import { AppProvider, useAppContext } from "../state/app-context.js";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";
import { TranslateProvider } from "../components/TranslateProvider.js";
import { ObservableFileSystemProvider } from "../fs/observable-provider.js";
import { useFileSelection } from "../hooks/useFileSelection.js";
import { LocaleProvider } from "../i18n/index.js";
import type { Locale } from "../i18n/locale.js";
import { ThemeProvider, type ThemePreference } from "../theme/index.js";
import {
  PreviewToolbarSlotContext,
  type PreviewToolbarSlot,
} from "../components/preview-toolbar-slot.js";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SingleFileFileSystemProvider } from "./single-file-fs.js";
import { ViewerToolbarSwitches } from "./ViewerToolbarSwitches.js";

/** Where the submission lives in the viewer's in-memory project. */
const VIEW_PATH = "/gallery/index.krs";

export interface ViewerOptions {
  /** The `.krs` to show. The viewer never fetches it. */
  source: string;
  /** Omit to follow `prefers-color-scheme`. */
  initialTheme?: ThemePreference;
  /** Omit to follow the browser language. */
  initialLocale?: Locale;
  /**
   * What the viewer puts on the preview toolbar. Defaults to the theme and
   * language switches with Share dropped; a host that owns theme and language
   * itself (the VS Code webview, #2996) passes its own.
   */
  toolbar?: PreviewToolbarSlot;
}

// Built once: the switches read their state from context, not from props.
const DEFAULT_TOOLBAR: PreviewToolbarSlot = { extras: <ViewerToolbarSwitches />, hideShare: true };

function ViewerProject({ source }: { source: string }) {
  const { dispatch, fs } = useAppContext();
  const { selectFileWithContent } = useFileSelection(fs, dispatch);
  const recompileRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    void (async () => {
      await fs.writeFile(VIEW_PATH, source);
      selectFileWithContent(VIEW_PATH, source);
      dispatch({ type: "SET_LOADING", loading: false });
      recompileRef.current?.();
    })();
    // The source is fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <AppShell entryPath={VIEW_PATH} hideEditor recompileRef={recompileRef} />;
}

function Viewer({ source, toolbar }: { source: string; toolbar: PreviewToolbarSlot }) {
  const fs = useMemo(
    () => new ObservableFileSystemProvider(new SingleFileFileSystemProvider()),
    [],
  );
  return (
    <AppProvider fs={fs}>
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <TranslateProvider>
          <PreviewToolbarSlotContext.Provider value={toolbar}>
            <ViewerProject source={source} />
          </PreviewToolbarSlotContext.Provider>
        </TranslateProvider>
      </CommandProvider>
    </AppProvider>
  );
}

/**
 * Mount the read-only viewer (#2997): the app's preview over a one-file
 * in-memory project, with no editor and no network.
 */
export function mountViewer(container: HTMLElement, options: ViewerOptions): Root {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <LocaleProvider initialLocale={options.initialLocale}>
        <ThemeProvider initialTheme={options.initialTheme}>
          <TooltipProvider delayDuration={300}>
            <Viewer source={options.source} toolbar={options.toolbar ?? DEFAULT_TOOLBAR} />
          </TooltipProvider>
        </ThemeProvider>
      </LocaleProvider>
    </StrictMode>,
  );
  return root;
}
