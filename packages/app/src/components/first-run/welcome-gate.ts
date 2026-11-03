/**
 * When the first-run Welcome shows (#3565).
 *
 * The app has no account and no server-side notion of "new user", so a first
 * visit is read from the one fact that only a first visit produces: this boot
 * found no projects and seeded the defaults. A localStorage flag remembers
 * that the visitor already chose, so a later re-seed (every project deleted,
 * or OPFS cleared on its own) does not greet them again. A visitor who arrived
 * through a link meant for something else (a gallery example, a deep
 * permalink, a share link) is taken there, not to Welcome.
 */

export const WELCOME_DISMISSED_KEY = "karasu-welcome-dismissed";

/**
 * Storage can throw (private windows, blocked site data), and so can reading
 * `window.localStorage` itself; treat both as "not dismissed".
 */
export function isWelcomeDismissed(storage?: Pick<Storage, "getItem">): boolean {
  try {
    return (storage ?? localStorage).getItem(WELCOME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Best effort: if storage is unavailable, Welcome may show again on the next first visit. */
export function markWelcomeDismissed(storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? localStorage).setItem(WELCOME_DISMISSED_KEY, "1");
  } catch {
    // Nothing to fall back to; the choice still applies to this session.
  }
}

/**
 * Whether the URL asks for a specific place: a gallery example (`?example=`,
 * #1646), a deep permalink (`?krs=` or `#krs-…`, docs/spec/permalink.md), or a
 * shared `#s=` link. A share link that restores opens in memory mode and never
 * gets here; one that cannot be restored lands in project mode under a
 * warning, which Welcome must not cover.
 */
export function hasDeepLink(location: Pick<Location, "search" | "hash">): boolean {
  const params = new URLSearchParams(location.search);
  const { hash } = location;
  return (
    params.has("example") || params.has("krs") || hash.startsWith("#krs-") || hash.startsWith("#s=")
  );
}

export function shouldShowWelcome({
  seededDefaults,
  location,
  storage,
}: {
  seededDefaults: boolean;
  location: Pick<Location, "search" | "hash">;
  storage?: Pick<Storage, "getItem">;
}): boolean {
  return seededDefaults && !hasDeepLink(location) && !isWelcomeDismissed(storage);
}
