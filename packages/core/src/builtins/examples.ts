/**
 * Built-in example projects used to populate ProjectMode on first launch.
 *
 * SYNC RULE: When modifying files under examples/, update this file
 * accordingly. See .claude/rules/examples-sync.md for the mapping table.
 */

export type ExampleProject = {
  /** Project name shown in the project selector */
  name: string;
  /** Files to write into the project root. Paths are relative to rootPath. */
  files: { path: string; content: string }[];
};

export const GETTING_STARTED_PROJECT: ExampleProject = {
  name: "getting-started",
  files: [
    {
      path: "index.krs",
      content: `@import "default.krs.style"

system ECPlatform {
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
    capability notification
  }

  service ECommerce {
    label "ECサイト"
    description "商品の閲覧・購入・出品を提供する"

    domain Catalog {
      label "商品カタログ"
      usecase SearchProducts {
        label "商品を検索する"
        resource ECommerceDB.ProductTable {
          operations read
        }
        resource SearchIndex [external] {
          label "検索インデックス"
          operations read
        }
      }
      usecase RegisterProduct {
        label "商品を登録する"
        resource ECommerceDB.ProductTable {
          operations create, update
        }
        resource MediaStorage.ProductImages {
          operations create
        }
      }
    }
    domain Order {
      label "受注"
      usecase PlaceOrder {
        label "注文を確定する"
        resource ECommerceDB.OrderTable {
          operations create
        }
        resource OrderEvents.OrderPlaced {
          operations create
        }
        resource InventoryAPI [external] {
          label "在庫API"
          operations read, update
        }
        resource PaymentAPI [external] {
          label "決済API"
          operations create
        }
      }
      usecase ShowOrderHistory {
        label "注文履歴を照会する"
        resource ECommerceDB.OrderTable {
          operations read
        }
      }
    }
    domain Member {
      label "会員"
      usecase Register {
        label "会員登録する"
        resource ECommerceDB.MemberTable {
          operations create
        }
      }
      usecase EditProfile {
        label "プロフィールを編集する"
        resource ECommerceDB.MemberTable {
          operations read, update
        }
      }
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

      owns Member
    owns Notification
      member alice {
        label "Alice"
        github "alice-dev"
      }
    }
    team "member-team" {
      label "会員チーム"
      member bob {
        label "Bob"
        description "会員基盤担当"
      }
    }
  }
  team notification {
    label "通知チーム"
    member carol {
      label "Carol"
      slack "@carol"
    }
  }
}

// 凡例: swatch は色を直接指定、ref は [tag] / 型 / #id を
// .krs.style から解決して色を引き継ぐ。scope を省略すると
// system / deploy / org の全ビューに描画される。
legend "凡例" {
  ref [external] "外部システム"
  ref [human]    "人間ユーザー"
  ref database   "共有データベース"
  ref queue      "メッセージキュー"
}
`,
    },
    {
      path: "default.krs.style",
      content: `// getting-started/default.krs.style
// Customize diagram appearance with CSS-like selectors.
// Uncomment and edit any rule below to try it out.

// Style by node type
// service {
//   color: #1e40af;
//   background-color: #dbeafe;
// }

// service[external] {
//   color: #374151;
//   background-color: #f3f4f6;
// }

// Style by ID
// #ECommerce {
//   color: #065f46;
//   background-color: #d1fae5;
// }

// #Notification {
//   color: #92400e;
//   background-color: #fef3c7;
// }

// Layout hints (escape hatch — see docs/spec/style.md)
// 外部サービスを右に寄せて行末に揃え、最下段の並びを
// [internal service] [infra] [external services] にする。
service[external] {
  column: right;
}
`,
    },
  ],
};

export const GETTING_STARTED_PROJECT_EN: ExampleProject = {
  name: "getting-started",
  files: [
    {
      path: "index.krs",
      content: `@import "default.krs.style"

system ECPlatform {
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
    capability notification
  }

  service ECommerce {
    label "EC Site"
    description "Browsing, purchasing, and listing products"

    domain Catalog {
      label "Product Catalog"
      usecase SearchProducts {
        label "Search products"
        resource ECommerceDB.ProductTable {
          operations read
        }
        resource SearchIndex [external] {
          label "Search index"
          operations read
        }
      }
      usecase RegisterProduct {
        label "Register a product"
        resource ECommerceDB.ProductTable {
          operations create, update
        }
        resource MediaStorage.ProductImages {
          operations create
        }
      }
    }
    domain Order {
      label "Orders"
      usecase PlaceOrder {
        label "Place an order"
        resource ECommerceDB.OrderTable {
          operations create
        }
        resource OrderEvents.OrderPlaced {
          operations create
        }
        resource InventoryAPI [external] {
          label "Inventory API"
          operations read, update
        }
        resource PaymentAPI [external] {
          label "Payment API"
          operations create
        }
      }
      usecase ShowOrderHistory {
        label "View order history"
        resource ECommerceDB.OrderTable {
          operations read
        }
      }
    }
    domain Member {
      label "Members"
      usecase Register {
        label "Sign up as a member"
        resource ECommerceDB.MemberTable {
          operations create
        }
      }
      usecase EditProfile {
        label "Edit profile"
        resource ECommerceDB.MemberTable {
          operations read, update
        }
      }
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

  Customer -> MobileApp "Open the app"
  MobileApp -> ECommerce "Call the API"
  Seller -> ECommerce "List a product"
  Admin -> ECommerce "Administer the platform"
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

      owns Member
    owns Notification
      member alice {
        label "Alice"
        github "alice-dev"
      }
    }
    team "member-team" {
      label "Member team"
      member bob {
        label "Bob"
        description "Owner of the member platform"
      }
    }
  }
  team notification {
    label "Notification team"
    member carol {
      label "Carol"
      slack "@carol"
    }
  }
}

// Legend: swatch supplies a literal color, ref pulls the color from
// .krs.style for the given [tag] / type / #id. Omit the scope to show
// on system / deploy / org views.
legend "Legend" {
  ref [external] "External system"
  ref [human]    "Human user"
  ref database   "Shared database"
  ref queue      "Message queue"
}
`,
    },
    {
      path: "default.krs.style",
      content: `// getting-started/default.krs.style
// Customize diagram appearance with CSS-like selectors.
// Uncomment and edit any rule below to try it out.

// Style by node type
// service {
//   color: #1e40af;
//   background-color: #dbeafe;
// }

// service[external] {
//   color: #374151;
//   background-color: #f3f4f6;
// }

// Style by ID
// #ECommerce {
//   color: #065f46;
//   background-color: #d1fae5;
// }

// #Notification {
//   color: #92400e;
//   background-color: #fef3c7;
// }

// Layout hints (escape hatch — see docs/spec/style.md)
// Pin external services to the right side of the bottom row.
service[external] {
  column: right;
}
`,
    },
  ],
};

