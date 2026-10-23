import { useEffect, useCallback, useRef, useState } from "react";
import { AppShell } from "./components/AppShell.js";
import {
  PreviewToolbarSlotContext,
  type PreviewToolbarSlot,
} from "./components/preview-toolbar-slot.js";
import { useAppContext } from "./state/app-context.js";
import { useTranslation } from "./i18n/index.js";
import { HOSTED_APP_ORIGIN } from "./utils/hosted-app.js";

/** Where the served directory is mirrored in the in-memory fs. */
const SERVE_ROOT = "/serve";

/**
 * Serve mode builds its Share links on the public app (#3162). Built on this
 * page they would point at the local server, which opens only on this machine
 * while `karasu serve` runs, and the npm build, which leaves the editor out,
 * would not open them at all (why #3138 dropped Share). Both builds go through
 * this component, so they share one destination (TPL-1024).
 */
const SERVE_TOOLBAR: PreviewToolbarSlot = { shareOrigin: HOSTED_APP_ORIGIN };

interface ProjectFile {
  path: string;
  content: string;
}

/** Why there is no diagram, kept as a key so it follows the active locale. */
type LoadError = { kind: "fileNotFound"; file: string } | { kind: "loadFailed" };

function resolveFileNameFromUrl(): string {
  const name = window.location.pathname.slice(1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

async function fetchDefaultFileName(): Promise<string> {
  try {
    const res = await fetch("/api/default");
    if (res.ok) {
      const data = (await res.json()) as { file: string | null };
      return data.file ?? "index";
    }
  } catch {
    // fallthrough
  }
  return "index";
}

/** Every `.krs` and `.krs.style` the server serves, or null when it could not be read. */
async function fetchProject(): Promise<ProjectFile[] | null> {
  try {
    const res = await fetch("/api/project");
    if (res.ok) return ((await res.json()) as { files: ProjectFile[] }).files;
  } catch {
    // fallthrough
  }
  return null;
}

/**
 * Previews one file of the directory `karasu serve` was given.
 *
 * The whole directory is mirrored into the in-memory fs at its real paths
 * (`/serve/<path>`), and the entry is compiled from there, so its imports
 * resolve the way `karasu render` resolves them (#3258). Any watch event
 * refetches the mirror, so saving an imported file or a style sheet redraws
 * the preview, not only saving the entry.
 */
export function ServeModeApp() {
  const { dispatch, fs } = useAppContext();
  const { t } = useTranslation();
  const [entryPath, setEntryPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  // Bumped after each refetch so the style sheets the entry imports are read again.
  const [sourceRevision, setSourceRevision] = useState(0);
  const recompileRef = useRef<(() => void) | null>(null);
  const entryPathRef = useRef<string | null>(null);
  // What the mirror holds now, by absolute path: lets a refetch skip unchanged
  // files and remove the ones that are gone.
  const mirrored = useRef(new Map<string, string>());
  // The entry text last put in state; null until it is first shown, and again
  // while it is missing, so its return selects it afresh.
  const shownEntry = useRef<string | null>(null);
  const everLoaded = useRef(false);

  const refresh = useCallback(async () => {
    const files = await fetchProject();
    if (files === null) {
      // Keep what is on screen when the server drops out mid-session; the
      // reconnect refetches. Only a first load that never arrives is an error.
      if (!everLoaded.current) setLoadError({ kind: "loadFailed" });
      return;
    }
    everLoaded.current = true;

    const next = new Map(files.map((f) => [`${SERVE_ROOT}/${f.path}`, f.content]));
    for (const [path, content] of next) {
      if (mirrored.current.get(path) !== content) await fs.writeFile(path, content);
    }
    for (const path of mirrored.current.keys()) {
      if (!next.has(path)) await fs.delete(path).catch(() => {});
    }
    mirrored.current = next;

    const entry = entryPathRef.current;
    if (entry === null) return;
    const content = next.get(entry);
    if (content === undefined) {
      shownEntry.current = null;
      setLoadError({ kind: "fileNotFound", file: entry.slice(SERVE_ROOT.length + 1) });
      return;
    }
    setLoadError(null);
    if (shownEntry.current === null) {
      // The shell gets the entry only once its text and imports are in fs.
      setEntryPath(entry);
      dispatch({ type: "SELECT_FILE", path: entry, content });
      dispatch({ type: "SET_LOADING", loading: false });
    } else if (shownEntry.current !== content) {
      // UPDATE_FILE_CONTENT, not SELECT_FILE: keeps the view the user drilled into.
      dispatch({ type: "UPDATE_FILE_CONTENT", content });
    }
    shownEntry.current = content;
    setSourceRevision((r) => r + 1);
    // The compile reads imports from fs, which changed without the entry's text changing.
    recompileRef.current?.();
  }, [fs, dispatch]);

  // Refetches run one at a time; events that land while one runs fold into a
  // single follow-up, so a burst of saves costs at most two fetches.
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const requestRefresh = useCallback(() => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = (async () => {
      do {
        again.current = false;
        await refresh().catch(() => {});
      } while (again.current);
      running.current = null;
    })();
  }, [refresh]);

  // 初期ロード
  useEffect(() => {
    (async () => {
      const name = resolveFileNameFromUrl() || (await fetchDefaultFileName());
      const path = `${SERVE_ROOT}/${name}.krs`;
      entryPathRef.current = path;
      requestRefresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE によるリアルタイム更新。どのファイルの変更でも取り直す（import 先や .krs.style も）
  useEffect(() => {
    const es = new EventSource("/api/watch");
    for (const event of ["change", "add", "unlink"]) {
      es.addEventListener(event, requestRefresh);
    }
    // Events sent while the connection was down are lost; a reconnect
    // refetches so the mirror cannot stay stale.
    let opened = false;
    es.addEventListener("open", () => {
      if (opened) requestRefresh();
      opened = true;
    });
    return () => es.close();
  }, [requestRefresh]);

  if (loadError) {
    return (
      <div className="app">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#ef4444",
            fontFamily: "monospace",
          }}
        >
          {loadError.kind === "fileNotFound"
            ? t("serve.error.fileNotFound", { file: loadError.file })
            : t("serve.error.loadFailed")}
        </div>
      </div>
    );
  }

  return (
    <PreviewToolbarSlotContext.Provider value={SERVE_TOOLBAR}>
      <AppShell
        entryPath={entryPath}
        hideEditor
        recompileRef={recompileRef}
        sourceRevision={sourceRevision}
        displayRoot={SERVE_ROOT}
      />
    </PreviewToolbarSlotContext.Provider>
  );
}
