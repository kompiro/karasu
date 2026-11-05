import { anchorId } from "@karasu-tools/core";
import type { ShareTarget } from "@karasu-tools/core";
import type { ActiveView } from "../state/app-reducer.js";

/**
 * The URL hash the app's history navigation reads and writes: the view, the
 * drill, the highlight, and the open file (#811). Kept apart from
 * `useHistoryNavigation` so the boot can build a hash without the hook (#3598).
 */

/**
 * Optional hash modifiers. An object (not positional args) so callers can't
 * silently pass a value into the wrong slot — the failure mode where a
 * highlight string landed where a mode boolean was expected (see the churn when
 * the entity sub-mode was added, #1907).
 */
interface BuildHashOptions {
  /** Org Tree View mode (only meaningful when `activeView === "org"`). */
  orgTree?: boolean;
  /** Entity sub-mode (only meaningful when `activeView === "system"` and drilled). */
  entityView?: boolean;
  /** Element id to focus-highlight on arrival. */
  highlight?: string | null;
  /** Open file to carry as `?file=` (Issue #811). */
  file?: string | null;
}

/**
 * Encodes activeView + viewPath + open file into a URL hash string.
 *
 * Examples:
 *   ("deploy", [])                                          → "#krs-deploy"
 *   ("deploy", [], { highlight: "ECommerce" })              → "#krs-deploy:ECommerce"
 *   ("system", [])                                          → "#krs-system-root"
 *   ("system", ["Payment"])                                → "#krs-system-Payment"
 *   ("org", ["a", "b"])                                     → "#krs-org-b"  (last segment only)
 *   ("org", [], { orgTree: true })                         → "#krs-org-tree"  (Tree View mode)
 *   ("org", [], { highlight: "ecTeam" })                   → "#krs-org-root:ecTeam"
 *   ("system", ["Ordering"], { entityView: true })         → "#krs-entity-Ordering"  (entity sub-mode)
 *   ("system", [], { file: "/p/before.krs" })              → "#krs-system-root?file=%2Fp%2Fbefore.krs"
 */
export function buildHash(
  activeView: ActiveView,
  viewPath: string[],
  options: BuildHashOptions = {},
): string {
  const {
    orgTree: isOrgTreeView = false,
    entityView: isEntityView = false,
    highlight: highlightNodeId = null,
    file: filePath = null,
  } = options;
  // Exhaustive dispatch on activeView — adding a new ActiveView member without
  // updating this switch fails the `never` assignment at compile time. Locks in
  // TPL-1094 (the #1094 failure mode where a new tab silently fell into
  // the fallback branch and produced the wrong hash).
  let base: string;
  switch (activeView) {
    case "deploy":
      base = "#krs-deploy";
      break;
    case "matrix":
      base = "#krs-matrix";
      break;
    // system/org are drillable: their element anchors route through the shared
    // `anchorId` grammar (core), so the SPA hash and the static drill-down SVG
    // emit one form — the cross-surface parity guarded by TPL-1827.
    // (deploy/matrix above are single-level whole-view tabs with a bare
    // `#krs-<view>` token, and org Tree View is a mode — these are not element
    // anchors and intentionally do not share the leaf grammar; see
    // docs/spec/permalink.md.)
    case "org":
      base = isOrgTreeView
        ? "#krs-org-tree"
        : `#${anchorId("org", viewPath.length === 0 ? "root" : viewPath[viewPath.length - 1])}`;
      break;
    case "system":
      // Entity sub-mode: while drilled into a domain, the same drill path is
      // addressed with the `entity` prefix (mirrors the static
      // #krs-entity-<domainId> bundle level). The sub-mode has no meaning at the
      // system root (no domain drilled), so it falls back to the system anchor.
      base =
        isEntityView && viewPath.length > 0
          ? `#${anchorId("entity", viewPath[viewPath.length - 1])}`
          : `#${anchorId("system", viewPath.length === 0 ? "root" : viewPath[viewPath.length - 1])}`;
      break;
    default: {
      const _exhaustive: never = activeView;
      throw new Error(`unhandled activeView: ${String(_exhaustive)}`);
    }
  }
  const withHighlight = highlightNodeId ? `${base}:${highlightNodeId}` : base;
  return filePath ? `${withHighlight}?file=${encodeURIComponent(filePath)}` : withHighlight;
}