export const CLIENT_MCP_PROJECT: ExampleProject = {
  name: "client-mcp",
  files: [
    {
      path: "index.krs",
      content: `// client-mcp: a minimal sample exercising the full client MVP feature set
// (Phase 1–5 of #823): client kind, delivers, handles re-export, resource
// for client-side storage, [external] services, and an MCP-style server.
//
// Scenario:
//   Customer (human)  → MobileApp + ClaudeDesktop  (clients we ship)
//   PartnerAgent (ai) → OrderMcp                   (third-party AI agent)
//
//   MobileApp talks to a BFF (MobileBff) which re-exports OrderService's
//   Order domain. ClaudeDesktop talks to OrderMcp, an MCP server that
//   adapts OrderService for AI tool-use.

system OrderPlatform {
  label "Order Platform"
  description "Order management exposed to mobile apps, desktop AI clients, and partner AI agents."

  user Customer [human] {
    label "Customer"
    role "End user placing and tracking orders"
  }

  user PartnerAgent [ai] {
    label "Partner Agent"
    role "Third-party AI agent that calls our MCP endpoint"
  }

  client MobileApp [mobile] {
    label "Mobile App"
    description "iOS / Android native app"
    handles Order
    resource localStorage "preferences"
    resource indexedDB "outbox"
    resource keychain "auth-token"
    capability notification
    capability camera {
      label "QR scanning"
      description "Scan QR codes printed on physical receipts"
    }
    capability geolocation {
      description "Continuous tracking while a delivery is in progress"
    }
  }

  client ClaudeDesktop [desktop] {
    label "Claude Desktop"
    description "Local desktop client wired to the MCP server via stdio"
    handles Order
    resource opfs "drafts"
    resource file "claude-desktop.config"
    capability clipboard
  }

  service MobileBff {
    label "Mobile BFF"
    description "Edge-side API gateway tailored for the mobile app"
    delivers MobileApp
    handles Order
  }

  service OrderService {
    label "Order Service"
    description "Source of truth for orders"

    domain Order {
      label "Order"
      description "Order placement, query, and cancellation"

      usecase PlaceOrder {
        label "Place an order"
        resource OrderTable [external] { label "Order table" }
      }
      usecase CancelOrder {
        label "Cancel an order"
        resource OrderTable [external] { label "Order table" }
      }
      usecase QueryOrder {
        label "Query order status"
        resource OrderTable [external] { label "Order table" }
      }
    }
  }

  service OrderMcp [external] {
    label "Order MCP"
    description "MCP server that exposes OrderService to AI agents"
    handles Order
  }

  Customer       -> MobileApp     "uses the app"
  Customer       -> ClaudeDesktop "uses the desktop client"
  PartnerAgent   -> OrderMcp      "tool-use over MCP"
  MobileApp      -> MobileBff     "HTTPS"
  ClaudeDesktop  -> OrderMcp      "stdio / MCP"
  MobileBff      -> OrderService  "internal RPC"
  OrderMcp       -> OrderService  "internal RPC"
}
`,
    },
  ],
};

