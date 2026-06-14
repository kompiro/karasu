# サービスとチームの境界を karasu で設計する

> [English](01-service-team-design.md) · **日本語**（このファイル）
>
> 📚 ガイドシリーズ 第1章 / 全5章 ｜ 次章 →: [オンボーディング](02-onboarding.ja.md)

このガイドは、karasu を「図を描くツール」としてではなく **サービス境界とチーム境界を設計するための道具** として使うアーキテクト向けのものです。次の 3 つの問いに、karasu の語彙でどう答えるかを順に示します。

1. **ドメインの依存関係を基に、どこでサービスを分割すべきか**
2. **望ましいアーキテクチャに合わせて、チーム構成をどう設計しなおすか**（逆コンウェイ戦略）
3. **チームごとに運用するために、モデルをどうファイル分割するか**

構文の網羅的なリファレンスではありません。各機能の正確な仕様は [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md)、設計思想は [`docs/concepts.ja.md`](../concepts.ja.md) を参照してください。このガイドは「アーキテクトが何を、なぜ、どの順で書くか」という運用の筋道を示します。

このガイドに出てくる `.krs` スニペットはすべて `karasu render` で構文検証済みです。手元で試すには karasu Web アプリ / VS Code 拡張に貼り付けるか、`karasu render <file>` を実行してください。

---

## 0. 前提: karasu が扱う三つの面

karasu はアーキテクチャを **論理・物理・組織** の三面で記述します（詳細は [`docs/concepts.ja.md`](../concepts.ja.md) の「論理・物理・組織の三面構造」節）。

| 面 | 問い | 主な語彙 |
|----|------|----------|
| 論理 | 何が・なぜ存在するか | `system` / `service` / `domain` / `usecase` / `resource` |
| 物理 | どのように動くか | `deploy` / `realizes` |
| 組織 | 誰が所有するか | `organization` / `team` / `member` / `owns` |

このガイドが扱う 3 つの問いは、すべて **論理と組織の交点** で起きます。karasu が組織構造を第一級の語彙として持つのは、まさにこの交点 — Conway の法則と逆コンウェイ戦略の力学が発生する場所 — を一つの言語で議論できるようにするためです。

ドリルダウンの原則も押さえておいてください。karasu は全体を 1 枚に押し込むのではなく、`system → service → domain → usecase` と **見る範囲を限定しながら降りていく**（scoped glance）設計です。サービス境界の議論は `service` レベルの俯瞰で、ドメイン依存の議論は `domain` レベルのドリルダウンで行います。

---

## 1. ドメインの依存関係からサービス分割を検討する

### 1.1 まずドメインと依存を書く（サービス境界は後で引く）

サービス分割を「先に箱を決めてから中身を詰める」のではなく、**ドメインとその依存関係を先に観察してから、結合の薄いところに境界線を引く**、というボトムアップの手順を karasu はそのまま表現できます。

出発点として、すべてのドメインが 1 つの service に同居したモノリスを書きます。ドメイン間の依存は、`domain` ブロックの中に **依存元ドメインを起点としたエッジ** で書きます（同期は `->`、非同期は `-->`）。

```krs
system Shop {
  label "オンラインショップ"

  user Customer [human] { label "購入者" }

  service Monolith {
    label "ショップ本体"

    domain Catalog  { label "カタログ" }
    domain Cart {
      label "カート"
      Cart -> Catalog "商品を引く"
    }
    domain Ordering {
      label "受注"
      Ordering -> Catalog   "商品情報を引く"
      Ordering -> Inventory "在庫を引き当てる"
      Ordering -> Payment   "決済を依頼する"
      Ordering --> Notification "注文確定を通知する"
    }
    domain Inventory { label "在庫" }
    domain Payment {
      label "決済"
      Payment --> Notification "決済結果を通知する"
    }
    domain Shipping {
      label "配送"
      Shipping -> Ordering "確定注文を引く"
    }
    domain Notification { label "通知" }
  }

  Customer -> Monolith "買い物をする"
}
```

> **構文の要点**: ドメイン間エッジは **依存元ドメインの `domain` ブロックの中** に書きます。`Cart -> Catalog` を `service` ブロック直下に書くとエラーになります（エッジの起点は囲っているブロックの id と一致する必要があるため）。`Cart` ブロックの中に `Cart -> Catalog` と書きます。

