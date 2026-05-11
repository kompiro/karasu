# .krs 構文リファレンス

> [English](syntax.md) · **日本語**（このファイル）

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

### 組織構造（誰が所有するか）— 別図で表現

論理・物理とは独立した軸として、サービス・ドメインの **オーナーシップ** を記述する。
`organization` をルートとし、`team` を入れ子で宣言する。各 team は `owns` で所有するノード（service / domain 等）を列挙し、`member` で所属メンバーを持てる。

| キーワード | 意味 | 含むことができるもの |
|-----------|------|-------------------|
| `organization` | 組織のルート。複数宣言可 | `team` |
| `team` | 責任を持つチーム。ネスト可 | `team`, `member`, `owns` |
| `member` | チームに所属する個人 | — |

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

#### `operations` プロパティ — usecase が resource に対して行う CRUD 動作

`usecase` 内の `resource` には `operations` プロパティを指定でき、その usecase が当該 resource に対して行う CRUD 動作を明示できる。usecase × resource マトリクス上で「書き込み／読み取り専用」を判別できるようにし、結合度シグナルや translate アダプタとの情報往復に役立てる。

```
usecase PlaceOrder {
  resource OrderTable {
    label "注文テーブル"
    operations create, read
  }
  resource InventoryAPI [external] {
    operations read
  }
}
```

許容される記法:

```
operations create                 // 単一
operations create, read           // カンマ区切り
operations create
operations read, update           // 複数行は累積される
```

`operations` は `usecase` 内の `resource` 宣言でのみ有効。インフラ側の `table` / `queue-item` / `bucket` には書けない。

| Operation | 意味 |
|-----------|------|
| `create` | resource 上に新しい項目を生成する書き込み |
| `read` | resource を非破壊で参照する |
| `update` | 既存項目を変更する書き込み |
| `delete` | 項目を消去する書き込み |

認識セット外の動詞も AST にはそのまま保持する（translate アダプタが `list` / `search` / `execute` などを往復できるようにするため）。パーサは `unknown-resource-operation` 警告を出す。重複は `duplicate-resource-operation` 警告を出して AST 上で重複排除される。

**省略時の意味**: `operations` を書かなければ現状と同じ挙動。依存は opaque のままで警告は出ない。「未決定の許容」（§プロパティの必須・省略ルール）方針を踏襲する。

#### 認可ノート — `description` + `link` で書く

[ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md) により、karasu は usecase レベルの認可（ロール／ライセンス／プラン／スコープなどの述語）を語彙に取り込まない。構造言語が表現するのは「何が存在し、どう関係するか」であり、「実行時に誰が当該 usecase を呼べるか」は外部の policy doc や IAM ツール（OPA, Cedar, Casbin, 社内 RBAC ドキュメントなど）に委ねる。

そのため認可記述を散文に逃がすことになるが、何も決めないとチームごとに語彙がブレる（「Admin only」「`billing.write` スコープ必要」「pro プラン以上」など）。次の取り決めで散文の見た目を揃え、読者と AI が「この usecase には認可制約がある」と一目で認識できるようにする:

```
usecase RefundOrder {
  label "返金処理"
  description "アクセス: 管理者と請求オペレーターのみ。詳細は policy リンクを参照。"
  link "https://policy.example.com/refund-order" "Authorization policy"
}
```

**規約**:

- 認可制約を持つ usecase の `description` では、該当する文を `アクセス:`（または英語で `Access:`）で始める。一文に収める — `description` は「ヒント」であって規則そのものではない。
- 同じ usecase に `link` を添え、ラベルに `Authorization policy`（または `認可ポリシー`）を含めて canonical な policy doc / IAM ルールを指す。**source of truth は link 側。** 散文と link が食い違ったときは link が正で、`description` は古いとみなす。
- `description` の中に属性風の語彙（`role: admin`、`requires: billing.write` 等）を発明しない。一文に収まらない制約はモデルではなく policy doc に置くべきというサインである。

ツールはこの規約を強制も描画もしない（`アクセス:` バッジも policy-link デコレーションもバリデータも存在しない）。あくまで著者間の「散文の取り決め」であり、同じ制約がファイルやチームを跨いでも同じ姿で読めるようにするためのもの。machine-checkable なゲートが必要な場合は明示的に対象外である（ADR-20260511-02 参照）。

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

