# 記法クックブック — karasu でモデリングするための idiom 集

> [English](notation-cookbook.md) · **日本語**（このファイル）

[`docs/spec/syntax.md`](../spec/syntax.md) は**文法**そのもの — すべてのキーワードと
規則です。このクックブックはその欠けていた相棒で、「*X* をどう表現するか」に答える
コンパクトな **idiom カタログ**です。文法からは到達できるが、文法を読んだだけでは
*自明でない*パターンを対象にします。各エントリはコピーして使える worked snippet です。

意図的に短くしてあるので、プロジェクトをリバースエンジニアリングするとき
`syntax.md` と**一緒に LLM へ渡せます**（[LLM でリバースする](reverse-engineering-with-ai.md)
を参照）。人間のオンボーディング資料も兼ねます。生成されたモデルは常に*仕様ではなく
地図*として扱い、コードと照合してください。

## 使い方

- **LLM と使う**: `syntax.md` の後にこのファイルを貼る。文法だけでなく *idiom* を
  示すので、モデルが独自の形を発明せず karasu 慣用の形を選ぶ。
- **人間が読む**: 必要なパターンを拾い読みする。各エントリは単独で完結している。

各エントリは同じ形をとる: いつ使うか（**When**）、規則を 1 行で述べた**パターン**、
最小の **`.krs`**、そしてなぜそう書くか（**Why**）。

---

## 1. キー/バリューストア（Redis, etcd）— leaf-less な `database`

**When** — table/collection の構造としてモデル化する意味がないストア: セッション
キャッシュ、KV/コンフィグストア、ロックサービスなど。

**パターン** — **leaf を持たない** `database` を宣言し、サービスから**ノード粒度の
エッジ**（`Service --> Store`）でつなぎ、具体的なエンジンは**物理層**の `store` ユニット
で名指しする。`@kv` アノテーションや新しい `kv` kind を凍結してはいけない — KV
ストアは単に分解しない `database` である。

```krs
system Web {
  service ApiGateway {
    label "API Gateway"
  }

  database SessionStore {          // leaf-less: 中に `table` を書かない
    label "Session store"
  }

  ApiGateway --> SessionStore "Reads/writes session tokens"   // ノード粒度のエッジ
}

deploy "production" {
  store "session-kv" {
    type     "Redis 7"             // 具体的なエンジンはここ
    realizes SessionStore
  }
}
```

**Why**

