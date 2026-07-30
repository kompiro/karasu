import type { ShareTarget } from "@karasu-tools/core";
import { shareTargetToHash, parseHash } from "../hooks/useHistoryNavigation.js";

/**
 * Resolve the deep-link anchor to normalize the entry URL to, or null for none.
 *
 * Two deep-link surfaces feed this:
 * - an inline share's `payload.target` (#1827), carried inside the `#s=` payload;
 * - a repo-backed permalink's `?krs=<anchor>` query (#1958) — the `/s` bounce
 *   moved the `#krs-…` there because the `#s=` fragment holds the payload.
 *
 * `?krs=` wins when present and valid (it is the explicit deep permalink the
 * reader followed). The value is validated with the same `parseHash` grammar
 * both anchor surfaces already use — no grammar fork (TPL-1827). An
 * invalid / unresolvable `?krs=` falls back to the payload target, else null
 * (whole-model, tolerant open).
 */
export function resolveDeepLinkHash(
  target: ShareTarget | undefined,
  entrySearch: string,
): string | null {
  const krs = new URLSearchParams(entrySearch).get("krs");
  if (krs) {
    const hash = krs.startsWith("#") ? krs : `#${krs}`;
    if (parseHash(hash) !== null) return hash;
  }
  return target ? shareTargetToHash(target) : null;
}