この時点で `service Monolith` をドリルダウンすると、7 つのドメインと依存の矢印が見えます。ここから読み取りたいのは **依存のクラスタ** です:

- `Ordering` が `Catalog` / `Inventory` / `Payment` / `Notification` に扇状に依存している（受注がハブ）
- `Shipping` は `Ordering` にだけ依存する（受注と配送は密）
- `Cart` は `Catalog` にだけ依存する（探索系は薄く独立）
- `Notification` は誰からも依存される末端（共通能力）
- `Payment` の通知は非同期（`-->`）= 意図された疎結合

非同期エッジ（`-->`）は単なる見た目の違いではなく **構造の意味論** を持ちます。後述の循環検出は非同期を「意図された疎結合」として扱い、検査対象から外します（[`docs/concepts.ja.md`](../concepts.ja.md) の「自動検査 — 循環依存」節）。どの依存を非同期にするかは、そのままサービス境界をまたぐ通信を疎結合にする設計判断になります。

### 1.2 境界線を引く — サービスに割り当てる

依存クラスタを観察したら、**結合の薄いところで切って** service に割り当てます。上のモノリスを次のように分割してみます。

- `CatalogService` … `Catalog`（多くから参照される土台、独立性が高い）
- `ShoppingService` … `Cart`（探索体験。Catalog にだけ依存）
- `OrderService` … `Ordering` + `Shipping`（受注と配送は密結合なので同居させる）
- `InventoryService` … `Inventory`
- `PaymentService` … `Payment`（専門性が高く隔離したい）
- `NotificationService` … `Notification`（共通の末端能力）

```krs
system Shop {
  label "オンラインショップ"

  user Customer [human] { label "購入者" }

  service CatalogService {
    label "カタログ"
    domain Catalog { label "カタログ" }
  }

  service ShoppingService {
    label "買い物体験"
    domain Cart {
      label "カート"
      Cart -> Catalog "商品を引く"
    }
  }

  service OrderService {
    label "受注・配送"
    domain Ordering {
      label "受注"
      Ordering -> Catalog   "商品情報を引く"
      Ordering -> Inventory "在庫を引き当てる"
      Ordering -> Payment   "決済を依頼する"
      Ordering --> Notification "注文確定を通知する"
    }
    domain Shipping {
      label "配送"
      Shipping -> Ordering "確定注文を引く"
    }
  }

  service InventoryService {
    label "在庫"
    domain Inventory { label "在庫" }
  }

  service PaymentService {
    label "決済"
    domain Payment {
      label "決済"
      Payment --> Notification "決済結果を通知する"
    }
  }

  service NotificationService {
    label "通知"
    domain Notification { label "通知" }
  }

  Customer -> ShoppingService "買い物をする"
}
```

### 1.3 implicit edge — ドメイン依存がサービス境界の俯瞰に立ち上がる

ここが karasu のドメイン駆動サービス分割の核心です。**ドメイン間のエッジを書いただけ** で、それが異なる service をまたぐとき、karasu は **上位の service 間エッジを自動合成** します。これを **implicit edge** と呼びます。

上の例では、`Ordering -> Catalog`（OrderService 内のドメイン → CatalogService 内のドメイン）を書いただけで、system 俯瞰図に `OrderService -> CatalogService` の暗黙エッジが琥珀色の破線で立ち上がります。同じ service ペアに複数のドメインエッジがあれば 1 本に集約され、ラベルは `"N domain edges"` になります。

この非対称性が効きます — **書き手はドメインモデリングの結果として細部にエッジを書くだけでよく、読み手は service レベルの俯瞰でサービス間の依存を受け取れます**。ドメイン分析の成果物が、手作業の翻訳なしにサービス境界の議論へ直結します。つまり「サービスをどう切るか」を、ドメイン依存図を書き換えるだけで何度でも試せます。

実際に分割後の system 俯瞰を見ると、サービス間依存はこう読めます:

- `ShoppingService -> CatalogService`(Cart→Catalog 由来)
- `OrderService -> CatalogService` / `-> InventoryService` / `-> PaymentService`
- `OrderService --> NotificationService`(非同期)
- `PaymentService --> NotificationService`(非同期)
- `Shipping -> Ordering` は **OrderService 内に閉じている** ため俯瞰には出ず、`OrderService` をドリルダウンしたサービスビューでだけ見える

