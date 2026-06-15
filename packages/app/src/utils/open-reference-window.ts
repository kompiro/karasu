import type { ActiveView } from "../state/app-reducer.js";

/** Stable window name so re-opening focuses/reuses the existing reference window. */
const REFERENCE_WINDOW_NAME = "karasu-reference";

/**
 * Open (or focus) the reference in a separate browser window, seeded with the
 * current diagram view. The window loads the same app bundle in `?reference`
 * mode (see `main.tsx` / `ReferenceWindow`), so styling and locale carry over
 * for free. Kept in its own window so the user can consult it while editing —
 * a modal in the main window would trap focus (#1548 follow-up).
 */
export function openReferenceWindow(activeView: ActiveView): void {
  const url = `${window.location.pathname}?reference=1&view=${encodeURIComponent(activeView)}`;
  const win = window.open(url, REFERENCE_WINDOW_NAME, "popup=yes,width=560,height=800");
  win?.focus();
}
