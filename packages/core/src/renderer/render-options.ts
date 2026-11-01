import type { NodeDiffMeta } from "../diff/view-diff.js";
import type { Diagnostic, LegendBlock, LegendViewScope } from "../types/ast.js";
import type { StyleSheet } from "../types/style.js";
import type { LegendUsage } from "../legend/usage.js";
import type { CategoryId } from "./category-collapse.js";
import type { EmptyStateLabels } from "./empty-state-labels.js";
import type { FacetOverlay } from "./facet-overlay.js";
import type { GroupLabelIndex } from "./group-labels.js";
import type { DiagramTheme } from "./palette.js";

export interface RenderOptions {
  /** Diff state per node id (and per edge key `from->to`) for diff-mode rendering. */
  nodeDiffState?: Map<string, string>;
  edgeDiffState?: Map<string, string>;
  /**
   * Full node diff metadata. When provided, the renderer derives the node's
   * `data-diff-state` from `meta.state` (preferred over `nodeDiffState`) and
   * decorates annotation badges with their own per-badge diff state
   * (Issue #738 / design doc D-2).
   */
  nodeDiffMeta?: Map<string, NodeDiffMeta>;
  /**
   * The canvas cards' diff metadata keyed by full path (`DiffedView.nodesByPath`).
   * When provided, a card that knows its path takes its state from here and
   * nowhere else: a miss means the card has no state, not that it may borrow
   * the bare-id entry of a same-named node (#2934).
   */
  nodeDiffMetaByPath?: Map<string, NodeDiffMeta>;
  /**
   * Diff state per container keyed by container id (deploy: `serviceId`). When
   * present, the matching `<g data-container-id>` emits `data-diff-state` so
   * CSS can highlight whole-container additions/removals (Issue #750).
   */
  containerDiffState?: Map<string, string>;
  /**
   * Localized labels for the empty-state placeholder rendered when the
   * layout has no nodes or containers. When omitted, English fallbacks
   * from `DEFAULT_EMPTY_STATE_LABELS` are used.
   */
  emptyLabels?: EmptyStateLabels;
  /**
   * Legend blocks declared in the source `.krs`. The renderer paints a
   * footer band below the diagram for every block that targets the
   * current view scope (or omits scope). Pair with `styleSheets` so
   * `ref` entries can resolve to swatch colors via the style cascade.
   */
  legends?: LegendBlock[];
  /** Resolved style sheets, used by the legend footer to color `ref` entries. */
  styleSheets?: StyleSheet[];
  /**
   * Tag/annotation/id/kind usage from the file. Lets the legend footer
   * fall back to a neutral swatch for refs that are in use on real nodes
   * but not painted by any style rule (e.g. `[human]`).
   */
  legendUsage?: LegendUsage;
  /**
   * Which view this render produces. Drives the legend's scope filter so
   * a `legend deploy "..."` block does not leak into the system view.
   */
  viewScope?: LegendViewScope;
  /**
   * Diagram theme. Drives the chrome palette (canvas background, legend
   * band, empty-state text, diff indicators, …). Defaults to `"dark"` so
   * existing output is unchanged. The matching built-in `.krs.style`
   * variant is selected by the caller (see `index.ts`).
   */
  theme?: DiagramTheme;
  /**
   * System-view node categories the viewer has collapsed (Issue #1821).
   * Each collapsed category's nodes are replaced by a single ⊕ stub before
   * layout, so the diagram reflows and edges to the hidden nodes drop. Omit
   * (or empty) for the default fully-expanded render. Only meaningful on the
   * system view; see `docs/design/layer-toggles.md`.
   */
  collapsedCategories?: ReadonlySet<CategoryId>;
  /**
   * When true, draw the interactive category controls (the ⊖ collapse buttons
   * and hover extent frames) for the live preview (Issue #1821). Defaults to
   * false so static outputs — SVG export, `/render`, CLI, guide diagrams — stay
   * clean. The ⊕ stub of an already-collapsed category is always drawn (it is
   * content, not chrome).
   */
  interactive?: boolean;
  /**
   * When true, draw the per-node info / deploy buttons in the card's corner
   * lane (Issue #2420). Defaults to false, so static outputs carry no button
   * for a viewer that cannot click it.
   *
   * Deliberately not folded into `interactive`: the two name different viewer
   * capabilities. The VS Code webview handles `data-info-button` but has no
   * category-collapse handling, so one shared flag would either take away its
   * ⓘ or give it a dead ⊖.
   */
  nodeControls?: boolean;
  /**
   * System-view grouping axis. `"team"` (#1858, P2a) bands each node's owning
   * team; `"boundary"` (#1822, P2b) bands by declared `boundary`. Omit for the
   * default un-grouped kind-tier layout.
   */
  groupBy?: "team" | "boundary";
  /**
   * Declared-boundary axis (node id → every boundary it is declared in, #2178).
   * Sourced from `krsFile.boundaryMembership`; consumed by layout only when
   * `groupBy === "boundary"`, which bands each node by its primary membership.
   */
  boundaryMembership?: Map<string, string[]>;
  /**
   * `krsFile.scopedBoundaryMembership` — membership from `boundary` blocks
   * declared inside a node block (#2036). Layout picks the entry for the canvas
   * it is drawing, so these frame their own level only.
   */
  scopedBoundaryMembership?: Map<string, Map<string, string[]>>;
  /**
   * Group ids the model declares on the active axis, in declaration order
   * (`declaredGroupOrder`). Keeps a declared-but-unplaceable group in the group
   * order instead of letting the axis map decide which groups exist (#2178).
   */
  declaredGroupOrder?: readonly string[];
  /**
   * Declared group labels for the active axis (#2133), from
   * `buildGroupLabelIndex(krsFile, groupBy)`; layout resolves them per canvas.
   * Titles the group frames; omitted → frames fall back to the group id.
   */
  groupLabels?: GroupLabelIndex;
  /**
   * Team id → declared `label`, from `buildTeamLabelIndex(krsFile)`. Supplies
   * the owner chip's display string on every axis; omitted → the chip falls
   * back to the team id (Issue #2157).
   */
  teamLabels?: ReadonlyMap<string, string>;
  collapsedGroups?: ReadonlySet<string>;
  /**
   * Whether the in-place expansion ⊕/⊖ controls may be drawn (Issue #1921).
   * `render()` sets it from the slice's system count so the affordance only
   * appears on the single-system root, where expansion is actually derived.
   * Internal — set by `render()`, not a public compile option.
   */
  expandable?: boolean;
  /**
   * Where `render` reports the diagnostics only a laid-out view can state
   * (#2179) — today, `boundary-membership-not-drawn`. Whether a boundary's frame
   * can reach a card depends on where the cards landed, so the parser cannot
   * know it and the compile pipeline cannot derive it without laying out.
   *
   * A sink rather than a return value because `render` returns the SVG string,
   * and it is called from surfaces that render *many* views into one artifact
   * (the drill-down and all-layers bundles call it once per level); collecting
   * into a caller-owned array is what lets those accumulate. This mirrors how
   * `ResolvedStyles.warnings` is collected.
   *
   * **Every surface that passes `groupBy` should pass this too** — the `◇` tab
   * is drawn from the layout on all of them, so a surface that omits the sink
   * draws the fallback while its diagnostics list stays silent, which is the
   * split TPL-1983 rules out. Entries are deduplicated on push, so a membership
   * that degrades at several levels of one bundle is stated once.
   */
  diagnosticSink?: Diagnostic[];
  /**
   * Resolved facet overlay (#2174). Absent means the overlay is off, and the
   * renderer then emits nothing extra — that absence is what keeps
   * "no facet selected ⇒ byte-identical output" true.
   */
  facetOverlay?: FacetOverlay;
  /**
   * Localized heading for the overlay's legend block. Core keeps an English
   * default, the way `emptyLabels` / `annotationBadgeLabels` do — the renderer
   * never reaches for a translation table.
   */
  facetLegendTitle?: string;
}
