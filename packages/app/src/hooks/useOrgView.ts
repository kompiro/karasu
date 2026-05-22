import { useState, useEffect, useRef, useCallback } from "react";
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
import { computeViewResultFingerprint } from "./result-fingerprint.js";

interface OrgViewState {
  orgSvg: string;
  orgDiagnostics: Diagnostic[];
  orgWarnings: Warning[];
  nodePathIndex: Map<string, string[]>;
  organizations: OrganizationBlock[];
  styles: ResolvedStyles | undefined;
}

const DEBOUNCE_MS = 300;

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
  const [state, setState] = useState<OrgViewState>({
    orgSvg: "",
    orgDiagnostics: [],
    orgWarnings: [],
    nodePathIndex: new Map(),
    organizations: [],
    styles: undefined,
  });

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

  const lastValidSvg = useRef("");
  const lastValidSvgKey = useRef("");
  const lastResultFingerprint = useRef<string | null>(null);
  const hadErrors = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  const emptyStateLabels = useEmptyStateLabels();

  // Structural key for `viewPath` so a fresh `[]` from `SET_ACTIVE_VIEW` does
  // not cancel the in-flight debounce when the previous value was also empty.
  // Mirrors the same fix in `useSystemView`. See #1171.
  const viewPathKey = viewPath.join("/");

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const currentKey = `${entryPath}:org:${viewPathKey}:cmp=${compareEntryPath ?? ""}`;

    timerRef.current = setTimeout(() => {
      const baseTask = compileProject(entryPath, fs, {
        diagramType: "org",
        viewPath,
        displayMode,
        emptyStateLabels,
        theme,
      });
      const task = compareEntryPath
        ? Promise.all([
            baseTask,
            compileOrgDiff({
              beforeEntryPath: compareEntryPath,
              afterEntryPath: entryPath,
              fs: compareFs ?? fs,
              viewPath,
              displayMode,
              emptyStateLabels,
              theme,
            }),
          ]).then(([base, diff]) => {
            if (base.diagramType !== "org") return base;
            return { ...base, svg: diff.svg, diagnostics: diff.diagnostics };
          })
        : baseTask;
      task
        .then((result) => {
          if (result.diagramType !== "org") return;
          const hasErrors = result.diagnostics.some((d) => d.severity === "error");

          if (hasErrors) {
            hadErrors.current = true;
            const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
            setState((prev) => ({
              orgSvg: svgToShow,
              orgDiagnostics: result.diagnostics,
              orgWarnings: prev.orgWarnings,
              nodePathIndex: prev.nodePathIndex,
              organizations: prev.organizations,
              styles: prev.styles,
            }));
          } else {
            const fingerprint = computeViewResultFingerprint({
              svg: result.svg,
              warnings: result.warnings,
              diagnostics: result.diagnostics,
            });
            if (fingerprint === lastResultFingerprint.current && !hadErrors.current) return;
            hadErrors.current = false;
            lastValidSvg.current = result.svg;
            lastValidSvgKey.current = currentKey;
            lastResultFingerprint.current = fingerprint;
            setState({
              orgSvg: result.svg,
              orgDiagnostics: result.diagnostics,
              orgWarnings: result.warnings,
              nodePathIndex: result.nodePathIndex,
              organizations: result.organizations,
              styles: result.styles,
            });
          }
        })
        .catch(() => {
          hadErrors.current = true;
          setState((prev) => ({
            ...prev,
            orgDiagnostics: [{ severity: "error", code: "app-org-parse-error", params: {} }],
          }));
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    entryPath,
    fs,
    viewPathKey,
    displayMode,
    theme,
    compareEntryPath,
    compareFs,
    emptyStateLabels,
    recompileCounter.current,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const orgTreeSvg =
    state.organizations.length > 0
      ? renderOrgTreeView(state.organizations, expandedTeamIds, { styles: state.styles, theme })
      : "";

  const orgTreeExportSvg =
    state.organizations.length > 0
      ? renderOrgTreeView(state.organizations, new Set(collectAllTeamIds(state.organizations)), {
          forExport: true,
          styles: state.styles,
          theme,
        })
      : "";

  return { ...state, recompile, expandedTeamIds, toggleTeamExpand, orgTreeSvg, orgTreeExportSvg };
}
