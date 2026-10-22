import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { DisplayMode, FileSystemProvider } from "@karasu-tools/core";
import { AppShell } from "../components/AppShell.js";
import { AppProvider, useAppContext } from "../state/app-context.js";
import { CommandProvider } from "../keyboard/command-context.js";
import { KeyboardShortcutDispatcher } from "../keyboard/KeyboardShortcutDispatcher.js";
import { TranslateProvider } from "../components/TranslateProvider.js";
import { ObservableFileSystemProvider } from "../fs/observable-provider.js";
import { useFileSelection } from "../hooks/useFileSelection.js";
import { useLatestRef } from "../hooks/useLatestRef.js";
import { LocaleProvider, useTranslation } from "../i18n/index.js";
import type { Locale } from "../i18n/locale.js";
import { ThemeProvider, useTheme, type ThemePreference } from "../theme/index.js";
import {
  PreviewToolbarSlotContext,
  type PreviewToolbarSlot,
} from "../components/preview-toolbar-slot.js";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SingleFileFileSystemProvider } from "./single-file-fs.js";
import { ViewerToolbarSwitches } from "./ViewerToolbarSwitches.js";
import { ViewerController, useViewerHostState } from "./viewer-controller.js";
import type { HighlightAttribute } from "../state/app-reducer.js";

/** Where a `source`-only submission lives in the viewer's in-memory project. */
const VIEW_PATH = "/gallery/index.krs";

interface ViewerCommonOptions {
  /** Omit to follow `prefers-color-scheme`. */
  initialTheme?: ThemePreference;
  /** Omit to follow the browser language. */
  initialLocale?: Locale;
  /**
   * What the viewer puts on the preview toolbar. Defaults to the theme and
   * language switches with Share dropped; a host that owns theme and language
   * itself (the VS Code webview, #2996) passes its own, and lists in `hide` the
   * controls it cannot carry.
   */
  toolbar?: PreviewToolbarSlot;
  /**
   * The host owns the editor (#3311): it is handed the node and the file that
   * defines it, and the detail panel's "Jump to editor" and Cmd/Ctrl+click are
   * offered (ADR-177). Omitted, the viewer offers no jump.
   */
  onRevealNode?: (nodeId: string, filePath: string) => void;
  /**
   * Opens an external link (a node's, an edge's or a facet's) instead of the
   * page navigating to it. Omitted, the link opens as a normal `target=_blank`.
   */
  onOpenExternal?: (url: string) => void;
  /** The host cannot write files yet: GUI writes (edge direction) are not offered. */
  readOnly?: boolean;
}

/**
 * Either the gallery's one fixed `.krs` (`source`), or a project the host
 * serves through its own file system (`fs` + `entryPath`, #3311).
 */
export type ViewerOptions = ViewerCommonOptions &
  (
    | {
        /** The `.krs` to show. The viewer never fetches it. */
        source: string;
        fs?: never;
        entryPath?: never;
      }
    | {
        source?: never;
        /** Read for the entry and everything it imports. */
        fs: FileSystemProvider;
        /** The `.krs` to open first. */
        entryPath: string;
      }
  );

/**
 * What a host can do to a mounted viewer (#3311). Every call may be made right
 * after `mountViewer()` returns, before the first render.
 */
export interface ViewerHandle {
  /**
   * Files changed behind `fs`. Recompiles while keeping the view and the drill
   * position. Paths are compared with the viewer's as given, so pass them in
   * the same form as `entryPath`.
   */
  filesChanged(paths: readonly string[]): void;
  /** Opens another `.krs`. The view starts over, as on the app's file switch. */
  setEntry(path: string): void;
  setTheme(theme: ThemePreference): void;
  setLocale(locale: Locale): void;
  setDisplayMode(mode: DisplayMode): void;
  /** Highlights a node (`null` clears it), as the app does from the editor cursor. */
  highlight(nodeId: string | null, attribute?: HighlightAttribute): void;
  unmount(): void;
}

// Built once: the switches read their state from context, not from props.
const DEFAULT_TOOLBAR: PreviewToolbarSlot = { extras: <ViewerToolbarSwitches />, hide: ["share"] };

interface ViewerProjectProps {
  controller: ViewerController;
  /** Resolves once the gallery's `source` is in `fs` (immediately for a host fs). */
  seeded: Promise<void>;
  onRevealNode?: (nodeId: string, filePath: string) => void;
  readOnly?: boolean;
}

