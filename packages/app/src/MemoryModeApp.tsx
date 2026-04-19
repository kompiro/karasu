import { useEffect } from "react";
import { getReference } from "@karasu-tools/core";
import { AppShell } from "./components/AppShell.js";
import { useAppContext } from "./state/app-context.js";
import { useFileSelection } from "./hooks/useFileSelection.js";

const MEMORY_FILE_PATH = "/memory/index.krs";

/**
 * MemoryModeApp — OPFS 非対応ブラウザ向けの単一ファイル編集モード。
 * AppProvider は App.tsx で注入される。
 */
export function MemoryModeApp() {
  const { dispatch, fs } = useAppContext();
  const { selectFileWithContent } = useFileSelection(fs, dispatch);

  useEffect(() => {
    (async () => {
      const sampleKrs = getReference().sampleKrs;
      await fs.writeFile(MEMORY_FILE_PATH, sampleKrs);
      selectFileWithContent(MEMORY_FILE_PATH, sampleKrs);
      dispatch({ type: "SET_LOADING", loading: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppShell entryPath={MEMORY_FILE_PATH} />;
}
