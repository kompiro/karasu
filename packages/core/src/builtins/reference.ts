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

interface ReferenceStrings {
  nodeKind: Record<
    | "system"
    | "service"
    | "domain"
    | "usecase"
    | "resource"
    | "user"
    | "client"
    | "database"
    | "queue"
    | "storage",
    string
  >;
  tag: Record<
    | "external"
    | "async"
    | "sync"
    | "human"
    | "ai"
    | "table"
    | "queue"
    | "api"
    | "storage"
    | "mobile"
    | "web"
    | "desktop"
    | "cli"
    | "device"
    | "extension"
    | "embed",
    string
  >;
  annotation: Record<
    "deprecated" | "new" | "experimental" | "migration_target",
    { description: string; label: string }
  >;
  styleProperty: Record<
    | "background-color"
    | "color"
    | "border-color"
    | "border-width"
    | "border-style"
    | "border-radius"
    | "font-size"
    | "font-weight"
    | "font-family"
    | "opacity"
    | "shape"
    | "column"
    | "stroke-width"
    | "direction"
    | "label-position"
    | "label-offset"
    | "badge-color"
    | "badge-icon"
    | "badge-label",
    string
  >;
  deployUnitKind: Record<
    "war" | "jar" | "oci" | "lambda" | "function" | "assets" | "job" | "artifact",
    string
  >;
  orgKind: Record<"organization" | "team" | "member", string>;
  shape: Record<"box" | "user" | "cylinder" | "queue" | "hexagon" | "cloud", string>;
  sampleKrs: string;
}

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

const STRINGS_JA: ReferenceStrings = {
  nodeKind: {
    system: "owned/externalなサービスの関係を示す器",
    service: "独立したビジネス機能の単位",
    domain: "サービス内のビジネス上の関心事の境界",
    usecase: "ドメイン内の業務・操作",
    resource: "usecaseが操作する対象（テーブル、外部API、ファイル等）",
    user: "システムの利用者（人間またはAIエージェント）",
    client:
      "ユーザーの委譲で動く、自社が出荷するクライアントソフトウェア（mobile / web / desktop / cli / device / extension / embed）",
    database: "system 直下に置く共有データベース。service が依存する infra",
    queue: "system 直下に置く共有メッセージキュー。service が依存する infra",
    storage:
      "system 直下に置く共有ストレージ（オブジェクトストレージ等）。service が依存する infra",
  },
  tag: {
    external: "システム境界の外側",
    async: "非同期通信（エッジ用）",
    sync: "同期通信（エッジ用、デフォルト）",
    human: "人間の利用者",
    ai: "AIエージェント",
    table: "テーブル系リソース（シェイプ: cylinder）",
    queue: "キュー系リソース（シェイプ: queue）",
    api: "API系リソース（シェイプ: hexagon）",
    storage: "ストレージ系リソース（シェイプ: cloud）",
    mobile: "モバイルネイティブアプリ（client）",
    web: "ブラウザ SPA（client）",
    desktop: "デスクトップアプリ（client）",
    cli: "コマンドラインツール / SDK（client）",
    device: "IoT / 専用端末 / KIOSK（client）",
    extension: "ホストアプリのプラグイン — Chrome / VS Code / Figma 等（client）",
    embed: "第三者サイトに埋め込まれるウィジェット / SDK（client）",
  },
  annotation: {
    deprecated: { description: "廃止予定", label: "非推奨" },
    new: { description: "新規追加", label: "NEW" },
    experimental: { description: "実験的", label: "実験的" },
    migration_target: { description: "移行先", label: "移行先" },
  },
  styleProperty: {
    "background-color": "ノードの背景色",
    color: "テキスト色（ノード）/ 線色（エッジ）",
    "border-color": "枠線の色",
    "border-width": "枠線の太さ",
    "border-style": "枠線のスタイル（ノード）/ 線のスタイル（エッジ）",
    "border-radius": "角丸の半径",
    "font-size": "フォントサイズ",
    "font-weight": "フォントの太さ",
    "font-family": "フォントファミリー",
    opacity: "不透明度（0.0〜1.0）",
    shape: 'ノードの形状。url("...") でカスタムSVGも指定可',
    column:
      "レイヤー内の列バケット（left / center / right）。最終手段のレイアウトヒント。system ビューのみ有効",
    "stroke-width": "エッジ線の太さ",
    direction: "エッジの推奨レイアウト方向（auto / up / down / left / right）。レイアウトヒント",
    "label-position": "エッジ上のラベル位置（start / middle / end、または 0.0〜1.0 の比率）",
    "label-offset": "エッジラベルの画面軸方向オフセット（<dy>px、または <dx>px <dy>px）",
    "badge-color": "アノテーションバッジの背景色",
    "badge-icon": "アノテーションバッジのアイコン文字",
    "badge-label": "アノテーションバッジのラベルテキスト",
  },
  deployUnitKind: {
    war: "WAR / EAR（Servlet・EJBコンテナ）",
    jar: "実行可能 JAR（Spring Boot など）",
    oci: "コンテナイメージ",
    lambda: "AWS Lambda",
    function: "Azure Functions / Google Cloud Functions",
    assets: "静的ファイル・SPA（CDN配信）",
    job: "バッチ処理。schedule 省略で単発実行、指定で定期実行",
    artifact: "上記に該当しない任意種別",
  },
  orgKind: {
    organization: "組織ブロック（トップレベル）",
    team: "チーム。owns でサービス・ドメインとの対応を宣言",
    member: "チームメンバー",
  },
  shape: {
    box: "角丸長方形",
    user: "人型（頭+体）",
    cylinder: "円柱",
    queue: "横向き円柱",
    hexagon: "六角形",
    cloud: "雲形",
  },
  sampleKrs: SAMPLE_KRS_JA,
};