エッジは `system`・`service`・`domain` ブロックの内部に記述できる。

#### domain ブロック内のエッジ

`domain` ブロック内にエッジを宣言することで、ドメイン間の依存関係を表現できる。
`from_id` には宣言元ドメインの ID、`to_id` には依存先ドメインの ID を記述する。

```
service ECommerce {
  domain Contract { label "契約" }
}

service BillingService {
  domain Billing {
    label "請求"
    Billing -> Contract "契約から作成される"       // 同期依存
    Billing --> AuditLog "監査ログを記録する"      // 非同期依存
  }
}
```

**同一サービス内のドメインエッジ**: サービスビュー（service をドリルダウンした図）で描画される。

**クロスサービスのドメインエッジ**: システムビューで「暗黙のサービス間エッジ」として自動的に派生・描画される。  
複数のドメインエッジが同じサービスペアに集約される場合、エッジのラベルは `"N domain edges"` と表示される。

暗黙エッジには `[implicit]` タグが自動付与される。デフォルトはアンバー色の破線で描画される。
明示的なサービス間エッジが同じ方向に存在する場合、暗黙エッジは派生されない。

使用できるタグ・スタイルの詳細は [`docs/spec/tags-annotations.md`](tags-annotations.md) を参照。

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

複数の `realizes` を並べることで、1つのデプロイ単位が複数のサービスを実現することを表せる。
その場合、デプロイダイアグラム上では各サービスのコンテナに同じノードが描画される。

```
oci "monolith" {
  image    "monolith:1.0.0"
  realizes OrderService
  realizes InventoryService
}
```

---

## 組織図の記述

`organization` ブロックで組織・チーム・メンバーの階層を宣言する。
論理図・物理図とは独立した「組織ビュー」としてレンダリングされる。

```
organization TechCorp {
  label "TechCorp Engineering"

  team "ec-team" {
    label "ECチーム"
    description "ECサイトの開発・運用を担当するチーム"

    owns ECommerce
    owns Order
    owns Catalog

    member alice {
      label "Alice Yamamoto"
      description "ECチームのテックリード"
      slack "@alice"
      github "alice-yamamoto"
    }
    member bob {
      label "Bob Tanaka"
      slack "@bob"
      github "bob-tanaka"
    }
  }

  team "platform-team" {
    label "プラットフォームチーム"

    team "infra" {
      label "インフラ"
      owns Kubernetes
      member dave { label "Dave Suzuki" }
    }
    team "security" {
      label "セキュリティ"
    }
  }
}
```

### team ノード

- `owns <id>` は team が所有する論理ノード（service / domain 等）を宣言する。同じ `id` を複数の team が `owns` することはできず、重複するとエラーになる。
- team は入れ子にでき、親 team の下に子 team を並べると組織階層を表現できる。
- team ID は同一 organization 内で一意。重複するとエラーになる。
- パース時に `ownerIndex`（`node id → team id`）が構築され、論理図のノードから所有チームを逆引きできる。

### member ノード

team の直下に `member` を宣言して個人を記述する。

| プロパティ | 構文 | 説明 |
|-----------|------|------|
| `label` | `label "<表示名>"` | 図上の表示名 |
| `description` | `description "<説明>"` | メンバーの説明文 |
| `slack` | `slack "<ハンドル>"` | Slack ハンドル |
| `github` | `github "<ユーザー名>"` | GitHub ユーザー名 |

すべて省略可。`member` はネストできない。

### label の指定方法

`organization` / `team` / `member` はいずれも位置引数（`team backend "バックエンドチーム"`）と
プロパティ形式（`team backend { label "バックエンドチーム" }`）の両方で label を指定できる。
両方が同時に指定された場合はプロパティ形式が優先される。

---

## 図の凡例（legend ブロック）

`legend` ブロックは「色と意味の対応」を宣言する。レンダラーは各ビューの図の下に
フッター帯として描画する。エクスポートやレビューで「この色は何？」を口頭で
説明せずに済むようにするのが目的。

### 配置

`legend` はトップレベルに置く（`system` / `deploy` / `organization` と同列）。
`system` / `service` / `domain` 内へのネストは parse error。同じビューが対象の
`legend` ブロックは複数書けて、宣言順に縦に並ぶ。

