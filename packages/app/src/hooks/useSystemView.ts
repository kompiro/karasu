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
  type DiagramTheme,
  type SystemNode,
  type NodeDiffMeta,
  type CategoryId,
} from "@karasu-tools/core";
import { useCallback, useState } from "react";
import iconManifest from "@karasu-tools/core/icons/icons.json";
import serviceSvg from "@karasu-tools/core/icons/service.svg?raw";
import clientSvg from "@karasu-tools/core/icons/client.svg?raw";
import clientMobileSvg from "@karasu-tools/core/icons/client-mobile.svg?raw";
import clientWebSvg from "@karasu-tools/core/icons/client-web.svg?raw";
import clientDesktopSvg from "@karasu-tools/core/icons/client-desktop.svg?raw";
import clientCliSvg from "@karasu-tools/core/icons/client-cli.svg?raw";
import clientDeviceSvg from "@karasu-tools/core/icons/client-device.svg?raw";
import clientExtensionSvg from "@karasu-tools/core/icons/client-extension.svg?raw";
import clientEmbedSvg from "@karasu-tools/core/icons/client-embed.svg?raw";
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
import { useEmptyStateLabels } from "../i18n/use-empty-state-labels.js";
import { useAnnotationBadgeLabels } from "../i18n/use-annotation-badge-labels.js";
import { computeViewResultFingerprint } from "./result-fingerprint.js";
import { useDebouncedCompile, type CompileOutcome } from "./useDebouncedCompile.js";

interface SystemViewState {
  svg: string;
  warnings: Warning[];
  diagnostics: Diagnostic[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  hasOrgDiagram: boolean;
  systems: SystemNode[];
  nodeFileIndex: Map<string, string>;
  /**
   * Per-node diff metadata when diff mode is active. `undefined` outside
   * diff mode, so consumers can treat presence as the diff-mode flag.
   */
  nodeDiff?: Map<string, NodeDiffMeta>;
}

// Register icons from manifest on module load (builtIn: true for placeholder injection)
resolveIconManifest(
  iconManifest,
  {
    "service.svg": serviceSvg,
    "client.svg": clientSvg,
    "client-mobile.svg": clientMobileSvg,
    "client-web.svg": clientWebSvg,
    "client-desktop.svg": clientDesktopSvg,
    "client-cli.svg": clientCliSvg,
    "client-device.svg": clientDeviceSvg,
    "client-extension.svg": clientExtensionSvg,
    "client-embed.svg": clientEmbedSvg,
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

export function useSystemView(
  entryPath: string | null,
  fs: FileSystemProvider | null,
  viewPath: ViewPath = [],
  displayMode: DisplayMode = "shape",
  compareEntryPath: string | null = null,
  compareFs: FileSystemProvider | null = null,
  theme?: DiagramTheme,
): SystemViewState & {
  recompile: () => void;
  collapsedCategories: ReadonlySet<CategoryId>;
  toggleCategory: (category: CategoryId) => void;
} {
  const emptyStateLabels = useEmptyStateLabels();
  const annotationBadgeLabels = useAnnotationBadgeLabels();

  // Collapsed external/infra categories (Issue #1821). Owned here because a
  // toggle recompiles the system view with the core `collapsedCategories`
  // option (the collapse is a layout transform, not a client-side re-render).
  const [collapsedCategories, setCollapsedCategories] = useState<ReadonlySet<CategoryId>>(
    new Set(),
  );
  const toggleCategory = useCallback((category: CategoryId) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);
  const collapsedKey = [...collapsedCategories].sort().join(",");

  // Structural key for `viewPath` so that a fresh `[]` from `SET_ACTIVE_VIEW`
  // does not restart the in-flight debounce when the previous value was also
  // empty. Without this, switching view tabs while the initial compile is
  // pending keeps resetting the 300ms timer and never renders an SVG. See #1171.
  const viewPathKey = viewPath.join("/");
  const currentKey = `${entryPath}:system:${viewPathKey}:cmp=${compareEntryPath ?? ""}:collapsed=${collapsedKey}`;

  const compile = async (): Promise<CompileOutcome<SystemViewState> | null> => {
    if (!entryPath || !fs) return null;

    // The baseline compileProject result supplies nodeMetadata / systems / the
    // deploy & org presence flags for surrounding UI (breadcrumbs,
    // NodeDetailPanel). In diff-mode the diff replaces only svg + diagnostics
    // and contributes per-node `nodeDiff`.
    const basePromise = compileProject(entryPath, fs, {
      diagramType: "system",
      viewPath,
      displayMode,
      emptyStateLabels,
      annotationBadgeLabels,
      theme,
      collapsedCategories,
      interactive: true,
    });

    let base: Awaited<typeof basePromise>;
    let svg: string;
    let diagnostics: Diagnostic[];
    let nodeDiff: Map<string, NodeDiffMeta> | undefined;
    if (compareEntryPath) {
      const [b, diff] = await Promise.all([
        basePromise,
        compileSystemDiff({
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
      nodeDiff = diff.nodeDiff;
    } else {
      base = await basePromise;
      svg = base.svg;
      diagnostics = base.diagnostics;
    }
    if (base.diagramType !== "system") return null;
    const sysBase = base;

    const toState = (s: string): SystemViewState => ({
      svg: s,
      warnings: sysBase.warnings,
      diagnostics,
      nodeMetadata: sysBase.nodeMetadata,
      hasDeployDiagram: sysBase.hasDeployDiagram,
      hasOrgDiagram: sysBase.hasOrgDiagram,
      systems: sysBase.systems,
      nodeFileIndex: sysBase.nodeFileIndex,
      nodeDiff,
    });
    return {
      fingerprint: computeViewResultFingerprint({
        svg,
        warnings: sysBase.warnings,
        diagnostics,
        nodeMetadata: sysBase.nodeMetadata,
      }),
      errorState: (svgToShow) => toState(svgToShow),
      okState: () => toState(svg),
      getSvg: (s) => s.svg,
      getDiagnostics: (s) => s.diagnostics,
    };
  };

  const result = useDebouncedCompile<SystemViewState>({
    active: !!entryPath && !!fs,
    currentKey,
    initialState: {
      svg: "",
      warnings: [],
      diagnostics: [],
      nodeMetadata: new Map(),
      hasDeployDiagram: false,
      hasOrgDiagram: false,
      systems: [],
      nodeFileIndex: new Map(),
    },
    compile,
    onError: (prev) => ({
      ...prev,
      diagnostics: [{ severity: "error", code: "app-project-compile-error", params: {} }],
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
      collapsedKey,
    ],
  });
  return { ...result, collapsedCategories, toggleCategory };
}
