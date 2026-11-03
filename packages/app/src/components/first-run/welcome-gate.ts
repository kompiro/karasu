/**
 * When the first-run Welcome shows (#3565).
 *
 * The app has no account and no server-side notion of "new user", so a first
 * visit is read from the one fact that only a first visit produces: this boot
 * found no projects and seeded the defaults. A localStorage flag remembers
 * that the visitor already chose, so a cleared OPFS on a later visit does not
 * greet them again. A visitor who arrived through a link meant for something
 * else (a gallery example, a deep permalink) is taken there, not to Welcome.
 */

export const WELCOME_DISMISSED_KEY = "karasu-welcome-dismissed";

/** Storage can throw (private windows, blocked site data); treat that as "not dismissed". */
export function isWelcomeDismissed(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(WELCOME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Best effort: if storage is unavailable, Welcome may show again on the next first visit. */
export function markWelcomeDismissed(storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(WELCOME_DISMISSED_KEY, "1");
  } catch {
    // Nothing to fall back to; the choice still applies to this session.
  }
}

/**
 * Whether the URL asks for a specific place: a gallery example (`?example=`,
 * #1646) or a deep permalink (`?krs=` or `#krs-…`, docs/spec/permalink.md).
 * Shared `#s=` links never reach project mode, so they need no check here.
 */
export function hasDeepLink(location: Pick<Location, "search" | "hash">): boolean {
  const params = new URLSearchParams(location.search);
  return params.has("example") || params.has("krs") || location.hash.startsWith("#krs-");
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
