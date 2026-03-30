import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import {
  Parser,
  InMemoryFileSystemProvider,
  buildDrillDownSvg,
  buildFullViewSvg,
  type KrsNode,
  type OrgViewPath,
  type DisplayMode,
} from "@karasu/core";
import { KarasuPreviewColumn } from "./components/KarasuPreviewColumn.js";
import { downloadSvg } from "./utils/download-svg.js";
import { AppProvider, useAppContext } from "./state/app-context.js";
import { useSystemView } from "./hooks/useSystemView.js";
import { useDeployView } from "./hooks/useDeployView.js";
import { useOrgView } from "./hooks/useOrgView.js";
import type { ActiveView } from "./state/app-reducer.js";

const SERVE_FILE_PATH = "/serve/index.krs";

function resolveFileNameFromUrl(): string {
  const pathname = window.location.pathname;
  const name = pathname === "/" || pathname === "" ? null : pathname.slice(1);
  return name ?? "";
}

async function fetchDefaultFileName(): Promise<string> {
  try {
    const res = await fetch("/api/default");
    if (res.ok) {
      const data = (await res.json()) as { file: string | null };
      return data.file ?? "index";
    }
  } catch {
    // fallthrough
  }
  return "index";
}

async function fetchFileContent(name: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/file/${encodeURIComponent(name)}`);
    if (res.ok) return await res.text();
  } catch {
    // fallthrough
  }
  return null;
}

export function ServeModeApp() {
  const inMemoryFs = useRef(new InMemoryFileSystemProvider()).current;

  return (
    <AppProvider fs={inMemoryFs}>
      <ServeModeInner />
    </AppProvider>
  );
}

function ServeModeInner() {
  const { state, dispatch, fs } = useAppContext();
  const { fileContent, viewPath, activeView, orgPath, highlightedNodeId, displayMode } = state;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullView, setIsFullView] = useState(false);

  // ref に recompile を格納し loadFile から参照できるようにする
  const recompileRef = useRef<() => void>(() => {});

  const {
    svg: systemSvg,
    warnings: systemWarnings,
    diagnostics: systemDiagnostics,
    nodeMetadata: systemNodeMetadata,
    hasDeployDiagram,
    recompile: recompileSystem,
  } = useSystemView(SERVE_FILE_PATH, fs, viewPath, displayMode);

  const {
    svg: deploySvg,
    warnings: deployWarnings,
    diagnostics: deployDiagnostics,
    nodeMetadata: deployNodeMetadata,
    recompile: recompileDeploy,
  } = useDeployView(SERVE_FILE_PATH, fs, viewPath);

  const {
    orgSvg,
    orgDiagnostics,
    orgWarnings,
    nodePathIndex,
    recompile: recompileOrg,
  } = useOrgView(SERVE_FILE_PATH, fs, orgPath as OrgViewPath);

  // hooks が確定した後に ref を更新する
  recompileRef.current = useCallback(() => {
    recompileSystem();
    recompileDeploy();
    recompileOrg();
  }, [recompileSystem, recompileDeploy, recompileOrg]);

  const loadFile = useCallback(
    async (name: string) => {
      const content = await fetchFileContent(name);
      if (content === null) {
        setLoadError(`File not found: ${name}.krs`);
        return;
      }
      setLoadError(null);
      await fs.writeFile(SERVE_FILE_PATH, content);
      dispatch({ type: "SELECT_FILE", path: SERVE_FILE_PATH, content });
      dispatch({ type: "SET_LOADING", loading: false });
      recompileRef.current();
    },
    [fs, dispatch],
  );

  // 初期ロード
  useEffect(() => {
    (async () => {
      const urlName = resolveFileNameFromUrl();
      const name = urlName || (await fetchDefaultFileName());
      await loadFile(name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE によるリアルタイム更新
  useEffect(() => {
    const es = new EventSource("/api/watch");
    es.addEventListener("change", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as { file: string };
        const urlName = resolveFileNameFromUrl();
        const currentName = urlName || "index";
        if (data.file === currentName) {
          loadFile(data.file);
        }
      } catch {
        // ignore malformed events
      }
    });
    return () => es.close();
  }, [loadFile]);

  const nodeMetadata = activeView === "deploy" ? deployNodeMetadata : systemNodeMetadata;

  const handleActiveViewChange = useCallback(
    (view: ActiveView) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: view });
    },
    [dispatch],
  );

  const handleContainerClick = useCallback(
    (containerId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: containerId });
    },
    [dispatch],
  );

  const handleDeployButtonClick = useCallback(
    (serviceId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: serviceId });
    },
    [dispatch],
  );

  const handleTeamButtonClick = useCallback(
    (teamId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: teamId });
    },
    [dispatch],
  );

  const handleOwnedServiceClick = useCallback(
    (serviceId: string) => {
      const resolvedPath = nodePathIndex.get(serviceId);
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" });
      if (resolvedPath !== undefined) {
        dispatch({ type: "SET_VIEW_PATH", path: resolvedPath });
      }
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: serviceId });
    },
    [dispatch, nodePathIndex],
  );

  const breadcrumbItems = useMemo(() => {
    if (!fileContent) return [];
    try {
      const parseResult = Parser.parse(fileContent);
      const systems = parseResult.value.systems;
      if (systems.length === 0) return [];

      const items: { id: string; label: string }[] = [];
      const system = systems[0];
      items.push({ id: system.id, label: system.label ?? system.id });

      let current: KrsNode = system;
      for (const segment of viewPath) {
        const child: KrsNode | undefined = current.children.find((c) => c.id === segment);
        if (!child) break;
        items.push({ id: child.id, label: child.label ?? child.id });
        current = child;
      }

      return items;
    } catch {
      return [];
    }
  }, [fileContent, viewPath]);

  const drillDownSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildDrillDownSvg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  const fullViewSvg = useMemo(() => {
    if (!fileContent) return undefined;
    try {
      return buildFullViewSvg(fileContent, undefined, displayMode);
    } catch {
      return undefined;
    }
  }, [fileContent, displayMode]);

  const orgBreadcrumbItems = useMemo(() => {
    if (!fileContent) return [];
    try {
      const parseResult = Parser.parse(fileContent);
      const orgs = parseResult.value.organizations;
      if (orgs.length === 0) return [];

      const items: { id: string; label: string }[] = [{ id: "__org__", label: "Org" }];

      let teams = orgs.flatMap((o) => o.teams);
      for (const segment of orgPath) {
        const team = teams.find((t) => t.id === segment);
        if (!team) break;
        items.push({ id: team.id, label: team.label ?? team.id });
        teams = team.teams;
      }

      return items;
    } catch {
      return [];
    }
  }, [fileContent, orgPath]);

  if (loadError) {
    return (
      <div className="app">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#ef4444",
            fontFamily: "monospace",
          }}
        >
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="app serve-mode">
      <KarasuPreviewColumn
        activeView={activeView}
        hasDeployDiagram={hasDeployDiagram}
        onActiveViewChange={handleActiveViewChange}
        displayMode={displayMode}
        onDisplayModeChange={(mode: DisplayMode) =>
          dispatch({ type: "SET_DISPLAY_MODE", displayMode: mode })
        }
        systemView={{
          svg: systemSvg,
          diagnostics: systemDiagnostics,
          viewPath,
          breadcrumbItems,
          warnings: systemWarnings,
          onBreadcrumbNavigate: (path) => dispatch({ type: "SET_VIEW_PATH", path }),
          onDeployButtonClick: handleDeployButtonClick,
          onTeamButtonClick: handleTeamButtonClick,
        }}
        deployView={{
          svg: deploySvg,
          diagnostics: deployDiagnostics,
          warnings: deployWarnings,
          highlightedNodeId,
          onClearHighlight: () => dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null }),
          onContainerClick: handleContainerClick,
        }}
        orgView={{
          svg: orgSvg,
          diagnostics: orgDiagnostics,
          orgPath: orgPath as OrgViewPath,
          breadcrumbItems: orgBreadcrumbItems,
          warnings: orgWarnings,
          onBreadcrumbNavigate: (path) => dispatch({ type: "SET_ORG_PATH", path }),
          highlightedNodeId,
          onClearHighlight: () => dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null }),
          onOwnedServiceClick: handleOwnedServiceClick,
        }}
        nodeMetadata={nodeMetadata}
        onExportSvg={(svg, filename) => downloadSvg(svg, filename)}
        isFullView={isFullView}
        onFullViewToggle={() => setIsFullView((v) => !v)}
        drillDownSvg={drillDownSvg}
        fullViewSvg={fullViewSvg}
      />
    </div>
  );
}
