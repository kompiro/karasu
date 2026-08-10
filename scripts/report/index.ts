// Public surface of the report scaffolding (Issue #2419). A generator under
// reports/<topic>/ imports from here; see reports/README.md.
//
// Declared as a knip `entry` in knip.json: every consumer other than demo.ts
// lives under the gitignored reports/, so knip cannot see the usage and would
// report the whole surface as dead.

export {
  dataUri,
  escapeHtml,
  pair,
  pane,
  reportPage,
  type Pane,
  type ReportPageOptions,
  type ReportSection,
} from "./html.ts";
export { renderKrs, type RenderOptions } from "./render.ts";
export { capture, type CaptureOptions, type ShotSpec, type Viewport } from "./screenshot.ts";
