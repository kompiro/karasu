/**
 * Compile-time feature flags for in-progress work.
 *
 * Flip a flag to true once the feature is complete enough to expose to users,
 * then delete the flag and its checks once the feature ships permanently.
 *
 * Avoid building runtime configuration on top of these — they are intended as
 * temporary on/off switches during development, not as a feature-management
 * platform. If a flag needs to live past a few PRs, consider whether the
 * feature should ship instead.
 */

/**
 * Graphical diff viewer (#650). Hides the "Compare with current" file-tree
 * action while follow-ups (#735–#740) close the gaps.
 *
 * Off by default. Enable for a single session by visiting the app with
 * `?diff=1` in the URL — useful for poking at the feature on the Preview
 * build without rebuilding.
 */
export const ENABLE_DIFF_VIEWER =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("diff");