export const EC_PLATFORM_PROJECTS: ExampleProject[] = [
  {
    name: "01-system",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/01-system.krs
// Demonstrates: system, service, sync edge (->), async edge (-->)
// This is the minimal building block of a karasu diagram.

system ECPlatform {
  label "ECプラットフォーム"

  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }

  service Payment {
    label "決済サービス"
    description "クレジットカード決済処理"
  }

  service Inventory {
    label "在庫管理"
    description "在庫データの管理"
  }

  service Notification {
    label "通知サービス"
    description "メール・プッシュ通知の送信"
  }

  ECommerce  ->  Payment      "決済を処理する"
  ECommerce  ->  Inventory    "在庫を確認する"
  ECommerce --> Notification  "注文確定メールを送る"
  Inventory --> Notification  "在庫切れアラートを送る"
}
`,
      },
    ],
  },
  {
    name: "02-users",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/02-users.krs
// Demonstrates: user [human], user [ai], role property
// Users can be human actors or AI agents interacting with the system.

system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    label "購入者"
    role "商品を購入する一般ユーザー"
  }

  user Admin [human] {
    label "運用担当者"
    role "在庫・注文・通知の管理を行う担当者"
  }

  user RecommendationAgent [ai] {
    label "レコメンドエージェント"
    role "購買履歴を分析して商品を推薦するAIエージェント"
  }

  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }

  service Payment {
    label "決済サービス"
    description "クレジットカード決済処理"
  }

  service Inventory {
    label "在庫管理"
    description "在庫データの管理"
  }

  service Notification {
    label "通知サービス"
    description "メール・プッシュ通知の送信"
  }

  Customer           ->  ECommerce    "商品を購入する"
  Admin              ->  Inventory    "在庫を管理する"
  Admin              ->  Notification "通知設定を変更する"
  RecommendationAgent -> ECommerce    "おすすめ商品を提案する"
  ECommerce          ->  Payment      "決済を処理する"
  ECommerce          ->  Inventory    "在庫を確認する"
  ECommerce         --> Notification  "注文確定メールを送る"
}
`,
      },
    ],
  },
  {
    name: "02.5-clients",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/02.5-clients.krs
// Demonstrates: client kind with form-factor tags, service.delivers,
// client.handles, and resource <storageKind> "<name>" lines.
// Slots between 02-users (who) and 03-domains (what each domain does).
//
// User → Client → Service is the natural progression: the people in 02-users
// don't talk to ECommerce directly — they go through a mobile or web client.

system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    label "購入者"
    role "商品を購入する一般ユーザー"
  }

  user Admin [human] {
    label "運用担当者"
    role "在庫・注文・通知の管理を行う担当者"
  }

  // Clients we ship — sit between users and services.
  client MobileApp [mobile] {
    label "モバイルアプリ"
    description "iOS / Android 向け公式アプリ"
    handles Order
    resource localStorage "preferences"
    resource indexedDB "outbox"
  }

  client WebApp [web] {
    label "Web アプリ"
    description "ブラウザ向け SPA"
    handles Order
    resource sessionStorage "view-state"
  }

  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
    // delivers links a service to the client(s) it ships to end users.
    delivers MobileApp, WebApp

    domain Order {
      label "受注"
    }
  }

  service Payment {
    label "決済サービス"
  }

  service Inventory {
    label "在庫管理"
  }

  Customer  -> MobileApp "アプリを利用する"
  Customer  -> WebApp    "ブラウザから利用する"
  Admin     -> WebApp    "管理画面を使う"
  MobileApp -> ECommerce "API を呼び出す"
  WebApp    -> ECommerce "API を呼び出す"
  ECommerce -> Payment   "決済を処理する"
  ECommerce -> Inventory "在庫を確認する"
}
`,
      },
    ],
  },
  {
    name: "03-domains",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/03-domains.krs
// Demonstrates: domain, usecase, resource — full drill-down hierarchy
// Drill into ECommerce to see its internal domain structure.

system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    label "購入者"
    role "商品を購入する一般ユーザー"
  }

  service ECommerce {
    label "ECサイト"

    domain Order {
      label "受注"
      description "注文の受付・管理・キャンセル"

      usecase PlaceOrder {
        label "注文を受け付ける"
        resource OrderTable {
          label "注文テーブル"
          operations create, read
        }
        resource InventoryAPI {
          label "在庫API"
          operations read
        }
      }

      usecase CancelOrder {
        label "注文をキャンセルする"
        resource OrderTable {
          label "注文テーブル"
          operations read, update
        }
      }

      usecase QueryOrder {
        label "注文状況を照会する"
        resource OrderTable {
          label "注文テーブル"
          operations read
        }
      }
    }

    domain Catalog {
      label "商品カタログ"
      description "商品情報の管理と検索"

      usecase SearchProducts {
        label "商品を検索する"
        resource ProductTable {
          label "商品テーブル"
          operations read
        }
      }

      usecase UpdateProduct {
        label "商品情報を更新する"
        resource ProductTable {
          label "商品テーブル"
          operations read, update
        }
        resource ImageStorage {
          label "画像ストレージ"
          operations create, update, delete
        }
      }
    }
  }

  service Payment {
    label "決済サービス"

    domain Billing {
      label "請求"

      usecase Charge {
        label "決済を実行する"
        resource PaymentGateway {
          label "決済ゲートウェイ"
        }
        resource TransactionLog {
          label "取引ログ"
        }
      }

      usecase Refund {
        label "返金する"
        resource PaymentGateway {
          label "決済ゲートウェイ"
        }
      }
    }
  }

  service Inventory {
    label "在庫管理"

    domain Stock {
      label "在庫"

      usecase CheckStock {
        label "在庫を確認する"
        resource StockTable {
          label "在庫テーブル"
        }
      }

      usecase ReserveStock {
        label "在庫を引き当てる"
        resource StockTable {
          label "在庫テーブル"
        }
      }
    }
  }

  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
  ECommerce ->  Inventory "在庫を確認する"
}
`,
      },
    ],
  },
  {
    name: "04-annotations",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/04-annotations.krs
// Demonstrates: [external] tag, @deprecated, @new, @experimental annotations
// Use annotations to communicate lifecycle state and ownership boundaries.

system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    label "購入者"
    role "商品を購入する一般ユーザー"
  }

  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }

  // @deprecated: this service is being replaced by NewPayment
  service LegacyPayment @deprecated {
    label "決済サービス（旧）"
    description "旧決済サービス。NewPayment への移行中"
  }

  // @new: recently introduced replacement service
  service NewPayment @new {
    label "決済サービス（新）"
    description "新しい決済サービス。PCI DSS準拠"
  }

  // @experimental: under active development, API may change
  service RecommendationEngine @experimental {
    label "レコメンドエンジン"
    description "AI駆動の商品推薦サービス"
  }

  // [external]: owned by a third party, not this team
  service StripeAPI [external] {
    label "Stripe API"
    description "クレジットカード決済の外部プロバイダ"
  }

  service AmazonSES [external] {
    label "Amazon SES"
    description "メール送信の外部サービス"
  }

  Customer           ->  ECommerce             "商品を購入する"
  ECommerce          ->  LegacyPayment         "決済を処理する（移行中）"
  ECommerce          ->  NewPayment            "決済を処理する（新）"
  ECommerce          ->  RecommendationEngine  "おすすめ商品を取得する"
  LegacyPayment      ->  StripeAPI             "カード決済"
  NewPayment         ->  StripeAPI             "カード決済"
  ECommerce         --> AmazonSES              "注文確定メールを送る"
}
`,
      },
    ],
  },
  {
    name: "05-multifile",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/05-multifile/system.krs
// Demonstrates: import { } from — splitting a large file into focused modules
// Open this directory in VSCode Extension or use \`karasu serve\` in server mode.

import { ECommerce } from "./ecommerce.krs"
import { Payment } from "./payment.krs"

system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    label "購入者"
    role "商品を購入する一般ユーザー"
  }

  service Inventory {
    label "在庫管理"

    domain Stock {
      label "在庫"
      usecase CheckStock { label "在庫を確認する" }
      usecase ReserveStock { label "在庫を引き当てる" }
    }
  }

  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
  ECommerce ->  Inventory "在庫を確認する"
}
`,
      },
      {
        path: "ecommerce.krs",
        content: `// ec-platform/05-multifile/ecommerce.krs
// ECommerce service definition — imported by system.krs

service ECommerce {
  label "ECサイト"
  description "商品管理と注文処理"

  domain Order {
    label "受注"
    usecase PlaceOrder {
      label "注文を受け付ける"
      resource OrderTable { label "注文テーブル" }
    }
    usecase CancelOrder { label "注文をキャンセルする" }
    usecase QueryOrder { label "注文状況を照会する" }
  }

  domain Catalog {
    label "商品カタログ"
    usecase SearchProducts {
      label "商品を検索する"
      resource ProductTable { label "商品テーブル" }
    }
  }
}
`,
      },
      {
        path: "payment.krs",
        content: `// ec-platform/05-multifile/payment.krs
// Payment service definition — imported by system.krs

service Payment {
  label "決済サービス"
  description "クレジットカード決済処理"

  domain Billing {
    label "請求"
    usecase Charge {
      label "決済を実行する"
      resource PaymentGateway { label "決済ゲートウェイ" }
      resource TransactionLog { label "取引ログ" }
    }
    usecase Refund {
      label "返金する"
      resource PaymentGateway { label "決済ゲートウェイ" }
    }
  }
}
`,
      },
    ],
  },
  {
    name: "06-deploy",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/06-deploy/system.krs
// Logical structure — imported by deploy.krs via realizes
// Open this directory in VSCode Extension or use \`karasu serve\` in server mode.

import { ECommerce } from "./ecommerce.krs"
import { Payment } from "./payment.krs"

system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    label "購入者"
    role "商品を購入する一般ユーザー"
  }

  service ECommerce
  service Payment

  service Inventory {
    label "在庫管理"
    domain Stock {
      label "在庫"
      usecase CheckStock { label "在庫を確認する" }
    }
  }

  service Frontend {
    label "フロントエンド"
    description "SPAによる購入画面"
  }

  Customer  ->  Frontend  "ブラウザでアクセス"
  Frontend  ->  ECommerce "APIを呼び出す"
  ECommerce ->  Payment   "決済を処理する"
  ECommerce ->  Inventory "在庫を確認する"
}
`,
      },
      {
        path: "ecommerce.krs",
        content: `// ec-platform/06-deploy/ecommerce.krs
