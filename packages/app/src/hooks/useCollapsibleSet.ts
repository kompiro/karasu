import { useCallback, useMemo, useState } from "react";

/**
 * A collapsed-id set with the three idioms the system view's collapse axes share
 * (Issue #1876): a clone-before-mutate `toggle`, a `replace` that swaps the whole
 * set (for the bulk Collapse-all / Expand-all toggle, #1872), and a stable sorted
 * `key` string for the recompile debounce dependency. Extracted from the
 * near-identical `collapsedCategories` (#1821) and `collapsedGroups` (#1858)
 * blocks in `useSystemView`.
 *
 * `T extends string` so the ids sort and join deterministically into `key`.
 */
export function useCollapsibleSet<T extends string>(): {
  /** The current collapsed set. */
  set: ReadonlySet<T>;
  /** Add `item` if absent, remove it if present (clone-before-mutate). */
  toggle: (item: T) => void;
  /** Replace the whole set — empty when `items` is omitted (expand-all). */
  replace: (items?: Iterable<T>) => void;
  /** Sorted, comma-joined ids — a stable string key for effect dependencies. */
  key: string;
} {
  const [set, setSet] = useState<ReadonlySet<T>>(new Set());
  const toggle = useCallback((item: T) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }, []);
  const replace = useCallback((items?: Iterable<T>) => {
    setSet(new Set(items));
  }, []);
  const key = useMemo(() => [...set].sort().join(","), [set]);
  return { set, toggle, replace, key };
}
