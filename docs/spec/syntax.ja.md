# .krs 構文リファレンス

> [English](syntax.md) · **日本語**（このファイル）

> 言語バージョン: **`.krs language v1.0`**（言語 v1.0 — freeze 済み [ADR-1314](../adr/1314-krs-spec-v1-freeze.md)。各パッケージの npm 版とは独立 — [ADR-2124](../adr/2124-version-vocabulary.md)）。ビルドが実装する言語版は `karasu --version` が表示する。

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
| `system` | owned/external なサービスやクライアントの関係を示す器 | `service`, `user`, `client`, `domain`, `database`, `queue`, `storage` |
| `user` | システムの利用者（人間またはAIエージェント） | — |
| `client` | ユーザーの委譲で動く、自社が出荷するクライアントソフトウェア（mobile / web / desktop / cli / device / extension / embed） | — |
| `service` | 独立したビジネス機能の単位 | `domain` |
| `domain` | ビジネス上の関心事の境界（トップレベル / system 直下 / service 内） | `usecase`, `entity` |
| `usecase` | ドメイン内の業務・操作 | `resource` |
| `resource` | usecaseが操作する対象（テーブル、外部API、ファイル等） | — |
| `entity` | domain が所有する概念データエンティティ。名前と関連のみを持ち属性は持たない。`table` で infra サブリソースに対応づける | — |
<!-- /gen:reference:node-kinds-logical -->

> Related TPLs: [TPL-2158](../test-perspectives/TPL-2158-catalog-fenced-against-parser-not-generated-doc.md) — この表は `REFERENCE_DATA` から生成されているため、その catalog を検査する同期テストの独立した正典には使えない。kind とプロパティの列は parser の実測で縛る。

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

推奨: 1 つの client につき form-factor タグは最大 1 つに留める。複数タグは **1 つの** 角括弧にカンマ区切りで書く（`[mobile, desktop]`）。角括弧を繰り返す書き方（`[mobile] [desktop]`）は parse error になる。組み合わせ自体はパースされるが、アーキテクチャ上の追加意味は持たない。

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

複数の service が共有するデータストアは、特定の `usecase` に所有させるのではなく、**`.krs` ファイルのトップレベル**（または `system` ブロックの直下）に下記 3 つのインフラブロックキーワードのいずれかで宣言する。各ブロックは leaf なサブリソースをネストできる。これらのノードは **system 図** に描画され、`[external]` service と同じ依存先 tier に並ぶ — service が共有インフラに *依存する* のであって、その逆はない。ファーストクラスノードへの昇格は [ADR-316](../adr/316-database-as-first-class-node.md) を参照。

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
- infra ブロックの **キーワード** `table`（`database` の leaf、共有ノードの宣言）と、shape **タグ** `[table]`（usecase の `resource` の描画 shape）は別物ではなく対応関係にある。usecase は上記 dot 記法の `resource` で infra leaf を参照し、karasu は **参照先 infra sub-resource の kind から shape タグを推論**する — `table` → `[table]`/cylinder, `queue-item` → `[queue]`, `bucket` → `[storage]` — ので、参照は指し示すストアと同じ形で描画される。キーワードはノードの *kind* を宣言し、`[...]` タグは `resource` の *shape* だけを決める接尾辞（手書きも可）。同じ語が 2 つの位置に現れても衝突しない。詳しい使い分けは [tags-annotations.ja.md](./tags-annotations.ja.md) を参照。

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

> Related TPLs: [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md) — infra sub-kind → shape タグの推論（`INFRA_SUB_KIND_TO_TAG`）と shape タグ表は、同じ語彙の 2 つの表現であり整合し続けなければならない。

### 組織構造（誰が所有するか）— 別図で表現

論理・物理とは独立した軸として、サービス・ドメインの **オーナーシップ** を記述する。
`organization` をルートとし、`team` を入れ子で宣言する。各 team は `owns` で所有するノード（service / domain 等）を列挙し、`member` で所属メンバーを持てる。

| キーワード | 意味 | 含むことができるもの |
|-----------|------|-------------------|
| `organization` | 組織のルート。複数宣言可 | `team` |
| `team` | 責任を持つチーム。ネスト可 | `team`, `member`, `owns` |
| `member` | チームに所属する個人 | — |

関連するグルーピングのオーバーレイ **`boundary`**（experimental）は、system view 内に意味的クラスタを
宣言し、team 所有と並ぶ第二の「Group by」軸として描画する。後述の「システムビューのグルーピング（`boundary`）」節を参照。

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
| `store` | 論理 infra ノードを realize するマネージド型データストア（Aurora PostgreSQL、Amazon SQS、S3 等） | `type`, `realizes` |
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
| `role` | `role "<ロール名>"` | user | actor archetype、または「この user が何をするか」の一行要約。**authz primitive ではない**（`requires role = ...` 述語も RBAC permission bundle も存在しない） — [ADR-832](../adr/832-no-runtime-authz-modeling.md) と [ADR-1281](../adr/1281-user-role-keyword-clarification.md) 参照 |
| `delivers` | `delivers <ClientId>[, <ClientId>...]` | service | この service が配布する client（BFF / SSR パターン）。レンダラーは各エントリを service から参照先 `client` への破線エッジとして描画する |
| `link` | `link "<URL>" "<ラベル>"` | 全種別 | 関連ドキュメントへのリンク（複数可）。ラベルは省略可 |
| `resource` | `resource <storageKind> "<name>"` | client | client 上の操作と紐づくローカルストレージ。複数可。client resource storage kinds は下記参照 |
| `capability` | `capability <name>` または `capability <name> { label "..." description "..." }` | client | client が要求するデバイス / ブラウザの capability（camera、geolocation、notification など）。複数可。client capability は下記参照 |

すべてのプロパティは省略可。`link` は同一ノード内に複数記述できる。
使用可能な種別以外で記述した場合はエラーを出す。

`link` の URL は `http:` / `https:` / `mailto:` の絶対 URL を推奨する。
それ以外のスキーム（例: `javascript:`）や相対パスは
`link-url-scheme-not-allowed` 警告の対象になる。リンク自体はモデルに保持
される（フォーマットしても元ソースから消えない）が、リンク URL を
クリック可能な `<a href>` として描画するプレビューパネルは `http:` /
`https:` / `mailto:` のリンクのみを表示する（`javascript:` href は
アプリの origin で実行されてしまうため）。

> Related TPLs: TPL-168 — `外部から来る input は trust boundary を越える前に validate / canonicalize する`

### 文字列値とエスケープ

引用符付き文字列値（`"..."`）が解釈するエスケープシーケンスは次の 3 種だけである。

| シーケンス | 意味 |
|-----------|------|
| `\"` | ダブルクォート |
| `\\` | バックスラッシュ |
| `\n` | 改行 |

これ以外の `\<char>` は素の文字になる（`\t` はタブではなく文字 `t`）。
エスケープの不要な文字は、復帰（CR）も含めてそのまま書いてよい。文字列
リテラルは 1 行に収まる必要はない。

