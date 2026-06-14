# 既存システムを読み下して karasu の図にまとめる

> [English](02-onboarding.md) · **日本語**（このファイル）
>
> 📚 ガイドシリーズ 第2章 / 全5章 ｜ ← 前章: [境界設計](01-service-team-design.ja.md) ｜ 次章 →: [進化・移行](03-evolution.ja.md)

このガイドは、**既存のシステムに途中から加わった人**（中途入社・チーム異動・引き継ぎ）が、コードと運用資産を読み下しながら karasu でアーキテクチャの地図を組み立てるためのものです。アーキテクチャドキュメントが無い・古い・断片的、という典型的な状況を前提にします。

関連ガイドの [サービス/チーム境界設計ガイド](01-service-team-design.ja.md) が「これから設計する（前向き）」道具としての使い方なら、こちらは **「既に在るものを読み解く（逆向き）」** 使い方です。情報の流れる向きが逆になります — 設計では抽象から具体へ降ろし、読解では具体から抽象へ上げます。

構文の正確な仕様は [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md)、設計思想は [`docs/concepts.ja.md`](../concepts.ja.md) を参照してください。このガイドは「初日から何をどの順で読み、何を図に落とすか」の運用手順を示します。

`.krs` スニペットと `karasu translate` / `karasu render` の実行例はすべて手元で検証済みです。

---

## 0. なぜ読み下しを karasu モデルに残すのか

オンボーディングで得た理解は、放っておくと頭の中に消えます。karasu に残す利点は 3 つです。

- **再利用できる成果物になる** — あなたの読解は `.krs` テキストという single source of truth に蓄積され、次に入る人の出発点になります。「読んで理解した」で終わらせず、地図として残します。
- **未完成のまま育てられる** — karasu は **warn, don't error**（未指定・未解決は警告にとどめ、エラーにしない）ポリシーです。全部分からなくても、分かったところまでを描いてコミットできます。理解が進むたびに差分で足していけます。
- **diff で「何が分かったか」が見える** — テキスト・決定論的出力・局所的変更という性質により、PR レビューで「今週この境界を理解した」が一目で伝わり、チームに還元できます。

逆に karasu が **やらないこと** も知っておくと迷いません。karasu は意図された**構造**（何が在り、どう関係し、誰が所有するか）を描きます。稼働中のメトリクス・本番トポロジ（リージョン/AZ/pod）・DB のカラム設計・呼び出しシーケンスは対象外です（[`docs/concepts.ja.md`](../concepts.ja.md) の「非目標」節）。読み下しの粒度を「ゆっくり変化する構造」に保つことが、地図を腐らせないコツです。

---

## 1. 既存資産から骨格を起こす — `karasu translate`

ゼロから手書きする必要はありません。チームには既に **読み取れる資産** があります。`karasu translate` はそれらを `.krs` のスキャフォールド（骨組み）に変換します。

| 入力 | `--from` | 何が起きるか | 主に埋まる面 |
|------|----------|--------------|--------------|
| docker-compose.yml | `compose` | コンテナ → `deploy` の `oci` 単位 | 物理 |
| k8s マニフェスト | `k8s` | Deployment/Job 等 → `deploy` 単位 | 物理 |
| OpenAPI スキーマ | `openapi` | パス/操作 → `service` と `usecase` | 論理（サービス内部） |
| SQL スキーマ | `db` | テーブル → `database` / `table` と resource | 論理（データ） |

ここで重要なのは **情報が抽象度の上がる方向に流れる** ことです。translate は実装の細部を落とし、アーキテクチャが読める粒度に **抽象化** します。逆方向（モデルからコードを生成する）は karasu の非目標です — それはモデルに実装詳細を背負わせ、地図をコードの重複物に変えてしまうからです。translate は **入力補助** であって、コード生成の裏返しではありません。

### 1.1 物理から入る — docker-compose を deploy.krs に

```console
$ karasu translate --from compose docker-compose.yml > deploy.krs
```

```krs
deploy "docker-compose" {
  oci "order-service" {
    image "shop/order-service:1.2.0"
    realizes OrderService
  }
  oci "catalog-service" {
    image "shop/catalog-service:2.0.1"
    realizes CatalogService
  }
  oci "postgres" {
    image "postgres:16"
    // TODO: realizes ? — could not resolve from naming convention
    // Add karasu/realizes label or karasu.map.yaml entry
  }
}
```

