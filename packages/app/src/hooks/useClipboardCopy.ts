import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_RESET_MS = 2000;

export function useClipboardCopy(resetMs: number = DEFAULT_RESET_MS) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(() => {
            setCopied(false);
            timerRef.current = null;
          }, resetMs);
        },
        () => {
          /* clipboard access denied — silently ignore */
        },
      );
    },
    [resetMs],
  );

  return { copy, copied };
}
