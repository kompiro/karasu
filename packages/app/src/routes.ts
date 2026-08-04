/**
 * Top-level URL segments the nest deployment owns, and the single source the
 * bare-permalink route guard reads (#1961).
 *
 * The bare `/<owner>/<repo>` catch-all inverts the default for unknown paths:
 * before it, an unmatched path fell through to the SPA; after it, a two-segment
 * path is attempted as a repo lookup first. That inversion is only safe while
 * every path the SPA and the sibling Functions own is known here — so this
 * module, not a list copied into the Function, is where those segments live
 * (TPL-1961).
 *
 * A missing entry does not 404 — the resolver's deterministic-negative
 * fallthrough still lands the visitor somewhere sensible — but it costs a
 * needless GitHub round-trip on every hit, so `bare-route.test.ts` and
 * `routes-config.test.ts` fence both consumers against drift.
 */

/** Path segment owned by ProjectMode (`/projects/<id>`, `useProjectNavigation`). */
export const PROJECTS_SEGMENT = "projects";

/**
 * Segments the SPA resolves client-side. These reach the server on reload,
 * bookmark and share, so the guard must decline them and `_routes.json` should
 * exclude them (a request that never invokes the Worker is ~4 ms instead of
 * ~200 ms).
 */
export const SPA_ROUTE_SEGMENTS = [PROJECTS_SEGMENT] as const;

/** Segments served by sibling Pages Functions. */
export const FUNCTION_ROUTE_SEGMENTS = ["s", "render", "r", "api"] as const;

/** Directories of static assets. */
export const STATIC_ROUTE_SEGMENTS = ["assets", "fonts"] as const;

/**
 * Every first segment that is definitively not a GitHub owner. Checked before
 * the owner/repo grammar so a reserved path never reaches GitHub.
 */
export const RESERVED_TOP_SEGMENTS: ReadonlySet<string> = new Set([
  ...SPA_ROUTE_SEGMENTS,
  ...FUNCTION_ROUTE_SEGMENTS,
  ...STATIC_ROUTE_SEGMENTS,
]);
