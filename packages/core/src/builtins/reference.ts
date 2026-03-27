import { BUILTIN_STYLE_SOURCE } from "./default-style.js";

export interface NodeKindInfo {
  kind: string;
  description: string;
  canContain: string[];
  properties: string[];
}

export interface TagInfo {
  name: string;
  appliesTo: string[];
  description: string;
}

export interface AnnotationInfo {
  name: string;
  description: string;
  defaultBadge: { color: string; icon: string; label: string };
}

export interface StylePropertyInfo {
  name: string;
  appliesTo: "node" | "edge" | "both";
  valueType: string;
  keywords?: string[];
  description: string;
}

export interface ShapeInfo {
  name: string;
  description: string;
  defaultFor?: string;
}

export interface KarasuReference {
  nodeKinds: NodeKindInfo[];
  tags: TagInfo[];
  annotations: AnnotationInfo[];
  styleProperties: StylePropertyInfo[];
  shapes: ShapeInfo[];
  builtinStyleSource: string;
  sampleKrs: string;
}

let _cachedReference: KarasuReference | null = null;

export function getReference(): KarasuReference {
  if (_cachedReference) return _cachedReference;
  _cachedReference = {
    nodeKinds: [
      {
        kind: "system",
        description: "owned/externalなサービスの関係を示す器",
        canContain: ["service", "user"],
        properties: ["label", "description", "link"],
      },
      {
        kind: "service",
        description: "独立したビジネス機能の単位",
        canContain: ["domain"],
        properties: ["label", "description", "team", "link"],
      },
      {
        kind: "domain",
        description: "サービス内のビジネス上の関心事の境界",
        canContain: ["usecase"],
        properties: ["label", "description", "team", "link"],
      },
      {
        kind: "usecase",
        description: "ドメイン内の業務・操作",
        canContain: ["resource"],
        properties: ["label", "description", "link"],
      },
      {
        kind: "resource",
        description: "usecaseが操作する対象（テーブル、外部API、ファイル等）",
        canContain: [],
        properties: ["label", "description", "link"],
      },
      {
        kind: "user",
        description: "システムの利用者（人間またはAIエージェント）",
        canContain: [],
        properties: ["label", "description", "role", "link"],
      },
    ],
    tags: [
      {
        name: "external",
        appliesTo: ["service", "resource"],
        description: "システム境界の外側",
      },
      {
        name: "async",
        appliesTo: ["edge"],
        description: "非同期通信（エッジ用）",
      },
      {
        name: "sync",
        appliesTo: ["edge"],
        description: "同期通信（エッジ用、デフォルト）",
      },
      {
        name: "human",
        appliesTo: ["user"],
        description: "人間の利用者",
      },
      {
        name: "ai",
        appliesTo: ["user"],
        description: "AIエージェント",
      },
      {
        name: "table",
        appliesTo: ["resource"],
        description: "テーブル系リソース（シェイプ: cylinder）",
      },
      {
        name: "queue",
        appliesTo: ["resource"],
        description: "キュー系リソース（シェイプ: queue）",
      },
      {
        name: "api",
        appliesTo: ["resource"],
        description: "API系リソース（シェイプ: hexagon）",
      },
      {
        name: "storage",
        appliesTo: ["resource"],
        description: "ストレージ系リソース（シェイプ: cloud）",
      },
    ],
    annotations: [
      {
        name: "deprecated",
        description: "廃止予定",
        defaultBadge: { color: "#EF4444", icon: "⚠", label: "非推奨" },
      },
      {
        name: "new",
        description: "新規追加",
        defaultBadge: { color: "#10B981", icon: "✦", label: "NEW" },
      },
      {
        name: "experimental",
        description: "実験的",
        defaultBadge: { color: "#F59E0B", icon: "⚗", label: "実験的" },
      },
      {
        name: "migration-target",
        description: "移行先",
        defaultBadge: { color: "#3B82F6", icon: "→", label: "移行先" },
      },
    ],
    styleProperties: [
      {
        name: "background-color",
        appliesTo: "node",
        valueType: "color",
        description: "ノードの背景色",
      },
      {
        name: "color",
        appliesTo: "both",
        valueType: "color",
        description: "テキスト色（ノード）/ 線色（エッジ）",
      },
      {
        name: "border-color",
        appliesTo: "node",
        valueType: "color",
        description: "枠線の色",
      },
      {
        name: "border-width",
        appliesTo: "node",
        valueType: "number",
        description: "枠線の太さ",
      },
      {
        name: "border-style",
        appliesTo: "both",
        valueType: "keyword",
        keywords: ["solid", "dashed", "dotted"],
        description: "枠線のスタイル（ノード）/ 線のスタイル（エッジ）",
      },
      {
        name: "border-radius",
        appliesTo: "node",
        valueType: "number",
        description: "角丸の半径",
      },
      {
        name: "font-size",
        appliesTo: "both",
        valueType: "number",
        description: "フォントサイズ",
      },
      {
        name: "font-weight",
        appliesTo: "node",
        valueType: "keyword",
        keywords: ["normal", "bold"],
        description: "フォントの太さ",
      },
      {
        name: "font-family",
        appliesTo: "node",
        valueType: "string",
        description: "フォントファミリー",
      },
      {
        name: "opacity",
        appliesTo: "node",
        valueType: "number",
        description: "不透明度（0.0〜1.0）",
      },
      {
        name: "shape",
        appliesTo: "node",
        valueType: "keyword",
        keywords: ["box", "user", "cylinder", "queue", "hexagon", "cloud"],
        description: 'ノードの形状。url("...") でカスタムSVGも指定可',
      },
      {
        name: "stroke-width",
        appliesTo: "edge",
        valueType: "number",
        description: "エッジ線の太さ",
      },
      {
        name: "badge-color",
        appliesTo: "node",
        valueType: "color",
        description: "アノテーションバッジの背景色",
      },
      {
        name: "badge-icon",
        appliesTo: "node",
        valueType: "string",
        description: "アノテーションバッジのアイコン文字",
      },
      {
        name: "badge-label",
        appliesTo: "node",
        valueType: "string",
        description: "アノテーションバッジのラベルテキスト",
      },
    ],
    shapes: [
      { name: "box", description: "角丸長方形", defaultFor: "service, domain, usecase" },
      { name: "user", description: "人型（頭+体）", defaultFor: "user" },
      { name: "cylinder", description: "円柱", defaultFor: "resource[table]" },
      { name: "queue", description: "横向き円柱", defaultFor: "resource[queue]" },
      { name: "hexagon", description: "六角形", defaultFor: "resource[api]" },
      { name: "cloud", description: "雲形", defaultFor: "resource[storage]" },
    ],
    builtinStyleSource: BUILTIN_STYLE_SOURCE,
    sampleKrs: `system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    label "顧客"
    description "商品を購入する一般ユーザー"
  }
  user Seller [human] {
    label "出品者"
    description "商品を出品するショップオーナー"
  }
  user Admin [human] {
    label "管理者"
    description "システムを運用する担当者"
  }

  service ECommerce {
    label "ECサイト"
    description "商品の閲覧・購入・出品を提供する"

    domain Catalog {
      label "商品カタログ"
      usecase SearchProducts {
        label "商品を検索する"
        resource ProductTable { label "商品テーブル" }
        resource SearchIndex [external] { label "検索インデックス" }
      }
      usecase RegisterProduct {
        label "商品を登録する"
        resource ProductTable { label "商品テーブル" }
        resource ImageStorage [external] { label "画像ストレージ" }
      }
    }
    domain Order {
      label "受注"
      usecase PlaceOrder {
        label "注文を確定する"
        resource OrderTable { label "注文テーブル" }
        resource InventoryAPI [external] { label "在庫API" }
        resource PaymentAPI [external] { label "決済API" }
      }
      usecase ShowOrderHistory { label "注文履歴を照会する" }
    }
    domain Member {
      label "会員"
      usecase Register {
        label "会員登録する"
        resource MemberTable { label "会員テーブル" }
      }
      usecase EditProfile { label "プロフィールを編集する" }
    }
  }
  service Payment [external] {
    label "決済"
    description "クレジットカード・電子マネー決済"
  }
  service Inventory [external] {
    label "在庫管理"
    description "在庫データの一元管理"
  }
  service Notification {
    label "通知"
    description "メール・プッシュ通知の送信"
  }

  Customer -> ECommerce "商品を購入する"
  Seller -> ECommerce "商品を出品する"
  Admin -> ECommerce "システムを管理する"
  ECommerce -> Payment "決済を処理する"
  ECommerce -> Inventory "在庫を照会する"
  ECommerce --> Notification "注文確認を送信する"
}

deploy Production {
  label "本番環境"
  oci ecommerceApp {
    label "ecommerce-app"
    runtime "Kubernetes (GKE)"
    realizes ECommerce
  }
  oci notificationWorker {
    label "notification-worker"
    runtime "Cloud Run"
    realizes Notification
  }
}

organization ECOrg {
  label "EC開発組織"
  team platform {
    label "プラットフォームチーム"
    owns ECommerce

    team commerce {
      label "コマースチーム"
      owns Catalog
      owns Order
      member alice {
        label "Alice"
        github "alice-dev"
      }
    }
    team "member-team" {
      label "会員チーム"
      owns Member
      member bob {
        label "Bob"
        description "会員基盤担当"
      }
    }
  }
  team notification {
    label "通知チーム"
    owns Notification
    member carol {
      label "Carol"
      slack "@carol"
    }
  }
}
`,
  };
  return _cachedReference;
}