`realizes`（このデプロイ単位がどの論理サービスを実現するか）は 4 段階で解決されます: **ラベル → `karasu.map.yaml` → 命名規則ヒューリスティック → 未解決**。上の例では `catalog-service` がヒューリスティックで `CatalogService` に、`order-service` はラベル指定で解決し、`postgres` は解決できず **TODO コメント** が残ります。これは「読解が途中である」ことを正直に残す karasu の作法です — エラーで止めず、TODO として可視化します。

インフラファイル自体を書き換えたくない場合（本番 Pod にラベルが付く・共有リポジトリを触りたくない等）は、分離レイヤーの `karasu.map.yaml` に `realizes` マッピングを書きます。

### 1.2 サービスの内部を OpenAPI から

```console
$ karasu translate --from openapi api.yaml --service OrderService --system Shop --emit-crud-decoration
```

```krs
system Shop {
  service OrderService {
    usecase ManageOrders {
      label "manage orders"
      description """
        Operations:
        - GET /orders — List orders
        - POST /orders — Create an order
        - GET /orders/{id} — Get an order
        - DELETE /orders/{id} — Cancel an order
        """
      resource OrdersResource {
        operations list:read, post:create, get:read, delete
      }
    }
  }
}
```

OpenAPI のパスと操作が `usecase` に、`--emit-crud-decoration` を付けると各操作が `<verb>:<crud>` 装飾付きの `resource` operations に落ちます。これで「この API は orders に対して read/create/delete をする」という **読み取り/書き込みの形** が CRUD として残ります。`--system` でラップ先 system を、`--service` でサービス名を指定します。

### 1.3 データの形を SQL スキーマから

```console
$ karasu translate --from db schema.sql --database OrderDB
```

```krs
database OrderDB {
  table OrdersTable {
    label "orders"
    description """
      Tables:
      - orders (root)
      - order_items — name suffix + FK to orders
      """
  }
  table CustomersTable { label "customers" }
}
```

デフォルト（`--granularity aggregate`）では、関連テーブルが集約ルートに **折りたたまれます** — `order_items` は FK と命名から `orders` の一部とみなされ、`OrdersTable` の description に畳まれます。これはまさに「抽象度を上げる」動きで、ER 図ではなくアーキテクチャの粒度になります。テーブルを 1:1 で出したいときは `--granularity table` を使います。

> translate が生むのは **スキャフォールド**（出発点）であって完成品ではありません。生成された `usecase` には `domain` ラッパーが無かったり、サービス名が機械的だったりします。次の §2〜§5 で、これを人間の理解に沿って整えていきます。

---

## 2. トップダウンに俯瞰を組む

骨格ができたら、まず **一番上の地図** から描きます。ドリルダウンの原則（[`docs/concepts.ja.md`](../concepts.ja.md)）に従い、最初から全部を 1 枚に詰め込まず、`system` レベルの俯瞰だけを作ります。

```krs
system Shop {
  label "オンラインショップ（読解中）"

  user Customer [human] { label "購入者" }

  service OrderService {
    label "受注サービス"
    description "注文処理。Slack #team-order が詳しい"
  }
  service CatalogService { label "カタログサービス" }
  service Legacy [external] {
    label "旧基幹（誰も全容を知らない）"
  }

  Customer     -> OrderService  "注文する"
  OrderService -> CatalogService "商品を引く"
  OrderService -> Legacy        "在庫を問い合わせる（詳細不明）"
}
```

- **`[external]`** は「システム境界の外」「自分たちが所有していない」ものに付けます。まだ読めていないレガシーやサードパーティを `[external]` にしておくと、「ここは今は深掘りしない」境界を明示できます。
- **`description` をメモ帳に使う** — 「誰が詳しいか」「どこに不明点があるか」を一文で残せます。これは後で `link` でドキュメント URL に置き換えられます。
- **エッジは矢印の向きと種別を持つ** — 同期 `->`、非同期 `-->`。読解の初期は分からなければ同期で置いておき、イベント駆動だと分かったら `-->` に直します。

### 2.1 まだ読めていないシステムは ghost で残す

別システム（自分の担当外、あるいは未調査）への依存は、`SystemId.ServiceId` のドット記法でエッジを引けます。参照先は **ghost system** として半透明に描画され、「境界の存在は見えるが中身は見えない」状態を表せます。

```krs
system Shop {
  service OrderService { label "受注サービス" }

  // 別システムへのクロス参照 — PaymentGW は ghost として描かれる
  OrderService -> PaymentGW.PaymentService "決済を依頼する"
}
```

ghost は scoped glance の具現化です。視野の外にあるが依存している相手を、詳細を背負わずに地図の縁に残せます。「決済は別チームの PaymentGW に投げている。中身は今は知らなくていい」を正直に描けます。