// ECommerce service definition — imported by system.krs

service ECommerce {
  label "ECサイト"
  domain Order {
    label "受注"
    usecase PlaceOrder { label "注文を受け付ける" }
    usecase QueryOrder { label "注文状況を照会する" }
  }
}
`,
      },
      {
        path: "payment.krs",
        content: `// ec-platform/06-deploy/payment.krs
// Payment service definition — imported by system.krs

service Payment {
  label "決済サービス"
  domain Billing {
    label "請求"
    usecase Charge { label "決済を実行する" }
    usecase Refund { label "返金する" }
  }
}
`,
      },
      {
        path: "deploy.krs",
        content: `// ec-platform/06-deploy/deploy.krs
// Demonstrates: deploy block, oci, jar, job (with/without schedule), assets, realizes
// Physical structure maps to logical services via \`realizes\`.

deploy Production {
  label "本番環境"

  // SPA hosted on CDN
  assets storefront {
    label "ECフロントエンド"
    runtime "CloudFront / S3"
    realizes Frontend
  }

  // Main application server as a container
  oci "ecommerce-app" {
    label "ECアプリケーション"
    image "ecommerce:3.2.1"
    runtime "Node.js 22"
    realizes ECommerce
  }

  // Payment service as an executable JAR
  jar "payment-service" {
    label "決済サービス"
    runtime "Java 21 / Spring Boot 3"
    realizes Payment
  }

  // Inventory as a container
  oci "inventory-service" {
    label "在庫サービス"
    image "inventory:1.4.0"
    runtime "Go 1.22"
    realizes Inventory
  }

  // One-off data migration (no schedule = single run)
  job "data-migration" {
    label "データ移行ジョブ"
    runtime "Python 3.12"
  }

  // Recurring billing report (cron schedule)
  job "monthly-billing-report" {
    label "月次売上集計"
    schedule "0 1 1 * *"
    runtime "Java 21"
    realizes Payment
  }
}
`,
      },
    ],
  },
  {
    name: "07-cross-system",
    files: [
      {
        path: "index.krs",
        content: `// ec-platform/07-cross-system/main.krs
// Demonstrates: cross-system service references with fully qualified names (System.Service)
// ECPlatform references PaymentGateway.PaymentService across system boundaries.
// The referenced service appears as an [external] ghost node in ECPlatform's system view.

import "ec-platform.krs"
import "payment-gateway.krs"
`,
      },
      {
        path: "ec-platform.krs",
        content: `// ec-platform/07-cross-system/ec-platform.krs
// ECPlatform system — references PaymentGateway.PaymentService using dot notation.
// To suppress the implicit-external warning, add: service PaymentService [external]

system ECPlatform {
  label "ECプラットフォーム"

  user Customer {
    label "顧客"
    role "商品を購入する一般ユーザー"
  }

  service OrderService {
    label "注文サービス"
    description "商品の注文処理と決済依頼を担当する"
  }

  service InventoryService {
    label "在庫管理サービス"
    description "在庫データの管理と在庫確認 API を提供する"
  }

  Customer      -> OrderService                   "注文する"
  OrderService  -> InventoryService               "在庫を確認する"
  OrderService  -> PaymentGateway.PaymentService  "決済を依頼する"
}
`,
      },
      {
        path: "payment-gateway.krs",
        content: `// ec-platform/07-cross-system/payment-gateway.krs
// PaymentGateway system — standalone payment processing platform.
// This system can be rendered independently or composed with ECPlatform via main.krs.

system PaymentGateway {
  label "決済ゲートウェイ"

  service PaymentService {
    label "決済サービス"
    description "クレジットカード・口座振替などの決済処理を担当する"
  }

  service FraudDetection {
    label "不正検知サービス"
    description "トランザクションの不正スコアリングを行う"
  }

  PaymentService -> FraudDetection "不正チェックを行う"
}
`,
      },
    ],
  },
];

export const FEATURE_SAMPLES_PROJECT: ExampleProject = {
  name: "feature-samples",
  files: [
    {
      path: "index.krs",
      content: `// feature-samples/index.krs
