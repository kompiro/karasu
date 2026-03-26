import { useEffect, useCallback, useMemo, useRef } from "react";
import { Parser, InMemoryFileSystemProvider, type KrsNode, type OrgViewPath } from "@karasu/core";
import { EditorPane } from "./components/EditorPane.js";
import { KarasuPreviewColumn } from "./components/KarasuPreviewColumn.js";
import { AppProvider } from "./state/app-context.js";
import { useAppContext } from "./state/app-context.js";
import { useProjectSystemView } from "./hooks/useProjectSystemView.js";
import { useProjectDeployView } from "./hooks/useProjectDeployView.js";
import { useOrgView } from "./hooks/useOrgView.js";
import type { ActiveView } from "./state/app-reducer.js";

const MEMORY_FILE_PATH = "/memory/index.krs";

const SAMPLE_KRS = `system "ECプラットフォーム" {
  user Customer "顧客" [human] {
    description "商品を購入する一般ユーザー"
  }
  user Seller "出品者" [human] {
    description "商品を出品するショップオーナー"
  }
  user Admin "管理者" [human] {
    description "システムを運用する担当者"
  }

  service ECommerce "ECサイト" {
    description "商品の閲覧・購入・出品を提供する"

    domain Catalog "商品カタログ" {
      usecase SearchProducts "商品を検索する" {
        resource ProductTable "商品テーブル"
        resource SearchIndex "検索インデックス" [external]
      }
      usecase ShowProductDetail "商品詳細を表示する"
      usecase RegisterProduct "商品を登録する" {
        resource ProductTable "商品テーブル"
        resource ImageStorage "画像ストレージ" [external]
      }
    }
    domain Cart "カート" {
      usecase AddToCart "カートに追加する" {
        resource CartTable "カートテーブル"
      }
      usecase ShowCart "カートを表示する"
      usecase UpdateQuantity "数量を変更する"
    }
    domain Order "受注" {
      usecase PlaceOrder "注文を確定する" {
        resource OrderTable "注文テーブル"
        resource InventoryAPI "在庫API" [external]
        resource PaymentAPI "決済API" [external]
      }
      usecase CancelOrder "注文をキャンセルする" {
        resource OrderTable "注文テーブル"
      }
      usecase ShowOrderHistory "注文履歴を照会する"
    }
    domain Review "レビュー" {
      usecase PostReview "レビューを投稿する" {
        resource ReviewTable "レビューテーブル"
      }
      usecase ListReviews "レビュー一覧を表示する"
    }
    domain Recommend "レコメンド" {
      usecase ShowRecommendations "おすすめ商品を表示する" {
        resource BrowsingHistory "閲覧履歴テーブル"
        resource RecommendEngine "レコメンドエンジン" [external]
      }
    }
    domain Member "会員" {
      usecase Register "会員登録する" {
        resource MemberTable "会員テーブル"
      }
      usecase EditProfile "プロフィールを編集する"
      usecase ManageAddresses "配送先を管理する" {
        resource AddressTable "配送先テーブル"
      }
    }
  }
  service Payment "決済" [external] {
    description "クレジットカード・電子マネー決済"
  }
  service Inventory "在庫管理" [external] {
    description "在庫データの一元管理"
  }
  service Shipping "配送" [external] {
    description "配送手配と追跡"
  }
  service Notification "通知" {
    description "メール・プッシュ通知の送信"
  }

  Customer -> ECommerce "商品を購入する"
  Seller -> ECommerce "商品を出品する"
  Admin -> ECommerce "システムを管理する"
  ECommerce -> Payment "決済を処理する"
  ECommerce -> Inventory "在庫を照会する"
  ECommerce -> Shipping "配送を依頼する"
  ECommerce --> Notification "注文確認を送信する"
}
`;

/**
 * MemoryModeApp — OPFS 非対応ブラウザ向けの単一ファイル編集モード。
 * AppProvider + InMemoryFileSystemProvider で ProjectModeApp と同等の機能を提供する。
 */
export function MemoryModeApp() {
  const inMemoryFs = useRef(new InMemoryFileSystemProvider()).current;

  return (
    <AppProvider fs={inMemoryFs}>
      <MemoryModeInner />
    </AppProvider>
  );
}

function MemoryModeInner() {
  const { state, dispatch, fs } = useAppContext();
  const { fileContent, viewPath, activeView, orgPath, highlightedNodeId } = state;

  // Initialize: write SAMPLE_KRS to in-memory FS and select the file
  useEffect(() => {
    (async () => {
      await fs.writeFile(MEMORY_FILE_PATH, SAMPLE_KRS);
      dispatch({ type: "SELECT_FILE", path: MEMORY_FILE_PATH, content: SAMPLE_KRS });
      dispatch({ type: "SET_LOADING", loading: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    svg: systemSvg,
    warnings: systemWarnings,
    diagnostics: systemDiagnostics,
    nodeMetadata: systemNodeMetadata,
    hasDeployDiagram,
    recompile: recompileSystem,
  } = useProjectSystemView(MEMORY_FILE_PATH, fs, viewPath);

  const {
    svg: deploySvg,
    warnings: deployWarnings,
    diagnostics: deployDiagnostics,
    nodeMetadata: deployNodeMetadata,
    recompile: recompileDeploy,
  } = useProjectDeployView(MEMORY_FILE_PATH, fs, viewPath);

  const recompile = useCallback(() => {
    recompileSystem();
    recompileDeploy();
  }, [recompileSystem, recompileDeploy]);

  const { orgSvg, orgDiagnostics, orgWarnings } = useOrgView(fileContent, "", orgPath as OrgViewPath);

  const nodeMetadata = activeView === "deploy" ? deployNodeMetadata : systemNodeMetadata;

  const handleEditorChange = useCallback(
    async (value: string) => {
      dispatch({ type: "UPDATE_FILE_CONTENT", content: value });
      await fs.writeFile(MEMORY_FILE_PATH, value);
      recompile();
    },
    [dispatch, fs, recompile],
  );

  const handleDrillDown = useCallback(
    (newPath: string[]) => {
      if (activeView === "org") {
        dispatch({ type: "SET_ORG_PATH", path: newPath });
      } else {
        dispatch({ type: "SET_VIEW_PATH", path: newPath });
      }
    },
    [dispatch, activeView],
  );

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

  return (
    <div className="app">
      <EditorPane value={fileContent} onChange={handleEditorChange} />
      <KarasuPreviewColumn
        activeView={activeView}
        hasDeployDiagram={hasDeployDiagram}
        onActiveViewChange={handleActiveViewChange}
        systemView={{
          svg: systemSvg,
          diagnostics: systemDiagnostics,
          viewPath,
          breadcrumbItems,
          warnings: systemWarnings,
          onBreadcrumbNavigate: (path) => dispatch({ type: "SET_VIEW_PATH", path }),
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
        }}
        nodeMetadata={nodeMetadata}
        onDrillDown={handleDrillDown}
      />
    </div>
  );
}
