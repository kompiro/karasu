import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  compileSystemDiff,
  resolveIconManifest,
  type Warning,
  type Diagnostic,
  type ViewPath,
  type FileSystemProvider,
  type NodeMetadata,
  type DisplayMode,
  type SystemNode,
} from "@karasu-tools/core";
import iconManifest from "@karasu-tools/core/icons/icons.json";
import serviceSvg from "@karasu-tools/core/icons/service.svg?raw";
import userSvg from "@karasu-tools/core/icons/user.svg?raw";
import domainSvg from "@karasu-tools/core/icons/domain.svg?raw";
import resourceSvg from "@karasu-tools/core/icons/resource.svg?raw";
import teamSvg from "@karasu-tools/core/icons/team.svg?raw";
import memberSvg from "@karasu-tools/core/icons/member.svg?raw";
import usecaseSvg from "@karasu-tools/core/icons/usecase.svg?raw";
import databaseSvg from "@karasu-tools/core/icons/database.svg?raw";
import queueSvg from "@karasu-tools/core/icons/queue.svg?raw";
import queueCardSvg from "@karasu-tools/core/icons/queue-card.svg?raw";
import tableSvg from "@karasu-tools/core/icons/table.svg?raw";
import apiSvg from "@karasu-tools/core/icons/api.svg?raw";
import cloudSvg from "@karasu-tools/core/icons/cloud.svg?raw";
import cloudCardSvg from "@karasu-tools/core/icons/cloud-card.svg?raw";
import ociSvg from "@karasu-tools/core/icons/oci.svg?raw";
import lambdaSvg from "@karasu-tools/core/icons/lambda.svg?raw";
import jarSvg from "@karasu-tools/core/icons/jar.svg?raw";
import warSvg from "@karasu-tools/core/icons/war.svg?raw";
import functionSvg from "@karasu-tools/core/icons/function.svg?raw";
import assetsSvg from "@karasu-tools/core/icons/assets.svg?raw";
import jobSvg from "@karasu-tools/core/icons/job.svg?raw";
import artifactSvg from "@karasu-tools/core/icons/artifact.svg?raw";

interface SystemViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  systems: SystemNode[];
  nodeFileIndex: Map<string, string>;
}

// Register icons from manifest on module load (builtIn: true for placeholder injection)
resolveIconManifest(
  iconManifest,
  {
    "service.svg": serviceSvg,
    "user.svg": userSvg,
    "domain.svg": domainSvg,
    "resource.svg": resourceSvg,
    "team.svg": teamSvg,
    "member.svg": memberSvg,
    "usecase.svg": usecaseSvg,
    "database.svg": databaseSvg,
    "queue.svg": queueSvg,
    "queue-card.svg": queueCardSvg,
    "table.svg": tableSvg,
    "api.svg": apiSvg,
    "cloud.svg": cloudSvg,
    "cloud-card.svg": cloudCardSvg,
    "oci.svg": ociSvg,
    "lambda.svg": lambdaSvg,
    "jar.svg": jarSvg,
    "war.svg": warSvg,
    "function.svg": functionSvg,
    "assets.svg": assetsSvg,
    "job.svg": jobSvg,
    "artifact.svg": artifactSvg,
  },
  true,
);

const DEBOUNCE_MS = 300;

export function useSystemView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = [],
  displayMode: DisplayMode = "shape",
  compareEntryPath: string | null = null,
): SystemViewState & { recompile: () => void } {
  const [state, setState] = useState<SystemViewState>({
    svg: "",
    warnings: [],
    diagnostics: [],
    nodeMetadata: new Map(),
    hasDeployDiagram: false,
    systems: [],
    nodeFileIndex: new Map(),
  });

  const lastValidSvg = useRef("");
  const lastValidSvgKey = useRef("");
  const hadErrors = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const currentKey = `${entryPath}:system:${viewPath.join("/")}:cmp=${compareEntryPath ?? ""}`;

    timerRef.current = setTimeout(async () => {
      try {
        if (compareEntryPath) {
          // Diff-mode: render the union of `compareEntryPath` (before) vs `entryPath` (after).
          // We still need a baseline compileProject result for nodeMetadata / systems used by
          // surrounding UI (breadcrumbs, NodeDetailPanel). The diff SVG replaces only `svg`.
          const [base, diff] = await Promise.all([
            compileProject(entryPath, fs, { diagramType: "system", viewPath, displayMode }),
            compileSystemDiff({
              beforeEntryPath: compareEntryPath,
              afterEntryPath: entryPath,
              fs,
              viewPath,
              displayMode,
            }),
          ]);
          if (base.diagramType !== "system") return;
          const hasErrors = diff.diagnostics.some((d) => d.severity === "error");
          if (hasErrors) {
            hadErrors.current = true;
            const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
            setState({
              svg: svgToShow,
              warnings: base.warnings,
              diagnostics: diff.diagnostics,
              nodeMetadata: base.nodeMetadata,
              hasDeployDiagram: base.hasDeployDiagram,
              systems: base.systems,
              nodeFileIndex: base.nodeFileIndex,
            });
          } else {
            if (diff.svg === lastValidSvg.current && !hadErrors.current) return;
            hadErrors.current = false;
            lastValidSvg.current = diff.svg;
            lastValidSvgKey.current = currentKey;
            setState({
              svg: diff.svg,
              warnings: base.warnings,
              diagnostics: diff.diagnostics,
              nodeMetadata: base.nodeMetadata,
              hasDeployDiagram: base.hasDeployDiagram,
              systems: base.systems,
              nodeFileIndex: base.nodeFileIndex,
            });
          }
          return;
        }

        const result = await compileProject(entryPath, fs, {
          diagramType: "system",
          viewPath,
          displayMode,
        });
        if (result.diagramType !== "system") return;
        const hasErrors = result.diagnostics.some((d) => d.severity === "error");

        if (hasErrors) {
          hadErrors.current = true;
          const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
          setState({
            svg: svgToShow,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            hasDeployDiagram: result.hasDeployDiagram,
            systems: result.systems,
            nodeFileIndex: result.nodeFileIndex,
          });
        } else {
          if (result.svg === lastValidSvg.current && !hadErrors.current) return;
          hadErrors.current = false;
          lastValidSvg.current = result.svg;
          lastValidSvgKey.current = currentKey;
          setState({
            svg: result.svg,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            hasDeployDiagram: result.hasDeployDiagram,
            systems: result.systems,
            nodeFileIndex: result.nodeFileIndex,
          });
        }
      } catch {
        hadErrors.current = true;
        setState((prev) => ({
          ...prev,
          diagnostics: [
            {
              severity: "error",
              code: "app-project-compile-error",
              params: {},
            },
          ],
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPath, fs, viewPath, displayMode, compareEntryPath, recompileCounter.current]);

  return { ...state, recompile };
}
