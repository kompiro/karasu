# .krs 構文リファレンス

## ファイル構造

```
@import "default.krs.style"
@import "theme/dark.krs.style"   // 複数可。後に書いたものが優先

// サービス未割り当てのドメイン（トップレベル）
domain Payment { label "決済" }

system ECPlatform {
  label "ECプラットフォーム"
  // service・user・エッジの定義
}
```

---

## 概念の全体像

karasu は**論理構造**と**物理構造**を明確に分離して表現する。

### 論理構造（何を・なぜ）

| キーワード | 意味 | 含むことができるもの |
|-----------|------|-------------------|
| `system` | owned/externalなサービスの関係を示す器 | `service`, `user` |
| `service` | 独立したビジネス機能の単位 | `domain` |
| `domain` | ビジネス上の関心事の境界（トップレベルまたはサービス内） | `usecase` |
| `usecase` | ドメイン内の業務・操作 | `resource` |
| `resource` | usecase が操作する対象（テーブル、外部API、ファイル等） | — |
| `user` | システムの利用者（人間またはAIエージェント） | — |

### 物理構造（どのように）— 別図で表現

`deploy` ブロックの中にデプロイ単位を種別キーワードで記述する。
すべてのプロパティは省略可。未指定の場合は警告を出すにとどめ、エラーにはしない。

| キーワード | 説明 | プロパティ |
|-----------|------|-----------|
| `war` | WAR / EAR（Servlet・EJBコンテナ） | `runtime`, `realizes` |
| `jar` | 実行可能 JAR（Spring Boot など） | `runtime`, `realizes` |
| `oci` | コンテナイメージ | `image`（省略可）, `runtime`, `realizes` |
| `lambda` | AWS Lambda | `runtime`, `realizes` |
| `function` | Azure Functions / Google Cloud Functions | `runtime`, `realizes` |
| `assets` | 静的ファイル・SPA（CDN配信） | `runtime`, `realizes` |
| `job` | バッチ処理。`schedule` 省略で単発実行、指定で定期実行 | `runtime`, `schedule`（省略可）, `realizes` |
| `artifact` | 上記に該当しない任意種別（逃げ弁） | `type`（省略可）, `runtime`, `realizes` |

---

## ノード宣言

```
<種別> <id> [<タグ>] @<アノテーション> [{ <プロパティ> <子ノード> }]
```

`id` は必須。タグ・アノテーション・ボディブロックは省略可。

---

## プロパティブロック

ボディブロック `{ }` 内にプロパティを記述できる。プロパティは子ノードやエッジの前に記述する。

| プロパティ | 構文 | 使用可能な種別 | 説明 |
|-----------|------|--------------|------|
| `label` | `label "<表示名>"` | 全種別 | 図上の表示名。省略時は id をそのまま表示する |
| `description` | `description "<説明>"` | 全種別 | ノードの説明文（複数行は `"""..."""` 形式） |
| `role` | `role "<ロール名>"` | user | 業務上の役割 |
| `team` | `team "<チーム名>"` | service, domain | オーナーチーム |
| `link` | `link "<URL>" "<ラベル>"` | 全種別 | 関連ドキュメントへのリンク（複数可）。ラベルは省略可 |

すべてのプロパティは省略可。`link` は同一ノード内に複数記述できる。
使用可能な種別以外で記述した場合はエラーを出す。

### user ノードの例

```
user <id> [<human|ai>] {
  label "<表示名>"
  role "<ロール名>"
  link "<URL>" "<ラベル>"
}
```

- タグ `[human]` / `[ai]` で人間の利用者とAIエージェントを区別する
- `role` はシステムにおける業務上の役割を記述する
- プロパティおよびボディブロック `{ }` は省略可

### service / domain ノードの例

```
service <id> {
  label "<表示名>"
  team "<チーム名>"
  link "<URL>" "<ラベル>"
  link "<URL>" "<ラベル>"

  domain <domainId> {
    label "<ドメイン名>"
    team "<チーム名>"
    ...
  }
}
```

---

## 論理図の記述

### system ブロック

```
system ECPlatform {
  label "ECプラットフォーム"

  user Customer [human] {
    description "商品を購入する一般ユーザー"
  }
  user Admin [human] {
    description "システムを運用する担当者"
  }

  service ECommerce {
    label "ECサイト"
    description "商品管理と注文処理"
  }
  service Payment [external] {
    label "決済サービス"
    description "クレジットカード決済処理"
  }
  service Inventory [external] {
    label "在庫管理"
    description "在庫データの管理"
  }

  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
  ECommerce --> Inventory "在庫を同期する"
}
```

### service ブロック

