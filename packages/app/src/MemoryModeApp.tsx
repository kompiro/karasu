import { useEffect, useRef } from "react";
import { InMemoryFileSystemProvider, getReference } from "@karasu-tools/core";
import { AppShell } from "./components/AppShell.js";
import { AppProvider, useAppContext } from "./state/app-context.js";

const MEMORY_FILE_PATH = "/memory/index.krs";

/**
 * MemoryModeApp — OPFS 非対応ブラウザ向けの単一ファイル編集モード。
 * AppProvider + InMemoryFileSystemProvider で ProjectModeApp と同等の機能を提供する。
 */
export function MemoryModeApp() {
  const inMemoryFs = useRef(new InMemoryFileSystemProvider()).current;

  return (
    <AppProvider fs={inMemoryFs}>
      <MemoryModeInner />
    </AppProvider>
  );
}

function MemoryModeInner() {
  const { dispatch, fs } = useAppContext();

  // Initialize: write sample KRS to in-memory FS and select the file
  useEffect(() => {
    (async () => {
      const sampleKrs = getReference().sampleKrs;
      await fs.writeFile(MEMORY_FILE_PATH, sampleKrs);
      dispatch({ type: "SELECT_FILE", path: MEMORY_FILE_PATH, content: sampleKrs });
      dispatch({ type: "SET_LOADING", loading: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppShell entryPath={MEMORY_FILE_PATH} />;
}
