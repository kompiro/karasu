import { createContext, type ReactNode } from "react";

/**
 * What a host other than the app puts on the preview toolbar (#2997).
 *
 * The app provides nothing, so its toolbar is exactly the default. The gallery
 * viewer (`src/viewer/`) uses it to add the theme and language switches it
 * needs, because an opaque-origin page cannot persist preferences, and to drop
 * Share, because the clipboard is unusable there.
 */
export interface PreviewToolbarSlot {
  /** Controls appended after the toolbar's own. */
  extras?: ReactNode;
  /** Omit the Share button entirely (not merely disable it). */
  hideShare?: boolean;
}

export const PreviewToolbarSlotContext = createContext<PreviewToolbarSlot>({});
