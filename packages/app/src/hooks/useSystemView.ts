import { useState, useEffect, useRef, useCallback } from "react";
import {
  compileProject,
  resolveIconManifest,
  type Warning,
  type Diagnostic,
  type ViewPath,
  type FileSystemProvider,
  type NodeMetadata,
  type DisplayMode,
} from "@karasu-tools/core";
import iconManifest from "@karasu-tools/core/icons/icons.json";
import serviceSvg from "@karasu-tools/core/icons/service.svg?raw";
import userSvg from "@karasu-tools/core/icons/user.svg?raw";
import domainSvg from "@karasu-tools/core/icons/domain.svg?raw";
import resourceSvg from "@karasu-tools/core/icons/resource.svg?raw";
import teamSvg from "@karasu-tools/core/icons/team.svg?raw";
import memberSvg from "@karasu-tools/core/icons/member.svg?raw";
import databaseSvg from "@karasu-tools/core/icons/database.svg?raw";
import queueSvg from "@karasu-tools/core/icons/queue.svg?raw";
import apiSvg from "@karasu-tools/core/icons/api.svg?raw";
import cloudSvg from "@karasu-tools/core/icons/cloud.svg?raw";
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
    "database.svg": databaseSvg,
    "queue.svg": queueSvg,
    "api.svg": apiSvg,
    "cloud.svg": cloudSvg,
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
): SystemViewState & { recompile: () => void } {
  const [state, setState] = useState<SystemViewState>({
    svg: "",
    warnings: [],
    diagnostics: [],
    nodeMetadata: new Map(),
    hasDeployDiagram: false,
  });

  const lastValidSvg = useRef("");
  const lastValidSvgKey = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recompileCounter = useRef(0);

  const recompile = useCallback(() => {
    recompileCounter.current++;
    setState((prev) => ({ ...prev }));
  }, []);

  useEffect(() => {
    if (!entryPath || !fs) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const currentKey = `${entryPath}:system`;

    timerRef.current = setTimeout(async () => {
      try {
        const result = await compileProject(entryPath, fs, {
          diagramType: "system",
          viewPath,
          displayMode,
        });
        if (result.diagramType !== "system") return;
        const hasErrors = result.diagnostics.some((d) => d.severity === "error");

        if (hasErrors) {
          const svgToShow = lastValidSvgKey.current === currentKey ? lastValidSvg.current : "";
          setState({
            svg: svgToShow,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            hasDeployDiagram: result.hasDeployDiagram,
          });
        } else {
          lastValidSvg.current = result.svg;
          lastValidSvgKey.current = currentKey;
          setState({
            svg: result.svg,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
            nodeMetadata: result.nodeMetadata,
            hasDeployDiagram: result.hasDeployDiagram,
          });
        }
      } catch {
        setState((prev) => ({
          ...prev,
          diagnostics: [
            {
              severity: "error",
              message: "プロジェクトのコンパイル中にエラーが発生しました",
            },
          ],
        }));
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryPath, fs, viewPath, displayMode, recompileCounter.current]);

  return { ...state, recompile };
}