- **`resource` の dot-path ではなくエッジでノード粒度参照する。** `resource <Db>.<Leaf>`
  参照には宣言済みの leaf が要る。KV ストアには名前を付ける leaf が無いので、
  `resource SessionStore` と書くと*未割り当て*になる（warning、orphan として描画）。
  慣用的な接続は直接の `Service --> SessionStore` エッジで、
  [`hato`](https://github.com/kompiro/karasu/tree/main/examples/en/hato) 例が
  leaf-less な `D1` / `R2` / `Tasks` を配線しているのと同じ方式。
- **エンジンは物理層に。** 「Redis 7」は*技術*の選択。論理層は技術非依存に保ち、
  `store { type … }` ユニットがどのエンジンが論理ストアを realize するかを記録する。
  Redis を etcd に載せ替えても論理モデルは揺れない。
- **語彙を増やさない。** アノテーション（`@…`）は*ライフサイクル*標識（deprecated,
  experimental）であって kind ではない — `@kv` は意図的に却下。leaf-less な `database`
  が既に「興味深い下部構造を持たないストア」を表現している。

## 2. 派生検索インデックス — `[index]` タグ

**When** — system of record から**派生した**検索/ベクトルインデックス
（ElasticSearch, OpenSearch, pgvector）で、それ自体が正本ではないもの。

**パターン** — `database` に `[index]` を付ける。具体的なエンジンは物理層に置く。

```krs
database SearchIndex [index] {
  table documents
}

// 物理層
store "search" {
  type     "ElasticSearch 8"
  realizes SearchIndex
}
```

**Why** — `[index]` は技術ではなく**役割**（正本に対する二次インデックス）を表し、
`index` バッジを付ける。ベクトル DB や ElasticSearch が*それ自体*正本なら素の
`database` のまま（`[index]` なし）。1 つの Postgres が正本かつインデックスを兼ねる
場合も付けない。idiom #1 と同じ「役割はタグ・技術は物理層」の規律で、エンジンごとに
`vector-store` / `search` kind を増やすのを避ける。
[ADR-20260623-04](https://github.com/kompiro/karasu/blob/main/docs/adr/20260623-04-vector-store-vs-database.md) を参照。

## 3. 境界の外側にあるもの — `[external]` タグ

**When** — システムが依存するが所有はしない、サードパーティ API・マネージド SaaS・
外部ストア。

**パターン** — ノード id に `[external]` を付ける。`service` と infra kind
（`database` / `queue` / `storage`）に適用できる。

```krs
system Shop {
  service PaymentGateway [external] {
    label "Payment gateway"
  }

  database AnalyticsDB [external] {  // マネージドなサードパーティストア
    label "Vendor analytics DB"
  }
}
```

**Why** — `[external]` はノードを破線・グレー系のボーダーで描き、読者が即座に
システム境界を見て取れる。外部ストアは `shared-infra-fan-in` 診断（idiom #4）の
対象からも除外される — ベンダー API を複数サービスで共有するのは想定内であって
設計上の匂いではない。

## 4. 共有インフラ（fan-in）

**When** — 複数のサービスが**同じ**データストアを読み書きする。

**パターン** — ストアは一度だけ宣言し、各サービスの `usecase` が共有 leaf を
`resource <Db>.<Leaf>` の dot-path で参照する。resolver がこれらを集約して
`service → database` エッジを自動導出する。

```krs
database ArticleDB {
  table articles
}

service ArticleDelivery {
  domain Delivery {
    usecase "Fetch an article" {
      resource ArticleDB.articles
    }
  }
}

service Authoring {
  domain Publishing {
    usecase "Publish an article" {
      resource ArticleDB.articles
    }
  }
}
```

**Why** — 2 つのサービスが 1 つの `ArticleDB` に fan-in すると **`shared-infra-fan-in`**
の info 診断が出る（決してエラーではない — karasu は結合を可視化するだけで、それを
禁じない）。ここは store に leaf（`articles`）がモデル化されているので `resource`
dot-path を使う。leaf-less なストアがノード粒度エッジを使う idiom #1 と対比のこと。
[診断リファレンス](../spec/diagnostics.md) を参照。

## 5. ドメイン越え・システム越えの参照

**When** — あるドメインが、**別の**ドメイン・サービス・システムが所有するものに
依存する。

**パターン** — エッジは**参照元**のブロック内で宣言する。origin-scope 規則が縛るのは
参照元であって参照先ではないので、ブロックは所有していないものに依存できる。別の
**システム**へは `System.Node` dot-notation を使う（参照先システムは ghost として描画）。

```krs
service BillingService {
  domain Billing {
    label "Billing"
    Billing -> Contract "Created from a contract"   // Contract は別サービスにある
  }
}

// システム越え: PaymentGateway は別の `system`（別所で import 済み）
OrderService -> PaymentGateway.PaymentService "Request payment"
```

**Why** — サービス越えのドメインエッジは system ビュー上で暗黙のサービスレベル
エッジに自動導出される。高レベルの絵を読みやすく保ちつつ、詳細は書いた場所に残る。
モデル化していないエンドポイントは破棄されず `unresolved-edge-endpoint` として
報告される。

## 6. モデルを複数ファイルに分割する

**When** — 1 つの system が単一ファイルには大きすぎる、あるいはチームごとに別々の
スライスを所有する。

**パターン** — **ファセット**（サービスごとのファイル + 共有 `infra.krs`）で分割し、
`import` で綴じ合わせる。同一 id の `system` / `deploy` / `organization` ブロックは
マージ（reopen）される。ファイル全体は `import "x.krs"`、単一ノードは
`import { Node } from "x.krs"` で取り込む。

```krs
// index.krs — エントリポイント
import "infra.krs"     // 共有の database / queue / storage
import "reader.krs"    // 1 ファイル 1 サービス
import "editor.krs"

system Blog {
  label "Blog Platform Demo"
}
```

**Why** — モデルにおいて**ファイルはグルーピング単位ではない**: 分割は純粋に
オーサリングの都合で、マージ結果は単一ファイルと同一に描画される。共有ストアは
1 つの `infra.krs` にまとめ、各スライスがそれを import することで、各スライスも
単独で描画できる。
[`multi-file-system`](https://github.com/kompiro/karasu/tree/main/examples/en/multi-file-system)
例を参照。

## 7. Cloudflare Workers — `wrangler.toml` から

**いつ** — 物理層が `wrangler.toml` にある Cloudflare Workers のサーバーレスアプリ。
compose / k8s ファイルが無いため、binding を手でモデル化すると具体技術（"D1 (SQLite)"）が
論理ラベルに漏れやすい。

**パターン** — `karasu translate --from wrangler` に決定的に抽出させる。adapter は
論理 `system`（engine-neutral な infra + Worker の `service` + edge）と物理 `deploy` を出力し、
具体的な Cloudflare 技術は論理ラベルではなく `store { type ... }` に落ちる:

```krs
system Hato {
  service Hato { label "hato" }

  database DB { }                  // D1
  storage EXPORTS { }              // R2
  queue TASKS { }                  // Queues
  database SEARCH [index] { }      // Vectorize — 派生ベクトルインデックス（イディオム #2）
  database CACHE { }               // KV
  service AI [external] { }        // Workers AI — 外部モデルサービス（イディオム #3）
  service SessionActor [external] { }  // Durable Object — 不透明な stateful actor

  Hato --> DB                      // 所有 infra は -->
  Hato -> AI                       // 外部 / 他 Worker は ->
  Hato -> AuthWorker               // service binding = Worker→Worker RPC edge
}

deploy "hato" {
  function "hato" { runtime "cloudflare-workers"; realizes Hato }
  store DBStore     { type "Cloudflare D1";       realizes DB }
  store SEARCHStore { type "Cloudflare Vectorize"; realizes SEARCH }
}
```

**なぜ** — binding→karasu のマッピングは新構文を作らず既存イディオムを再利用する:
**Vectorize → `database [index]`**（イディオム #2 の派生インデックス）、**Workers AI /
Durable Object → `service [external]`**（イディオム #3、この adapter からは不透明）、
**service binding → `->` の communication edge**。KV は素の `database` にマップする
（専用の `[cache]` role は
[notation-watch 項目](https://github.com/kompiro/karasu/issues/1816)であり、まだ notation ではない）。
未知の binding 種別は warning を出して skip する — 決して推測しない。実行は
`karasu translate --from wrangler wrangler.toml > index.krs`。

## 関連

- [`docs/spec/syntax.md`](../spec/syntax.md) — 厳密な `.krs` 文法（まずこれを渡す）
- [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md) — タグ / アノテーション一覧
- [LLM でリバースする](reverse-engineering-with-ai.md) — 文法と一緒にこのクックブックを渡す
- [オンボーディングガイド](02-onboarding.md) — 既存システムを図へ読み下す
