// The compile entry points' options and result shapes, kept apart from
// `compile.ts` (which re-exports them) so that file stays inside its line budget.

import type {
  OrganizationBlock,
  SystemNode,
  DeployBlock,
  Diagnostic,
  LogicalNodeKind,
  DeployNodeKind,
  LinkEntry,
  ClientResource as ClientResourceImpl,
  ClientCapability as ClientCapabilityImpl,
} from "../types/ast.js";
import type { ResolvedStyles } from "../types/style.js";
import type { Warning } from "../types/warnings.js";
import type { DraftState } from "../annotations/draft-confidence.js";
import type { MigrationIntent } from "../annotations/migration-intent.js";
import type { CategoryId } from "../renderer/category-collapse.js";
import type { DisplayMode } from "../renderer/layout.js";
import type { DiagramTheme } from "../renderer/palette.js";
import type { FacetOverviewEntry } from "../renderer/facet-overview.js";
import type { TeamDependencyReport } from "../view/team-dependency-extract.js";
import type { AnnotationBadgeLabels } from "../builtins/default-style.js";
import type { ViewPath } from "../view/view-slice.js";
import type { EmptyStateLabels } from "../renderer/empty-state-labels.js";
import type { PhysicalTargetIndex } from "../spec/infra-index.js";

export interface NodeMetadata {
  kind: LogicalNodeKind | DeployNodeKind;
  label: string;
  description?: string;
  descriptionSummary?: string;
  links: LinkEntry[];
  /** Owning team **id** — the identity `onNavigateToOrg` jumps by. */
  team?: string;
  /**
   * Owning team's declared `label`, when it has one. Detail panels show this
   * and fall back to {@link team}, matching the card chip (Issue #2157).
   */
  teamLabel?: string;
  role?: string;
  runtime?: string;
  /** Deploy-only: the `store` unit's managed-store tech, or an `artifact`'s type. */
  type?: string;
  /** Deploy-only: an `oci` unit's container image reference. */
  image?: string;
  /** Deploy-only: a `job` unit's cron schedule. */
  schedule?: string;
  realizes?: string[];
  tags: string[];
  annotations: string[];
  /**
   * Interpreted migration-intent params (`@deprecated(until:…)` /
   * `@experimental(until:…)` / `@migration_target(from:…)`), when the node
   * carries any. Omitted otherwise so consumers can guard cheaply (#1595).
   */
  migrationIntent?: MigrationIntent;
  /**
   * Present when the node carries `@draft` — the statement is asserted but
   * unconfirmed. `confidence` is set only when the annotation named a level,
   * because a bare `@draft` is already the mark that matters (#1995).
   */
  draft?: DraftState;
  hasChildren: boolean;
  /** Client-only: operation-tied storage resources, in declaration order. */
  resources?: ClientResourceImpl[];
  /** Client-only: device / browser capabilities, in declaration order. */
  capabilities?: ClientCapabilityImpl[];
  /**
   * True when this node has a corresponding deploy container. Set for the kinds
   * whose card carries the affordance (`DEPLOY_AFFORDANCE_KIND_SET`:
   * service / domain / client), `undefined` for the rest.
   */
  hasDeployContainer?: boolean;
  /**
   * Full drill-down ViewPath for this node (includes system ID as first segment).
   * Available for service and domain nodes. Use this for drill-down navigation
   * instead of appending the nodeId to the current viewPath.
   */
  viewPath?: string[];
}

export type DiagramType = "system" | "deploy" | "org";

export interface DeployBlockInfo {
  id: string;
  label: string;
}

/** Options for compile() and compileProject(). */
export interface CompileOptions {
  /** Which diagram to render. Defaults to "system". */
  diagramType?: DiagramType;
  /** Optional .krs.style content. Do NOT pre-concatenate icon theme when using displayMode "icon". */
  styleSource?: string;
  /** Drill-down path for system and org diagrams. Ignored for deploy. */
  viewPath?: ViewPath;
  /** Active deploy container ID. Deploy diagram only. */
  selectedDeployId?: string;
  /** "icon" switches nodes to fixed-size icon card layout. */
  displayMode?: DisplayMode;
  /** Translated labels for renderer-embedded empty-state messages. */
  emptyStateLabels?: EmptyStateLabels;
  /**
   * Diagram theme. Drives both the renderer chrome palette and which
   * built-in `.krs.style` variant sits at the bottom of the cascade.
   * Defaults to `"dark"` so existing output is unchanged.
   */
  theme?: DiagramTheme;
  /**
   * Translated labels for the built-in annotation badges (@deprecated /
   * @new / @experimental / @migration_target). Omitted keys fall back to
   * the reference-data en labels. User `.krs.style` badge-label rules
   * still override these (cascade is unchanged).
   */
  annotationBadgeLabels?: AnnotationBadgeLabels;
  /**
   * System-view node categories the viewer has collapsed (Issue #1821). Each
   * collapsed category (`"infra"` / `"external"`) is folded to a single ⊕ stub
   * before layout so the diagram reflows. Omit for the default fully-expanded
   * render. System view only; see ADR-1821.
   */
  collapsedCategories?: ReadonlySet<CategoryId>;
  /**
   * Draw the interactive category controls (⊖ / hover frame) for the live
   * preview (Issue #1821). Defaults to false so static outputs stay clean.
   */
  interactive?: boolean;
  /**
   * Draw the per-node info / deploy buttons (#2420). Separate from
   * `interactive` because the two describe different capabilities of the
   * viewer: the VS Code webview wires up `data-info-button` but implements no
   * category collapsing, so riding one flag would give it a dead ⊖ control.
   * Static outputs (CLI render, `/render`, exports) leave both off.
   */
  nodeControls?: boolean;
  /**
   * System-view grouping axis (Issue #1858, P2a). `"team"` stacks each node's
   * owning team (resolved via the `organization`/`owns` block) as a
   * dependency-ordered band with a boundary frame. Omit for the default
   * un-grouped kind-tier layout. System view only; see
   * ADR-1858.
   */
  groupBy?: "team" | "boundary";
  /**
   * Facet ids the viewer has selected for the overlay (#2174). Viewer state,
   * never model state — nothing here is written back to `.krs`. An empty or
   * absent selection renders exactly as before.
   */
  selectedFacets?: readonly string[];
  /**
   * System-view team ids collapsed to a `<Team> (N)` stub (Issue #1858, P2a).
   * Only meaningful with `groupBy: "team"`. Cross-group edges re-target onto the
   * stub, so collapsing every team yields the group-dependency-DAG view. Omit
   * for the default fully-expanded grouped render.
   */
  collapsedGroups?: ReadonlySet<string>;
  /**
   * System-view service ids expanded in place (Issue #1921). Each named service
   * is drawn with its domain children inside a boundary frame while siblings
   * stay collapsed; cross-boundary edges re-anchor to the exact internal domain.
   * Phase 1 honours at most one entry and only in the ungrouped system view.
   */
  expandedContainers?: ReadonlySet<string>;
}