最後の点が「同居の根拠」です。`Shipping` と `Ordering` を同じ service に入れたことで、その密な依存はサービス境界をまたがず、俯瞰の認知負荷を上げません。**サービス内に閉じ込めるべき依存と、サービス間にまたがる依存** が図の上で自然に分離されます。

### 1.4 静的検査でサービス分割の妥当性を確かめる

karasu は引いた境界を 2 つの静的シグナルで検査します。どちらも「規定」ではなく「観察」です — karasu は構造を描いて通知し、判断はチームに委ねます（[`docs/concepts.ja.md`](../concepts.ja.md) の「karasu が『描く』もの、『規定しない』もの」節）。

**循環依存（`[cyclic]`、赤色）** — karasu は **sync エッジ（`->`）のみ** を対象に循環を検出します。サービス境界をまたぐ sync の循環は、起動順序・呼び出しチェーン・デプロイ独立性の障害に直結するため、境界の引き直しを促す強いシグナルです。逆に非同期（`-->`）の循環は「意図された疎結合」として検査対象外になります。**サービス間にまたがる sync 循環が出たら、その 2 サービスはまだ 1 つの境界として癒着している** と読みます。

**ドメイン分散（`domain-dispersal`、info）** — 同一 system 内で **同じ domain id が複数の service に登場** すると、info 診断が出ます。DDD では同じドメインが複数サービスにまたがる状態を凝集性低下のシグナルとみなすため、karasu はそれを事実として通知します（「直せ」とは言いません）。サービス分割の途中で 1 つのドメインを 2 つの service に割ってしまったときの早期警告になります。検出キーは `id` で、`label`（表示名）は使いません。

> サービス分割を検討するときは、**循環が消え、ドメイン分散が出ない** 状態を一つのゴールラインにできます。ただしこれは「正解」ではなく「ある流派から見た健全性」です。共有 DB や意図的なドメイン共有が正当な場面もあります。診断はリンク先の文脈を読んで、プロジェクトの制約に照らして判断してください。

### 1.5 CRUD マトリクスで結合を定量化する

エッジは「誰が誰を呼ぶか」を示しますが、**データ結合**（どの usecase がどの resource を読み書きするか）はもう一段細かい結合シグナルです。`usecase` の `resource` に `operations` を書いておくと、`karasu matrix` で usecase × resource の CRUD マトリクスを出せます。

```console
$ karasu matrix index.krs --format md --writes-only
```

サービス分割の観点で見るべきは:

- **複数サービスの usecase が同じ resource に書き込む（ΣC/U/D が高い列）** — 書き込み競合は強い結合シグナル。境界をまたいで同じデータを書いているなら、その resource の所有を 1 サービスに寄せ、他は API 越しに依頼する形を検討する。
- **write-dominates な resource** — 書き込みが支配的な resource は、読み取り専用で共有するより、所有者を明確にすべき候補。
- `--service` で 1 サービスに絞れば、そのサービスが外部 resource にどれだけ依存しているか（列の `[external]`）が見えます。

