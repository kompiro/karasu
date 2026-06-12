import { useCallback } from "react";
import { useTransientFlag } from "./useTransientFlag.js";

const DEFAULT_RESET_MS = 2000;

export function useClipboardCopy(resetMs: number = DEFAULT_RESET_MS) {
  const [copied, markCopied] = useTransientFlag(resetMs);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(markCopied, () => {
        /* clipboard access denied — silently ignore */
      });
    },
    [markCopied],
  );

  return { copy, copied };
}
