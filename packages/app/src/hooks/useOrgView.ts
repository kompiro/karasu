import { useState, useCallback } from "react";
import {
  compileProject,
  compileOrgDiff,
  renderOrgTreeView,
  collectAllTeamIds,
  type Diagnostic,
  type Warning,
  type ViewPath,
  type FileSystemProvider,
  type DisplayMode,
  type DiagramTheme,
  type OrganizationBlock,
  type ResolvedStyles,
} from "@karasu-tools/core";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { useAnnotationBadgeLabels } from "../i18n/use-annotation-badge-labels.js";
import { computeViewResultFingerprint } from "./result-fingerprint.js";
import { useDebouncedCompile, type CompileOutcome } from "./useDebouncedCompile.js";

interface OrgViewState {
  orgSvg: string;
  orgDiagnostics: Diagnostic[];
  orgWarnings: Warning[];
  nodePathIndex: Map<string, string[]>;
  organizations: OrganizationBlock[];
  styles: ResolvedStyles | undefined;
}

export function useOrgView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = [],
  displayMode?: DisplayMode,
  compareEntryPath: string | null = null,
  compareFs: FileSystemProvider | null = null,
  theme?: DiagramTheme,
): OrgViewState & {
  recompile: () => void;
  expandedTeamIds: Set<string>;
  toggleTeamExpand: (teamId: string) => void;
  orgTreeSvg: string;
  orgTreeExportSvg: string;
} {
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());

  const toggleTeamExpand = useCallback((teamId: string) => {
    setExpandedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }, []);

  const emptyStateLabels = useEmptyStateLabels();
  const annotationBadgeLabels = useAnnotationBadgeLabels();

  // Structural key for `viewPath` so a fresh `[]` from `SET_ACTIVE_VIEW` does
  // not restart the in-flight debounce when the previous value was also empty.
  // Mirrors the same fix in `useSystemView`. See #1171.
  const viewPathKey = viewPath.join("/");
  const currentKey = `${entryPath}:org:${viewPathKey}:cmp=${compareEntryPath ?? ""}`;

  const compile = async (): Promise<CompileOutcome<OrgViewState> | null> => {
    if (!entryPath || !fs) return null;

    const basePromise = compileProject(entryPath, fs, {
      diagramType: "org",
      viewPath,
      displayMode,
      emptyStateLabels,
      annotationBadgeLabels,
      theme,
    });

    // Diff-mode replaces only the SVG and diagnostics; the org metadata
    // (organizations / nodePathIndex / styles / warnings) comes from the base.
    let base: Awaited<typeof basePromise>;
    let svg: string;
    let diagnostics: Diagnostic[];
    if (compareEntryPath) {
      const [b, diff] = await Promise.all([
        basePromise,
        compileOrgDiff({
          beforeEntryPath: compareEntryPath,
          afterEntryPath: entryPath,
          fs: compareFs ?? fs,
          viewPath,
          displayMode,
          emptyStateLabels,
          annotationBadgeLabels,
          theme,
        }),
      ]);
      base = b;
      svg = diff.svg;
      diagnostics = diff.diagnostics;
    } else {
      base = await basePromise;
      svg = base.svg;
      diagnostics = base.diagnostics;
    }
    if (base.diagramType !== "org") return null;
    const orgBase = base;

    return {
      // Org's fingerprint intentionally omits nodeMetadata (it carries none).
      fingerprint: computeViewResultFingerprint({ svg, warnings: orgBase.warnings, diagnostics }),
      // On error keep the prior org metadata (only swap in the stale SVG +
      // fresh diagnostics), matching the prior per-hook behavior.
      errorState: (svgToShow, prev) => ({
        orgSvg: svgToShow,
        orgDiagnostics: diagnostics,
        orgWarnings: prev.orgWarnings,
        nodePathIndex: prev.nodePathIndex,
        organizations: prev.organizations,
        styles: prev.styles,
      }),
      okState: () => ({
        orgSvg: svg,
        orgDiagnostics: diagnostics,
        orgWarnings: orgBase.warnings,
        nodePathIndex: orgBase.nodePathIndex,
        organizations: orgBase.organizations,
        styles: orgBase.styles,
      }),
      // Org names its state fields differently (orgSvg / orgDiagnostics); the
      // selectors bridge that, so the scaffold needs no per-view field names.
      getSvg: (s) => s.orgSvg,
      getDiagnostics: (s) => s.orgDiagnostics,
    };
  };

  const state = useDebouncedCompile<OrgViewState>({
    active: !!entryPath && !!fs,
    currentKey,
    initialState: {
      orgSvg: "",
      orgDiagnostics: [],
      orgWarnings: [],
      nodePathIndex: new Map(),
      organizations: [],
      styles: undefined,
    },
    compile,
    onError: (prev) => ({
      ...prev,
      orgDiagnostics: [{ severity: "error", code: "app-org-parse-error", params: {} }],
    }),
    deps: [
      entryPath,
      fs,
      viewPathKey,
      displayMode,
      theme,
      compareEntryPath,
      compareFs,
      emptyStateLabels,
      annotationBadgeLabels,
    ],
  });
  const { recompile } = state;

  const orgTreeSvg =
    state.organizations.length > 0
      ? renderOrgTreeView(state.organizations, expandedTeamIds, {
          styles: state.styles,
          theme,
          emptyStateLabels,
        })
      : "";

  const orgTreeExportSvg =
    state.organizations.length > 0
      ? renderOrgTreeView(state.organizations, new Set(collectAllTeamIds(state.organizations)), {
          forExport: true,
          styles: state.styles,
          theme,
          emptyStateLabels,
        })
      : "";

  return { ...state, recompile, expandedTeamIds, toggleTeamExpand, orgTreeSvg, orgTreeExportSvg };
}