マトリクスは境界の「データ面」の裏取りで、エッジ（呼び出し面）と合わせて見ると分割の妥当性が立体的に判断できます。詳しい読み方は [オンボーディングガイド §4.4](02-onboarding.ja.md#44-crud-マトリクスで何が何を触るかを一覧する) を参照してください。

---

## 2. 逆コンウェイ戦略 — アーキテクチャに合わせてチームを設計する

サービス境界を引いたら、次は **誰がその境界を所有するか** です。Conway の法則は「ソフトウェアの構造は組織の構造を写す」と述べます。逆コンウェイ戦略（inverse Conway maneuver）は、これを逆向きに使い — **望ましいアーキテクチャを実現するために、意図的にチーム構造を設計しなおす** アプローチです。

karasu にとって組織図はドキュメントではなく **設計判断の対象** です。サービス・ドメインのオーナーシップを図の中に明示することで、「このサービスを分割したい。どのチームが新しい境界を所有すべきか」を、論理構造と同じテーブルで議論できます。

### 2.1 organization / team / owns

`organization` をルートに `team` を入れ子で宣言し、各 team が `owns` で所有する論理ノード（service / domain）を列挙します。§1.2 で引いたサービス境界に、チームを当てはめます。

```krs
organization Shop {
  label "Shop Engineering"

  team discovery {
    label "Discovery（探索体験）"
    description "Stream-aligned: 商品発見〜カートまでの体験フローを一気通貫で所有"
    owns CatalogService
    owns ShoppingService
    owns Catalog
    owns Cart
  }

  team fulfillment {
    label "Fulfillment（受注・在庫）"
    description "Stream-aligned: 注文確定から配送・在庫引き当てまでを所有"
    owns OrderService
    owns InventoryService
    owns Ordering
    owns Shipping
    owns Inventory
  }

  team payments {
    label "Payments（決済）"
    description "Complicated-subsystem: 決済ドメインの専門性を抱えるチーム"
    owns PaymentService
    owns Payment
  }

  team platform {
    label "Platform（基盤）"
    description "Platform team: 通知などの共通能力を他チームに提供する"
    owns NotificationService
    owns Notification
  }
}
```

`owns` は組織と論理/物理を結ぶ関係で、`realizes`（物理と論理を結ぶ）と対称です。これにより三つの面は独立に書けながら、対応関係が常に図の中に現れます。

### 2.2 owns の重複は境界の衝突シグナル

**同じノード id を複数の team が `owns` することはできません** — 重複するとエラー（または警告）になります。これは逆コンウェイの作業中に効く制約です: チームを引き直しているときに 2 チームが同じ service を所有しようとしたら、それは **境界がまだ曖昧で、責任の分界点が決まっていない** というシグナルです。karasu はそれを静的に検出します。

逆に、ある service を所有するチームが居ない（どの `owns` にも現れない）場合は、組織ビューでオーナー不在として浮かび上がります。「このサービスを分割したが、新しい境界の所有者を決めていない」ことに気づけます。

### 2.3 チームトポロジを description で表現する

karasu は team の種別（stream-aligned / platform / enabling / complicated-subsystem といったチームトポロジの語彙）を専用キーワードとしては持ちません。これは意図的で、karasu は特定の組織論を語彙に固定しません。代わりに `description` に一文で書く規約を採ると、チーム間で表記がぶれず、図の読み手と AI が「このチームはどの役割か」を一目で読めます。

- **Stream-aligned team** … ユーザー価値の流れ（探索→購入→受注→配送）に沿って所有する。上の `discovery` / `fulfillment`。
- **Platform team** … 共通能力を他チームに提供する。上の `platform`（通知）。
- **Complicated-subsystem team** … 高い専門性を要する部分を隔離する。上の `payments`（決済）。
- **Enabling team** … 他チームの能力獲得を支援する（横断的、所有よりも支援が主）。

逆コンウェイの実践は「サービス境界（§1）に対して、最小の認知負荷で所有できるチーム分割を探す」作業です。`owns` のまとまりが各チームの認知負荷の代理指標になります — 1 チームが広すぎる範囲を `owns` していたら、それは分割の候補です。

### 2.4 ネストした team で組織階層を表す

`team` は入れ子にでき、親チームの下に子チーム（分隊・オンコール当番など）を置けます。`member` で個人を、`slack` / `github` で連絡先を記述できます。完全な例は [`examples/org/system.krs`](../../examples/org/system.krs) を参照してください。

---

## 3. チームごとに運用するためのファイル分割

サービスとチームの境界が定まったら、**各チームが自分の境界だけを所有・編集できるようにモデルをファイル分割** します。逆コンウェイの帰結をリポジトリのファイル構造にも反映する段階です。

### 3.1 育ててから extract する

karasu の原則は「インラインネストで書き育て、育ったら外部ファイルに extract する」です。最初から完璧なファイル分割を目指す必要はありません。§1〜§2 のように 1 ファイルでモデルを育て、サービス境界が安定してきたらチーム単位でファイルに切り出します。

### 3.2 whole-file import と system 再オープン

1 つの `system` を複数ファイルに分割する canonical な方法は、各ファイルで **同じ id の `system` ブロックを再オープン** し、orchestrator となるファイルが `import "..."` で whole-file import することです（仕様は [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md) の「マルチファイル import の意味論」S2/S3）。

`index.krs`（orchestrator。App / CLI で開く起点ファイル）:

```krs
import "discovery.krs"
import "fulfillment.krs"
import "payments.krs"
import "platform.krs"

system Shop {
  label "オンラインショップ"
  user Customer [human] { label "購入者" }
  Customer -> ShoppingService "買い物をする"
}
```

`fulfillment.krs`（Fulfillment チームが所有するスライス）:

```krs
system Shop {
  service OrderService {
    label "受注・配送"
    domain Ordering {
      label "受注"
      Ordering -> Catalog   "商品情報を引く"
      Ordering -> Inventory "在庫を引き当てる"
      Ordering -> Payment   "決済を依頼する"
      Ordering --> Notification "注文確定を通知する"
    }
    domain Shipping {
      label "配送"
      Shipping -> Ordering "確定注文を引く"
    }
  }
  service InventoryService {
    label "在庫"
    domain Inventory { label "在庫" }
  }
}

organization Shop {
  team fulfillment {
    label "Fulfillment"
    owns OrderService
    owns InventoryService
    owns Ordering
    owns Shipping
    owns Inventory
  }
}
```

他のチーム（`discovery.krs` / `payments.krs` / `platform.krs`）も同じ形で、自分の service と対応する `team` ブロックだけを持ちます。`index.krs` を開くと、4 ファイルが 1 つの `system Shop` に merge され、§1.2 と同一の俯瞰図になります。

マージ規則の要点（S3）:

- **同名 system は 1 つに merge** される。children（service / domain / edge）は id ごとに union。
- **system 本体プロパティ**（`label` など）は **import グラフの root に近いファイルが勝つ**。上の例では `index.krs` の `label "オンラインショップ"` が採用され、各スライスが別のラベルを書いていても上書きされます。「いま開いているファイル」が自然と俯瞰メタデータの source of truth になります。
- `organization` / `deploy` ブロックも whole-file import で同時に伝搬し、同名なら union されます（S4）。各チームが自分の `team` ブロックを自分のファイルに書けば、`index.krs` で 1 つの組織図に統合されます。

> **CODEOWNERS との対応**: このファイル分割は、リポジトリの `CODEOWNERS` と 1 対 1 で対応させられます。`fulfillment.krs` を Fulfillment チームの所有にすれば、モデル上のオーナーシップ（`owns`）とリポジトリ上のレビュー権限が一致し、逆コンウェイの境界がそのまま PR フローに乗ります。

### 3.3 各スライスを単独でレンダリングできるようにする

各チームファイルを App で単独に開いたとき、**他チームのドメインを指すエッジ** はどう扱われるでしょうか。`fulfillment.krs` の `Ordering -> Catalog` は、`Catalog` が同ファイルに無いため、単独レンダリング時には endpoint が未解決になります。

karasu はこのとき edge を drop して `unresolved-edge-endpoint` 警告を出しますが、**解決できた側のノード（`Ordering`）は drop しません**（S6）。つまり単独でも図は壊れず、欠けるのは外部への矢印 1 本だけです。`index.krs` 経由でマージすればその矢印も復活します。

外部参照を単独でも解決したい場合は、参照先スライスを import します。ネストしたノード（service 内の domain など）を named import するには **ドット区切りパス** を使います:

```krs
// fulfillment.krs の冒頭に追加すると、単独でも Catalog が解決する
import { Shop.CatalogService.Catalog } from "discovery.krs"
```

`index.krs` が `discovery.krs` と `fulfillment.krs` の両方を whole-file import し、`fulfillment.krs` も `discovery.krs` を named import する形は **DAG（有向非巡回グラフ）** であって循環ではありません。同じファイルが複数経路で到達されても `circular-import` 警告は出ません（S5）。警告が出るのは、あるファイルが自分自身を直接・間接にロードバックする **真の循環** のときだけです。

### 3.4 共有インフラは専用ファイルに 1 度だけ

複数のスライスが共有する `database` / `queue` / `storage` は、専用の infra ファイルに 1 度だけ宣言し、使う側のスライスが `import "infra.krs"` で取り込むのが canonical なパターンです。これにより各スライスが単独でもデータストア参照を解決でき、共有インフラが「どこに住んでいるか」の曖昧さが無くなります。完全な動作例は [`examples/multi-file-system/`](../../examples/multi-file-system/)（`infra.krs` + reader / editor / moderation の 3 スライス）を参照してください — このガイドの §3 全体を end-to-end で実演しています。

---

## 4. 三面を一周させる — realizes でデプロイにつなぐ

論理（サービス境界）と組織（チーム）を結んだら、物理面を `deploy` + `realizes` で足すと三面が揃います。`realizes` は物理（具象）→ 論理（抽象）の向きで「このデプロイ単位がこのサービスを実現する」を宣言します。

```krs
deploy Production {
  label "本番環境"
  oci orderContainer {
    image   "order-service:1.0.0"
    runtime "Docker"
    realizes OrderService
  }
}
```

`deploy` も whole-file import で伝搬する（S4）ため、各チームが自分のスライスファイルに自分の `deploy` 単位を書けます。`multi-file-system` の例では reader / editor / moderation の各ファイルがそれぞれ `oci` を宣言し、`index.krs` で 1 つの本番デプロイ図に union されます。

こうして一周します:

```
ドメイン依存（§1）
  → サービス境界（implicit edge / 循環検査で検証）
    → チーム所有（§2: owns / 逆コンウェイ）
      → ファイル分割（§3: 各チームがスライスを所有）
        → デプロイ（§4: realizes）
```

三面が同じ `.krs` の語彙で、同じドリルダウンの中に乗るため、サービスを切り直すと「どのチームが新境界を持つか」「どのデプロイ単位が動くか」が同じモデルの上で連動して見えます。これが karasu の狙う **三面の交点での設計** です。

---

## 5. アンチパターンと診断の読み方

karasu の診断は「fact（モデルの内部整合性）」と「style（ある流派から見た smell）」を register で区別します。境界設計の文脈での読み方:

| 診断 | 段 | 境界設計での読み方 |
|------|----|----|
| 循環依存 `[cyclic]`（sync のみ） | warning | サービス境界をまたぐ sync 循環 = まだ癒着している。境界を引き直すか、片方を非同期化する |
| `domain-dispersal` | info | 1 ドメインを複数 service に割った。凝集性のシグナル（DDD 観点）。意図的なら無視可 |
| `infra-redeclared-across-files` | info | 同じ DB を複数ファイルで宣言。Database-per-Service 観点の smell。共有が正当なら無視可 |
| `owns` 重複 | error/warning | 2 チームが同じノードを所有。境界の責任分界が未確定 |
| `unresolved-edge-endpoint` | warning | スライス単独レンダリングで外部参照が未解決（S6、ノードは保持）。merge すれば解消 |
| `unassigned-database` | warning | `database` が `system` の外にある。`system` 直下（または再オープン）に置く |

`info` 段の診断は **「karasu が何か気付いた — 文脈上気になるなら読み、気にならなければ無視してよい」** と読みます。karasu はスタイル違反を理由に render を拒否しません。共有 DB も複数サービスにまたがる domain も、構造として妥当なら忠実に描き、判断はプロジェクトの制約を知るあなたに委ねます。

---

## さらに学ぶ

- 関連ガイド: [オンボーディング](02-onboarding.ja.md)（読解）/ [進化・移行](03-evolution.ja.md)（変更）/ [伝達](05-communicating-diagrams.ja.md)（スタイル・凡例・CI）/ [アクセス経路とクライアント](04-access-paths.ja.md)
- ガイド全体の地図: [`docs/guide/README.md`](README.md)
- 構文の正確な仕様: [`docs/spec/syntax.ja.md`](../spec/syntax.ja.md)
- スタイル（`.krs.style`）: [`docs/spec/style.ja.md`](../spec/style.ja.md)
- タグ・アノテーション一覧: [`docs/spec/tags-annotations.ja.md`](../spec/tags-annotations.ja.md)
- 設計思想（三面構造・scoped glance・逆コンウェイの動機）: [`docs/concepts.ja.md`](../concepts.ja.md)
- 動く複数ファイル例: [`examples/multi-file-system/`](../../examples/multi-file-system/)
- 組織図の完全例: [`examples/org/system.krs`](../../examples/org/system.krs)
- 段階的チュートリアル: [`examples/ec-platform/`](../../examples/ec-platform/)（`01-system.krs` から順に）
