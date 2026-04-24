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
  type OrganizationBlock,
  type ResolvedStyles,
} from "@karasu-tools/core";
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";

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
  const hadErrors = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  const emptyStateLabels = useEmptyStateLabels();

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const currentKey = `${entryPath}:org:${viewPath.join("/")}:cmp=${compareEntryPath ?? ""}`;

    timerRef.current = setTimeout(() => {
      const baseTask = compileProject(entryPath, fs, {
        diagramType: "org",
        viewPath,
        displayMode,
        emptyStateLabels,
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
            if (result.svg === lastValidSvg.current && !hadErrors.current) return;
            hadErrors.current = false;
            lastValidSvg.current = result.svg;
            lastValidSvgKey.current = currentKey;
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
    viewPath,
    displayMode,
    compareEntryPath,
    compareFs,
    emptyStateLabels,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    recompileCounter.current,
  ]);

  const orgTreeSvg =
    state.organizations.length > 0
      ? renderOrgTreeView(state.organizations, expandedTeamIds, { styles: state.styles })
      : "";

  const orgTreeExportSvg =
    state.organizations.length > 0
      ? renderOrgTreeView(state.organizations, new Set(collectAllTeamIds(state.organizations)), {
          forExport: true,
          styles: state.styles,
        })
      : "";

  return { ...state, recompile, expandedTeamIds, toggleTeamExpand, orgTreeSvg, orgTreeExportSvg };
}
