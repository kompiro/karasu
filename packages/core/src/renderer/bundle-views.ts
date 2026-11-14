import type { ShareTargetView } from "../share/synthesize.js";

/**
 * Every view a deep permalink can name (`ShareTargetView`, the app's
 * `ActiveView`) with its tab label in the static all-views bundle, or `null`
 * for a view the bundle does not draw. A `Record` over the union, so a new view
 * does not compile until the static side decides (TPL-1827,
 * docs/spec/permalink.md).
 *
 * The matrix is app-only: it has no static level and no tab, so a
 * `#krs-matrix` fragment opens the bundle at its default view.
 */
const BUNDLE_VIEWS = {
  system: "System",
  deploy: "Deploy",
  org: "Org",
  matrix: null,
} as const satisfies Record<ShareTargetView, string | null>;

/** A view the static bundle draws a pane and a tab for. */
export type ViewType = {
  [V in ShareTargetView]: (typeof BUNDLE_VIEWS)[V] extends string ? V : never;
}[ShareTargetView];

/** The bundle's tabs, in order. */
export const VIEW_TYPES: readonly { type: ViewType; label: string }[] = (
  Object.keys(BUNDLE_VIEWS) as ShareTargetView[]
).flatMap((type) => {
  const label = BUNDLE_VIEWS[type];
  return label === null ? [] : [{ type: type as ViewType, label }];
});