const STRINGS_EN: ReferenceStrings = {
  nodeKind: {
    system: "Container showing the relationships between owned and external services",
    service: "An independent unit of business capability",
    domain: "A business-concern boundary within a service",
    usecase: "A business task or operation within a domain",
    resource: "A target that a usecase reads or writes (table, external API, file, etc.)",
    user: "A user of the system (human or AI agent)",
    client:
      "User-delegated software the project itself ships (mobile / web / desktop / cli / device / extension / embed)",
    database: "Shared database declared at system level — infra that services depend on",
    queue: "Shared message queue declared at system level — infra that services depend on",
    storage:
      "Shared storage (object store, etc.) declared at system level — infra that services depend on",
  },
  tag: {
    external: "Outside the system boundary",
    async: "Asynchronous communication (for edges)",
    sync: "Synchronous communication (for edges, default)",
    human: "A human user",
    ai: "An AI agent",
    table: "Table-like resource (shape: cylinder)",
    queue: "Queue-like resource (shape: queue)",
    api: "API-like resource (shape: hexagon)",
    storage: "Storage-like resource (shape: cloud)",
    mobile: "Mobile native app (client)",
    web: "Browser SPA (client)",
    desktop: "Desktop app (client)",
    cli: "Command-line tool / SDK (client)",
    device: "IoT / dedicated terminal / KIOSK (client)",
    extension: "Host-app plugin — Chrome / VS Code / Figma, etc. (client)",
    embed: "Widget / SDK embedded in third-party sites (client)",
  },
  annotation: {
    deprecated: { description: "Slated for removal", label: "Deprecated" },
    new: { description: "Newly added", label: "NEW" },
    experimental: { description: "Experimental", label: "Experimental" },
    migration_target: { description: "Migration target", label: "Migration target" },
  },
  styleProperty: {
    "background-color": "Node background color",
    color: "Text color (node) / line color (edge)",
    "border-color": "Border color",
    "border-width": "Border width",
    "border-style": "Border style (node) / line style (edge)",
    "border-radius": "Corner radius",
    "font-size": "Font size",
    "font-weight": "Font weight",
    "font-family": "Font family",
    opacity: "Opacity (0.0 to 1.0)",
    shape: 'Node shape. Also accepts url("...") for a custom SVG',
    column:
      "Column bucket within the layer (left / center / right). Last-resort layout hint; honored on the system view only",
    "stroke-width": "Edge line width",
    direction:
      "Suggested layout direction of the edge (auto / up / down / left / right). Layout hint",
    "label-position":
      "Position of the label along the edge (start / middle / end, or a 0.0–1.0 fraction)",
    "label-offset": "Screen-axis offset of the edge label (<dy>px, or <dx>px <dy>px)",
    "badge-color": "Annotation badge background color",
    "badge-icon": "Annotation badge icon character",
    "badge-label": "Annotation badge label text",
  },
  deployUnitKind: {
    war: "WAR / EAR (Servlet / EJB container)",
    jar: "Executable JAR (e.g. Spring Boot)",
    oci: "Container image",
    lambda: "AWS Lambda",
    function: "Azure Functions / Google Cloud Functions",
    assets: "Static files / SPA (served via CDN)",
    job: "Batch job. Without schedule: one-shot; with schedule: recurring",
    artifact: "Any kind not covered above",
  },
  orgKind: {
    organization: "Organization block (top level)",
    team: "Team. Declares correspondence to services or domains via owns",
    member: "Team member",
  },
  shape: {
    box: "Rounded rectangle",
    user: "Person icon (head + body)",
    cylinder: "Cylinder",
    queue: "Horizontal cylinder",
    hexagon: "Hexagon",
    cloud: "Cloud",
  },
  sampleKrs: SAMPLE_KRS_EN,
};

