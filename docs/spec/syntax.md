# .krs 構文リファレンス

## ファイル構造

```
@import "default.krs.style"
@import "theme/dark.krs.style"   // 複数可。後に書いたものが優先

system "ECプラットフォーム":
  // service・user・エッジの定義
```

---

## 概念の全体像

karasu は**論理構造**と**物理構造**を明確に分離して表現する。

### 論理構造（何を・なぜ）

| キーワード | 意味 | 含むことができるもの |
|-----------|------|-------------------|
| `system` | owned/externalなサービスの関係を示す器 | `service`, `user` |
| `service` | 独立したビジネス機能の単位 | `domain` |
| `domain` | サービス内のビジネス上の関心事の境界 | `usecase` |
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
<種別> <id> "<ラベル>" [<タグ>] @<アノテーション>
```

タグ・アノテーションは省略可。

---

## プロパティブロック

ノード宣言の末尾にコロン `:` を付け、インデントされたブロック内にプロパティを記述する。
子ノードがプロパティを持たない場合、`:` は不要。

| プロパティ | 構文 | 使用可能な種別 | 説明 |
|-----------|------|--------------|------|
| `description` | `description: "テキスト"` または `description: \|` | 全種別 | ノードの説明 |
| `role` | `role: "ロール名"` | user | 業務上の役割 |
| `team` | `team: "チーム名"` | service, domain | オーナーチーム |
| `links` | `links:` + YAML リスト | 全種別 | 関連ドキュメントへのリンク（複数可） |

すべてのプロパティは省略可。`links` は YAML リスト形式で複数の URL を記述できる。
使用可能な種別以外で記述した場合はエラーを出す。

### description のパイプ記法

複数行の説明（Markdown対応）にはパイプ記法を使用する:

```
service ECommerce "ECサイト":
  description: |
    商品管理と注文処理を担当するサービス。

    ## 責務
    - 商品カタログの管理
    - 注文の受付と処理
```

### user ノードの例

```
user Admin "管理者" [human]:
  role: "システム管理者"
  links:
    - "https://wiki.example.com/admin"
```

- タグ `[human]` / `[ai]` で人間の利用者とAIエージェントを区別する
- `role` はシステムにおける業務上の役割を記述する
- プロパティブロック（`:` + インデント）は省略可

### service / domain ノードの例

```
service ECommerce "ECサイト":
  description: "商品管理と注文処理"
  team: "ECチーム"
  links:
    - "https://wiki.example.com/ec"
    - "https://figma.com/file/xxx"

  domain Order "受注":
    team: "受注チーム"
    usecase PlaceOrder "注文を受け付ける"
```

---

## 論理図の記述

### system ブロック

```
system "ECプラットフォーム":
  user Customer "顧客" [human]:
    description: "商品を購入する一般ユーザー"
  user Admin "管理者" [human]:
    description: "システムを運用する担当者"

  service ECommerce "ECサイト":
    description: "商品管理と注文処理"
  service Payment "決済サービス" [external]:
    description: "クレジットカード決済処理"
  service Inventory "在庫管理" [external]:
    description: "在庫データの管理"

  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
  ECommerce --> Inventory "在庫を同期する"
```

### service ブロック

service の内部を domain に分解して記述する。
1つのドメインが複数の service にまたがる場合はツールが警告を出す（設計上の問題シグナル）。

```
service ECommerce "ECサイト":
  domain Order "受注":
    usecase PlaceOrder "注文を受け付ける":
      resource OrderTable "注文テーブル"
      resource InventoryAPI "在庫API" [external]
    usecase CancelOrder "注文をキャンセルする"
    usecase CheckOrder "注文状況を照会する"
  domain Purchasing "発注":
    usecase PlaceSupplyOrder "仕入先に発注する"
    usecase CheckSupplyOrder "発注状況を確認する"
```

### エッジ宣言

```
<from_id> ->  <to_id> "<ラベル>"   // 同期（実線矢印）
<from_id> --> <to_id> "<ラベル>"   // 非同期（破線矢印）
```

---

## 物理図の記述

```
// deploy.krs
deploy "本番環境":
  war "order.war":
    runtime: "Tomcat 9"
    realizes: ECommerce

  oci "inventory-service":
    image: "inventory:2.1.0"
    runtime: "Node.js 20"
    realizes: Inventory

  assets "storefront":
    runtime: "CloudFront / S3"
    realizes: Frontend

  job "data-migration":          // scheduleなし → 単発実行
    runtime: "Python 3.12"
    realizes: Migration

  job "monthly-billing":         // scheduleあり → 定期実行
    schedule: "0 0 1 * *"
    runtime: "Java 21"
    realizes: Billing

  artifact "legacy-settlement":  // ビルトイン種別に該当しない場合
    type: "mainframe-batch"
    runtime: "COBOL / z/OS"
    realizes: Settlement
```

`realizes` はUMLのRealization（実現）関係。矢印は物理（具象）→ 論理（抽象）の向き。

---

## ドリルダウンと外部ファイル参照

インラインネストで記述し、育ってきたら外部ファイルに extract できる。

```
// インラインネスト（基本形）
system "ECプラットフォーム":
  service ECommerce "ECサイト":
    domain Order "受注":
      usecase PlaceOrder "注文を受け付ける"
```

```
// 外部ファイルへ extract した後
import { ECommerce } from "ecommerce.krs"

system "ECプラットフォーム":
  service ECommerce
  service Payment "決済サービス" [external]
  ECommerce -> Payment "決済を処理する"
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

同じドメイン名が複数の service に登場した場合、ツールが警告を出す。

```
⚠ Warning: domain "受注" が複数の service に分散しています
  - ECommerce
  - Legacy
  ドメインの凝集性を確認してください
```
