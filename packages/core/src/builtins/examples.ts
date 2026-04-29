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
  }

  service ECommerce {
    label "ECサイト"
    description "商品の閲覧・購入・出品を提供する"

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
  }

  service ECommerce {
    label "EC Site"
    description "Browsing, purchasing, and listing products"

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
  }

  client ClaudeDesktop [desktop] {
    label "Claude Desktop"
    description "Local desktop client wired to the MCP server via stdio"
    handles Order
    resource opfs "drafts"
    resource file "claude-desktop.config"
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
        }
        resource InventoryAPI {
          label "在庫API"
        }
      }

      usecase CancelOrder {
        label "注文をキャンセルする"
        resource OrderTable {
          label "注文テーブル"
        }
      }

      usecase QueryOrder {
        label "注文状況を照会する"
        resource OrderTable {
          label "注文テーブル"
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
        }
      }

      usecase UpdateProduct {
        label "商品情報を更新する"
        resource ProductTable {
          label "商品テーブル"
        }
        resource ImageStorage {
          label "画像ストレージ"
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
