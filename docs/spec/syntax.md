# .krs 構文リファレンス

## ファイル構造

```
@import "default.krs.style"
@import "theme/dark.krs.style"   // 複数可。後に書いたものが優先

system "ECプラットフォーム" {
  // service・person・エッジの定義
}
```

---

## 概念の全体像

karasu は**論理構造**と**物理構造**を明確に分離して表現する。

### 論理構造（何を・なぜ）

| キーワード | 意味 | 含むことができるもの |
|-----------|------|-------------------|
| `system` | owned/externalなサービスの関係を示す器 | `service`, `person` |
| `service` | 独立したビジネス機能の単位 | `domain` |
| `domain` | サービス内のビジネス上の関心事の境界 | `usecase` |
| `usecase` | ドメイン内の業務・操作 | — |
| `person` | 利用者・人物 | — |

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
<種別> <id> "<ラベル>" "<説明>" [<タグ>] @<アノテーション>
```

説明・タグ・アノテーションは省略可。

---

## 論理図の記述

### system ブロック

```
system "ECプラットフォーム" {
  person  Customer  "顧客"         "商品を購入する一般ユーザー"
  person  Admin     "管理者"       "システムを運用する担当者"

  service ECommerce "ECサイト"     "商品管理と注文処理"
  service Payment   "決済サービス" "クレジットカード決済処理" [external]
  service Inventory "在庫管理"     "在庫データの管理"         [external]

  Customer  ->  ECommerce "商品を購入する"
  ECommerce ->  Payment   "決済を処理する"
  ECommerce --> Inventory "在庫を同期する"
}
```

### service ブロック

service の内部を domain に分解して記述する。
1つのドメインが複数の service にまたがる場合はツールが警告を出す（設計上の問題シグナル）。

```
service ECommerce "ECサイト" {
  domain "受注" {
    usecase "注文を受け付ける"
    usecase "注文をキャンセルする"
    usecase "注文状況を照会する"
  }
  domain "発注" {
    usecase "仕入先に発注する"
    usecase "発注状況を確認する"
  }
}
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
system "ECプラットフォーム" {
  service ECommerce "ECサイト" {
    domain "受注" { ... }
  }
}

// 外部ファイルへ extract した後
import { ECommerce } from "ecommerce.krs"

system "ECプラットフォーム" {
  service ECommerce
  service Payment "決済サービス" [external]
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

同じドメイン名が複数の service に登場した場合、ツールが警告を出す。

```
⚠ Warning: domain "受注" が複数の service に分散しています
  - ECommerce
  - Legacy
  ドメインの凝集性を確認してください
```
