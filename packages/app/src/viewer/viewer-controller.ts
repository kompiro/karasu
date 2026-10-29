import { useSyncExternalStore } from "react";
import type { DisplayMode } from "@karasu-tools/core";
import type { HighlightAttribute } from "../state/app-reducer.js";
import type { Locale } from "../i18n/locale.js";
import type { ThemePreference } from "../theme/index.js";

/**
 * What the host has asked the viewer for so far (#3311). A field left
 * `undefined` was never asked for, so the viewer keeps its own value.
 */
export interface ViewerHostState {
  entryPath: string;
  /** Bumped by every `filesChanged` call. */
  filesRevision: number;
  theme?: ThemePreference;
  locale?: Locale;
  displayMode?: DisplayMode;
  /**
   * `seq` makes a repeated request for the same node a new value, so it is
   * applied again after the user cleared the highlight in between.
   */
  highlight?: { nodeId: string | null; attribute?: HighlightAttribute; seq: number };
}

/**
 * The store between `mountViewer()`'s handle and the React tree (#3311).
 *
 * The handle is returned before React has mounted anything, so a host call
 * cannot go straight to a component. It lands here instead, and the tree reads
 * it with `useSyncExternalStore`: a call made right after mounting is
 * therefore applied on the first render instead of being lost.
 */
export class ViewerController {
  private state: ViewerHostState;
  private readonly listeners = new Set<() => void>();
  // Paths from every `filesChanged` the tree has not consumed yet. Kept as a
  // union so two calls that land before one render lose neither batch.
  private changedPaths = new Set<string>();

  constructor(entryPath: string) {
    this.state = { entryPath, filesRevision: 0 };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): ViewerHostState => this.state;

  filesChanged(paths: readonly string[]): void {
    for (const p of paths) this.changedPaths.add(p);
    this.update({ filesRevision: this.state.filesRevision + 1 });
  }

  /** Hands over the paths changed since the last call, and forgets them. */
  takeChangedPaths(): ReadonlySet<string> {
    const taken = this.changedPaths;
    this.changedPaths = new Set();
    return taken;
  }

  setEntry(entryPath: string): void {
    this.update({ entryPath });
  }

  setTheme(theme: ThemePreference): void {
    this.update({ theme });
  }

  setLocale(locale: Locale): void {
    this.update({ locale });
  }

  setDisplayMode(displayMode: DisplayMode): void {
    this.update({ displayMode });
  }

  highlight(nodeId: string | null, attribute?: HighlightAttribute): void {
    const seq = (this.state.highlight?.seq ?? 0) + 1;
    this.update({ highlight: { nodeId, attribute, seq } });
  }

  private update(patch: Partial<ViewerHostState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

export function useViewerHostState(controller: ViewerController): ViewerHostState {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
