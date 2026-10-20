import { useEffect, useCallback, useRef, useState } from "react";
import { AppShell } from "./components/AppShell.js";
import {
  PreviewToolbarSlotContext,
  type PreviewToolbarSlot,
} from "./components/preview-toolbar-slot.js";
import { useAppContext } from "./state/app-context.js";
import { useFileSelection } from "./hooks/useFileSelection.js";
import { HOSTED_APP_ORIGIN } from "./utils/hosted-app.js";

const SERVE_FILE_PATH = "/serve/index.krs";

/**
 * Serve mode builds its Share links on the public app (#3162). Built on this
 * page they would point at the local server, which opens only on this machine
 * while `karasu serve` runs, and the npm build, which leaves the editor out,
 * would not open them at all (why #3138 dropped Share). Both builds go through
 * this component, so they share one destination (TPL-1024).
 */
const SERVE_TOOLBAR: PreviewToolbarSlot = { shareOrigin: HOSTED_APP_ORIGIN };

function resolveFileNameFromUrl(): string {
  const pathname = window.location.pathname;
  const name = pathname === "/" || pathname === "" ? null : pathname.slice(1);
  return name ?? "";
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

async function fetchFileContent(name: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/file/${encodeURIComponent(name)}`);
    if (res.ok) return await res.text();
  } catch {
    // fallthrough
  }
  return null;
}

export function ServeModeApp() {
  const { dispatch, fs } = useAppContext();
  const { selectFileWithContent } = useFileSelection(fs, dispatch);
  const [loadError, setLoadError] = useState<string | null>(null);
  const recompileRef = useRef<(() => void) | null>(null);

  const loadFile = useCallback(
    async (name: string) => {
      const content = await fetchFileContent(name);
      if (content === null) {
        setLoadError(`File not found: ${name}.krs`);
        return;
      }
      setLoadError(null);
      await fs.writeFile(SERVE_FILE_PATH, content);
      selectFileWithContent(SERVE_FILE_PATH, content);
      dispatch({ type: "SET_LOADING", loading: false });
      recompileRef.current?.();
    },
    [fs, dispatch, selectFileWithContent],
  );

  // 初期ロード
  useEffect(() => {
    (async () => {
      const urlName = resolveFileNameFromUrl();
      const name = urlName || (await fetchDefaultFileName());
      await loadFile(name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE によるリアルタイム更新
  useEffect(() => {
    const es = new EventSource("/api/watch");
    es.addEventListener("change", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as { file: string };
        const urlName = resolveFileNameFromUrl();
        const currentName = urlName || "index";
        if (data.file === currentName) {
          loadFile(data.file);
        }
      } catch {
        // ignore malformed events
      }
    });
    return () => es.close();
  }, [loadFile]);

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
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <PreviewToolbarSlotContext.Provider value={SERVE_TOOLBAR}>
      <AppShell entryPath={SERVE_FILE_PATH} hideEditor recompileRef={recompileRef} />
    </PreviewToolbarSlotContext.Provider>
  );
}
