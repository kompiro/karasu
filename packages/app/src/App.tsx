import { useState, useCallback, useMemo } from "react";
import { EditorPane } from "./components/EditorPane.js";
import { PreviewPane } from "./components/PreviewPane.js";
import { WarningPanel } from "./components/WarningPanel.js";
import { Breadcrumb } from "./components/Breadcrumb.js";
import { useKarasu } from "./hooks/useKarasu.js";
import { Parser } from "@karasu/core";

const SAMPLE_KRS = `@import "default.krs.style"

system "ECプラットフォーム" {
  person Customer "顧客" "商品を購入する一般ユーザー"
  person Seller "出品者" "商品を出品するショップオーナー"
  person Admin "管理者" "システムを運用する担当者"

  service ECommerce "ECサイト" "商品の閲覧・購入・出品を提供する" {
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
  service Payment "決済" "クレジットカード・電子マネー決済" [external]
  service Inventory "在庫管理" "在庫データの一元管理" [external]
  service Shipping "配送" "配送手配と追跡" [external]
  service Notification "通知" "メール・プッシュ通知の送信"

  Customer -> ECommerce "商品を購入する"
  Seller -> ECommerce "商品を出品する"
  Admin -> ECommerce "システムを管理する"
  ECommerce -> Payment "決済を処理する"
  ECommerce -> Inventory "在庫を照会する"
  ECommerce -> Shipping "配送を依頼する"
  ECommerce --> Notification "注文確認を送信する"
}
`;

const SAMPLE_STYLE = `/* karasu default theme */

person {
  background-color: #1D4ED8;
  color: #DBEAFE;
  border-color: #1E40AF;
  border-width: 2px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  shape: person;
}

service {
  background-color: #0369A1;
  color: #E0F2FE;
  border-color: #075985;
  border-width: 2px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  shape: box;
}

[external] {
  background-color: #1F2937;
  color: #D1D5DB;
  border-color: #374151;
  border-style: dashed;
}

resource {
  background-color: #1E3A5F;
  color: #BFDBFE;
  border-color: #3B82F6;
  border-width: 2px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: normal;
  shape: cylinder;
}

@deprecated {
  badge-color: #EF4444;
  badge-icon: "⚠";
  badge-label: "非推奨";
  opacity: 0.6;
}

@new {
  badge-color: #10B981;
  badge-icon: "✨";
  badge-label: "新規";
  opacity: 0.5;
}

edge {
  color: #94A3B8;
  stroke-width: 1.5px;
  font-size: 11px;
}

edge[async] {
  border-style: dashed;
  color: #6B7280;
}
`;

export function App() {
  const [krsSource, setKrsSource] = useState(SAMPLE_KRS);
  const [styleSource] = useState(SAMPLE_STYLE);
  const [viewPath, setViewPath] = useState<string[]>([]);

  const { svg, warnings, diagnostics } = useKarasu(krsSource, styleSource, viewPath);

  const handleEditorChange = useCallback((value: string) => {
    console.info("KRS source updated:", value);
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
      items.push({ id: system.id ?? system.label, label: system.label });

      let current = system;
      for (const segment of viewPath) {
        const child = current.children.find(
          (c) => (c.id ?? c.label) === segment
        );
        if (!child) break;
        items.push({ id: child.id ?? child.label, label: child.label });
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
        <Breadcrumb items={breadcrumbItems} onNavigate={setViewPath} />
        <PreviewPane
          svg={svg}
          diagnostics={diagnostics}
          viewPath={viewPath}
          onDrillDown={handleDrillDown}
        />
      </div>
      <WarningPanel warnings={warnings} />
    </div>
  );
}
