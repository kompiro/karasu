import { useEffect, useRef, type RefObject } from "react";

/**
 * Mirrors `value` into a ref, replacing the hand-rolled
 * `const xRef = useRef(x); xRef.current = x;` idiom (#2015 point 5). Intended
 * only for *passive* prop-to-ref mirrors — refs that just carry the latest
 * value into async callbacks without stale-closure issues. Genuinely stateful
 * refs (initialized once, mutated by effects/handlers rather than synced from
 * a value every render) should keep using `useRef` directly so the two kinds
 * stay visually distinct.
 *
 * The write happens in an effect, not during render: writing a ref while
 * rendering is what `react(refs)` forbids, because a render can be discarded
 * or replayed and the ref would keep a value no committed tree ever had.
 * The cost is that `.current` lags by one commit for anyone reading it
 * *during* render or in a layout effect — which is exactly the use this hook
 * is not for. Every reader must run after the commit: an effect declared below
 * the `useLatestRef` call, an event handler, or an async continuation.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
