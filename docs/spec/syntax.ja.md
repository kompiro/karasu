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

<!-- gen:reference:node-kinds-logical — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| キーワード | 意味 | 含むことができるもの |
|------------|------|----------------------|
| `system` | owned/external なサービスやクライアントの関係を示す器 | `service`, `user`, `client`, `database`, `queue`, `storage` |
| `user` | システムの利用者（人間またはAIエージェント） | — |
| `client` | ユーザーの委譲で動く、自社が出荷するクライアントソフトウェア（mobile / web / desktop / cli / device / extension / embed） | — |
| `service` | 独立したビジネス機能の単位 | `domain` |
| `domain` | ビジネス上の関心事の境界（トップレベルまたはサービス内） | `usecase` |
| `usecase` | ドメイン内の業務・操作 | `resource` |
| `resource` | usecaseが操作する対象（テーブル、外部API、ファイル等） | — |
<!-- /gen:reference:node-kinds-logical -->

認識される `client` の form-factor タグは下記の表を参照。

#### `client` の form-factor タグ（認識されるもの）

karasu のタグシステムは意図的にオープンで、任意のタグを受け付けつつスタイルがセレクタで反応する設計になっている。`client` に限っては、form factor 分類として **7 つの名前が認識される**。将来的に kind 固有のアイコン（Phase 2）やレイアウトヒントで反応する予定。リスト外のタグもパースは通り、通常のユーザー定義タグとして振る舞うが、karasu 内蔵の form-factor 扱いはトリガしない。

<!-- gen:reference:client-form-factor-tags — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| タグ | Form factor |
|------|-------------|
| `[mobile]` | iOS / Android ネイティブアプリ |
| `[web]` | 自社オリジンで動く SPA |
| `[desktop]` | デスクトップアプリ（Electron、ネイティブ） |
| `[cli]` | エンドユーザーに配布するコマンドラインツール / SDK |
| `[device]` | IoT / 専用端末 / KIOSK |
| `[extension]` | 他アプリケーションがホストするプラグイン・拡張（ブラウザ拡張、IDE 拡張、デザインツールのプラグイン） |
| `[embed]` | サードパーティの Web コンテンツに埋め込む widget / SDK（Stripe Checkout、Intercom 等） |
<!-- /gen:reference:client-form-factor-tags -->

推奨: 1 つの client につき form-factor タグは最大 1 つに留める。組み合わせ（例: `[mobile] [desktop]`）はパースされるが、アーキテクチャ上の追加意味は持たない。

`client` は **プロジェクト自身が配布するソフトウェア** に限定される。サードパーティのブラウザ・IDE・AI エージェントがシステムを利用する場合は `user`（通常は `[human]` / `[ai]`）でモデル化し、`client` にはしない。

#### `handles` プロパティ — client / service が呼び出し側に公開するもの

`client` と `service` はどちらも `handles` プロパティで **呼び出し側に公開するドメイン id** を宣言できる。これは *バリデート済みクロスリファレンス*で、ドメイン id は 1 ホップの expose ルールで到達可能でなければならず、そうでない場合は `unresolved-handles` 警告が出る。

```krs
service Backend {
  domain Order {}      // 自身が所有 — handles エントリ不要
}
service Bff {
  handles Order        // 再公開: Order は Backend が所有し、下のエッジ経由で到達
}
client WebApp [web] {
  handles Order        // BFF 経由でエンドユーザーに Order を公開
}

WebApp -> Bff
Bff -> Backend
```

受け付ける記法:

```krs
client A [web] { handles Order }
client B [web] { handles Order, Catalog, Inventory }
client C [web] {
  handles Order
  handles Catalog
}
```

**expose ルール**（バリデータが使用）:

> ノード `N` がドメイン `D` を *expose する* のは次のいずれかが成り立つとき:
> 1. `N` が子ノードとして `domain D` を持つ（自身が所有）、または
> 2. `N` が `handles D` を宣言し、かつ少なくとも 1 つの outgoing 通信エッジの宛先も `D` を expose している。

`delivers` などの宣言的プロパティはエッジとしてカウントされない。expose ルールは 1 ホップずつ展開されるため、`client → BFF → backend` 連鎖の各リンクは明示的に宣言する必要がある — 暗黙の auto-passthrough は存在しない。

### インフラ層（共有データストア）— system 図に描画される

