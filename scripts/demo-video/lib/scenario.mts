// What a scenario file exports, and what record.mts hands it.

import type { Page } from "@playwright/test";
import type { Card } from "./compose.mts";

export type Lang = "en" | "ja";

export interface ScenarioContext {
  lang: Lang;
  /** Repository root (the worktree the scripts run from). */
  repo: string;
  /** Scratch dir for this run: a copy of the fixture, browser profiles, logs. */
  work: string;
  /** Fresh copy of `fixtures/<fixture>/<lang>/`, the model the scenario edits. */
  model: string;
  /**
   * Starts the screen recording. Call it once the first frame is worth showing
   * (window open, file loaded); record.mts stops it when `run` returns or throws.
   */
  startRecording(): void;
  /**
   * Stops the recording. Call it after the last scene, before closing the app: closing
   * VS Code with unsaved demo edits raises a "save changes?" dialog that must not end up
   * in the video. record.mts also stops it if `run` returns without calling this.
   */
  stopRecording(): Promise<void>;
  /**
   * Captures the thumbnail frame from `page` now: the app or VS Code window as it is,
   * without the caption and code panel overlays (hidden for the screenshot only, so
   * the video is unaffected). It parks the pointer first, which the video does show.
   * Call it once, on the scene that best shows the feature.
   * Without a call, the middle frame of the recording is used, overlays included.
   */
  markThumbnail(page: Page): Promise<void>;
}

export interface Scenario {
  /**
   * Build outputs the scenario runs (repo-relative), each with the command that
   * produces it. record.mts refuses to start while one is missing.
   */
  requires: ReadonlyArray<{ path: string; build: string }>;
  /** Directory under fixtures/ holding `en/` and `ja/` copies of the demo model. */
  fixture: string;
  /** Title cards per language. The outro reuses the kicker and title. */
  cards: Record<Lang, { intro: Card; outroSub: string }>;
  run(ctx: ScenarioContext): Promise<void>;
}
