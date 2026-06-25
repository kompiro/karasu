import { useEffect } from "react";
import { getReference } from "@karasu-tools/core";
import { AppShell } from "./components/AppShell.js";
import { useAppContext } from "./state/app-context.js";
import { useFileSelection } from "./hooks/useFileSelection.js";
import { useTranslation } from "./i18n/index.js";

const MEMORY_FILE_PATH = "/memory/index.krs";

interface MemoryModeAppProps {
  /**
   * Initial `.krs` source to seed instead of the sample. Used to open a shared
   * inline URL (karasu-nest) as an ephemeral in-memory view — see App.tsx.
   */
  initialKrs?: string;
}

/**
 * MemoryModeApp — OPFS 非対応ブラウザ向けの単一ファイル編集モード。
 * AppProvider は App.tsx で注入される。
 */
export function MemoryModeApp({ initialKrs }: MemoryModeAppProps = {}) {
  const { dispatch, fs } = useAppContext();
  const { selectFileWithContent } = useFileSelection(fs, dispatch);
  const { locale } = useTranslation();

  useEffect(() => {
    (async () => {
      const seed = initialKrs ?? getReference(locale).sampleKrs;
      await fs.writeFile(MEMORY_FILE_PATH, seed);
      selectFileWithContent(MEMORY_FILE_PATH, seed);
      dispatch({ type: "SET_LOADING", loading: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppShell entryPath={MEMORY_FILE_PATH} />;
}