複数の service が共有するデータストアは、特定の `usecase` に所有させるのではなく、**`.krs` ファイルのトップレベル**（または `system` ブロックの直下）に下記 3 つのインフラブロックキーワードのいずれかで宣言する。各ブロックは leaf なサブリソースをネストできる。これらのノードは **system 図** に描画され、`[external]` service と同じ依存先 tier に並ぶ — service が共有インフラに *依存する* のであって、その逆はない。ファーストクラスノードへの昇格は [ADR-20260405-05](../adr/20260405-05-database-as-first-class-node.md) を参照。

<!-- gen:reference:node-kinds-infra — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| キーワード | 階層 | 用途 | 含むことができるもの |
|------------|------|------|----------------------|
| `database` | system 直下のインフラブロック | service が共有するデータベース（RDBMS、ドキュメントストア等） | `table` |
| `queue` | system 直下のインフラブロック | service が共有するメッセージキュー / トピック | `queue-item` |
| `storage` | system 直下のインフラブロック | service が共有するオブジェクトストア / ブロブストレージ（S3、GCS 等） | `bucket` |
| `table` | leaf、`database` ブロック内 | データベース内のテーブル / コレクション | — |
| `queue-item` | leaf、`queue` ブロック内 | キューが運ぶメッセージ / イベント型。`queue` ブロック内では `queue` キーワードで書く（内部的には `queue-item` としてパースされる） | — |
| `bucket` | leaf、`storage` ブロック内 | オブジェクトストア内のバケット / コンテナ | — |
<!-- /gen:reference:node-kinds-infra -->

- インフラノードとサブリソースに適用できるのは `label` / `description` / `link` プロパティのみ。すべて省略可で、省略時はエラーではなく警告を出すにとどめる。`operations`（CRUD）プロパティはここでは無効 — `usecase` 内の `resource` 宣言でのみ意味を持つ（後述）。
- `database` / `queue` / `storage` はトップレベルまたは `system` の直下でのみ有効。`service` / `domain` / `usecase` の中にネストすると `infra-not-in-context` で拒否される。
- `table` / `queue-item` / `bucket` は leaf ノード — プロパティとエッジは持てるが、ネストした宣言は持てない。
- `usecase` は自身の `resource` を共有サブリソースにドット記法で紐づける — `resource <InfraId>.<SubResourceId>`（例: `resource OrderDB.OrderTable`）。resolver はこれらの参照を集約して system 図上の `service → database`（および `service → queue` / `service → storage`）エッジを導出し、usecase→resource エッジに `[read]` / `[write]` タグを合成することがある（[docs/spec/tags-annotations.ja.md](./tags-annotations.ja.md) の「システム自動付与タグ」節を参照）。
- `[external]` はシステム境界の外にあるストア（マネージドなサードパーティ DB、外部イベントバス等）を表すために `database` / `queue` / `storage` に付けられる。
- `database` ブロックがないまま `resource OrderTable` と書くことも許容される（警告のみ、孤立ノードとして描画）。`usecase` を書きながらボトムアップに resource を発見し、後で `database` ブロックにグループ化してドット記法の参照に切り替えればよい。

```krs
system ECPlatform {
  service ECommerce {}        // domain / usecase は簡潔さのため省略

  database OrderDB {
    label "注文DB"
    table OrderTable   { label "注文" }
    table ProductTable { label "商品" }
  }
  queue OrderEvents {
    queue OrderPlaced  { label "注文確定" }   // queue キーワードで書くが queue-item としてパースされる
  }
  storage MediaStorage {
    bucket ProductImages { label "商品画像" }
  }
}
```

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