// Catalog of single-feature .krs samples bundled with karasu.
//
// Each file in this project demonstrates one syntax feature in isolation —
// open them from the file tree:
//
//   minimal.krs               smallest valid input (system + 2 services + edges)
//   edges.krs                 sync (->) vs async (-->) edges, labelled / bare
//   parallel-edges.krs        parallel edges between the same node pair
//   users.krs                 [human] / [ai] user nodes with role + description
//   external-nodes.krs        [external] tag on service / resource nodes
//   annotations.krs           @deprecated / @new / @experimental / @migration_target
//   legend.krs                legend blocks (swatch / ref, view scoping)
//   domain-drill.krs          full hierarchy: system -> service -> domain -> usecase -> resource
//   domain-drift.krs          domain-to-domain edges (cross-service + intra-service)
//   resource-operations.krs   usecase resource CRUD operations + read/write edges
//   crud-matrix.krs           inputs for the \`karasu matrix\` usecase x resource grid
//   usecase-authorization.krs authorization-as-prose convention (Access: + policy link)
//   bff-delivers.krs          service.delivers <ClientId> for the BFF / SSR pattern
//   deploy-all.krs            every deploy artifact type (war / jar / oci / lambda / ...)

system FeatureSamples {
  label "Feature samples"
  description "Open the sibling .krs files from the file tree — each one demonstrates a single syntax feature."

  service Catalog {
    label "See the file tree"
  }
}
`,
    },
    {
      path: "annotations.krs",
      content: `// annotations.krs
// Demonstrates: all four lifecycle annotations — @deprecated, @new,
// @experimental, @migration_target — individually and combined.

system AnnotationSample {
  label "Annotation Sample"

  service LegacyAuth @deprecated {
    label "Legacy Auth"
    description "Scheduled for removal in Q3."
  }

  service NewAuth @new {
    label "New Auth"
    description "Introduced in the latest release."
  }

  service BetaSearch @experimental {
    label "Beta Search"
    description "Feature-flagged; not yet in general availability."
  }

  service MigrationBridge @deprecated @migration_target {
    label "Migration Bridge"
    description "Deprecated origin that is also the migration target stub."
  }

  LegacyAuth -> MigrationBridge "migrate traffic"
  MigrationBridge -> NewAuth    "forward requests"
  NewAuth -> BetaSearch         "delegate search"
}
`,
    },
    {
      path: "bff-delivers.krs",
      content: `// bff-delivers.krs
// Demonstrates: service.delivers <ClientId> for the BFF / SSR pattern.
//
// A Next.js / Rails+React / Laravel+Vue server ships a JS frontend bundle to
// the browser and proxies API calls to backend services. The server-side and
// the browser-side are different OAuth2 client types (confidential vs public)
// and are modeled as separate nodes joined by \`delivers\`.

system ECPlatform {
  label "BFF pattern sample"

  user Customer [human] {
    label "Customer"
  }

  service NextServer {
    label "Next.js BFF"
    description "Server-side: SSR, API routes, session storage, asset pipeline."
    delivers WebApp
  }

  client WebApp [web] {
    label "Customer SPA"
    description "Browser-side bundle delivered by NextServer."
  }

  service OrderService {
    label "Order service"
  }

  Customer  -> WebApp       "uses"
  WebApp    -> NextServer   "API calls (same-origin cookie)"
  NextServer -> OrderService "user-delegated calls"
}
`,
    },
    {
      path: "crud-matrix.krs",
      content: `// Feature sample: CRUD matrix view
//
// Showcases the inputs that \`karasu matrix\` reduces into a usecase x resource
// grid: write/read mix, [external] resources, and undeclared / unrecognized
// verbs that surface as \`?\` cells.

system ECPlatform {
  database OrderDB {
    label "Order DB"
    table OrderTable { label "Order table" }
    table InventoryTable { label "Inventory table" }
  }
  queue OrderEvents {
    label "Order events"
    queue OrderPlaced { label "Order placed" }
  }

  service OrderService {
    label "Order service"

    domain Order {
      usecase PlaceOrder {
        label "Place an order"
        resource OrderDB.OrderTable {
          operations create, read
        }
        resource OrderDB.InventoryTable {
          operations read, update
        }
        resource OrderEvents.OrderPlaced {
          operations create
        }
        resource PaymentAPI [external] {
          label "Payment API"
          operations create
        }
      }
      usecase CancelOrder {
        label "Cancel an order"
        resource OrderDB.OrderTable {
          operations update, delete
        }
        resource OrderEvents.OrderPlaced {
          operations create
        }
      }
      usecase SearchOrders {
        label "Search orders"
        // \`list\` is decorated as \`read\` — matrix shows \`R\` (no \`?\` suffix).
        resource OrderDB.OrderTable {
          operations read, list:read
        }
      }
      usecase ReplaceOrderSnapshot {
        label "Replace order snapshot (physical delete-insert)"
        // \`replace\` decorated as both create + delete (1:N mapping).
        // Matrix counts this as a write and contributes to ΣC and ΣD.
        resource OrderDB.OrderTable {
          operations replace:create,delete
        }
      }
      usecase ReplayOrderEvents {
        label "Replay order events (no operations declared)"
        resource OrderEvents.OrderPlaced
      }
    }
  }

  service ReportService {
    label "Reporting"
    domain Report {
      usecase ExportOrders {
        label "Export orders"
        resource OrderDB.OrderTable {
          operations read
        }
      }
    }
  }
}
`,
    },
    {
      path: "deploy-all.krs",
      content: `// deploy-all.krs
// Demonstrates: all deploy artifact types — war, jar, oci, lambda, function,
// assets, job (one-shot and scheduled), artifact.

system DeploySample {
  label "Deploy Sample"

  service LegacyApp    { label "Legacy App" }
  service ApiServer    { label "API Server" }
  service WorkerApp    { label "Worker App" }
  service WebFrontend  { label "Web Frontend" }
  service DataPipeline { label "Data Pipeline" }
  service BillingJob   { label "Billing Job" }
  service FnHandler    { label "Function Handler" }
  service AzureFn      { label "Azure Function" }
  service LegacyBatch  { label "Legacy Batch" }
}

