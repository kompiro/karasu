import { BUILTIN_STYLE_SOURCE } from "./default-style.js";
import { REFERENCE_DATA } from "./reference-data.js";

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

export interface DeployUnitKindInfo {
  kind: string;
  description: string;
  properties: string[];
}

export interface OrgKindInfo {
  kind: string;
  description: string;
  canContain: string[];
  properties: string[];
}

export interface KarasuReference {
  nodeKinds: NodeKindInfo[];
  deployUnitKinds: DeployUnitKindInfo[];
  orgKinds: OrgKindInfo[];
  tags: TagInfo[];
  annotations: AnnotationInfo[];
  styleProperties: StylePropertyInfo[];
  shapes: ShapeInfo[];
  builtinStyleSource: string;
  sampleKrs: string;
}

/**
 * Locale accepted by `getReference`. Kept as a local alias so the core
 * package has no cross-package dependency on the app-layer `Locale` type.
 */
export type ReferenceLocale = "en" | "ja";

const SAMPLE_KRS_JA = `system ECPlatform {
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

  client MobileApp [mobile] {
    label "モバイルアプリ"
    description "iOS / Android 向け公式アプリ"
    handles Order, Catalog
    resource keychain "session-token"
  }
  client AdminConsole [web] {
    label "管理者向け Web SPA"
    handles Member
  }

  service ECommerce {
    label "ECサイト"
    description "商品の閲覧・購入・出品を提供する"
    delivers AdminConsole

    domain Catalog {
      label "商品カタログ"
      usecase SearchProducts {
        label "商品を検索する"
        resource ECommerceDB.ProductTable
        resource SearchIndex [external] { label "検索インデックス" }
      }
      usecase RegisterProduct {
        label "商品を登録する"
        resource ECommerceDB.ProductTable
        resource MediaStorage.ProductImages
      }
    }
    domain Order {
      label "受注"
      usecase PlaceOrder {
        label "注文を確定する"
        resource ECommerceDB.OrderTable
        resource OrderEvents.OrderPlaced
        resource InventoryAPI [external] { label "在庫API" }
        resource PaymentAPI [external] { label "決済API" }
      }
      usecase ShowOrderHistory { label "注文履歴を照会する" }
    }
    domain Member {
      label "会員"
      usecase Register {
        label "会員登録する"
        resource ECommerceDB.MemberTable
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

  // インフラ層: service が共有する database / queue / storage を
  // system 直下のファーストクラスノードとして宣言する。
  database ECommerceDB {
    label "ECサイトDB"
    table ProductTable { label "商品テーブル" }
    table OrderTable { label "注文テーブル" }
    table MemberTable { label "会員テーブル" }
  }
  queue OrderEvents {
    label "注文イベント"
    queue OrderPlaced { label "注文確定" }
  }
  storage MediaStorage {
    label "画像ストレージ"
    bucket ProductImages { label "商品画像" }
  }

  Customer -> MobileApp "アプリを利用する"
  MobileApp -> ECommerce "API を呼び出す"
  Seller -> ECommerce "商品を出品する"
  Admin -> AdminConsole "管理画面を開く"
  AdminConsole -> ECommerce "API を呼び出す"
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

// 凡例: swatch は色を直接指定、ref は @annotation / [tag] /
// 型 / #id を .krs.style から解決して色を引き継ぐ。scope を省略すると
// system / deploy / org の全ビューに描画される。
legend "オーナー / 状態" {
  swatch #2563EB "プラットフォーム"
  swatch #16A34A "通知"
  ref @deprecated "廃止予定"
  ref [external]  "外部システム"
}
`;