<!-- gen:reference:deploy-unit-kinds — DO NOT EDIT. Generated from packages/core/src/builtins/reference-data.ts; run `pnpm gen:reference`. -->
| キーワード | 説明 | プロパティ |
|------------|------|------------|
| `war` | WAR / EAR（Servlet・EJBコンテナ） | `runtime`, `realizes` |
| `jar` | 実行可能 JAR（Spring Boot など） | `runtime`, `realizes` |
| `oci` | コンテナイメージ | `image`, `runtime`, `realizes` |
| `lambda` | AWS Lambda | `runtime`, `realizes` |
| `function` | Azure Functions / Google Cloud Functions | `runtime`, `realizes` |
| `assets` | 静的ファイル・SPA（CDN配信） | `runtime`, `realizes` |
| `job` | バッチ処理。schedule 省略で単発実行、指定で定期実行 | `runtime`, `schedule`, `realizes` |
| `artifact` | 上記に該当しない任意種別 | `type`, `runtime`, `realizes` |
<!-- /gen:reference:deploy-unit-kinds -->

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
| `role` | `role "<ロール名>"` | user | actor archetype、または「この user が何をするか」の一行要約。**authz primitive ではない**（`requires role = ...` 述語も RBAC permission bundle も存在しない） — [ADR-20260511-02](../adr/20260511-02-no-runtime-authz-modeling.md) と [ADR-20260511-04](../adr/20260511-04-user-role-keyword-clarification.md) 参照 |
| `team` | `team "<チーム名>"` | service, domain | オーナーチーム |
| `delivers` | `delivers <ClientId>[, <ClientId>...]` | service | この service が配布する client（BFF / SSR パターン）。レンダラーは各エントリを service から参照先 `client` への破線エッジとして描画する |
| `link` | `link "<URL>" "<ラベル>"` | 全種別 | 関連ドキュメントへのリンク（複数可）。ラベルは省略可 |
| `resource` | `resource <storageKind> "<name>"` | client | client 上の操作と紐づくローカルストレージ。複数可。client resource storage kinds は下記参照 |
| `capability` | `capability <name>` または `capability <name> { label "..." description "..." }` | client | client が要求するデバイス / ブラウザの capability（camera、geolocation、notification など）。複数可。client capability は下記参照 |

すべてのプロパティは省略可。`link` は同一ノード内に複数記述できる。
使用可能な種別以外で記述した場合はエラーを出す。

`link` の URL は `http:` / `https:` / `mailto:` の絶対 URL でなければならない。
それ以外のスキーム（例: `javascript:`）や相対パスは拒否され、パーサーが
`link-url-scheme-not-allowed` 警告を出してリンクを除外する。これにより
プレビューパネルがリンク URL をクリック可能な `<a href>` として描画する際に
危険なスキームが到達しない。

> Related TPLs: TPL-20260510-17 — `外部から来る input は trust boundary を越える前に validate / canonicalize する`

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

### client ノードの例

```
client <id> [<form-factor-tag>] {
  label "<表示名>"
  description "<説明>"
  resource <storageKind> "<name>"
  resource <storageKind> "<name>"
}
```

#### `client` の `resource` storage kinds

`resource <storageKind> "<name>"` は client 上の操作と紐づくローカルストレージ（`localStorage` key、IndexedDB データベース、OPFS ファイル等）を宣言する。複数の `resource` 行が許容され、client カードにインラインで描画される。

`<storageKind>` は以下の 6 つの予約値のいずれかでなければならない。それ以外の kind は `client-resource-invalid-kind` で拒否され、認証クレデンシャル・cookie・デバイス capability（より強いモデル化が必要）が黙ってストレージ一覧に紛れ込まないようにしている。

| Storage kind | 典型的な対象 |
|--------------|--------------|
| `localStorage`   | ブラウザの localStorage key |
| `sessionStorage` | ブラウザの sessionStorage key |
| `indexedDB`      | IndexedDB データベース |
| `opfs`           | Origin Private File System のファイル / ディレクトリ |
| `file`           | ローカルファイルシステム（desktop / CLI / device client 用） |
| `keychain`       | OS のキーチェーン / Keystore エントリ（生のクレデンシャルは別途モデル化） |

> Cookie / session / クレデンシャルのストレージは意図的に対象外で、security parent issue（#834）で追跡。デバイス capability（camera、geolocation 等）は #837 で追跡。

```
client WebApp [web] {
  label "Customer SPA"
  resource localStorage "preferences"
  resource indexedDB "outbox"
}
```

**描画**: SVG カードは resource 1 行ずつではなく `📦 ×N` のカウントバッジを 1 つだけ表示する（リスト増加でカードの高さが膨れないように）。kind と name の宣言順での完全リストは `NodeDetailPanel` の「Storage resources」セクションに出る。[AT-0069](../acceptance/0069-client-resource-badge-and-detail-panel.md) 参照。

#### `client` の `capability`