const STRINGS: Record<ReferenceLocale, ReferenceStrings> = {
  en: STRINGS_EN,
  ja: STRINGS_JA,
};

const _cache = new Map<ReferenceLocale, KarasuReference>();

export function getReference(locale: ReferenceLocale = "en"): KarasuReference {
  const cached = _cache.get(locale);
  if (cached) return cached;

  const s = STRINGS[locale];
  const ref: KarasuReference = {
    nodeKinds: [
      {
        kind: "system",
        description: s.nodeKind.system,
        canContain: ["user", "client", "service", "database", "queue", "storage"],
        properties: ["label", "description", "link"],
      },
      {
        kind: "user",
        description: s.nodeKind.user,
        canContain: [],
        properties: ["label", "description", "role", "link"],
      },
      {
        kind: "client",
        description: s.nodeKind.client,
        canContain: [],
        properties: ["label", "description", "handles", "resource", "link"],
      },
      {
        kind: "service",
        description: s.nodeKind.service,
        canContain: ["domain"],
        properties: ["label", "description", "team", "delivers", "handles", "link"],
      },
      {
        kind: "domain",
        description: s.nodeKind.domain,
        canContain: ["usecase"],
        properties: ["label", "description", "team", "link"],
      },
      {
        kind: "usecase",
        description: s.nodeKind.usecase,
        canContain: ["resource"],
        properties: ["label", "description", "link"],
      },
      {
        kind: "resource",
        description: s.nodeKind.resource,
        canContain: [],
        properties: ["label", "description", "link"],
      },
      {
        kind: "database",
        description: s.nodeKind.database,
        canContain: ["table"],
        properties: ["label", "description", "link"],
      },
      {
        kind: "queue",
        description: s.nodeKind.queue,
        canContain: ["queue-item"],
        properties: ["label", "description", "link"],
      },
      {
        kind: "storage",
        description: s.nodeKind.storage,
        canContain: ["bucket"],
        properties: ["label", "description", "link"],
      },
    ],
    tags: [
      {
        name: "external",
        appliesTo: ["service", "client", "database", "queue", "storage", "resource"],
        description: s.tag.external,
      },
      { name: "async", appliesTo: ["edge"], description: s.tag.async },
      { name: "sync", appliesTo: ["edge"], description: s.tag.sync },
      { name: "human", appliesTo: ["user"], description: s.tag.human },
      { name: "ai", appliesTo: ["user"], description: s.tag.ai },
      { name: "mobile", appliesTo: ["client"], description: s.tag.mobile },
      { name: "web", appliesTo: ["client"], description: s.tag.web },
      { name: "desktop", appliesTo: ["client"], description: s.tag.desktop },
      { name: "cli", appliesTo: ["client"], description: s.tag.cli },
      { name: "device", appliesTo: ["client"], description: s.tag.device },
      { name: "extension", appliesTo: ["client"], description: s.tag.extension },
      { name: "embed", appliesTo: ["client"], description: s.tag.embed },
      { name: "table", appliesTo: ["resource"], description: s.tag.table },
      { name: "queue", appliesTo: ["resource"], description: s.tag.queue },
      { name: "api", appliesTo: ["resource"], description: s.tag.api },
      { name: "storage", appliesTo: ["resource"], description: s.tag.storage },
    ],
    annotations: [
      {
        name: "deprecated",
        description: s.annotation.deprecated.description,
        defaultBadge: { color: "#EF4444", icon: "⚠", label: s.annotation.deprecated.label },
      },
      {
        name: "new",
        description: s.annotation.new.description,
        defaultBadge: { color: "#10B981", icon: "✦", label: s.annotation.new.label },
      },
      {
        name: "experimental",
        description: s.annotation.experimental.description,
        defaultBadge: { color: "#F59E0B", icon: "⚗", label: s.annotation.experimental.label },
      },
      {
        name: "migration_target",
        description: s.annotation.migration_target.description,
        defaultBadge: { color: "#3B82F6", icon: "→", label: s.annotation.migration_target.label },
      },
    ],
    styleProperties: [
      {
        name: "background-color",
        appliesTo: "node",
        valueType: "color",
        description: s.styleProperty["background-color"],
      },
      { name: "color", appliesTo: "both", valueType: "color", description: s.styleProperty.color },
      {
        name: "border-color",
        appliesTo: "node",
        valueType: "color",
        description: s.styleProperty["border-color"],
      },
      {
        name: "border-width",
        appliesTo: "node",
        valueType: "number",
        description: s.styleProperty["border-width"],
      },
      {
        name: "border-style",
        appliesTo: "both",
        valueType: "keyword",
        keywords: ["solid", "dashed", "dotted"],
        description: s.styleProperty["border-style"],
      },
      {
        name: "border-radius",
        appliesTo: "node",
        valueType: "number",
        description: s.styleProperty["border-radius"],
      },
      {
        name: "font-size",
        appliesTo: "both",
        valueType: "number",
        description: s.styleProperty["font-size"],
      },
      {
        name: "font-weight",
        appliesTo: "node",
        valueType: "keyword",
        keywords: ["normal", "bold"],
        description: s.styleProperty["font-weight"],
      },
      {
        name: "font-family",
        appliesTo: "node",
        valueType: "string",
        description: s.styleProperty["font-family"],
      },
      {
        name: "opacity",
        appliesTo: "node",
        valueType: "number",
        description: s.styleProperty.opacity,
      },
      {
        name: "shape",
        appliesTo: "node",
        valueType: "keyword",
        keywords: ["box", "user", "cylinder", "queue", "hexagon", "cloud"],
        description: s.styleProperty.shape,
      },
      {
        name: "column",
        appliesTo: "node",
        valueType: "keyword",
        keywords: ["left", "center", "right"],
        description: s.styleProperty.column,
      },
      {
        name: "stroke-width",
        appliesTo: "edge",
        valueType: "number",
        description: s.styleProperty["stroke-width"],
      },
      {
        name: "direction",
        appliesTo: "edge",
        valueType: "keyword",
        keywords: ["auto", "up", "down", "left", "right"],
        description: s.styleProperty.direction,
      },
      {
        name: "label-position",
        appliesTo: "edge",
        valueType: "keyword",
        keywords: ["start", "middle", "end"],
        description: s.styleProperty["label-position"],
      },
      {
        name: "label-offset",
        appliesTo: "edge",
        valueType: "length",
        description: s.styleProperty["label-offset"],
      },
      {
        name: "badge-color",
        appliesTo: "node",
        valueType: "color",
        description: s.styleProperty["badge-color"],
      },
      {
        name: "badge-icon",
        appliesTo: "node",
        valueType: "string",
        description: s.styleProperty["badge-icon"],
      },
      {
        name: "badge-label",
        appliesTo: "node",
        valueType: "string",
        description: s.styleProperty["badge-label"],
      },
    ],
    deployUnitKinds: [
      {
        kind: "war",
        description: s.deployUnitKind.war,
        properties: ["label", "runtime", "realizes"],
      },
      {
        kind: "jar",
        description: s.deployUnitKind.jar,
        properties: ["label", "runtime", "realizes"],
      },
      {
        kind: "oci",
        description: s.deployUnitKind.oci,
        properties: ["label", "image", "runtime", "realizes"],
      },
      {
        kind: "lambda",
        description: s.deployUnitKind.lambda,
        properties: ["label", "runtime", "realizes"],
      },
      {
        kind: "function",
        description: s.deployUnitKind.function,
        properties: ["label", "runtime", "realizes"],
      },
      {
        kind: "assets",
        description: s.deployUnitKind.assets,
        properties: ["label", "runtime", "realizes"],
      },
      {
        kind: "job",
        description: s.deployUnitKind.job,
        properties: ["label", "runtime", "schedule", "realizes"],
      },
      {
        kind: "artifact",
        description: s.deployUnitKind.artifact,
        properties: ["label", "type", "runtime", "realizes"],
      },
    ],
    orgKinds: [
      {
        kind: "organization",
        description: s.orgKind.organization,
        canContain: ["team"],
        properties: ["label", "description", "link"],
      },
      {
        kind: "team",
        description: s.orgKind.team,
        canContain: ["team", "member"],
        properties: ["label", "description", "owns", "link"],
      },
      {
        kind: "member",
        description: s.orgKind.member,
        canContain: [],
        properties: ["label", "description", "slack", "github", "link"],
      },
    ],
    shapes: [
      { name: "box", description: s.shape.box, defaultFor: "service, domain, usecase" },
      { name: "user", description: s.shape.user, defaultFor: "user" },
      { name: "cylinder", description: s.shape.cylinder, defaultFor: "resource[table]" },
      { name: "queue", description: s.shape.queue, defaultFor: "resource[queue]" },
      { name: "hexagon", description: s.shape.hexagon, defaultFor: "resource[api]" },
      { name: "cloud", description: s.shape.cloud, defaultFor: "resource[storage]" },
    ],
    builtinStyleSource: BUILTIN_STYLE_SOURCE,
    sampleKrs: s.sampleKrs,
  };

  _cache.set(locale, ref);
  return ref;
}
