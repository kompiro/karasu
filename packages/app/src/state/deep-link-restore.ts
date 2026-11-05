/**
 * Ends the restoration of a deep link's hash (#3598) from a visitor's own
 * action outside `useHistoryNavigation`: a cross-view jump, an Outline click,
 * a guide's scene. Until the hash's values are all applied, the hook replaces
 * the history entry instead of pushing and keeps the values still pending;
 * once the visitor moves on, the move must be pushed and nothing pending may
 * land over it later.
 *
 * It lives outside the app state for the same reason as `preview-reveal.ts`:
 * one hook answers, and the callers are spread across panes and the first-run
 * guide, which threading a callback would have to reach one by one.
 */

let end: (() => void) | null = null;

/** Lets the mounted history hook answer `endDeepLinkRestore`; returns the unregister. */
export function registerDeepLinkRestore(handler: () => void): () => void {
  end = handler;
  return () => {
    if (end === handler) end = null;
  };
}

/** The visitor acted: a restoration still running ends here. */
export function endDeepLinkRestore(): void {
  end?.();
}
