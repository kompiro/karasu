import { useState, useCallback, useMemo } from "react";
import { EditorPane } from "./components/EditorPane.js";
import { PreviewPane } from "./components/PreviewPane.js";
import { WarningPanel } from "./components/WarningPanel.js";
import { BreadcrumbBar } from "./components/BreadcrumbBar.js";
import { useKarasu } from "./hooks/useKarasu.js";
import { Parser, type KrsNode } from "@karasu/core";

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
 * 現在の App.tsx のロジックをそのまま抽出したもの。
 */
export function MemoryModeApp() {
  const [krsSource, setKrsSource] = useState(SAMPLE_KRS);
  const [viewPath, setViewPath] = useState<string[]>([]);

  const { svg, warnings, diagnostics, nodeMetadata } = useKarasu(krsSource, "", viewPath);

  const handleEditorChange = useCallback((value: string) => {
    setKrsSource(value);
  }, []);

  const handleDrillDown = useCallback((newPath: string[]) => {
    setViewPath(newPath);
  }, []);

  // Build breadcrumb items from the AST
  const breadcrumbItems = useMemo(() => {
    try {
      const parseResult = Parser.parse(krsSource);
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
  }, [krsSource, viewPath]);

  return (
    <div className="app">
      <EditorPane value={krsSource} onChange={handleEditorChange} />
      <div className="preview-column">
        <BreadcrumbBar items={breadcrumbItems} onNavigate={setViewPath} />
        <PreviewPane
          svg={svg}
          diagnostics={diagnostics}
          viewPath={viewPath}
          nodeMetadata={nodeMetadata}
          onDrillDown={handleDrillDown}
        />
      </div>
      <WarningPanel warnings={warnings} />
    </div>
  );
}