export interface SystemCompileResult {
  diagramType: "system";
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  /**
   * The same metadata keyed by the node's full path in the `nodePathRefId`
   * text form (`Shop.Api`), the value a card carries as `data-node-path`
   * (#2917). Where two nodes share a bare id, `nodeMetadata` holds the
   * `nodePathRanking` winner's (#2934); this map holds both, each with the
   * `viewPath` that drills to exactly that node.
   */
  nodeMetadataByPath: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  /**
   * Whether the project has at least one `organization` block. Mirrors
   * `hasDeployDiagram` so app-level auto-switch hooks can read every
   * "is view X populated?" flag from a single compile result instead of
   * racing the org compile (Issue #923).
   */
  hasOrgDiagram: boolean;
  /**
   * Whether the project declares at least one `boundary` block (#1822 P2b).
   * Gates the "Group by: boundary" axis in the app the same way
   * `hasOrgDiagram` gates "Group by: team".
   */
  hasBoundaries: boolean;
  deployBlocks: DeployBlockInfo[];
  /**
   * Fully resolved system tree (all imports merged), with a synthetic
   * `__unassigned__` system wrapping any top-level orphan services / domains /
   * infra blocks so consumers can walk a single system list and reach every
   * usecase / resource. Use for breadcrumb traversal and for view extractors
   * such as `extractCrudMatrix`.
   */
  systems: SystemNode[];
  /**
   * What a `resource <Parent>.<Child>` can name across the whole merged model:
   * infra leaves and client storages, top-level clients included (#3794). Pass
   * it to `extractCrudMatrix` / `extractCoverage` with `systems`.
   */
  physicalTargets: PhysicalTargetIndex;
  /** Maps each node id to the file path where it is defined. */
  nodeFileIndex: Map<string, string>;
  /**
   * Every facet the model knows, declared-first then reference-only, in the
   * order the overlay assigns colours (#2174). This is what the app's selector
   * offers; intersecting the user's selection with it is what keeps a facet that
   * was edited out of the model from lingering in the selection (TPL-1032).
   */
  facets: { id: string; label?: string }[];
  /**
   * "Which elements belong to facet X", derived from the model (#2177).
   *
   * The centralized audit view the design owes for writing membership
   * element-side. Derived on every compile — there is no authored second copy
   * to drift (TPL-1032). Empty when the model knows no facets.
   */
  facetOverview: FacetOverviewEntry[];
}

export interface DeployCompileResult {
  diagramType: "deploy";
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
  /**
   * All deploy blocks with their nodes, as parsed. Unlike the rendered
   * `svg` (one selected block) this carries the full tree so consumers
   * such as the App Outline can list every block. Flat: block → nodes.
   */
  deployTree: DeployBlock[];
}

export interface OrgCompileResult {
  diagramType: "org";
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  nodePathIndex: Map<string, string[]>;
  organizations: OrganizationBlock[];
  /** Maps each owned service/domain id to its resolved primary owner team id. */
  ownerIndex: Map<string, string>;
  /** Resolved node/edge styles for use in tree view rendering. */
  styles: ResolvedStyles;
  /**
   * Team dependencies derived from `owns` × the logical edges (#2597).
   *
   * Carried on the **org** result because the org tab is where it is drawn
   * (ADR-309's precedent: org modes live on the org tab), and computed here
   * because this is the one place holding both halves of the join — the org
   * result's `organizations` and the merged file's systems. Deriving it in the
   * app would need a second resolve of the same project.
   *
   * Empty (`teams: []`) when the model declares no `organization`, which is
   * what gates the mode in the app rather than a separate flag to drift
   * against (TPL-1032).
   *
   * **Lazily derived, memoized on first read.** The join walks every edge of
   * every container and builds two indices, and almost no org compile wants
   * it: `karasu render --view org`, the docs-site example renderer and the
   * VS Code webview never read this field, and the app reads it only while the
   * dependency mode is open. Keeping it a property rather than a separate
   * entry point preserves the "one resolve, one model" guarantee the org tab
   * relies on; making it lazy stops every other caller paying for it.
   */
  readonly teamDependencies: TeamDependencyReport;
}

/** Discriminated union of all compile result types. Narrow on `diagramType` to access type-specific fields. */
export type CompileResult = SystemCompileResult | DeployCompileResult | OrgCompileResult;
