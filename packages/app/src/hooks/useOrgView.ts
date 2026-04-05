import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
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
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      compileProject(entryPath, fs, { diagramType: "org", viewPath, displayMode })
        .then((result) => {
          if (result.diagramType !== "org") return;
          const hasErrors = result.diagnostics.some((d) => d.severity === "error");

          if (hasErrors) {
            setState((prev) => ({
              orgSvg: lastValidSvg.current,
              orgDiagnostics: result.diagnostics,
              orgWarnings: prev.orgWarnings,
              nodePathIndex: prev.nodePathIndex,
              organizations: prev.organizations,
              styles: prev.styles,
            }));
          } else {
            lastValidSvg.current = result.svg;
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
          setState((prev) => ({
            ...prev,
            orgDiagnostics: [{ severity: "error", message: "パース中にエラーが発生しました" }],
          }));
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPath, fs, viewPath, displayMode, recompileCounter.current]);

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
