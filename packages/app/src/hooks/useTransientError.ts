import { useCallback, useEffect, useRef, useState } from "react";

interface TransientError {
  /** The current error message, or `null` when nothing is shown. */
  error: string | null;
  /** Show `message` and arm the auto-dismiss timer. */
  reportError: (message: string) => void;
  /** Hide the message immediately (e.g. the dismiss button). */
  clearError: () => void;
}

/**
 * Holds a transient error message that auto-dismisses after `ms`. The string
 * sibling of {@link useTransientFlag}: used to surface action failures
 * (project create/import/export, snapshot capture, …) in a banner instead of
 * letting them vanish silently (#1532).
 *
 * Owns the timer lifecycle: cleared on unmount (never fires into a dead
 * component) and re-armed on every `reportError` (a second failure resets the
 * countdown rather than letting the first timer hide it early).
 */
export function useTransientError(ms: number): TransientError {
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancelTimer, [cancelTimer]);

  const reportError = useCallback(
    (message: string) => {
      setError(message);
      cancelTimer();
      timerRef.current = setTimeout(() => {
        setError(null);
        timerRef.current = null;
      }, ms);
    },
    [ms, cancelTimer],
  );

  const clearError = useCallback(() => {
    cancelTimer();
    setError(null);
  }, [cancelTimer]);

  return { error, reportError, clearError };
}