deploy "Production" {
  war "legacy-app" {
    runtime "Tomcat 10"
    realizes "LegacyApp"
  }

  jar "api-server" {
    runtime "JVM 21"
    realizes "ApiServer"
  }

  oci "worker" {
    image "worker-app:latest"
    runtime "Kubernetes"
    realizes "WorkerApp"
  }

  lambda "fn-handler" {
    runtime "Node.js 22"
    realizes "FnHandler"
  }

  function "azure-fn" {
    runtime "Node.js 20"
    realizes "AzureFn"
  }

  assets "web-frontend" {
    runtime "CloudFront"
    realizes "WebFrontend"
  }

  job "data-pipeline" {
    runtime "JVM 21"
    realizes "DataPipeline"
  }

  job "monthly-billing" {
    runtime "JVM 21"
    schedule "0 0 1 * *"
    realizes "BillingJob"
  }

  artifact "legacy-batch" {
    type "COBOL batch"
    runtime "Mainframe"
    realizes "LegacyBatch"
  }
}
`,
    },
    {
      path: "domain-drift.krs",
      content: `// domain-drift.krs
// Demonstrates: domain-to-domain edges across and within services.
//
// Cross-service edge (OrderDomain -> PaymentDomain):
//   No explicit service edge exists, so an implicit service edge is derived
//   and rendered in amber dashed style in the system view.
//
// Intra-service edge (OrderDomain -> ShippingDomain within OrderService):
//   Both domains belong to OrderService, so the edge is rendered directly
//   in the service drill-down view.

system DriftSample {
  label "Domain Drift Sample"

  service OrderService {
    label "Order Service"

    domain OrderDomain {
      label "Order Domain"
      description "Depends on PaymentDomain to process payments and ShippingDomain to ship orders."
      OrderDomain -> PaymentDomain "decides payment"
      OrderDomain -> ShippingDomain "triggers shipment"
    }

    domain ShippingDomain {
      label "Shipping Domain"
      description "Handles order shipment."
    }
  }

  service PaymentService {
    label "Payment Service"

    domain PaymentDomain {
      label "Payment Domain"
      description "Handles payment processing for orders."
    }
  }
}
`,
    },
    {
      path: "domain-drill.krs",
      content: `// domain-drill.krs
// Demonstrates: full logical hierarchy — system → service → domain → usecase → resource.
// Use this to verify drill-down rendering at every level.

system ECommerce {
  label "EC Platform"

  service OrderService {
    label "Order Service"
    team "Order Team"

    domain OrderDomain {
      label "Order Domain"
      team "Order Team"

      usecase PlaceOrder {
        label "Place Order"

        resource OrderDB {
          label "Order DB"
          description "Primary database for order records."
        }

        resource PaymentAPI [external] {
          label "Payment API"
        }
      }

      usecase CancelOrder {
        label "Cancel Order"

        resource OrderDB {
          label "Order DB"
        }
      }
    }

    domain ShippingDomain {
      label "Shipping Domain"

      usecase TrackShipment {
        label "Track Shipment"

        resource ShippingAPI [external] {
          label "Shipping API"
        }
      }
    }
  }
}
`,
    },
    {
      path: "edges.krs",
      content: `// edges.krs
// Demonstrates: sync (->) and async (-->) edges, with and without labels.

system EdgeSample {
  label "Edge Variants"

  service A { label "Service A" }
  service B { label "Service B" }
  service C { label "Service C" }
  service D { label "Service D" }

  // Sync edges
  A -> B "labelled sync call"
  A -> C

  // Async edges
  B --> D "labelled async call"
  C --> D
}
`,
    },
    {
      path: "external-nodes.krs",
      content: `// external-nodes.krs
// Demonstrates: [external] tag on service and resource nodes.
// External nodes represent components outside the system boundary.

system ExternalSample {
  label "External Nodes"

  service OrderService {
    label "Order Service"

    domain OrderDomain {
      label "Order Domain"

      usecase PlaceOrder {
        label "Place Order"

        resource PaymentAPI [external] {
          label "Payment API"
          description "Third-party payment gateway outside our boundary."
        }

        resource InventoryDB {
          label "Inventory DB"
        }
      }
    }
  }

  service PaymentGateway [external] {
    label "Payment Gateway"
    description "External payment provider — not owned by this team."
  }

  OrderService -> PaymentGateway "charges card"
}
`,
    },
    {
      path: "legend.krs",
      content: `// Diagram legend syntax (Issue #833).
//
// \`legend\` blocks declare color-meaning pairs that render as a footer band
// below each diagram view. Two entry primitives exist:
//   swatch <hex>  "label"   — explicit color sample
//   ref <target>  "label"   — color from the .krs.style cascade for the
//                              given annotation / tag / id / type
//
// View scope is optional. When omitted, the legend appears on every view.
// Otherwise it is filtered to \`system\`, \`deploy\`, or \`org\`.

system ECPlatform {
  label "EC Platform"

  service ECommerce {
    label "EC Site"
  }
  service Payment [external] {
    label "Payment"
  }
  service Legacy @deprecated {
    label "Legacy"
  }
}

deploy Production {
  oci "ec-api"      { realizes ECommerce }
  oci "payment-api" { realizes Payment }
}

organization Acme {
  team Backend {
    label "Backend"
  }
}

// Shown on every view (system / deploy / org).
legend "Owner team" {
  swatch #2563EB "Team Backend"
  swatch #16A34A "Team Frontend"
  swatch #DC2626 "Third-party"

  ref @deprecated "Deprecated"
  ref [external]  "External system"
  ref service     "Service"
  ref #ECommerce  "EC site (focus)"
}

// Deploy-only legend — physical layer specifics.
legend deploy "Hosting tier" {
  swatch #0EA5E9 "Cloud Run"
  swatch #F59E0B "On-prem"
}
`,
    },
    {
      path: "minimal.krs",
      content: `// minimal.krs
// Demonstrates: the smallest valid .krs input — system + 2 services + sync/async edges.
// Use this as a baseline when isolating rendering bugs.

system Minimal {
  label "Minimal System"

  service Frontend {
    label "Frontend"
  }

  service Backend {
    label "Backend"
  }

  Frontend ->  Backend "sync call"
  Frontend --> Backend "async call"
}
`,
    },
    {
      path: "parallel-edges.krs",
      content: `// parallel-edges.krs