### 文法

```
legend ::= "legend" view-scope? title? "{" entry* "}"

view-scope ::= "system" | "deploy" | "org"
title      ::= <文字列リテラル>
entry      ::= swatch-entry | ref-entry

swatch-entry ::= "swatch" "#" hex-digits <文字列リテラル>
ref-entry    ::= "ref" ref-target <文字列リテラル>

ref-target ::= "@" identifier      ; annotation
             | "[" identifier "]"  ; tag
             | "." identifier      ; class（前方互換、現状常に未解決）
             | "#" identifier      ; node id
             | identifier          ; node 種別（type）
```

### ビュースコープ

| `<view-scope>` | 描画されるビュー |
|----------------|------------------|
| 省略           | system / deploy / org すべて |
| `system`       | system 図のみ |
| `deploy`       | deploy 図のみ |
| `org`          | org 図のみ |

### 例

```krs
system ECPlatform {
  service ECommerce { label "EC サイト" }
  service Payment [external] { label "決済" }
  service Legacy @deprecated { label "レガシー" }
}

deploy Production {
  oci "ec-api" { realizes ECommerce }
}

// 全ビューに表示
legend "オーナーチーム" {
  swatch #2563EB "バックエンド"
  swatch #16A34A "フロントエンド"
  swatch #DC2626 "サードパーティ"

  ref @deprecated "廃止予定"   // 色は .krs.style から
  ref [external]  "外部システム"
  ref service     "サービス"
  ref #ECommerce  "EC サイト"
}

// deploy 図だけに表示
legend deploy "ホスティング層" {
  swatch #0EA5E9 "Cloud Run"
  swatch #F59E0B "On-prem"
}
```

### 色の解決

- **`swatch`** は hex 値をそのまま使う（3 / 4 / 6 / 8 桁、`#` プレフィックス必須）。
- **`ref`** は `.krs.style` のカスケードで解決する。一致したルールのうち
  specificity が最も高いものから `background-color`（無ければ `badge-color`）を採用。
- ターゲットが少なくとも 1 つの実ノードに付いているが painting rule を持たない
  `ref` は、**中立的なフォールバック swatch** で描画される。これにより
  `[human]` / `[ai]` のような意味的アノテーション / タグも凡例に表示される。
- 一致するルールも該当ノードも無い `ref` は**フッターから省略**され、
  warning panel に `legend-ref-unresolved` が表示される。
- `.class` セレクタはパーサーが受け付けるが、`.krs.style` にクラス概念が
  ないため現状は常に未解決扱い（[`style.ja.md`](style.ja.md) 参照）。

### ラベルは i18n しない

凡例ラベルは著者が `.krs` に直接書いた文字列で、`name` / `label` プロパティと
同じく **i18n の対象外**。レンダラーは SVG にそのまま埋め込み、app の翻訳層は
触らない（[`i18n.md`](i18n.md) の exemption リスト参照）。

### サンプル

`examples/feature-samples/legend.krs` に v1 の全プリミティブを盛り込んだ
サンプルがあるので、アプリにペーストして動作を確認できる。

### v1 で扱わないこと

設計判断の経緯は [`docs/design/diagram-legend.md`](../design/diagram-legend.md) を参照。

- shape / icon / pattern 凡例（v1 は色のみ）
- インタラクティブ凡例（クリックでハイライト 等）
- 使用中アノテーション / タグからの自動生成
- diff ビュー（`compileSystemDiff` / `compileDeployDiff`）と
  org のドリルダウン / focused-team / icon-mode 経路への描画

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

## ドメイン ID の一意性

同じ `domain id` が同一 `system` 内の複数の `service` に登場した場合、ツールがエラーを出す。

```
✖ Error: Domain id "Order" must be unique within a system; found in multiple services
```

ドメインエッジ（`Billing -> Contract`）の解決は domain ID で行われるため、ID が一意でなければ参照先が曖昧になる。  
この制約により、同一 system 内では domain ID を重複させることはできない。

**検出スコープ**: `system` ブロック単位。
異なる `system` にまたがる同名 `domain` は組織的に独立した並行モデリングとして扱い、エラーにしない。

**検出キー**: `domain` の `id`。`label`（表示名）は検出に使用しない。
