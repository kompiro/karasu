/**
 * Built-in example projects derived from examples/ec-platform/.
 * Used to populate ProjectMode on first launch.
 *
 * SYNC RULE: When modifying examples/ec-platform/ files, update this file
 * accordingly. See .claude/rules/examples-sync.md for the mapping table.
 */

export type ExampleProject = {
  /** Project name shown in the project selector */
  name: string;
  /** Files to write into the project root. Paths are relative to rootPath. */
  files: { path: string; content: string }[];
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
// Demonstrates: import "dir/" — auto-loading all .krs files in a directory.
// Each team owns their service file; this file defines the entry point and wiring.
// Open this directory in VSCode Extension or use \`karasu serve\` in server mode.

import "./"

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
// ECommerce service definition — merged into ECPlatform via directory import

system ECPlatform {
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
}
`,
      },
      {
        path: "payment.krs",
        content: `// ec-platform/05-multifile/payment.krs
// Payment service definition — merged into ECPlatform via directory import

system ECPlatform {
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