---

## 3. ボトムアップに肉付けする

俯瞰ができたら、理解した service を 1 つずつドリルダウンして中を埋めます。**全部を均等に深掘りしない** — 自分が触る領域だけ深く、それ以外は service の箱のまま、が scoped glance の正しい使い方です。

```krs
service OrderService {
  label "受注サービス"

  domain Ordering {
    label "受注"
    usecase PlaceOrder {
      label "注文を受け付ける"
      resource OrderDB.OrdersTable { operations create, read }
      resource CatalogAPI [external] { operations read }
    }
    usecase CancelOrder { label "注文をキャンセルする" }
  }
}
```

- **`domain`** は DDD の Bounded Context に近い「関心事の境界」です。translate が生んだ素の `usecase` を、理解に沿って `domain` でグルーピングし直します。
- **`resource`** は usecase が操作する対象（テーブル・外部 API・ファイル）。読みながら「この usecase は何を触るか」を発見し、`operations`（create/read/update/delete）で読み書きの別を残します。
- **resource はボトムアップに発見してよい** — 最初は `resource OrderTable` と素で書いておき、後で共有 DB だと分かったら `database OrderDB { table OrdersTable }` にまとめ、`resource OrderDB.OrdersTable` のドット参照に切り替えます。karasu は素の resource を孤立ノードとして描き、警告にとどめます。

### 3.1 共有データストアの発見

複数の service が同じ DB を触っていることに気づいたら、`database` / `queue` / `storage` を **system 直下の共有インフラ** として宣言します。これらは system 図で描画され、複数 service から 1 つの DB ノードへエッジが集まる形で「共有」が可視化されます。

```krs
system Shop {
  service OrderService { /* ... resource OrderDB.OrdersTable ... */ }
  service ReportService { /* ... resource OrderDB.OrdersTable ... */ }

  database OrderDB {
    label "注文DB"
    table OrdersTable { label "注文" }
  }
}
```

karasu はこの共有を **描くが禁止しません** — マイクロサービスの Database-per-Service 観点では smell ですが、共有が正当な場面もあるからです。読解中のあなたが見つけた「構造的事実」を、判断を保留したまま地図に残せます。

> **診断との対応**: 同名の `database` / `queue` / `storage` を **複数ファイルで再宣言** した場合は `infra-redeclared-across-files`(info) が出ます。一方、上の例のように 1 つの DB を複数 service が参照する **fan-in 自体** への診断は現状なく、共有は図に描かれるだけです（fan-in 診断は検討中 — Issue #1570）。

---

## 4. 依存関係を読み解く — karasu が構造的負債を教えてくれる

既存システムの読解で最も価値があるのは **依存の網** の把握です。karasu のエッジと静的検査がここで効きます。

### 4.1 ドメイン依存がサービス境界に立ち上がる

`domain` ブロックの中にドメイン間エッジ（`Ordering -> Catalog` 等）を書くと、それが異なる service をまたぐとき、karasu は **service 間の implicit edge を自動合成**して俯瞰図に琥珀色で描きます。つまり、読みながらドメインの細かい依存を書くだけで、サービス間の依存マップが俯瞰に自動で立ち上がります。「どのサービスがどのサービスに依存しているか」を手で集計する必要がありません。

### 4.2 循環依存 = 既存システムの構造的負債の発見

karasu は **sync エッジ（`->`）のみ** を対象に循環依存を検出し、`[cyclic]` タグを付けて赤で描きます。既存システムを読み下しているとき、これは **隠れた構造的負債を発見する装置** になります — 「A が B を呼び、B が巡り巡って A を呼んでいる」という、コードを追うだけでは気づきにくい循環が、地図の上で赤く浮かびます。非同期（`-->`）は「意図された疎結合」として検査対象外なので、本当に問題になる同期の循環だけが残ります。

### 4.3 ドメイン分散 = 凝集性のシグナル

同一 system 内で同じ `domain id` が複数の service に登場すると、`domain-dispersal`（info）が出ます。読解中に「あれ、`Payment` の処理が 2 つのサービスに散っている」と気づいたとき、それが意図的な分散か設計の歪みかを、事実として記録できます。

### 4.4 CRUD マトリクスで「何が何を触るか」を一覧する

`usecase` の `resource` に `operations`（create/read/update/delete）を書いていくと、`karasu matrix` で **usecase × resource の CRUD マトリクス** を出せます。読解中の「どの操作がどのデータを読み書きするか」を一覧表にまとめる強力な把握レンズです。

```console
$ karasu matrix index.krs --format md
```

