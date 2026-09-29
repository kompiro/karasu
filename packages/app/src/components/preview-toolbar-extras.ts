import { createContext, type ReactNode } from "react";

/**
 * Extra controls a host can append to the preview toolbar (#2993 spike).
 *
 * The app provides nothing, so its toolbar is unchanged. The gallery viewer
 * uses it for the theme and language switches it needs because an
 * opaque-origin page cannot persist preferences.
 */
export const PreviewToolbarExtrasContext = createContext<ReactNode>(null);
