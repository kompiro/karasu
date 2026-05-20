import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useCommand } from "../keyboard/use-command.js";
import { TranslateDialog } from "./TranslateDialog.js";

const TranslateDialogContext = createContext<(() => void) | null>(null);

/**
 * Returns a function that opens the translate dialog. No-ops when no
 * {@link TranslateProvider} is mounted (e.g. components rendered in isolation
 * by unit tests).
 */
export function useOpenTranslateDialog(): () => void {
  const open = useContext(TranslateDialogContext);
  return open ?? (() => {});
}

/**
 * Hosts the {@link TranslateDialog} and the command that opens it (Issue
 * #1463), and exposes an imperative opener via context.
 *
 * Two entry points share the one dialog instance: the "Translate Infra Config
 * to .krs" command palette entry (registered here), and the Translate button
 * in the project sidebar (which calls {@link useOpenTranslateDialog}).
 */
export function TranslateProvider({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => setOpen(true), []);

  useCommand({
    id: "translate.openDialog",
    title: "Translate Infra Config to .krs…",
    run: openDialog,
  });

  return (
    <TranslateDialogContext.Provider value={openDialog}>
      {children}
      <TranslateDialog open={open} onClose={() => setOpen(false)} />
    </TranslateDialogContext.Provider>
  );
}
