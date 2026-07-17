import { useRef, type RefObject } from "react";

/**
 * Mirrors `value` into a ref on every render, replacing the hand-rolled
 * `const xRef = useRef(x); xRef.current = x;` idiom (#2015 point 5). Intended
 * only for *passive* prop-to-ref mirrors — refs that just carry the latest
 * value into async callbacks without stale-closure issues. Genuinely stateful
 * refs (initialized once, mutated by effects/handlers rather than synced from
 * a value every render) should keep using `useRef` directly so the two kinds
 * stay visually distinct.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
