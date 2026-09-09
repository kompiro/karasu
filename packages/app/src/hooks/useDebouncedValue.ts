import { useEffect, useState } from "react";

/**
 * Returns `value` once it has stayed unchanged for `delayMs`.
 *
 * The first value is returned immediately (no delay on mount). Every later
 * change restarts the window, so the returned value only moves after the
 * input has been still for the whole `delayMs`; an intermediate value of a
 * burst is never returned. When the input comes back to the settled value
 * inside the window, nothing is scheduled at all. The pending timer is
 * cleared on unmount and whenever the input changes again, so an older
 * value can never land after a newer one (the rule #1534 set for the
 * compile hooks).
 *
 * Why it exists (#2758): `useViewSvg` builds the export SVGs in `useMemo`
 * keyed on the live editor content, so every keystroke re-rendered the whole
 * model several times on the main thread before React could paint. Feeding
 * those memos a settled value moves that cost behind the same window the
 * visible view's compile already uses (`useDebouncedCompile`), without
 * changing the memos themselves. Generic on purpose: any input that is
 * expensive to react to and cheap to keep stale can go through it.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    // Already settled on this exact value (mount, the timer just fired, or the
    // input returned to it inside the window): nothing to schedule.
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, settled]);

  return settled;
}