function ViewerProject({ controller, seeded, onRevealNode, readOnly }: ViewerProjectProps) {
  const { state, dispatch, fs } = useAppContext();
  const { selectFile } = useFileSelection(fs, dispatch);
  const { entryPath, filesRevision, displayMode, highlight } = useViewerHostState(controller);
  const recompileRef = useRef<(() => void) | null>(null);
  const currentFilePathRef = useLatestRef(state.currentFilePath);

  // Open the entry, and open it again whenever the host switches it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await seeded;
      if (cancelled) return;
      await selectFile(entryPath);
      if (cancelled) return;
      dispatch({ type: "SET_LOADING", loading: false });
      recompileRef.current?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [entryPath, seeded, selectFile, dispatch]);

  // Files changed behind `fs`. The open file's text is held in state (the
  // style sheets and the jump read it), so it is re-read when it is one of
  // them; the compile itself reads `fs` and only needs to run again. Going
  // through UPDATE_FILE_CONTENT rather than SELECT_FILE keeps the view.
  useEffect(() => {
    if (filesRevision === 0) return;
    const changed = controller.takeChangedPaths();
    const current = currentFilePathRef.current;
    void (async () => {
      if (current && changed.has(current)) {
        const content = await fs.readFile(current).catch(() => null);
        // The host may have switched files while the read was out.
        if (content !== null && currentFilePathRef.current === current) {
          dispatch({ type: "UPDATE_FILE_CONTENT", content });
        }
      }
      recompileRef.current?.();
    })();
    // Runs once per `filesChanged`, which is what the revision counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesRevision]);

  useEffect(() => {
    if (displayMode) dispatch({ type: "SET_DISPLAY_MODE", displayMode });
  }, [displayMode, dispatch]);

  useEffect(() => {
    if (!highlight) return;
    dispatch({
      type: "SET_HIGHLIGHTED_NODE",
      nodeId: highlight.nodeId,
      highlightAttribute: highlight.attribute,
    });
  }, [highlight, dispatch]);

  return (
    <AppShell
      entryPath={entryPath}
      hideEditor
      recompileRef={recompileRef}
      onRevealNode={onRevealNode}
      readOnly={readOnly}
      sourceRevision={filesRevision}
    />
  );
}

/** Applies the host's theme and language, which live in the providers above it. */
function HostThemeAndLocale({ controller }: { controller: ViewerController }) {
  const { theme, locale } = useViewerHostState(controller);
  const { setTheme } = useTheme();
  const { setLocale } = useTranslation();
  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);
  useEffect(() => {
    if (locale) setLocale(locale);
  }, [locale, setLocale]);
  return null;
}

interface ViewerProps extends ViewerProjectProps {
  fs: FileSystemProvider;
  toolbar: PreviewToolbarSlot;
}

function Viewer({ fs, toolbar, ...project }: ViewerProps) {
  return (
    <AppProvider fs={fs}>
      <CommandProvider>
        <KeyboardShortcutDispatcher />
        <TranslateProvider>
          <PreviewToolbarSlotContext.Provider value={toolbar}>
            <ViewerProject {...project} />
          </PreviewToolbarSlotContext.Provider>
        </TranslateProvider>
      </CommandProvider>
    </AppProvider>
  );
}

/** Hands a click on a new-tab link to the host instead of letting the page follow it. */
function interceptExternalLinks(
  container: HTMLElement,
  onOpenExternal: (url: string) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target !== "_blank") return;
    if (!container.contains(anchor)) return;
    event.preventDefault();
    onOpenExternal(anchor.href);
  };
  // `auxclick` is the middle button, which would otherwise open the link too.
  container.addEventListener("click", onClick);
  container.addEventListener("auxclick", onClick);
  return () => {
    container.removeEventListener("click", onClick);
    container.removeEventListener("auxclick", onClick);
  };
}

/**
 * Mount the read-only viewer (#2997): the app's preview with no editor and no
 * network, over the gallery's one `.krs` or over a host's project (#3311).
 */
export function mountViewer(container: HTMLElement, options: ViewerOptions): ViewerHandle {
  const fs = new ObservableFileSystemProvider(options.fs ?? new SingleFileFileSystemProvider());
  const seeded =
    options.source !== undefined ? fs.writeFile(VIEW_PATH, options.source) : Promise.resolve();
  const controller = new ViewerController(options.entryPath ?? VIEW_PATH);
  const stopIntercepting = options.onOpenExternal
    ? interceptExternalLinks(container, options.onOpenExternal)
    : () => {};

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <LocaleProvider initialLocale={options.initialLocale}>
        <ThemeProvider initialTheme={options.initialTheme}>
          <HostThemeAndLocale controller={controller} />
          <TooltipProvider delayDuration={300}>
            <Viewer
              fs={fs}
              seeded={seeded}
              controller={controller}
              toolbar={options.toolbar ?? DEFAULT_TOOLBAR}
              onRevealNode={options.onRevealNode}
              readOnly={options.readOnly}
            />
          </TooltipProvider>
        </ThemeProvider>
      </LocaleProvider>
    </StrictMode>,
  );

  return {
    filesChanged: (paths) => controller.filesChanged(paths),
    setEntry: (path) => controller.setEntry(path),
    setTheme: (theme) => controller.setTheme(theme),
    setLocale: (locale) => controller.setLocale(locale),
    setDisplayMode: (mode) => controller.setDisplayMode(mode),
    highlight: (nodeId, attribute) => controller.highlight(nodeId, attribute),
    unmount: () => {
      stopIntercepting();
      root.unmount();
    },
  };
}