`capability <name>` は client が要求するデバイス / ブラウザの capability（camera、geolocation、notification、bluetooth、…）を宣言する。`capability` は `resource` とは概念的に別: resource は client が読み書きするストレージ、capability は OS / browser が許可を与える機能を指す。推奨セットは [docs/spec/tags-annotations.ja.md](./tags-annotations.ja.md#client-capability) に文書化されている。

2 つの形が使える:

```
client OrderClient [mobile] {
  // ショートフォーム — アノテーションが不要な capability は 1 行で書ける
  capability notification

  // ブロックフォーム — review / threat modeling で「なぜこの capability か」を残したい場合
  // label / description を付ける
  capability camera {
    label "QR scanning"
    description "点検対象に貼られた QR を読み取るため"
  }
  capability geolocation {
    description "配送中の継続トラッキング"
  }
}
```

capability 識別子セットは **オープン**: 任意の kebab-case 識別子を受け付ける。推奨セット外の名前でも警告は出ず、ドメイン固有 capability（業界デバイス、社内専用機能）も自由に表現できる。同一 client 上で同じ capability 名を複数回宣言すると、バリデータは `client-capability-duplicate` を出す。

**描画**: SVG カードは `resource` バッジと同じ形で `🔐 ×N` のカウントバッジを 1 つだけ表示する。label / description 付きの完全リストは `NodeDetailPanel` に出る。[AT-1002](../acceptance/1002-client-capability.md) 参照。

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

#### `delivers`（service → client）

`service` はどの `client` ノードを配布するかを `delivers` で宣言できる。BFF / SSR パターン（Next.js, Rails+React, Laravel+Vue 等）のモデリング用。サーバーサイドのバンドルとブラウザサイドのバンドルは OAuth2 client タイプが異なる別ノードとして扱い、両者を `delivers` で結ぶ:

```
service NextServer {
  label "Next.js BFF"
  delivers WebApp           // 単一の client
}

service Gateway {
  delivers WebApp, AdminUI  // カンマ区切りリスト
}

client WebApp [web] {}
client AdminUI [desktop] {}
```

`delivers` の各エントリは、system view 上で service から参照先 client への破線エッジに合成される。参照先 id は対になる `client` ノードに解決できなければならず、できない場合はリゾルバが `delivers-target-not-client` 警告を出す。`delivers` は宣言的プロパティであり、新しいエッジ種別ではない。client と service の間の通常の API 呼び出しは引き続き `->` で書く。

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

`operations` は `usecase` 内の `resource` 宣言でのみ有効。インフラ側の `table` / `queue-item` / `bucket` には書けない（上の「インフラ層（共有データストア）」節を参照）。

| Operation | 意味 |
|-----------|------|
| `create` | resource 上に新しい項目を生成する書き込み |
| `read` | resource を非破壊で参照する |
| `update` | 既存項目を変更する書き込み |
| `delete` | 項目を消去する書き込み |

認識セット外の動詞も AST にはそのまま保持する（translate アダプタが `list` / `search` / `execute` などを往復できるようにするため）。パーサは `unknown-resource-operation` 警告を出す。重複は `duplicate-resource-operation` 警告を出して AST 上で重複排除される。

**省略時の意味**: `operations` を書かなければ現状と同じ挙動。依存は opaque のままで警告は出ない。「未決定の許容」（§プロパティの必須・省略ルール）方針を踏襲する。

##### verb-decoration 記法（1:N CRUD マッピング）

ドメイン上の意味を持つカスタム動詞には、`<verb>:<crud>[,<crud>...]` のデコレーションで CRUD 意図を注記できる。著者は自然な語彙を保ちつつ、CRUD マトリクスや write-dominates 判定にも情報を提供できる。

```
operations list:read, search:read           // 1:1 マッピング
operations enqueue:create, dequeue:delete   // キューのイディオム
operations replace:create,delete            // 物理的な delete-insert（1:N）
operations create, list:read                // 装飾なし + 装飾ありを混在
```

挙動:

- 右辺は認識セットの CRUD 動詞（`create` / `read` / `update` / `delete`）のみ受け付ける。それ以外の識別子は `invalid-crud-decoration`（エラー）。
- 右辺が空（`list:`）の場合は `empty-crud-decoration`（エラー）。
- 右辺に同じ CRUD 動詞が重複（`replace:create,create`）すると `duplicate-crud-decoration-target`（警告）、AST 上で重複排除される。
- 装飾された動詞は認識セット外でも `unknown-resource-operation` を出さない — デコレーションが著者の CRUD 宣言として扱われる。
- CRUD マトリクスビュー（[ADR-20260502-01](../adr/20260502-01-crud-matrix-view.md)）はセル文字 / ΣC/R/U/D 合計 / write-dominates フラグの計算で `decoratedAs` を優先する。装飾された動詞は `?` サフィックスを生成しない。

1 行に 1:N + 複数動詞が並んだときの曖昧性解消ルール: パーサが `verb:` を見たら、次の `<id>:` 境界まで続くカンマ区切り識別子は CRUD-RHS 継続として扱われる。したがって `search:read,create, list:read` は `search:[read,create]` の後に `list:[read]` としてパースされる。装飾された動詞の後ろに装飾なしの動詞を置きたい場合は、装飾なしの動詞を先に並べる（`create, list:read`）。

**使い分けの指針 — いつ 1:N を使うか**: `verb:create,delete` は本物の物理 delete-insert イディオム（`REPLACE INTO`、soft-delete + 新規行、Kafka tombstone + 新規 key）にとっておく。論理上は同一エンティティの in-place 書き換えなら `update` を使う。ツールはこの区別を強制しない — ドキュメント上の規約である。

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

#### 任意のエッジ id（`#<id>`）

末尾に `#<id>` を付けると、エッジに著者定義の安定した識別子を与えられる。`.krs.style` のリゾルバが `edge#<id>` セレクタで指せるようになる。

```
ECommerce -> Payment "決済を処理する" #criticalWrite
WebApp --> Bff #liveStream
A -> B [important] #namedEdge
```

`#<id>` トークンは任意ラベルとタグの後ろに置く。エッジ id はプロジェクト内で一意でなければならず、重複は `duplicate-edge-id` エラーになる。`#<id>` を省略すると、エッジは計算 canonical id `<from><arrow><to>`（同期は `->`、非同期は `-->`）にフォールバックする。同じ計算 base を共有する 2 つのエッジでどちらにも `#<id>` が無い場合は `ambiguous-edge-base` 警告が出て、エッジ単位のスタイルセレクタはどちらにも一致しなくなる。

同じサフィックスは `usecase` ブロックの `resource` 行にも付けられ、合成された usecase→resource エッジに id を与えられる:

```
usecase PlaceOrder {
  resource OrderDB.OrderTable #placeOrderWrite { operations create, read }
}
```

`#<id>` が `edge#<id>` スタイルセレクタにどう流れるかは [`docs/design/edge-id-selector.md`](../design/edge-id-selector.md) を参照。セレクタ自体は [`docs/spec/style.ja.md` — エッジ ID セレクタ](style.ja.md#エッジ-id-セレクタedgeid) に記載されている。

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
あらゆるブロック（`system` / `service` / `domain` / `deploy` /
`organization` / `team` など）内へのネストは parse error
（`legend-not-top-level`）。パーサーは 1 件だけ報告し、ネストされた
legend ブロック全体をスキップする。同じビューが対象の
`legend` ブロックは複数書けて、宣言順に縦に並ぶ。

### 文法

```
legend ::= "legend" view-scope? title? "{" entry* "}"

view-scope ::= "system" | "service" | "domain" | "deploy" | "org"
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

スコープ語彙はビュー種別（`system` / `deploy` / `org`）と論理ドリルダウン深度
（`service` / `domain`）の混成。マッチングは**完全一致** — 各描画レベルは
自分のスコープに正確に一致する凡例だけを表示し、深さをまたぐ重ね合わせは
しない（`legend system` は service ドリルダウンに現れず、`legend service` は
トップレベルに現れない）。

| `<view-scope>` | 描画される場所 |
|----------------|------------------|
| 省略           | system / deploy / org 各ビューのトップレベル |
| `system`       | system 図のトップレベルのみ |
| `service`      | service を root にしたドリルダウンビューのみ |
| `domain`       | domain を root にしたドリルダウンビューのみ |
| `deploy`       | deploy 図のみ |
| `org`          | org 図のみ |

スコープ語彙を持たないノード（system フレームや usecase 等）を root にした
ドリルダウンレベルには凡例は描画されない。all-layers ビューでは、各レベル帯の
直下にそのレベルのスコープの凡例が表示される。ドリルダウンレベルの凡例は
opt-in — 既存スコープ（省略 / `system` / `deploy` / `org`）のみを使うファイルは
トップレベルより下に凡例を描画しない。

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

// domain を root にしたドリルダウンビューだけに表示
legend domain "データアクセス" {
  swatch #3B82F6 "Read 経路"
  swatch #F97316 "Write 経路"
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
  org の focused-team / icon-mode 経路への描画
- ノード指定凡例（`legend #OrderService "..."`）— 深度スコープが共通ケースを
  カバーするため、ノード単位の出し分けは需要が観測されてから（Issue #1513）

> **Related TPLs**:
> - [TPL-20260510-21](../test-perspectives/TPL-20260510-21-scoped-glance-drill-down.md) — scoped glance: 各ドリルダウンレベルは自分の語彙だけを見せる（完全一致の凡例切り替えはこの原則の凡例への適用）
> - [TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md) — トップレベル / drill-down / all-layers の各レンダーパスに同じ legend オプションが渡ること
> - [TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — view-scope 語彙は built-in リファレンスデータと同期すること

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

### パス構文 — `system` ブロック内にネストしたノードへの到達

別ファイルの `system` の直接の子よりも深い位置に定義された `service` / `domain` / `usecase` に到達するには、**ドット区切りパス**形式を使う:

```
import { ECPlatform.ECommerce.Order } from "./services.krs"
```

各セグメントは、直前に解決されたノードの `children` 配列に対して id で照合される（kind は強制されない）。パス解決は import 先ファイルのトップレベル `system` から始まる。

import 側に取り込まれるのは要求したチェーンだけ: 上の例では、merge 後のファイルに `ECPlatform` のスタブとその下の `ECommerce` のスタブが生まれ、`ECommerce` の子は解決された `Order` のみになる（`Order` のサブツリーは完全に保持される）。`ECommerce` 配下の兄弟 domain は自動では import されない。必要なら同じ import に列挙するか、ファイル全体を wildcard import する。

#### パス構文を使うべき場面

パス構文は同じ id が複数の system に現れるときに真価を発揮する — system 移行が典型例:

```
// services.krs
system OrderSystemV1 {
  service OrderService { domain Legacy {} }
}
system OrderSystemV2 {
  service OrderService { domain Modern {} }
}

// migration.krs — リネームせずに V2 だけを取り込む
import { OrderSystemV2.OrderService } from "./services.krs"
```

素の id（`import { ECommerce }`）も引き続き機能する — id が一意に定まる場合は最も簡潔な形式であり続ける。

#### 失敗時の挙動

解決できないパスは `import-path-not-found` 診断を発行し、失敗したセグメントと最後に正常にたどれたノードを示す:

```
import { ECPlatform.NotThere.Order } from "./services.krs"
// → Import path "ECPlatform.NotThere.Order" failed at segment "NotThere" (#1):
//   no child with that id under "ECPlatform"
```

---

## マルチファイル import の意味論

このセクションは、モデルを複数の `.krs` ファイルに分割したときに各 `import` 形式が何を意味するかを定義する。実装: `packages/core/src/fs/import-resolver.ts`。関連 ADR: [ADR-20260405-03](../adr/20260405-03-wildcard-import-two-pass-resolution.md)（wildcard / 2 パス）, [ADR-20260409-05](../adr/20260409-05-directory-import.md)（ディレクトリ）, [ADR-20260409-06](../adr/20260409-06-named-import-toplevel-service.md)（named top-level）, [ADR-20260513-03](../adr/20260513-03-import-system-nested.md)（named path 構文）。

### S1. 4 つの import 形式

```krs
@import "theme.krs.style"             // (a) スタイル import — 下の「@import のスコープ」節を参照
import { Foo, Bar.Baz } from "p.krs"  // (b) named import — 「ドリルダウンと外部ファイル参照」節を参照
import "p.krs"                        // (c) whole-file import — 本セクションで定義
import "dir/"                         // (d) ディレクトリ import — 本セクションで定義
```

(c) と (d) は同一の merge 規則を持つ。(d) の意味は「`dir/` 直下の `.krs` ファイルをアルファベット順で列挙し、それぞれを同じ位置に書かれた個別の `import "..."` 宣言として処理した結果」と等価。サブディレクトリは再帰しない。

### S2. whole-file import の merge 規則

`import "p.krs"` は **p.krs を完全再帰展開した KrsFile** を importer に取り込む。「完全再帰展開」とは p.krs 自身の import をすべて解決した後の最終形であり、importer ごとに再計算する必要はなく **ファイル単位でメモ化できる** — 同じ p.krs を複数経路で到達しても同じ内容になる（S5 参照）。

importer が吸収するもの:

- すべての top-level ノード（`system` / `service` / `client` / `database` / `queue` / `storage` / `legend` / `deploy` / `organization`）
- 各 `system` ブロック内のすべての children（`user` / `client` / `service` / `domain` / `usecase` / `resource` / edge / infra）
- p.krs 内で `@import` 参照されているすべてのスタイルシート（cascade に追加）

### S3. 同名 system ブロックの merge（system 再オープン）

同じ id の `system` が複数ファイルに現れた場合（importer 自身のファイルと imported ファイル、あるいは複数の imported ファイル）、重複として扱わず **1 つに merge** する:

- **system 本体プロパティ**（`label` / `description` / タグ）: **import グラフの root に近いファイル**で書かれた宣言が勝つ。root とは `ImportResolver.resolve(entryPath)` に渡された `entryPath` — 実用上は App / VS Code 拡張で開いているファイル、または `karasu render` に渡したファイル。resolver は import グラフを bottom-up に traverse し、root 側で未設定のフィールドだけを imported 側の値で埋める。
  - 2 つのファイルが異なる non-empty 値で衝突した場合、root に近い側が採用され、`system-property-conflict` 警告が出る（採用値・無視値・両者の location を含む）。
- **children**: id ごとに find-or-create で union。同じ merged system 内で 2 つの children が同じ id を持つと `duplicate-node-in-system` エラー（既存挙動）。異なる id なら問題なく union される。
- **edges**: union。完全に同一な edge（`from` / `to` / kind / label すべて一致）のみ dedup、それ以外は両方残る。

これが 1 つの大きな `system` を複数ファイルに分割する canonical な方法。App / CLI で「今開いているファイル」が自然と top-level system メタデータの source of truth になる。

### S4. 同名 deploy / organization ブロックの merge

S3 と同じ規則を `deploy.nodes`（oci / k8s / vm / …）と `organization.teams`（および member）に適用する。`realizes` / `owns` の relation は union される。`import "p.krs"` は `system` だけでなく `deploy` / `organization` も同時に取り込む — 物理ビュー / 組織ビュー専用の別 import 形式は存在しない。

### S5. DAG 経由再到達と真の循環

import グラフは **DAG** を許す。同じファイルが 2 つの異なる import チェーン（entry → A → C と entry → B → C）で到達されても警告は出ない。resolver はファイルパスごとに解決済みスナップショットをメモ化し、2 回目の到達では 1 回目の結果を再利用する。

`circular-import` 警告は **真の循環** — あるファイルが **現在ロード中スタック**に既に居る状態で再度要求された場合 — に限り発する。実装上は `loading` セット（path stack: 入るときに push、出るときに pop）と `loaded` メモを別々に持つ。後者は警告を出さない。

```
// DAG — 警告なし
index.krs:  import "admin.krs"
            import "auth.krs"
admin.krs:  import { Service } from "auth.krs"  // admin 経由で auth.krs に到達
auth.krs:   // (import なし)

// 真の循環 — a.krs の 2 回目到達で警告
a.krs:      import "b.krs"
b.krs:      import "a.krs"   // ← circular-import 警告
```

### S6. edge endpoint 未解決時はノードを残す

edge `A -> B` の片方の endpoint が解決できない（merged モデルに target id が存在しない）とき、resolver は:

- edge を drop し、`unresolved-edge-endpoint` 警告を発する — 未解決 id と edge の source location を含む
- **解決できた側のノードは drop しない**。あるファイルで宣言されたノードは、その outbound / inbound edge が解決できるか否かに関わらずモデルの一部である

`realizes` / `owns` / `handles` などの cross-reference にも同じ規則を適用する — source ノードは残り、relation のみ警告と共に消える。

### S4.5. 同名 infra (`database` / `queue` / `storage`) の再オープン

S3 と同じ規則を `database` / `queue` / `storage` にも適用する（複数ファイルで同じ id を宣言した場合、または 1 つの import グラフ内で複数の `system` ブロックに同じ infra id が現れた場合）:

- **本体プロパティ**（`label` / `description` / タグ）: root-entry-wins で silent。S3 と異なり、衝突する non-empty 値があっても warning は出ない（共有 infra は移行途中で複数箇所に同じ宣言が散在しやすく、property warning がノイズになるための意図的な非対称）
- **children**（`table` 宣言などのリーフ）: id ごとに find-or-create で merge。DAG 再到達（同一インスタンスが複数経路で到達）は silent に dedup。**異なる** 宣言で `(id, kind)` が衝突した場合 — 例: 片方が `table users { ... cols A ... }`、もう片方が `table users { ... cols B ... }` — 先勝ちで後者は drop され、`infra-leaf-redeclared-silently` **info** 診断で「捨てた宣言があった」事実を surface する（build は止めない）
- **診断**: `infra-redeclared-across-files` **info** 診断が、infra が複数箇所で宣言された事実を id と kind 付きで surface する — 修正方法は指示しない

`warning` ではなく `info` を使うのは意図的: karasu は共有 infra（複数 service がまたがって読み書きする `database`）を **可視化** はするが、それを禁止しない。文言は事実先行 — 共有が smell かどうかはプロジェクトのスタイル次第で、ドキュメントに委ねる。canonical な書き方は下のパターン参照。

#### Canonical なパターン — 専用 infra ファイル

`database` / `queue` / `storage` をスライス間で共有する推奨方法は、専用 infra ファイルに 1 度だけ宣言し、使う側のスライスから `import "infra.krs"` で取り込むこと。S2 のファイル単位 memoization と S5 の DAG 取り扱いにより、infra ファイルは 1 度だけ解決され、すべての importer から再利用される:

```krs
// infra.krs
system Blog {
  database ArticleDB { table articles }
}

// reader.krs
import "infra.krs"
system Blog {
  service ArticleDelivery {
    domain Delivery {
      usecase ReadArticle { resource ArticleDB.articles }
    }
  }
}

// editor.krs
import "infra.krs"
system Blog {
  service Authoring {
    domain Publish {
      usecase Publish { resource ArticleDB.articles }
    }
  }
}
```

このパターンでは `infra-redeclared-across-files` 診断は発生しない — 各 infra id は `infra.krs` で 1 度だけ宣言され、他スライスは `resource` パスで参照するだけ。診断が出るのは「**同じ `database UserDB { ... }`** という宣言が複数ファイルに literal に書かれている」ときで、resolver が受け入れるが推奨しないフォールバック動作。

### S7. 決定的順序

`mergedFile` の順序は以下で決まる:

1. import 宣言は各ファイル内で source order で処理される
2. ディレクトリ import はファイル名のアルファベット順で展開される
3. ノードは merged コレクションへの初回登場時に挿入される（以降の merge は find-or-create で既存エントリを変更するだけ）

同じプロジェクトは常に同じ merged AST を生成する。

> **関連 TPL**:
> - [TPL-20260514-01](../test-perspectives/TPL-20260514-01-import-dag-not-cycle.md) — DAG 経由再到達は循環ではない（S5）
> - [TPL-20260514-02](../test-perspectives/TPL-20260514-02-whole-file-import-completeness.md) — whole-file import は全 top-level / nested ノードを保持する（S2）
> - [TPL-20260514-03](../test-perspectives/TPL-20260514-03-system-reopen-merge.md) — 再オープン `system` は children を union、property は root entry が勝つ（S3）
> - [TPL-20260514-04](../test-perspectives/TPL-20260514-04-deploy-org-wildcard-propagation.md) — `deploy` / `organization` も whole-file import で伝搬する（S4）
> - [TPL-20260514-05](../test-perspectives/TPL-20260514-05-dangling-edge-preserves-node.md) — 未解決 edge endpoint は残存ノードを drop しない（S6）
> - [TPL-20260514-07](../test-perspectives/TPL-20260514-07-infra-redeclared-across-files.md) — 同名 `database` / `queue` / `storage` の再宣言は union merge、info 診断（S4.5）

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

## ドメイン分散

同じ `domain id` が同一 `system` 内の複数の `service` に登場した場合、ツールは **情報的な** `domain-dispersal` 診断（info 段、error ではない）を出す。図はそのまま描画される。

```
ℹ domain "Order" は複数の service の配下に登場します
  - ECommerce
  - Legacy
  DDD では同じドメインが複数 service にまたがる状態を凝集性のシグナルとみなすことがあります
```

これは karasu の「描くが規定しない」立場（`docs/concepts.md` 「What karasu visualizes vs. what it doesn't prescribe」節）に従う。複数 service に共有された domain は karasu が忠実に描いて通知する構造的事実であり、凝集性の判断は読み手に委ねる。この理由でコンパイルを拒否することはない。

ドメインエッジ（`Billing -> Contract`）の解決は domain ID で行われる。同名 ID が分散している場合、ナビゲーション（`nodePathIndex`）は **最初の登場箇所** を保持する。片側が移行アノテーションを持つときは優先度の高い方が勝つ（「非推奨ドメインの移行」節を参照）。

**検出スコープ**: `system` ブロック単位。
異なる `system` にまたがる同名 `domain` は組織的に独立した並行モデリングとして扱い、診断を出さない。

**検出キー**: `domain` の `id`。`label`（表示名）は検出に使用しない。

> Related TPLs: TPL-20260514-08 — `Diagnostic register reflects "fact vs. style"`