// Demonstrates parallel edges between the same node pair. The renderer
// automatically bundles them: ports spread along the node sides (via the
// existing port-distribution pass), and labels slide along the edge so
// "create" and "update" do not stack on top of each other.
// See docs/design/parallel-edge-bundling.md and Issue #1185.

system ParallelEdges {
  label "Parallel Edges"

  service A { label "Client" }
  service B { label "API" }
  service C { label "Worker" }

  // Two sync edges between the same pair: both labels must be readable.
  A -> B "create"
  A -> B "update"

  // Sync + async between the same pair: stroke style differs and labels
  // still need to separate.
  B -> C "enqueue"
  B --> C "callback"
}
`,
    },
    {
      path: "resource-operations.krs",
      content: `// Resource CRUD operations on usecases (Issue #1046) and the
// derived read/write edge differentiation in the usecase view (Issue #1061).
//
// \`operations\` declares which CRUD verbs the enclosing usecase performs on a
// resource. Recognized verbs are \`create\` / \`read\` / \`update\` / \`delete\`.
// Unknown verbs still parse (preserved for translate adapters that emit
// \`list\` / \`search\` / \`execute\`) but raise an \`unknown-resource-operation\`
// warning. Omission keeps the dependency opaque — no diagnostic.
//
// In the usecase drill-down view the renderer derives a write-vs-read
// classification from \`operations\` and shows it via:
//   - synthesized usecase->resource edge gets a [write] / [read] pseudo-tag
//   - edge label: "W" for write, "R" for read
//   - edge stroke-width: 2 for write, 1.5 for read (default style)
// Hierarchy: read (1.5) < write (2) < cyclic (2.5) keeps cyclic the
// most attention-grabbing axis.
//
// This file is the AT-friendly minimal sample. See \`examples/ec-platform/\`
// for the same property used in a realistic scenario.

system Demo {
  label "Resource operations demo"

  database OrderDB {
    table OrderTable { label "Orders table" }
  }

  service Backend {
    domain Order {
      // Write usecase: edge renders thicker with "W" label.
      usecase PlaceOrder {
        label "Accept a new order"
        resource OrderDB.OrderTable {
          operations create, read
        }
        resource InventoryAPI [external] {
          label "Inventory check API"
          operations read
        }
      }

      // Multi-line form accumulates verbs; still classified as write
      // because update is in the list.
      usecase UpdateOrder {
        label "Modify an order"
        resource OrderDB.OrderTable {
          operations read
          operations update
        }
      }

      // Pure read usecase: edge renders thinner with "R" label.
      usecase QueryOrder {
        label "Query order status"
        resource OrderDB.OrderTable {
          operations read
        }
      }

      // Omission form — opaque dependency. Renders as read (conservative)
      // with "R" label and the default thin stroke.
      usecase ListOrders {
        label "List recent orders"
        resource OrderDB.OrderTable
      }
    }
  }
}
`,
    },
    {
      path: "usecase-authorization.krs",
      content: `// Authorization notes on a usecase — the description + link convention
// (ADR-20260511-02, Issue #1282).
//
// karasu deliberately does NOT model runtime authorization (who may call
// which usecase) in its vocabulary. There is no \`requires\`, no \`policy\`,
// no \`role: admin\` attribute. Instead, the constraint is written as prose
// in \`description\` and the canonical rule lives behind a \`link\`.
//
// Convention:
//   - Start the relevant sentence with \`Access:\` (or \`アクセス:\` in JP).
//   - Add a \`link\` whose label contains \`Authorization policy\`.
//   - The link is authoritative; the description is a one-sentence hint.
//   - Do NOT invent attributes inside the description text.
//
// See docs/spec/syntax.md "Authorization notes" for the full rationale.

system Billing {
  label "Billing platform"

  service BillingAPI {
    label "Billing API"

    domain Refund {
      label "Refunds"

      // Restricted usecase — Access: prefix + policy link.
      usecase RefundOrder {
        label "Refund an order"
        description "Access: admins and billing operators only. Customers cannot self-serve; partial refunds require dual approval above 10,000 JPY."
        link "https://policy.example.com/billing/refund-order" "Authorization policy"
      }

      // Open usecase — no Access: prefix, no policy link. Anyone authenticated
      // can call this; the absence of the convention is itself a signal.
      usecase QueryRefundStatus {
        label "Check refund status"
        description "Returns the current state of a refund request."
      }
    }
  }
}
`,
    },
    {
      path: "users.krs",
      content: `// users.krs
// Demonstrates: [human] and [ai] user nodes with role and description properties.

system UserSample {
  label "User Node Sample"

  user Customer [human] {
    label "Customer"
    role "Places orders and tracks shipments"
    description "A human user who interacts with the storefront."
  }

  user SupportAgent [human] {
    label "Support Agent"
    role "Handles customer inquiries"
  }

  user RecommendBot [ai] {
    label "Recommendation Bot"
    role "Generates personalised product recommendations"
    description "An AI agent that analyses purchase history."
  }

  service Storefront {
    label "Storefront"
  }

  service SupportPortal {
    label "Support Portal"
  }

  Customer      -> Storefront     "browses and orders"
  SupportAgent  -> SupportPortal  "resolves tickets"
  RecommendBot  -> Storefront     "injects recommendations"
}
`,
    },
  ],
};

export const MULTI_FILE_SYSTEM_PROJECT: ExampleProject = {
  name: "multi-file-system",
  files: [
    {
      path: "index.krs",
      content: `// multi-file-system/index.krs
// Demonstrates: splitting one \`system\` block across multiple files
// (system reopen, whole-file import, deploy + organization propagation).
// See docs/spec/syntax.md §"Multi-file import semantics".

import "reader.krs"
import "editor.krs"
import "moderation.krs"

// The system body declared here wins over the same-id declarations in the
// imported files (S3: root entry preference). Open reader.krs / editor.krs /
// moderation.krs directly to see the same system labeled differently.
system Blog {
  label "ブログプラットフォームデモ"
  description "Reader / Editor / Moderation の三面を別ファイルに分割した例"
}
`,
    },
    {
      path: "reader.krs",
      content: `// multi-file-system/reader.krs
