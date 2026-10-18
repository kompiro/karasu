import { createContext, type ReactNode } from "react";

/**
 * What a host other than the app puts on the preview toolbar (#2997).
 *
 * The app provides nothing, so its toolbar is exactly the default. The gallery
 * viewer (`src/viewer/`) uses it to add the theme and language switches it
 * needs, because an opaque-origin page cannot persist preferences, and to drop
 * Share, because the clipboard is unusable there. `karasu serve` keeps Share
 * but points its links at the public app (`ServeModeApp`, #3162).
 */
export interface PreviewToolbarSlot {
  /** Controls appended after the toolbar's own. */
  extras?: ReactNode;
  /** Omit the Share button entirely (not merely disable it). */
  hideShare?: boolean;
  /**
   * The origin Share builds its links on, when it is not this page's: a host
   * whose own origin the recipient cannot open (`karasu serve` on the author's
   * machine) passes the public app's (#3162, TPL-3162). Unset, links are built
   * on `window.location`.
   */
  shareOrigin?: string;
}

export const PreviewToolbarSlotContext = createContext<PreviewToolbarSlot>({});