```
| usecase \ resource | Orders | CatalogAPI [external] | ΣC | ΣR | ΣU | ΣD |
| --- | --- | --- | --- | --- | --- | --- |
| CancelOrder | U |  | 0 | 0 | 1 | 0 |
| PlaceOrder | CR | R | 1 | 2 | 0 | 0 |
| ΣC | 1 | 0 |  |  |  |  |
| ΣR | 1 | 1 |  |  |  |  |
| ΣU | 1 | 0 |  |  |  |  |
| ΣD | 0 | 0 |  |  |  |  |
```

- 出力は `md` / `csv` / `svg`。md はそのまま PR やオンボーディングメモに貼れます。
- `--writes-only` で読み取り専用セルを落とすと、**書き込み経路だけ** が浮かび、「どの usecase が状態を変えるか」が一目で分かります。
- `--service` で特定サービスに絞る、`--infra database` で列を特定インフラ種別に絞る、などの絞り込みが効きます。
- 列方向の合計（ΣC/R/U/D）が高い resource は **多くの usecase から触られるホットスポット** で、読解の優先度や結合の集中点を示します。

---

## 5. 「まだ分かっていない」を正直に描く

オンボーディングの肝は、**理解が部分的な状態をそのまま表現できる** ことです。karasu はこれを複数の仕組みで支えます。

- **未割り当てドメイン（トップレベル `domain`）** — どの service に属すか未確定の概念を、`system` の外にトップレベルで置けます。「`Promotion` というドメインがあるらしいが、どのサービスの担当か未確定」を仮置きできます。コンパイラは未割り当て警告を出しますが、エラーにはしません。

  ```krs
  // まだ配置先が分からないドメイン
  domain Promotion { label "プロモーション（調査中）" }

  system Shop {
    service OrderService { label "受注サービス" }
  }
  ```

- **TODO コメント** — translate が残す `// TODO: realizes ?` のように、未解決点をコメントで残します。
- **`[external]` と ghost** — 未調査の境界を「外」として置き、深掘りを後回しにできます。
- **warn, don't error** — `runtime` 未指定、`realizes` 未指定、resource の孤立など、未完成な点はすべて警告にとどまります。地図は壊れず描画され続けます。

### 5.1 読解の確度を独自アノテーションで示す

「未確定」と「確認済み」の中間 — **推測だが描いておきたい** — を残したいことがあります。karasu のアノテーション名は **オープンセット**（任意の `@<識別子>` を受け付け、組み込み外でも警告は出ない）なので、`@unverified` / `@assumed` のような独自アノテーションを定義して、読解の確度を一級のマークとして残せます。

```krs
// このドメインの存在は推測 — コード上の確証はまだ取れていない
domain Promotion @unverified { label "プロモーション（推測）" }

system Shop {
  service OrderService @assumed {
    label "受注サービス"
    description "アクセス経路は推測。Slack #team-order で要確認"
  }
}
```