// Reader-facing slice of the Blog system, plus the deploy and organization
// views (S4: whole-file import propagates \`deploy\` / \`organization\`).
//
// Pulls shared databases from infra.krs so this file renders standalone
// in the App (canonical infra-file pattern).

import "infra.krs"

system Blog {
  label "Reader slice"  // overridden by index.krs (S3)

  user Reader [human] {
    label "読者"
    description "公開記事を閲覧するエンドユーザー"
  }

  client ReaderApp {
    label "閲覧フロント"
    description "公開ページ・記事詳細・検索"
  }

  service ArticleDelivery {
    label "記事配信"
    description "公開済み記事の配信とキャッシュ"

    domain "配信" {
      usecase "記事を取得する" {
        resource ArticleDB.articles
      }
      usecase "全文検索する" {
        resource SearchIndex.documents
      }
    }
  }

  Reader -> ReaderApp "記事を読む"
  ReaderApp -> ArticleDelivery "記事取得"
  ArticleDelivery -> Search "クエリ転送"
}

deploy Production {
  label "Production"
  oci readerContainer {
    label "reader-container"
    runtime "Docker"
    realizes ArticleDelivery
  }
}

organization Editorial {
  label "Editorial"
  team platform {
    label "Platform"
    owns ArticleDelivery
    member alice {
      label "Alice"
      description "Tech lead"
    }
  }
}
`,
    },
    {
      path: "editor.krs",
      content: `// multi-file-system/editor.krs
// Authoring slice — editors write drafts, publish articles, and ask
// Moderation for approval. Single \`Authoring\` service owns the whole
// write-side lifecycle (drafting → publishing) rather than splitting
// each step into its own microservice — both responsibilities are one
// team's purview and share the same DB.
//
// Reaches moderation.krs via a named import; moderation.krs is also
// brought in whole-file by index.krs (DAG re-arrival — no circular
// warning per S5). Pulls shared databases from infra.krs.

import "infra.krs"
import { Moderation } from "moderation.krs"

system Blog {
  label "Editor slice"  // overridden by index.krs (S3)

  user Editor [human] {
    label "編集者"
    description "記事を執筆・公開する"
  }

  client EditorApp {
    label "編集フロント"
    description "下書き編集・プレビュー・公開操作"
  }

  service Authoring {
    label "編集・公開"
    description "下書きから公開までの記事ライフサイクル"

    domain "編集" {
      usecase "下書きを編集する" {
        resource DraftStore.drafts
      }
      usecase "プレビューを生成する" {
        resource DraftStore.drafts
      }
    }

    domain "公開" {
      usecase "記事を公開する" {
        resource ArticleDB.articles
      }
    }
  }

  Editor -> EditorApp "記事を書く"
  EditorApp -> Authoring "下書き保存 / 公開"
  Authoring -> Moderation "公開前チェック依頼"
}

// Same-id \`deploy\` / \`organization\` blocks merge with the ones in
// reader.krs and moderation.krs (S4 union).
deploy Production {
  oci authoringContainer {
    label "authoring-container"
    runtime "Docker"
    realizes Authoring
  }
}

organization Editorial {
  team editorial {
    label "Editorial"
    owns Authoring
    member bob {
      label "Bob"
      description "Editor-in-chief"
    }
  }
}
`,
    },
    {
      path: "moderation.krs",
      content: `// multi-file-system/moderation.krs
// Trust & Safety slice — owns moderation review and surfaces the external
// search service that delivery relies on. Reached via two paths: named
// import from editor.krs (Authoring asks Moderation for approval before
// publishing) and whole-file import from index.krs. Not a cycle (S5).
// Pulls shared databases from infra.krs (canonical infra-file pattern).

import "infra.krs"

system Blog {
  // No label here — S3 leaves index.krs's label intact.

  user Moderator [human] {
    label "モデレーター"
    description "投稿内容の審査・公開可否を判断"
  }

  client AdminApp [internal] {
    label "管理コンソール"
    description "モデレーション / 公開キュー操作"
  }

  service Moderation {
    label "モデレーション"
    description "公開前チェック・違反通報の処理"

    domain "審査" {
      usecase "公開可否を判断する" {
        resource ModerationLog.decisions
      }
      usecase "違反通報を処理する" {
        resource ModerationLog.decisions
      }
    }
  }

  Moderator -> AdminApp "モデレーション操作"
  AdminApp -> Moderation "判定を記録"
}

// Same-id \`deploy\` / \`organization\` blocks merge with the ones in
// reader.krs and editor.krs (S4 union).
deploy Production {
  oci moderationContainer {
    label "moderation-container"
    runtime "Docker"
    realizes Moderation
  }
}

organization Editorial {
  team trustSafety {
    label "Trust & Safety"
    owns Moderation
    member carol {
      label "Carol"
      description "Trust & Safety lead"
    }
  }
}
`,
    },
    {
      path: "infra.krs",
      content: `// multi-file-system/infra.krs
// Shared infrastructure — databases and external dependencies referenced
// by services across reader / editor / moderation slices. Declared once
// here, inside a reopened \`system Blog\` block (S3), and pulled into each
// slice via \`import "infra.krs"\`. This is the canonical pattern for
// cross-file shared infra:
//
//   - Each slice that uses a shared resource imports infra.krs, so it
//     renders standalone in the App without unresolved-edge warnings.
//   - DAG re-arrival (S5) memoizes the resolved infra.krs, so being
//     reached through reader / editor / moderation doesn't duplicate work.
//   - The merged model has one canonical declaration per resource — no
//     ambiguity about where shared infra "lives".
//   - Declaring inside \`system Blog { ... }\` (rather than at file root)
//     lets the system-reopen merge in S3 attach the infra to the system,
//     so the \`unassigned-database\` warning doesn't fire.

system Blog {
  database ArticleDB {
    table articles
  }

  database DraftStore {
    table drafts
  }

  database SearchIndex {
    table documents
  }

  database ModerationLog {
    table decisions
  }

  service Search [external] {
    label "全文検索エンジン"
    description "外部ホスト型の検索サービス。Delivery が直接クエリする"
  }
}
`,
    },
  ],
};