/**
 * Convert a deep permalink {@link ShareTarget} (carried inside a shared
 * `#s=` payload, #1827) into the canonical `#krs-<view>-<node>:highlight`
 * hash. Reuses {@link buildHash} so the share path and the in-app navigation
 * path emit one grammar. The leaf `node` becomes the single-segment viewPath;
 * `useHistoryNavigation` reconstructs the full path from it via the node-path
 * index on mount, exactly as a normal drill hash resolves.
 */
export function shareTargetToHash(target: ShareTarget): string {
  return buildHash(target.view, target.node ? [target.node] : [], {
    orgTree: target.orgTree ?? false,
    entityView: target.entityView ?? false,
    highlight: target.highlight ?? null,
  });
}

/**
 * Decodes a URL hash string into { activeView, nodeId, isOrgTreeView, highlightNodeId, filePath }.
 * nodeId is null for root and tree-view hashes.
 * highlightNodeId is extracted from the optional colon-suffixed segment (e.g. "#krs-deploy:ECommerce").
 * filePath is extracted from the optional `?file=<encoded>` suffix (Issue #811).
 * Returns null for unrecognized hashes.
 */
export function parseHash(hash: string): {
  activeView: ActiveView;
  nodeId: string | null;
  isOrgTreeView: boolean;
  isEntityView: boolean;
  highlightNodeId: string | null;
  filePath: string | null;
} | null {
  // Strip the `?file=` suffix first so it doesn't interfere with `:` parsing.
  let filePath: string | null = null;
  let core = hash;
  const queryIdx = hash.indexOf("?", 1);
  if (queryIdx !== -1) {
    const query = hash.slice(queryIdx + 1);
    core = hash.slice(0, queryIdx);
    const params = new URLSearchParams(query);
    const f = params.get("file");
    if (f) filePath = f;
  }

  // Extract optional highlight suffix: "#krs-deploy:ECommerce" → base="#krs-deploy", highlight="ECommerce"
  const colonIdx = core.indexOf(":", 1);
  let highlightNodeId: string | null = null;
  let base = core;
  if (colonIdx !== -1) {
    highlightNodeId = core.slice(colonIdx + 1) || null;
    base = core.slice(0, colonIdx);
  }

  // Exhaustive dispatch table — `satisfies Record<ActiveView, ...>` on
  // PARSE_DISPATCHERS makes adding a new ActiveView a compile error here as
  // well as in buildHash. Each dispatcher matches a disjoint prefix, so
  // iteration order is irrelevant.
  for (const view of Object.keys(PARSE_DISPATCHERS) as ActiveView[]) {
    const parsed = PARSE_DISPATCHERS[view](base);
    if (parsed) return { ...parsed, highlightNodeId, filePath };
  }
  return null;
}

type ParseResult = {
  activeView: ActiveView;
  nodeId: string | null;
  isOrgTreeView: boolean;
  isEntityView: boolean;
};

const PARSE_DISPATCHERS = {
  deploy: (base) =>
    base === "#krs-deploy"
      ? { activeView: "deploy", nodeId: null, isOrgTreeView: false, isEntityView: false }
      : null,
  matrix: (base) =>
    base === "#krs-matrix"
      ? { activeView: "matrix", nodeId: null, isOrgTreeView: false, isEntityView: false }
      : null,
  org: (base) => {
    if (base === "#krs-org-tree")
      return { activeView: "org", nodeId: null, isOrgTreeView: true, isEntityView: false };
    const m = base.match(/^#krs-org-(.+)$/);
    if (!m) return null;
    return {
      activeView: "org",
      nodeId: m[1] === "root" ? null : m[1],
      isOrgTreeView: false,
      isEntityView: false,
    };
  },
  system: (base) => {
    // The entity view is a system-view sub-mode keyed by the drilled domain id,
    // so its #krs-entity-<domainId> hash resolves to activeView "system" with
    // the entity sub-mode on. Checked before the plain system anchor.
    const em = base.match(/^#krs-entity-(.+)$/);
    if (em) {
      return {
        activeView: "system",
        nodeId: em[1] === "root" ? null : em[1],
        isOrgTreeView: false,
        isEntityView: true,
      };
    }
    const m = base.match(/^#krs-system-(.+)$/);
    if (!m) return null;
    return {
      activeView: "system",
      nodeId: m[1] === "root" ? null : m[1],
      isOrgTreeView: false,
      isEntityView: false,
    };
  },
} satisfies Record<ActiveView, (base: string) => ParseResult | null>;
