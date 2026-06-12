import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A boolean flag that turns true on `trigger()` and auto-resets to false `ms`
 * later. Used for transient "Saved" / "Copied" affordances.
 *
 * Owns the timer lifecycle so callers don't re-derive it: the timer is cleared
 * on unmount (never fires into a dead component) and re-armed on every trigger
 * (a rapid second trigger doesn't let the first timer reset the flag early).
 */
export function useTransientFlag(ms: number): readonly [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const trigger = useCallback(() => {
    setActive(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActive(false);
      timerRef.current = null;
    }, ms);
  }, [ms]);

  return [active, trigger] as const;
}
