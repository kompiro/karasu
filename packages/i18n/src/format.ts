/**
 * Locale-neutral formatting helpers shared by the `en` / `ja` catalogs.
 *
 * Intentionally NOT exported from `index.ts` — these are catalog-internal
 * building blocks, not part of the package's public API.
 */

/**
 * Format an optional min/max pair as a range descriptor:
 *
 *   - both bounds   → `[0, 1]`
 *   - min only      → `>= 0`
 *   - max only      → `<= 1`
 *   - neither bound → `""` (which leaves a doubled space in the
 *     surrounding message — preserved verbatim for byte-identical output)
 */
export function formatRange(min?: number, max?: number): string {
  return min !== undefined && max !== undefined
    ? `[${min}, ${max}]`
    : min !== undefined
      ? `>= ${min}`
      : max !== undefined
        ? `<= ${max}`
        : "";
}