const SAMPLE_KRS_EN = `system ECPlatform {
  label "EC Platform"

  user Customer [human] {
    label "Customer"
    description "End users who purchase products"
  }
  user Seller [human] {
    label "Seller"
    description "Shop owners who list products for sale"
  }
  user Admin [human] {
    label "Admin"
    description "Staff who operate the platform"
  }

  client MobileApp [mobile] {
    label "Mobile App"
    description "Official iOS / Android app"
    handles Order, Catalog
    resource keychain "session-token"
  }
  client AdminConsole [web] {
    label "Admin Web SPA"
    handles Member
  }

  service ECommerce {
    label "EC Site"
    description "Browsing, purchasing, and listing products"
    delivers AdminConsole

    domain Catalog {
      label "Product Catalog"
      usecase SearchProducts {
        label "Search products"
        resource ECommerceDB.ProductTable
        resource SearchIndex [external] { label "Search index" }
      }
      usecase RegisterProduct {
        label "Register a product"
        resource ECommerceDB.ProductTable
        resource MediaStorage.ProductImages
      }
    }
    domain Order {
      label "Orders"
      usecase PlaceOrder {
        label "Place an order"
        resource ECommerceDB.OrderTable
        resource OrderEvents.OrderPlaced
        resource InventoryAPI [external] { label "Inventory API" }
        resource PaymentAPI [external] { label "Payment API" }
      }
      usecase ShowOrderHistory { label "View order history" }
    }
    domain Member {
      label "Members"
      usecase Register {
        label "Sign up as a member"
        resource ECommerceDB.MemberTable
      }
      usecase EditProfile { label "Edit profile" }
    }
  }
  service Payment [external] {
    label "Payment"
    description "Credit card and e-money payment processing"
  }
  service Inventory [external] {
    label "Inventory"
    description "Centralized inventory management"
  }
  service Notification {
    label "Notification"
    description "Email and push notification delivery"
  }

  // Infra layer: shared database / queue / storage that services depend on,
  // declared as first-class nodes directly under system.
  database ECommerceDB {
    label "EC Site DB"
    table ProductTable { label "Product table" }
    table OrderTable { label "Order table" }
    table MemberTable { label "Member table" }
  }
  queue OrderEvents {
    label "Order events"
    queue OrderPlaced { label "Order placed" }
  }
  storage MediaStorage {
    label "Media storage"
    bucket ProductImages { label "Product images" }
  }

  Customer -> MobileApp "Use the app"
  MobileApp -> ECommerce "Call the API"
  Seller -> ECommerce "List a product"
  Admin -> AdminConsole "Open the admin console"
  AdminConsole -> ECommerce "Call the API"
  ECommerce -> Payment "Process payments"
  ECommerce -> Inventory "Check inventory"
  ECommerce --> Notification "Send order confirmation"
}

deploy Production {
  label "Production environment"
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
  label "EC development org"
  team platform {
    label "Platform team"
    owns ECommerce

    team commerce {
      label "Commerce team"
      owns Catalog
      owns Order
      member alice {
        label "Alice"
        github "alice-dev"
      }
    }
    team "member-team" {
      label "Member team"
      owns Member
      member bob {
        label "Bob"
        description "Owner of the member platform"
      }
    }
  }
  team notification {
    label "Notification team"
    owns Notification
    member carol {
      label "Carol"
      slack "@carol"
    }
  }
}

// Legend: swatch supplies a literal color, ref pulls the color from
// .krs.style for the given @annotation / [tag] / type / #id. Omit
// the scope to show on system / deploy / org views.
legend "Owner / status" {
  swatch #2563EB "Platform"
  swatch #16A34A "Notification"
  ref @deprecated "Deprecated"
  ref [external]  "External system"
}
`;

const SAMPLE_KRS: Record<ReferenceLocale, string> = {
  en: SAMPLE_KRS_EN,
  ja: SAMPLE_KRS_JA,
};

const _cache = new Map<ReferenceLocale, KarasuReference>();

export function getReference(locale: ReferenceLocale = "en"): KarasuReference {
  const cached = _cache.get(locale);
  if (cached) return cached;

  const data = REFERENCE_DATA;
  const ref: KarasuReference = {
    nodeKinds: data.nodeKinds.map((k) => ({
      kind: k.kind,
      description: k.description[locale],
      canContain: k.canContain,
      properties: k.properties,
    })),
    deployUnitKinds: data.deployUnitKinds.map((k) => ({
      kind: k.kind,
      description: k.description[locale],
      properties: k.properties,
    })),
    orgKinds: data.orgKinds.map((k) => ({
      kind: k.kind,
      description: k.description[locale],
      canContain: k.canContain,
      properties: k.properties,
    })),
    tags: data.tags.map((t) => ({
      name: t.name,
      appliesTo: t.appliesTo,
      description: t.description[locale],
    })),
    annotations: data.annotations.map((a) => ({
      name: a.name,
      description: a.description[locale],
      defaultBadge: {
        color: a.defaultBadge.color,
        icon: a.defaultBadge.icon,
        label: a.defaultBadge.label[locale],
      },
    })),
    styleProperties: data.styleProperties.map((p) => ({
      name: p.name,
      appliesTo: p.appliesTo,
      valueType: p.valueType,
      ...(p.keywords ? { keywords: p.keywords } : {}),
      description: p.description[locale],
    })),
    shapes: data.shapes.map((sh) => ({
      name: sh.name,
      description: sh.description[locale],
      ...(sh.defaultFor !== undefined ? { defaultFor: sh.defaultFor } : {}),
    })),
    builtinStyleSource: BUILTIN_STYLE_SOURCE,
    sampleKrs: SAMPLE_KRS[locale],
  };

  _cache.set(locale, ref);
  return ref;
}
