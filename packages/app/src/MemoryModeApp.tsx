import { useEffect } from "react";
import { getReference, SHARE_STYLE_IMPORT_PATH } from "@karasu-tools/core";
import { AppShell } from "./components/AppShell.js";
import { useAppContext } from "./state/app-context.js";
import { useFileSelection } from "./hooks/useFileSelection.js";
import { useTranslation } from "./i18n/index.js";

const MEMORY_DIR = "/memory";
const MEMORY_FILE_PATH = `${MEMORY_DIR}/index.krs`;
// A bundled share style is seeded here; the flattened `.krs` carries a single
// `@import "<SHARE_STYLE_IMPORT_PATH>"` that resolves to it. Derive the path
// from the shared constant so the two sides can't drift.
const MEMORY_STYLE_PATH = `${MEMORY_DIR}/${SHARE_STYLE_IMPORT_PATH}`;

interface MemoryModeAppProps {
  /**
   * Initial `.krs` source to seed instead of the sample. Used to open a shared
   * inline URL (karasu-nest) as an ephemeral in-memory view — see App.tsx.
   */
  initialKrs?: string;
  /** Bundled `.krs.style` to seed alongside `initialKrs` (karasu-nest share). */
  initialStyle?: string;
}

/**
 * MemoryModeApp — OPFS 非対応ブラウザ向けの単一ファイル編集モード。
 * AppProvider は App.tsx で注入される。
 */
export function MemoryModeApp({ initialKrs, initialStyle }: MemoryModeAppProps = {}) {
  const { dispatch, fs } = useAppContext();
  const { selectFileWithContent } = useFileSelection(fs, dispatch);
  const { locale } = useTranslation();

  useEffect(() => {
    (async () => {
      const seed = initialKrs ?? getReference(locale).sampleKrs;
      if (initialStyle !== undefined) {
        await fs.writeFile(MEMORY_STYLE_PATH, initialStyle);
      }
      await fs.writeFile(MEMORY_FILE_PATH, seed);
      selectFileWithContent(MEMORY_FILE_PATH, seed);
      dispatch({ type: "SET_LOADING", loading: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppShell entryPath={MEMORY_FILE_PATH} />;
}