service の内部を domain に分解して記述する。
1つのドメインが複数の service にまたがる場合はツールが警告を出す（設計上の問題シグナル）。

```
service ECommerce {
  label "ECサイト"
  domain Order {
    label "受注"
    usecase PlaceOrder {
      label "注文を受け付ける"
      resource OrderTable {
        label "注文テーブル"
      }
      resource InventoryAPI [external] {
        label "在庫API"
      }
    }
    usecase CancelOrder {
      label "注文をキャンセルする"
    }
    usecase QueryOrder {
      label "注文状況を照会する"
    }
  }
  domain Purchasing {
    label "発注"
    usecase OrderFromSupplier {
      label "仕入先に発注する"
    }
    usecase CheckPurchaseStatus {
      label "発注状況を確認する"
    }
  }
}
```

### トップレベル domain 宣言

`domain` は `service` の内部だけでなく、ファイルのトップレベルにも記述できる。
どのサービスにも属さないドメインは「未割り当て」として扱われ、システムビューに表示される。
コンパイラは未割り当てドメインに対して警告を出す。

```
// まだどのサービスに属するか決まっていないドメイン
domain Payment { label "決済" }
domain Inventory { label "在庫" }

system ECPlatform {
  service ECommerce {
    // ドメインの割り当ては後で決定
  }
}
```

用途:
- 設計初期段階でドメイン概念を先に列挙する
- サービス再編中にドメインを一時的に「仮置き」する

### エッジ宣言

```
<from_id> ->  <to_id> "<ラベル>"   // 同期（実線矢印）
<from_id> --> <to_id> "<ラベル>"   // 非同期（破線矢印）
```

---

## 物理図の記述

```
// deploy.krs
deploy "本番環境" {

  war "order.war" {
    runtime  "Tomcat 9"
    realizes ECommerce
  }

  oci "inventory-service" {
    image    "inventory:2.1.0"
    runtime  "Node.js 20"
    realizes Inventory
  }

  assets "storefront" {
    runtime  "CloudFront / S3"
    realizes Frontend
  }

  job "data-migration" {          // scheduleなし → 単発実行
    runtime  "Python 3.12"
    realizes Migration
  }

  job "monthly-billing" {         // scheduleあり → 定期実行
    schedule "0 0 1 * *"
    runtime  "Java 21"
    realizes Billing
  }

  artifact "legacy-settlement" {  // ビルトイン種別に該当しない場合
    type     "mainframe-batch"
    runtime  "COBOL / z/OS"
    realizes Settlement
  }
}
```

`realizes` はUMLのRealization（実現）関係。矢印は物理（具象）→ 論理（抽象）の向き。

---

## ドリルダウンと外部ファイル参照

インラインネストで記述し、育ってきたら外部ファイルに extract できる。

```
// インラインネスト（基本形）
system ECPlatform {
  label "ECプラットフォーム"
  service ECommerce {
    label "ECサイト"
    domain Order { label "受注" }
  }
}

// 外部ファイルへ extract した後
import { ECommerce } from "ecommerce.krs"

system ECPlatform {
  label "ECプラットフォーム"
  service ECommerce
  service Payment [external] {
    label "決済サービス"
  }
  ECommerce -> Payment "決済を処理する"
}
```

---

## @import のスコープ

- ファイル全体に適用される（グローバルスコープ）
- ファイル先頭に記述する
- 同じセレクタが複数ファイルで定義された場合は後勝ち（警告を出力）

---

## プロパティの必須・省略ルール

プロパティはすべて省略可。未指定の場合は警告を出すにとどめ、エラーにはしない。
図を描きながら設計を詰めていく途中で「まだ決まっていない」状態を許容するためのポリシー。

| プロパティ | 省略時の挙動 |
|-----------|------------|
| `runtime` | `⚠ runtime が指定されていません` と警告 |
| `realizes` | `⚠ realizes が指定されていません` と警告（物理図の存在意義に直結するため） |
| `schedule` | 省略時は単発実行として扱う（警告なし） |
| `image`（ociのみ） | 省略可。指定すると図に表示される |
| `type`（artifactのみ） | 省略可。指定すると図に表示される |

---

## ドメイン分散の警告

同じ `domain id` が同一 `system` 内の複数の `service` に登場した場合、ツールが警告を出す。

```
⚠ Warning: domain "Order" が複数の service に分散しています
  - ECommerce
  - Legacy
  ドメインの凝集性を確認してください
```

**検出スコープ**: `system` ブロック単位。異なる `system` にまたがる同名 `domain` は
組織的に独立した並行モデリングとして扱い、警告しない。

**検出キー**: `domain` の `id`。`label`（表示名）は検出に使用しない。