```krs
service Search {
  label "say \"hi\""
  description "1 行目\n2 行目"
}
```

**トリプルクォート**文字列（`"""..."""`）は **raw** である。内部でエスケープ
処理は行われず、最初に現れた `"""` で終端する。Markdown をそのまま書ける
ようにするための選択であり（[ADR-9008](../adr/9008-ast-restructure-discriminated-union.md)）、
閉じ `"""` のインデントが各行から除去される。したがって値そのものが `"""` を
含む場合はトリプルクォート形式では表現できず、`\n` エスケープを使った単一行
形式になる（`karasu fmt` はそのように出力する）。

`karasu fmt` と `karasu translate` はいずれも出力時にエスケープするため、
lexer が受理する値は round-trip しても変化しない。

> Related TPLs: [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) — `コードを変換する機能では parse(format(x)) ≡ parse(x) の round-trip を保証する`

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
  link "<URL>" "<ラベル>"
  link "<URL>" "<ラベル>"

  domain <domainId> {
    label "<ドメイン名>"
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

#### トップレベルへの配置

`user` 宣言とエッジは `system` ブロックの **内側** にのみ書ける — `user` という
アクターも関係（エッジ）も、ある system の境界に属するものだからである。どちらも
ファイルのトップレベルに書くと parse error（`top-level-declaration`）になり、
パーサはそれを報告して該当構文をスキップする。（一方で `domain` とインフラ
ブロック `database` / `queue` / `storage` は *トップレベルにも置ける* — 各節を
参照。）この規則は[診断と規則のリファレンス](diagnostics.md)にカタログ化されている。

トップレベルのインフラとの非対称は意図的である: 共有インフラは多数の system から
参照される 1 つの **モノ**（top-level の単一 identity）だが、`user` は特定の
system との **アクターの関係** をモデル化し、その `role` はその system 内で定義
される。したがって同一人物が 2 つの system に関わる場合は 2 つの `user` ノードに
なり、共有 id による規約でのみ結びつく。system をまたぐ共有 actor / persona は
post-v1.0 の拡張余地として意図的に残しており、ここではスコープ外とする
（[#1639](https://github.com/kompiro/karasu/issues/1639) 参照）。

> Related TPLs: [TPL-2171](../test-perspectives/TPL-2171-spec-promised-diagnostics-implemented.md) — spec が約束する配置規則は、汎用 parse error に落とさず専用の診断コードを持つこと。

#### 入れ子の配置

[論理構造](#論理構造何をなぜ)の表の **含められるもの** 列が、その kind が持てる
子の唯一の定義である。それ以外の入れ子は `node-not-in-context` **warning** を
発行する。ノードは保持され描画もされるが、その位置での意味は定義されていない。
意味を持つのは表に載っている入れ子だけで、`docs/concepts.ja.md` が階層を
`service → domain → usecase → resource` と定めている以上、`client` の直下に
書かれた `usecase` には意味を与えようがない。

error ではなく warning なのは言語 v1.0 が freeze 済み
（[ADR-1314](../adr/1314-krs-spec-v1-freeze.md)）だからである — 今日パースが通る
ファイルは通り続ける。error への格上げは言語 v2.0 に登録してある
（[roadmap §Syntax 2.0](../roadmap.md#syntax-20-プログラム)）。tag / annotation の
語彙が辿るのと同じ「言語 v1.x は warning、言語 v2.0 で error」の経路である。

次の 4 つは warning ではなく拒否され、該当ノードは捨てられる:

| 拒否される入れ子 | 診断 | warning ではなく error である理由 |
|---|---|---|
| `system` 外のインフラブロック | `infra-not-in-context` | 所属すべき system が無い |
| `domain` 外の `entity` | `entity-not-in-domain` | entity はちょうど 1 つの domain に所有される |
| canvas を描かない kind の中の `boundary` | `boundary-not-in-context` | 囲む対象の peer が存在しない |
| `entity` の中のノード全般 | `unexpected-token-in-block` | entity が持つのは名前・関連・`table` 対応だけで、属性は持たない |

`domain` はトップレベル・`system` 直下・`service` 内のいずれにも書ける。前 2 者は
どちらも service にまだ割り当てられていない domain を表し、どちらも
`unassigned-domain` warning を出す。著者が選んでいるのは綴りであって意味ではない
（[#2184](https://github.com/kompiro/karasu/issues/2184)）。

両者が正当に分かれるのは描画である。`(Unassigned)` 擬似 system
（[ADR-681](../adr/681-top-level-service-rendering.md)）が包むのはトップレベル形
のみで、これは「描画先の器を持たないノードに器を与える」機構だからである
（system 直下の domain は既に自分の system の中に描画される）。「service に割り
当てられていない」ことの診断と「描画先が無い」ことの framing は別の関心事であり、
2 つの配置で対称になるのは前者だけである。

> Related TPLs: [TPL-2165](../test-perspectives/TPL-2165-containment-rule-has-single-definition.md) — containment 規則は定義を 1 つだけ持ち（`canContain`）、それを強制するのは parser である。[TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md) — 同じモデリング状態を表す配置は、著者が選んだ綴りによらず同じ診断を出す。

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
- CRUD マトリクスビュー（[ADR-1062](../adr/1062-crud-matrix-view.md)）はセル文字 / ΣC/R/U/D 合計 / write-dominates フラグの計算で `decoratedAs` を優先する。装飾された動詞は `?` サフィックスを生成しない。

1 行に 1:N + 複数動詞が並んだときの曖昧性解消ルール: パーサが `verb:` を見たら、次の `<id>:` 境界まで続くカンマ区切り識別子は CRUD-RHS 継続として扱われる。したがって `search:read,create, list:read` は `search:[read,create]` の後に `list:[read]` としてパースされる。装飾された動詞の後ろに装飾なしの動詞を置きたい場合は、装飾なしの動詞を先に並べる（`create, list:read`）。

**使い分けの指針 — いつ 1:N を使うか**: `verb:create,delete` は本物の物理 delete-insert イディオム（`REPLACE INTO`、soft-delete + 新規行、Kafka tombstone + 新規 key）にとっておく。論理上は同一エンティティの in-place 書き換えなら `update` を使う。ツールはこの区別を強制しない — ドキュメント上の規約である。

#### 認可ノート — `description` + `link` で書く

[ADR-832](../adr/832-no-runtime-authz-modeling.md) により、karasu は usecase レベルの認可（ロール／ライセンス／プラン／スコープなどの述語）を語彙に取り込まない。構造言語が表現するのは「何が存在し、どう関係するか」であり、「実行時に誰が当該 usecase を呼べるか」は外部の policy doc や IAM ツール（OPA, Cedar, Casbin, 社内 RBAC ドキュメントなど）に委ねる。

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

ツールはこの規約を強制も描画もしない（`アクセス:` バッジも policy-link デコレーションもバリデータも存在しない）。あくまで著者間の「散文の取り決め」であり、同じ制約がファイルやチームを跨いでも同じ姿で読めるようにするためのもの。machine-checkable なゲートが必要な場合は明示的に対象外である（ADR-832 参照）。

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

### `entity` 宣言 — 概念レベルのドメインエンティティ

`entity` は `domain` が所有する概念データエンティティ（`domain` の子として宣言）。
オンボーディングで読み手が知りたいこと — どのエンティティが存在し、どう関連し、
誰が所有するか（親 domain が所有権を含意）— を表す。**スキーマではない**:
entity は名前・関連・任意の物理対応のみを持ち、**属性（カラム・型・インデックス）は
持たない**。この「属性を持たない」線が、entity を DB スキーマ非目標の
「ゆっくり変化する構造」側に留める（[`docs/concepts.md`](../concepts.md) の非目標節）。
物理スキーマは対象外のまま、概念レベルの ER 層が入ってくる。

```krs
service OrderService {
  domain Ordering {
    entity Order {
      label "注文"
      table OrderDB.orders           // 物理対応（任意・dot 記法）
      Order -> Customer "発注者"      // 関連（Customer は他ドメイン所有でも可）
      Order -> Product  "品目"
    }
    entity Payment {}
  }
}
```

**物理対応 — `table <InfraId>.<subId>`。** entity は infra サブリソース 1 つに
dot 記法で対応づけられる（`table OrderDB.orders`）。対応は任意 — 対応のない
entity は前向き設計・ボトムアップの正当な中間状態。v1 では dot 形式のみ受け付け、
bare な `table orders` は `expected-id-after` を出す。

**関連 — 関連 1 つ = edge 1 本。** entity 間の関連は既存の edge 構文
（`->` 同期 / `-->` 非同期）を、参照を保持する側の entity ブロック内で宣言する。
service / domain 間の依存 edge と異なり、entity の関連は両方向に読める 1 つの事実
なので、参照を持つ側に **1 本だけ**書く:

- `Order -> Customer` は Order が参照を保持する（AR: `Order belongs_to :customer`、
  物理的には `orders.customer_id`）。逆方向（`Customer has_many :orders`）は含意され、
  2 本目の edge は書かない。
- **edge origin scope** 規則が適用される: `entity Order { … }` 内の explicit な
  関連は `Order` を起点にしなければならず、`Customer -> Order` と書くと
  `edge-source-mismatch` になる。これが向きの規則（起点 = 参照保持側）を強制する。
- カーディナリティタグ（`[n:1]` / `[n:m]`）と、entity 関連の domain エッジへの
  畳み上げは **v1 の対象外** — 関連は当面ラベルのみ。

**配置。** `entity` は `domain` の子としてのみ有効。それ以外の場所で宣言すると
`entity-not-in-domain` を出し、その entity は破棄される。

**anchor 名前空間。** entity id と domain id は 1 つの deep-link 名前空間
（`entity` ビュートークン）を共有する。両者にまたがって同じ id が使われる
（entity id が複数 domain で重複、または entity id が domain id と一致）と
`entity-anchor-collision` 警告を出す（deep-link のアドレス可能性は劣化するが
描画は止まらない）。[`docs/spec/diagnostics.ja.md`](diagnostics.ja.md) を参照。

**usecase の `resource` は entity に解決される — 正準形は論理参照。** `usecase`
内の bare `resource <id>` は、同名の `entity` がモデル全体で一意に存在するとき
その `entity` に解決される（id はフラットな名前空間なので、別 domain / service の
一致でもよい）。この論理参照が正準形であり、物理 dot 記法（`resource
OrderDB.orders`）はボトムアップの中間状態として引き続き有効。

- **編集ゼロの昇格。** 一致する entity がない bare `resource Order` は
  `unassigned-resource` 警告を出す。モデルのどこかに
  `entity Order { table OrderDB.orders }` を宣言すると、usecase 側**無編集**で
  参照が解決され警告は消える。検査は parser ではなく resolver がモデル全体で
  行うため、宣言をまたいだ昇格が成立する。
- **推移的導出。** resolver は `usecase → entity → table → database` を辿り、
  物理 dot 記法参照と同じ `service → database` エッジ導出と `[read]` / `[write]`
  タグ合成を行う。`table` 対応のない entity は論理的には解決されるが store
  エッジは導出しない（前向き設計の状態）— それでも警告は出ない。
- **二重計上しない。** 物理直参照と entity 経由参照が**同じ** store に到達する
  場合は 1 本に数える。導出は解決後の store をキーにする（明示エッジが導出
  エッジを抑制するのと同じ排除クラス）。
- **曖昧なら未解決。** 複数の entity に一致する bare id は解決されず
  （`unassigned-resource` 警告のまま）、衝突の根本原因は
  `entity-anchor-collision` が指す。

> Related TPLs: [TPL-1882](../test-perspectives/TPL-1882-entity-carries-no-attributes.md) — `entity` は名前・関連・物理対応のみを受け付け、属性的宣言（カラム・型）は拒否する。モデルを DB スキーマ非目標の構造側に保つ。
> [TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md) — resource→store の target set は複数の resolver（`deriveInfraEdges` / `detectSharedInfraFanIn` / `detectUnassignedResources`）が消費する。解決先に `entity` を追加する際は全箇所を同期させる。
> [TPL-2170](../test-perspectives/TPL-2170-dangling-edge-preserves-node.md) — 未解決の bare `resource` / 越境 entity 関連でも、解決できた側のノードは drop しない。
> [TPL-510](../test-perspectives/TPL-510-derivation-tag-semantics.md) — entity 経由 usecase→resource エッジの read/write タグ合成は元 resource の operation semantics を保存する。

#### infra leaf のドメイン所有 — cross-domain ストアアクセス

`entity` のマッピング（`entity Order { table OrderDB.orders }`）は store エッジを
導出するだけでなく、対応づけた infra **leaf** をその entity の domain に
**所有**させる。所有は**論理層から導出**され、**物理 `table` には決して宣言しない**
— 物理側はドメインを持たず、論理/物理の分離が保たれる。所有は **leaf 粒度**
（`OrderDB.orders`）で扱う。1 つの store 内の兄弟テーブルが別ドメインに属しうる
ためである。1 つの leaf は**複数の**ドメインに所有されうる（その leaf を
マッピングする各 domain）— これは正当な co-ownership の事実。

ある domain の `usecase` が、所有ドメイン集合にその domain を**含まない** leaf を
読み書きすると、コンパイラは **`cross-domain-store-access`** info 診断を出す —
境界越えの事実（shared kernel や移行期には正当）であって欠陥ではない。system
単位でスコープし、`[external]` / `[index]` store は除外、集約した read/write の
`mode` を持つ。これは `shared-infra-fan-in` と**直交**する: あちらは store を何
service が共有するかで判定し、こちらは所有境界の越境で判定する。leaf を
マッピングする `entity` が 1 つも無い純粋な物理モデルでは leaf は所有者不明と
なり診断は出ない（後から entity を足せば usecase を編集せず診断が有効になる）。
[診断リファレンス](diagnostics.ja.md) を参照。

> Related TPLs: [TPL-1967](../test-perspectives/TPL-1967-domain-ownership-derived-from-entity-not-declared.md) — infra leaf のドメイン所有は `entity` 層から導出（物理 `table` に宣言しない）、leaf 粒度でキーし、所有ドメインの集合で持ち、system 単位でスコープする。[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md) — 同じ事実に 2 つ目の表現を持たせて drift させない。

### エッジ宣言

```
<from_id> ->  <to_id> "<ラベル>"   // 同期（実線矢印）
<from_id> --> <to_id> "<ラベル>"   // 非同期（破線矢印）
```

エッジは `system`・`service`・`domain` ブロックの内部に記述できる。

**エッジの起点スコープ（edge origin scope）。** `service` または `domain` ブロック
内に宣言したエッジは、そのブロックを起点とする。implicit な `-> <to_id>` は所属
ブロックの id を起点に取り、explicit な `<from_id> -> <to_id>` はその同じ所属
ブロック id を指さなければならない。別の起点を指すと `edge-source-mismatch`
エラーになる（`->`・`-->` の両方）。`system` ブロック内のエッジは任意の宣言済み
ノードを起点にできる。この規則と診断は
[診断と規則のリファレンス](diagnostics.md)にカタログ化されている。

**境界をまたぐ依存。** この規則が縛るのは *起点*（source）であって *依存先*
（target）ではない。所有していない相手への依存はそのまま記述できる:

- **別サービスのドメインへ** — 自分のブロックを起点に保つ:
  `Billing -> Contract`（`Contract` は別サービスのドメイン。
  [domain ブロック内のエッジ](#domain-ブロック内のエッジ)を参照）。
- **外部サービスへ** — `[external]` を付けて宣言し、そこへエッジを引く:
  `service Payment [external]` に対し `ECommerce -> Payment`。
- **モデル化していない相手へ** — エッジは保持され、未解決の端点が
  報告される（`unresolved-edge-endpoint`、§S6 参照）。拒否はされない。

起点を自分が所有しない **inbound** な依存（外部や他チームのサービスが自分の
ブロックへ向かう）を表したいときは、その起点を `[external]` ノードとして
モデル化し、任意の起点が許される `system` スコープでエッジを宣言する
— エッジは常にその起点と同じ場所に置かれる。

#### 端点のスコープ（endpoint scope）

エッジは、それを宣言したブロックを描画するビューに描かれる。したがって
**両端がそのスコープの peer でなければならない**:

- `system` ブロック内 — そのブロック自身の直下の子（およびルートビューが並べて
  差し込むトップレベルの `domain`）
- `service` / `domain` / `entity` ブロック内 — そのブロック自身とその兄弟

peer は import マージ後の**ブロック単位**で数える。別ファイルで `system` を再
オープンすると子はひとつのブロックに union される（§S3）ため、別ファイルが宣言
した peer を指してもよい。**同一ファイル内**の同 id `system` ブロック 2 つは
マージされず、peer も別々になる。

そのスコープより **深い位置**にあるノードを端点に指すと、エッジはどのビューにも
描画されない。典型は、ドメイン間の依存を `system` スコープへ持ち上げた形:

```krs
system Shop {
  service OrderSvc {
    domain Ordering { usecase Place {} }
    domain Billing  { usecase Charge {} }
  }
  Ordering -> Billing   // ✗ どこにも描画されない — edge-endpoint-not-at-scope で報告される
}
```

上の「起点スコープ」の規則が求めるとおり、起点のブロック内に書く:

```krs
domain Ordering {
  usecase Place {}
  -> Billing            // ✓ OrderSvc のサービスビューに描画される
}
```

次の 2 つは実際に描画されるため、意図的に報告しない: 距離を問わない
`domain` → `domain` エッジ（サービスをまたぐ場合は暗黙のサービス間エッジに
集約される。[domain ブロック内のエッジ](#domain-ブロック内のエッジ)を参照）と、
限定子付き `DomainId.EntityId` で書いた cross-domain の `entity` 関連。
bare id の cross-domain entity 参照は intra-domain 専用のため drop され、報告される。

端点がどこにも解決しない場合は別のケースで、`unresolved-edge-endpoint`
（§S6）として報告される。どちらの診断も
[診断と規則のリファレンス](diagnostics.md)にカタログ化されている。

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

`#<id>` が `edge#<id>` スタイルセレクタにどう流れるかは [`docs/adr/1096-edge-id-selector.md`](../adr/1096-edge-id-selector.md) を参照。セレクタ自体は [`docs/spec/style.ja.md` — エッジ ID セレクタ](style.ja.md#エッジ-id-セレクタedgeid) に記載されている。

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

> 関連 TPL:
> - [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md) — parser が受理した構造はいずれかの view で描画されるか診断される。エッジの endpoint が宣言スコープに無い場合に黙って落とさない（§端点のスコープ）
> - [TPL-1936](../test-perspectives/TPL-1936-cross-domain-entity-reference-qualified.md) — cross-domain entity 関連は限定子付き `DomainId.EntityId` で参照する

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

`realizes` の対象は `service` / `domain` に加えて **`client`** も指定できる。client（SPA・モバイルアプリ）は
デプロイ対象となる論理ノードなので、それを realize する `war` / `assets` 等は、`oci` がサービスを realize するのと
同じく client の物理形態を記録する（`database` / `queue` / `storage` を対象とする場合は後述の _共有 infra の realize_ を参照）。

複数の `realizes` を並べることで、1つのデプロイ単位が複数のサービスを実現することを表せる。
その場合、デプロイダイアグラム上では各サービスのコンテナに同じノードが描画される。

```
oci "monolith" {
  image    "monolith:1.0.0"
  realizes OrderService
  realizes InventoryService
}
```

### 共有 infra を realize する（`store` kind）

`realizes` は `service` / `domain` だけでなく、**共有 infra ノード**（`database` / `queue` / `storage`）も
指せる。これは論理データストアの *物理的な実体* — 実際にどのマネージドサービス / エンジンが裏で動くか — を
記録するもので、`oci` ユニットが service を realize するのと対称。マネージドデータストアには専用の
**`store`** kind を使い、具体技術は自由記述の `type` で書く。

```
deploy "production" {
  store "order-db" {
    type     "Aurora PostgreSQL 15"
    realizes OrderDB        // 論理 `database OrderDB` を realize
  }
  store "order-events" {
    type     "Amazon SQS"
    realizes OrderEvents    // 論理 `queue OrderEvents` を realize
  }
}
```

このユニットは、service を realize するユニットと同様に、realize 先 infra ノードのコンテナ内に描画される。
`store` は `type` と `realizes` を持つが `runtime` / `schedule` は持たない — マネージドストアにはコード成果物の
ランタイム形態の概念が無いため。推奨スタイル: マネージドストアは `store` で書く。他の kind（`oci` 等）でも
infra を realize できるが、`store` を使うと意図が明確になる。

service が realize 済みの infra ノードに依存し（usecase が `resource <Infra>.<Sub>` で参照）、その service と
store の両方が realize されているとき、deploy 図は service のコンテナから realize 先 store のコンテナへ依存エッジを
描く（[ADR-1658](../adr/1658-deploy-infra-dependency-edges.md)）。

> スコープ: これは `deploy` の **ランタイム契約層**（どの concrete な形態がストアを裏付けるか）に収まる。
> インフラのトポロジ（リージョン・AZ・クラスタ・ノード）は依然として対象外（[concepts.ja.md](../concepts.ja.md) 参照）。
> 決定は [ADR-1632](../adr/1632-infra-physical-realize.md)。

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

- `owns <id>` は team が所有する論理ノード（`service` / `domain` / `client` 等）を宣言する。同じ `id` を複数の team が `owns` することはできず、重複するとエラーになる。
- *Group by: team* のグルーピングは**ビューごとに、いま描画しているレベルに描かれるノード集合との交差で**解決される。`owns` にレベル制限は無いため、service 配下にネストされた `domain` を owns した team はその service の drill-down ビューに team フレームを得る — `boundary` 軸と共通のビューごとセマンティクス（「システムビューのグルーピング（`boundary`）」節を参照）。
- team は入れ子にでき、親 team の下に子 team を並べると組織階層を表現できる。
- team ID は同一 organization 内で一意。重複するとエラーになる。
- パース時に `ownerIndex`（`node id → team id`）が構築され、論理図のノードから所有チームを逆引きできる。
- 所有関係はシステムビューの**所有されるノードのカード上**に `👥` チップとして描画される。対象は team が `owns` できる全 kind（`service` / `domain` / `client`）。チップの表示は team の `label`（無ければ id）で、*Group by: team* のフレームと同じ名乗りになる。クリック時の遷移先は team の **id** で解決する。

> Related TPLs: [TPL-2157](../test-perspectives/TPL-2157-resolved-relation-rendered-for-every-kind.md) — 解決済みの `owns` を提示する側（カードのチップ・`NodeMetadata`・detail panel）の kind gate も、`owns` が許す全 kind を列挙する。

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

`organization` / `team` / `member` の label は、他のノード kind と同じく `label` プロパティで指定する
（`team backend { label "バックエンドチーム" }`、[ADR-19](../adr/19-required-id-label-as-property.md)）。
旧来の位置引数（`team backend "バックエンドチーム"`）は**非推奨**（#2133）: 現状は受理され
`positional-label-deprecated` warning が出る。`karasu fmt` がプロパティ形式へ書き換える。
両方が同時に指定された場合はプロパティ形式が優先される。

> Related TPLs: [TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md) — parser が受理する形は必ず本 spec に文書化する。未文書の受理形は drift（本節の positional 形は約 4 ヶ月間 undocumented のまま受理されていた、#2133）。

---

## システムビューのグルーピング（`boundary`）— experimental

> **experimental notation（post-v1.0 watch）。** `boundary` は freeze せず experimental として保持する。
> 後方互換は**まだ約束しない**。v1.0-stable への昇格は実利用証拠に基づく notation promotion gate
> （[ADR-1820](../adr/1820-notation-promotion-gate.md)）で判断する。`docs/roadmap.md` § post-v1.0 horizon を参照。

`boundary` ブロックは system view のノードの**意味的クラスタ**を宣言する。論理構造の上に著者が引く
グルーピングで、kind ティアとも team 所有とも独立している。system view の第二の**「Group by」軸**
（第一は team 所有。上記）で、`groupBy: "boundary"` にすると各 boundary のメンバーが依存順のグループに
束ねられ、team 軸とまったく同じように境界フレームで囲まれる。両軸とも**ビューごと・drill-down の
各レベルで**解決される（下の `contains` の項を参照）。二つの軸は**排他**（同時に一つだけ選ぶ）で
**独立**（あるノードが *Group by: team* では team A、*Group by: boundary* では boundary X に属しうる）。

```krs
boundary payments {
  label "Payments"
  contains Billing
  contains Wallet
}
```

- **2 つの配置**がある: 上記の **top-level 宣言**（`organization` と同じ）と、**ノードブロック内の
  スコープ宣言**（次のサブセクション）。top-level 形は containment ではなく**参照**（`contains <id>`）で
  束ねるので、import をまたいで宣言されたノードも集められる（`owns` と同じファイル横断性）。
- **`contains <id>`** は 1 行 1 メンバー（`owns` と同型）。parser は宣言済みの id なら受理する（`owns` と違い kind 制限なし）。
  グルーピングは**ビューごとに、いま描画しているレベルに描かれるノード集合との交差で**解決される:
  各ビューはそのレベルに居るメンバーだけをフレームで囲み、他レベルのメンバーはそのビューのフレームに
  参加しない。service 配下にネストされた `domain` はその service の drill-down ビューで、`usecase` は
  domain ビューで、`entity` は entity ビューで、infra の leaf（`table`・queue メッセージ・`bucket`）は
  そのストアの drill-down ビューで囲まれる。したがって 1 つの boundary が複数レベルにフレームを持ちうる
  （同一ラベル・disjoint なフレーム — multi-system root view の per-system team フレームと同じ正直な表現）。
  ghost ノードはグルーピングに参加しない。`contains` が受理する全 kind はいずれかのレベルに描画されるため、
  解決済みメンバーには必ずフレームの現れるビューがある — inert になるのは実在しない id への参照
  （`contains-target-not-found`）だけ。このビューごとの解決は**両方の** Group-by 軸に共通:
  `owns` にもレベル制限は無いので、ネストされた `domain` を owns した team は *Group by: team* で
  同じ drill-down ビューにフレームを得る。
- **所属は 1:N**。1 つのノードは何個の boundary に含まれてもよく、**宣言された所属はすべて保持される**。
  `boundary` は著者が引くグルーピングであり、複数のグルーピングが重なるのは正常な状態である
  （1 つの service が `payments` でもあり `pci-scope` でもある）。多重所属は info 診断
  `duplicate-boundary-assignment` で観測する — error ではなく、見えるべき事実
  （`duplicate-owner-assignment` と同じ register）。
- **ビューによる多重所属の解決**: banded な *Group by: boundary* レイアウトは 1 ノードを 1 band にしか
  **配置**できないため、配置先は**最初に宣言された** boundary（*primary*）になる。ただしフレームの側は
  自分の band に閉じない — 他の band に置かれたメンバーを囲むところまで矩形直交の輪郭に広げるので、
  共有ノードは**ちょうど 1 つ**描かれたまま、届く**すべての**フレームに囲まれ、2 つの輪郭がその
  カードの上で重なる。boundary ごとに宣言順で循環する識別色を持ち、薄く塗る。重なりが「入れ子」ではなく
  「重なり」に読めるのはこの色による。
- **色は指定できる。** 循環色は既定値であって著者の主張ではない。`.krs.style` から
  boundary を名指してフレームの色を引き取れる（`boundary#pci { border-color: ... }`)。
  [style.ja.md § boundary フレームセレクタ](style.ja.md#boundary-フレームセレクタboundary--boundaryid) を参照。
- **届かないときは、所属をカードの上に出す。** フレームを広げるのは、届く先までの回廊に**非メンバー**が
  1 枚も無いときだけ — フレームが非メンバーを囲んではならず、この規則は包含を見せることより優先する。
  広げられない場合はカードにその boundary の色で破線のタブ `◇ <boundary>` が付き、ビューは info 診断
  `boundary-membership-not-drawn` を報告する。**タブになるのが例外ではなく普通**だと考えてよい:
  回廊が空いているかどうかは依存の流れがカードをどこに置いたか次第で、著者が選んだことではない。
  どちらも*ビュー*の話であり、モデルはいずれの場合もすべての所属を保持している。
- **band を持てる boundary は必ず持つ。** メンバー全員が先行する boundary に取られた boundary は
  band にするものが無く、フレームもラベルも出ない。消えるかわりに、その canvas で**共有メンバーを
  1 つ引き取る** — そこに描かれている宣言順で最初のメンバーのうち、元の boundary に別のメンバーが
  残るもの。したがって片方の band を埋めてもう片方を空にすることはない。条件を満たすメンバーが
  1 つも無い場合（唯一の候補が自分の band の最後の 1 人）は band を持たないままにする。
  ノードはどちらの場合も**ちょうど 1 つ**描かれ、フレームが非メンバーを囲むことはない。
- **共有メンバーが配置を動かす。** メンバーを共有する boundary 同士は、依存の流れが許す限り
  隣り合う band に置かれ、共有ノードは相手の band に接する行に座る。どちらも図の上から下への
  依存順を犠牲にしない — band の並びは依然として min feedback-arc-set が最優先で、band 内の
  移動も「その band の中で誰もそのノードに依存していない」ときだけ行われる。共有メンバーの無い
  モデルの配置は従来と完全に同一（[#2176](https://github.com/kompiro/karasu/issues/2176)）。
- **membership index は配置ごとに parse 時に導出される**。top-level 形はフラットな
  **`boundaryMembership`**（`node id → boundary id の配列`、org の `ownerIndex` と同型）を、
  スコープ宣言は per-scope の **`scopedBoundaryMembership`**
  （`宣言スコープ → (child id → boundary id の配列)`）を組む。後者はスコープパスをキーに含むため、
  別スコープの同名の子と混同しえない（TPL-1352）。1 つのキャンバス上で両者が同じノードを指名した場合は
  **スコープ側が勝つ** — そのノードの隣に書かれた、より具体的な宣言であり、**そのキャンバスにおける**
  所属を述べ直しているからである。ファイル全体 `import` では両ファイルの所属が併合される（和集合）。
  import 先のファイルで宣言された boundary は import 元のモデルにもフレームを作る。

### スコープ宣言 — ノードブロック内の `boundary`

`boundary` ブロックは**ノードブロックの中**にも宣言できる。そこに書かれた boundary は
その層自身の関心事であり、メンバは**宣言ノードの直下の子**を bare id で指し、
フレームは**宣言ノードのキャンバスにだけ**現れる。

```krs
system Shop {
  service Checkout {
    boundary core {
      label "Core domains"
      contains Ledger
      contains Cart
    }
    domain Ledger {}
    domain Cart {}
    domain Reporting {}   // contains されていない — フレームの外に描かれる
  }
}
```

- **配置** — 自身のキャンバス（子が描画される drill-down ビュー）を持つ kind の中に置ける:

  | ホスト kind | スコープ `boundary` 可否 |
  |---|---|
  | `system` / `service` / `domain` / `usecase` | **可** |
  | `database` / `queue` / `storage` | **可**（ストアの drill-down ビューの `table` / queue-item / `bucket` leaf を囲む） |
  | `entity` / `resource` / `user` / `client` / infra leaf（`table`・queue item・`bucket`） | **不可** — キャンバスを持たず囲む peer が無い。宣言すると error `boundary-not-in-context` |

  `system` ブロック直下に書いた `boundary` は root system キャンバスをスコープとする —
  top-level 形の root レベルメンバがフレームされるのと同じキャンバスである。
- **メンバは直下の子のみ。** `contains <id>` は宣言ノードの直下の子に対してのみ解決される —
  孫は不可。兄弟 id は既に error 一意（`duplicate-node-id-parent`）なので、bare id は常に
  ちょうど 1 ノードを指し、top-level 形が持つ曖昧さ（[#2036](https://github.com/kompiro/karasu/issues/2036)）は
  構造的に発生しない。孫をグルーピングしたければ**孫の親のブロックに** boundary を書く —
  層ごとの関心事は層ごとに書く。直下の子でない `contains` 先は報告され
  （`contains-target-not-found`）、inert に留まる。メンバは直下の子に限られるが、
  `system`（および infra ブロック）は**別ファイルで再オープン**でき、スコープ宣言の
  `contains` はマージ後のノードの子に対して解決される。したがってメンバも
  `boundary` ブロック自体も、読んでいるファイルとは別のファイル由来でありうる —
  変わらないのは「どちらも同じ宣言ノードに載る」ことである。
- **identity = 宣言スコープ + id。** 別スコープの同名 `boundary` は**別の boundary**である:
  それぞれ自分のキャンバスに自分の group identity でフレームを持ち、自分の `label` で
  タイトルされ、**collapse も独立**する — フレームの group id は内部的にスコープ修飾されるため、
  collapse 状態がスコープ間で漏れることはない（対して top-level 形は 1 宣言 = 1 identity で、
  レベルをまたぐメンバを持つ top-level boundary のフレーム群は 1 つの collapse 状態を共有する —
  system をまたぐ team と同じ、ADR-1884）。**同一スコープ内**で同じ id を 2 度宣言することは
  できない（`duplicate-boundary-id`、error）。別スコープの同名 boundary が同じ*関心事*を意味するか
  どうかは意図的に規定しない。
- **top-level 互換。** top-level 形は今日の挙動を一切変えない: メンバの kind・レベル無制限、
  ファイル横断参照、レベルをまたぐ per-view 断片化（ADR-1983）、同 id 宣言のマージ。
  スコープ形は新しい・より厳格な配置であり、追加しても既存の top-level 宣言には何も起きない。

| キーワード | 意味 | 含められるもの |
|---|---|---|
| `boundary` | system view ノードの名前付き意味的クラスタ。複数宣言可。top-level またはキャンバスを持つノードブロック内 | `contains` |
| `contains` | この boundary に属するメンバー node id（1 行 1 つ。スコープ宣言では宣言ノードの直下の子に対して解決） | — |

診断（[diagnostics.md](diagnostics.md) 参照）:

- `duplicate-boundary-assignment`（info）— ノードが複数の `boundary` に所属する（ビュー側の解決規則は上の「所属は 1:N」を参照）。
- `contains-target-not-found`（warning）— `contains` 先が存在しない（top-level: system 階層のどこにも無い。スコープ宣言: 宣言ノードの直下の子に無い）。
- `boundary-not-in-context`（error）— キャンバスを持たない kind の中の `boundary` ブロック。
- `duplicate-boundary-id`（error）— 同じ親ノード内の 2 つの `boundary` ブロックが同じ id を宣言。top-level ブロックは対象外（従来どおりマージ）。
- `positional-label-removed`（error）— boundary id 直後の位置ラベル（`boundary payments "Payments"`）。label は `label` プロパティのみ（[ADR-19](../adr/19-required-id-label-as-property.md)、#2133）。

どちらの *Group by* 軸でも、グループフレームのタイトルにはグループの `label` が表示される。
label が無い場合は id にフォールバックする（#2133）。

> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — 受理された語彙は効果を持つ（宣言された `boundary` は *Group by: boundary* で必ずフレームを生み、parse-and-vanish しない）。[TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md) — parser が受理する形は本 spec に文書化する（撤去した positional label は accepted-but-unspecified だった、#2133）。[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md) — 上記のビューごとの適用範囲は全 render surface（interactive compile・静的 export bundle・entity view）で同一に成立させる。一部 surface だけの gate 追加・撤去は undocumented な挙動割れを出荷する（#1983）。[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md) — スコープ membership index とスコープ group identity は（宣言スコープ, id）でキーする。スコープ次元を落とすと別スコープの同名 boundary が融合する（#2036）。[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) — スコープブロックも `karasu fmt` の round-trip 対象。`KrsFile` の top-level 配列由来のガードはノード内構文を守らない。[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md) — スコープの `contains-target-not-found` も他の存在検証と同様マージ後モデルで再導出する（#2036 slice A がまさにこれを踏んだ）。[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md) — boundary の所属はモデル層で 1:N。banded view の primary はビュー側の解決であり、群の並びは軸 index の値集合ではなく宣言から導く（#2178）。 [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md) — band 機構全体で配置はちょうど一度。seam bias と band 無し boundary の member 引き取りはノードの band と行を書き換えるが、どちらも drop / duplicate を起こしてはならない（#2176）。 [TPL-2179](../test-perspectives/TPL-2179-derived-outline-measured-on-coverage-not-bbox.md) — メンバーまで広げたフレームは実被覆で測り、回廊に非メンバーが無いときだけ広げる。「フレームは非メンバーを囲まない」が包含を見せることより優先し、届かない場合の縮退が上記の `◇` タブである（#2179）。 [TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md) — 宣言できる構文は in-app Reference から到達できること。`boundary` / `facet` は出荷・spec 済みでありながら `REFERENCE_DATA` に無く、一方で `facet` の要素側 `facets` は 14 の全 node kind に載っていた（#2316）。

---

## 横断的な所属（`facet`）— experimental

> **experimental な記法（post-v1.0 watch）。** `facet` は experimental として
> 着地する — 後方互換はまだ約束されず、v1.0-stable への昇格は実利用の
> エビデンスを条件とする（notation promotion gate、
> [ADR-1820](../adr/1820-notation-promotion-gate.md)）。
>
> **所属は overlay で見る。表示するかは読み手が決める。** プレビューの *Facets*
> セレクタで facet を選ぶと、所属要素に色付きのリングが付き、それ以外は減光し、
> legend に色の凡例が出る。複数の facet を同時に選べ、複数に属する要素には所属数
> だけリングが重なる。overlay は **Group by と直交する** — team / boundary の
> バンド表示と同時に読める — し、ドリルダウン・畳み込み・SVG 書き出しでも残る。
>
> **選択はビューア側の状態であり、モデルには書かない。** どの facet を強調して
> いるかは `.krs` に一切書かれない。同じ `.krs` は、誰かが選択するまでどの読み手
> にも同じように描画される。
>
> overlay の隣に 2 つのサーフェスがある。シートは所属でスタイリングできる
> （[`[facets=<id>]`](style.ja.md#ファセットセレクタfacetsid-experimental) —
> 任意名タグセレクタの流用に代わるもの）。そして Facets メニュー下部の
> **所属一覧**が「facet X に属する要素はどれか」を 1 画面で答える。この一覧は
> **コンパイルのたびに `facets` プロパティから導出され、著述されない** — 所属を
> 要素側に書くことの代償が集中一覧の不在であり、導出することがその代償を
> locality を手放さずに払う方法である。

`facet` は、アーキテクチャの**外側**で定義された集合 — 規制・ポリシー・監査スコープ — を
宣言し、要素がそこに所属することを表す。`database` は PCI スコープに入っていようが
いまいが database であり、PCI 性は外から課される。これが register の分かれ目である:
**tag** は要素が「何であるか」（アーキタイプ）を述べ、`facet` は外部定義の「どの集合に
属するか」を述べる。`boundary` / `annotation` / `tag` / `facet` の四分法は
[tags-annotations.ja.md](tags-annotations.ja.md#語彙の-register--boundary--annotation--tag--facet)
を参照。

```krs
facet pii {
  label "個人情報"
  description "取扱いは ADR-1421 に従う"
  link "https://example.com/adr/1421" "ADR-1421"
}

facet requires_auth {
  label "認証必須"
  description "ログイン後にのみ到達可能。誰が呼べるかは IAM policy が定める"
  link "https://example.com/policies/iam" "IAM policy"
}

system Shop {
  service Checkout {
    domain Ordering {
      usecase PlaceOrder {
        facets requires_auth
      }
      entity Order {
        table OrderDB.orders
        facets pii
      }
    }
  }

  database OrderDB {
    facets pii
  }
}
```

- **宣言は top-level** で、持てるのはメタデータのみ（`label` / `description` / `link`）。
  ノードブロック内に `facet` ブロックを書くとエラーになる — facet id はモデル全体の
  名前であり、ノードごとの名前ではない。
- **宣言は所属リストを持たない。** `contains` は無く、所属は要素側に書く。所属が
  対象の隣にあるため、要素の rename や移動のたびに遠くのリストを直す必要がない。
- **文法は閉じており値言語を持たない — 恒久的に。** 述語も属性宣言も `policy` ブロックも
  入れない。facet が述べるのは「ポリシーがどの振る舞いを覆うか」であって、
  **ポリシーの内容**は `description` の prose と実物への `link` に置く。これは実行時の
  authorization をモデル化しないという [ADR-832](../adr/832-no-runtime-authz-modeling.md)
  の決定の構造的な担保である: 値言語が無ければ「範囲の宣言」から「ルールの宣言」へ
  滑り落ちる勾配自体が存在しない。
- **`facets <id>[, <id>]*` は全 node kind で受理される** — `system` / `service` /
  `domain` / `usecase` / `entity` / `resource` / `user` / `client`、infra ブロック
  （`database` / `queue` / `storage`）とその leaf（`table`・queue item・`bucket`）。
  所属はアーキテクチャの外から課されるものなので、構造的に除外される kind は無い。
  edge は v1 では `facets` を取らない。
- **プロパティの繰り返しと id の重複はマージされる。** `facets a, b` と 2 行に分けた
  `facets` は同じ意味で、同じ id を二度書いても冪等でありエラーではない。
  `karasu fmt` は 1 行のカンマ区切りに正規化する。
- **要素は任意個の facet に所属できる（1:N）。** 多重所属は正常な状態であり
  （`entity` が PII かつ PCI スコープ、はあり得る）診断対象ではない。宣言された所属は
  すべてモデルに保持され、一度に 1 つしか見せられないビューはビュー側で解決する。
- **参照が指すのは facet id であって node id ではない。** `facets pii` は `facet` 宣言の
  平坦な名前空間に対して解決されるため、`boundary … contains` や `owns` が答えねば
  ならない cross-layer の addressing 問題がそもそも発生しない。
- **宣言と参照は別ファイルにあってよい。** 双方は import をまたいでマージされ、
  マージ後のモデルで検証される。facet の語彙を 1 ファイルにまとめて丸ごと import する
  構成はサポートされる。
- **タイポ検出は best-effort ではなく完全である。** 宣言集合が「正」を与えるため、
  著者定義の名前どうしの取り違え（`pii` に対する `facets pcl`）も、組み込み名の
  綴り間違いと同じ確実さで検出される — 固定語彙としか比較できない near-miss の
  `annotation-possible-typo` ヒントとは異なる。
- **既定の描画は変わらない。** 要素に `facets` を付けても図の描かれ方は一切変わらず、
  facet の効果はすべて opt-in である。

| キーワード | 意味 | 持てるもの |
|---------|---------|-------------|
| `facet` | 外部定義の集合とそのメタデータの top-level 宣言。top-level 限定 | `label`、`description`、`link` |
| `facets` | 要素が所属する facet id（カンマ区切り・繰り返し可・全 node kind で受理） | — |

診断（[diagnostics.ja.md](diagnostics.ja.md) を参照）:

- `facet-not-declared`（warning）— `facets` の参照先の `facet` が宣言されていない。マージ後のモデルで検査するので、import 先のファイルにある宣言も有効。
- `duplicate-facet-id`（error）— 同じ id の `facet` ブロックが 2 つある（同一ファイル内でも、マージされた複数ファイルにまたがっていても）。参照が解決するのは最初の宣言。
- `positional-label-removed`（error）— facet id 直後の位置ラベル（`facet pii "個人情報"`）。label は `label` プロパティのみ（[ADR-19](../adr/19-required-id-label-as-property.md)）。

> Related TPLs: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md) — 受理された語彙は効果を持つ。上記の overlay がその効果である。[TPL-2174](../test-perspectives/TPL-2174-opt-in-visual-layer-is-inert-when-off.md) — overlay は opt-in なので、facet を 1 つも選択していないときは何も出してはならない。[TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md) — `facets` は cross-reference プロパティなので、parser の受理だけでなく resolver 側の検証と unresolved warning を伴う。[TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md) — 上記の 1:N は派生 index でも全マージ経路でも保持する。単一値が要るビューはビュー側で解決する。[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md) — `facet-not-declared` と `duplicate-facet-id` はマージ後のモデルで判定する（宣言と参照が別ファイルにありうるため）。[TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md) — 宣言ブロックと per-node の `facets` プロパティは双方 `karasu fmt` の round-trip 対象。`KrsFile` の top-level 配列由来のガードは per-node プロパティを守らない。[TPL-2133](../test-perspectives/TPL-2133-parser-acceptance-documented-in-spec.md) — parser が全 kind で受理するので、受理する kind を本節に列挙する。[TPL-1281](../test-perspectives/TPL-1281-keyword-lexical-ambiguity-fence-vs-deprecate.md) — 「所属」から「ルール言語」への引力は、キーワードの選び直しではなく上記リンクの ADR-832 を外部 fence として縛る。 [TPL-2316](../test-perspectives/TPL-2316-declarable-construct-reachable-from-reference.md) — 宣言できる構文は in-app Reference から到達できること。`boundary` / `facet` は出荷・spec 済みでありながら `REFERENCE_DATA` に無く、一方で `facet` の要素側 `facets` は 14 の全 node kind に載っていた（#2316）。

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

`examples/en/feature-samples/legend.krs` に v1 の全プリミティブを盛り込んだ
サンプルがあるので、アプリにペーストして動作を確認できる。

### v1 で扱わないこと

設計判断の経緯は [`docs/adr/833-diagram-legend-syntax.md`](../adr/833-diagram-legend-syntax.md) を参照。

- shape / icon / pattern 凡例（v1 は色のみ）
- インタラクティブ凡例（クリックでハイライト 等）
- 使用中アノテーション / タグからの自動生成
- diff ビュー（`compileSystemDiff` / `compileDeployDiff`）と
  org の focused-team / icon-mode 経路への描画
- ノード指定凡例（`legend #OrderService "..."`）— 深度スコープが共通ケースを
  カバーするため、ノード単位の出し分けは需要が観測されてから（Issue #1513）

> **Related TPLs**:
> - [TPL-1223](../test-perspectives/TPL-1223-scoped-glance-drill-down.md) — scoped glance: 各ドリルダウンレベルは自分の語彙だけを見せる（完全一致の凡例切り替えはこの原則の凡例への適用）
> - [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md) — トップレベル / drill-down / all-layers の各レンダーパスに同じ legend オプションが渡ること
> - [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md) — view-scope 語彙は built-in リファレンスデータと同期すること

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

このセクションは、モデルを複数の `.krs` ファイルに分割したときに各 `import` 形式が何を意味するかを定義する。実装: `packages/core/src/fs/import-resolver.ts`。関連 ADR: [ADR-281](../adr/281-wildcard-import-two-pass-resolution.md)（wildcard / 2 パス）, [ADR-292](../adr/292-directory-import.md)（ディレクトリ）, [ADR-412](../adr/412-named-import-toplevel-service.md)（named top-level）, [ADR-927](../adr/927-import-system-nested.md)（named path 構文）。

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
> - [TPL-1381](../test-perspectives/TPL-1381-import-dag-not-cycle.md) — DAG 経由再到達は循環ではない（S5）
> - [TPL-1383](../test-perspectives/TPL-1383-whole-file-import-completeness.md) — whole-file import は全 top-level / nested ノードを保持する（S2）
> - [TPL-2168](../test-perspectives/TPL-2168-system-reopen-merge.md) — 再オープン `system` は children を union、property は root entry が勝つ（S3）
> - [TPL-2169](../test-perspectives/TPL-2169-deploy-org-wildcard-propagation.md) — `deploy` / `organization` も whole-file import で伝搬する（S4）
> - [TPL-2170](../test-perspectives/TPL-2170-dangling-edge-preserves-node.md) — 未解決 edge endpoint は残存ノードを drop しない（S6）
> - [TPL-1385](../test-perspectives/TPL-1385-infra-redeclared-across-files.md) — 同名 `database` / `queue` / `storage` の再宣言は union merge、info 診断（S4.5）

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

> Related TPLs: TPL-1386 — `Diagnostic register reflects "fact vs. style"`
