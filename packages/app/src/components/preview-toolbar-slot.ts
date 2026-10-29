import { createContext, type ReactNode } from "react";

/**
 * A toolbar control a host can leave out (#3311). Each names one control the
 * user sees: `export` is the SVG split button with everything in its menu,
 * `allLayers` the ⊞ toggle, `docs` the Docs menu (Reference and the docs site).
 */
export type PreviewToolbarAction = "share" | "export" | "allLayers" | "docs";

/**
 * What a host other than the app puts on the preview toolbar (#2997).
 *
 * The app provides nothing, so its toolbar is exactly the default. The gallery
 * viewer (`src/viewer/`) uses it to add the theme and language switches it
 * needs, because an opaque-origin page cannot persist preferences, and to drop
 * Share, because the clipboard is unusable there. `karasu serve` keeps Share
 * but points its links at the public app (`ServeModeApp`, #3162). The VS Code
 * webview (#2996) also drops export, the all-layers view and Docs, which it does
 * not carry over from the app.
 */
export interface PreviewToolbarSlot {
  /** Controls appended after the toolbar's own. */
  extras?: ReactNode;
  /** Controls to omit entirely (not merely disable). */
  hide?: readonly PreviewToolbarAction[];
  /**
   * The origin Share builds its links on, when it is not this page's: a host
   * whose own origin the recipient cannot open (`karasu serve` on the author's
   * machine) passes the public app's (#3162, TPL-3162). Unset, links are built
   * on `window.location`.
   */
  shareOrigin?: string;
}

export const PreviewToolbarSlotContext = createContext<PreviewToolbarSlot>({});
