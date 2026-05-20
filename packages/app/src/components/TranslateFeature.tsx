import { useState } from "react";
import { useCommand } from "../keyboard/use-command.js";
import { TranslateDialog } from "./TranslateDialog.js";

/**
 * Registers the "Translate Infra Config to .krs" command and hosts the
 * {@link TranslateDialog} it opens (Issue #1463).
 *
 * Mounted once at the App root so the command is always available from the
 * command palette, independent of which App mode is active.
 */
export function TranslateFeature() {
  const [open, setOpen] = useState(false);

  useCommand({
    id: "translate.openDialog",
    title: "Translate Infra Config to .krs…",
    run: () => setOpen(true),
  });

  return <TranslateDialog open={open} onClose={() => setOpen(false)} />;
}