- 組み込みの 4 つ（`@deprecated` / `@new` / `@experimental` / `@migration_target`）と違い、独自アノテーションに **デフォルト描画は付きません**。ただし `.krs.style` のアノテーションセレクタの正当な対象になるので、色やバッジで「確度の低い領域」を一目化できます（[伝達ガイド §3](05-communicating-diagrams.ja.md#3-ライフサイクル状態を色バッジで示す) と同じ要領）。

  ```css
  /* theme.krs.style — 推測中の領域を点線＋バッジで目立たせる */
  @unverified { border-style: dashed; opacity: 0.7; badge-label: "要確認"; badge-icon: "❓"; }
  ```

- 組み込み名に近いタイポ（例: `@depracated`）には `annotation-possible-typo` の info ヒントが出ますが、`@unverified` のように離れた名前には出ません。
- 理解が確定したらアノテーションを外すだけ。`@unverified` が残っているノードを grep すれば、**未確認の宿題一覧** になります。

この「未完成を許容する」姿勢が、オンボーディングと karasu の相性の核心です。完璧な理解を待たずにコミットし、理解が進むたびに警告と `@unverified` を 1 つずつ潰していけます。warning パネルと独自アノテーションが **残りの宿題リスト** になります。

---

## 6. 「誰に聞けばいいか」を地図化する

中途入社者にとって、技術構造と同じくらい重要なのが **人の地図** です。karasu の組織ビューは、これをアーキテクチャと同じ図の中に重ねられます。

```krs
organization Shop {
  team orderTeam {
    label "受注チーム"
    owns OrderService
    member alice {
      label "Alice（受注のテックリード）"
      slack "@alice"
      github "alice"
    }
  }
  team platformTeam {
    label "基盤チーム"
    owns OrderDB
    member bob { label "Bob（DBA）" slack "@bob" }
  }
}
```

- **`owns`** で「このサービス/DB は誰の担当か」を地図化します。読解中に「OrderService のことは受注チームに聞けばいい」が分かったら、`owns` で記録します。
- **`member` + `slack` / `github`** で連絡先を残せます。オンボーディング地図としては、まさにこれが欲しい情報です。
- どの team も所有していない service は組織ビューで **オーナー不在** として浮かびます。「このサービス、誰が見てるんだ？」という、入社直後によくある疑問が可視化されます。

詳細は関連ガイドの [サービス/チーム境界設計ガイド §2](01-service-team-design.ja.md#2-逆コンウェイ戦略--アーキテクチャに合わせてチームを設計する) と、完全例の [`examples/org/system.krs`](../../examples/org/system.krs) を参照してください。

---

## 7. 図に固めてチームに還元する

読解の成果は、render して共有することで初めてチームの資産になります。

```console
# 全ビュー（system / deploy / org）をまとめて SVG に
$ karasu render index.krs --output docs/architecture.svg

# 特定ビューだけ
$ karasu render index.krs --view deploy --output deploy.svg
$ karasu render index.krs --view org    --output org.svg

# レイアウト調整が必要なら draw.io へ逃がす
$ karasu render index.krs --format drawio --output arch.drawio
```

- **PR で diff を見せる** — `.krs` はテキストなので、「今週この依存関係を理解した」という追加が PR の diff で明快に伝わります。先輩レビュアーが「その依存はもう無いよ」「`Legacy` は実は `[external]` じゃない」と訂正でき、レビューが知識移転の場になります。
- **`render` の警告を宿題リストにする** — 残った警告（未解決 realizes、未割り当て domain など）が、次に潰すべき理解のギャップを指し示します。

### ファイル分割

システムが大きく、チームごとに読解範囲を分けるなら、1 つの `system` を複数ファイルに分割できます（whole-file import + system 再オープン）。各自が自分の読解範囲のファイルを持ち、orchestrator の `index.krs` で 1 枚に統合します。詳しくは [サービス/チーム境界設計ガイド §3](01-service-team-design.ja.md#3-チームごとに運用するためのファイル分割) と [`examples/multi-file-system/`](../../examples/multi-file-system/) を参照してください。

---

## 8. オンボーディング・チェックリスト

読み下しの進め方の目安です。上から順に、分かった分だけ埋めていきます。

1. **物理から骨格** — `translate --from compose|k8s` で `deploy.krs` を起こし、`realizes` の TODO を 1 つずつ解決する
2. **サービス俯瞰** — `system` に service を並べ、外部・未調査は `[external]` / ghost で置く。エッジで依存を引く
3. **データの形** — `translate --from db` で `database` / `table` を起こす
4. **API の形** — `translate --from openapi` で `usecase` / `resource` を起こす
5. **担当領域を深掘り** — 自分が触る service だけ `domain` → `usecase` → `resource` までドリルダウン
6. **依存を読む** — implicit edge でサービス間依存を、`[cyclic]` で構造的負債を、`domain-dispersal` で凝集性を確認
7. **人の地図** — `organization` / `team` / `owns` / `member` で「誰に聞くか」を記録
8. **還元** — `render` して PR を出し、レビューで訂正を受ける。残った警告を次の宿題にする

完璧を目指さず、**warning を 1 つずつ減らしていく** ことが地図の精度を上げる作業だと捉えてください。あなたの読解が、次に入る人の出発点になります。

---

## さらに学ぶ

- 関連ガイド: [境界設計](01-service-team-design.ja.md)（設計）/ [進化・移行](03-evolution.ja.md)（変更）/ [伝達](05-communicating-diagrams.ja.md)（スタイル・凡例・CI）/ [アクセス経路とクライアント](04-access-paths.ja.md)
- ガイド全体の地図: [`docs/guide/README.md`](README.md)
- 構文の正確な仕様: [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md)
- 設計思想（三面構造・scoped glance・translate の非対称性）: [`docs/concepts.ja.md`](../concepts.ja.md)
- 段階的チュートリアル: [`examples/ec-platform/`](../../examples/ec-platform/)（`01-system.krs` から順に）
- クロスシステム / ghost の例: [`examples/ec-platform/07-cross-system/`](../../examples/ec-platform/07-cross-system/)
- 動く複数ファイル例: [`examples/multi-file-system/`](../../examples/multi-file-system/)
