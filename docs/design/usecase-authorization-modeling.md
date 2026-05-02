# ユーザー属性ベースの usecase 認可モデリング

- **日付**: 2026-05-01
- **ステータス**: 検討中（Q0 = A/B 二択を保留中）
- **関連**:
  - Issue #832（本検討の起点）
  - ADR-20260428-06（client / MCP modeling — `role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を将来語彙として予約）
  - ADR-20260429-07（client capability modeling — capability と policy の区別、open-set 方針）
  - `docs/spec/syntax.md`（`user.role`、`usecase`、タグ・アノテーション機構）
  - `docs/concepts.md`（論理 / 物理分離）

---

## 背景・課題

karasu は現在、`user [human|ai] { role "<name>" }` という形で**単一のロール**だけを表現できる。
一方、現代のプロダクトは usecase の実行可否を以下の組み合わせで判断するのが普通である:

- **ロール** — `Admin` だけが `RefundOrder` を実行可能
- **ライセンス / プラン** — `AdvancedAnalytics` は `enterprise` プラン契約者のみ
- **グループ / コホート** — `BetaFeature` は `beta-tester` グループ所属者のみ
- **組み合わせ** — `OverrideShipping` は `admin` AND `pro` プラン

今の karasu では:

1. usecase 側に「実行に必要な属性」を宣言する手段がない
2. user 側にロール以外の属性（プラン・ライセンス・グループ）を宣言する手段がない

結果として、図を読んだ人が「どの user が、どの usecase を呼べるのか」を判断できない。

これは **モデリング / コミュニケーション** の問題であって、ランタイム enforcement
（OPA / Cedar / Casbin の代替）を作る話ではない。図を読めば「ここは admin 限定」「ここは pro プラン以上」と
**伝わる**ようにしたい、というのがゴール。

ADR-20260428-06 で `role` / `license` / `group` / `plan` / `requires` / `allows` / `policy` を
将来の認可語彙として**予約**してあるので、語彙衝突は避けられている。本ドキュメントは
このうちどれを採用するか、**そもそも採用すべきか**を決める。

## 制約・前提

- C1: **モデリング目的に閉じる**。runtime IAM は別物。表現力は「読み手に伝わる」レベルで十分。
- C2: **ID + 属性の二段構成は維持する**。user / usecase の id は今のまま。属性だけが増える。
- C3: **`client.handles` (UI 上の枠)** との関係を整理する。ADR-20260428-06 の
  方針通り、`handles` (UI 露出) と認可 (実行可否) は**直交する二段チェック**として扱う。
- C4: **後方互換**。既存の `user.role "name"` を壊さない。新語彙が増えるだけにする。
- C5: **語彙の予約は ADR-20260428-06 で済んでいる**。本ドキュメントでは新語彙を
  追加で予約する場合のみ ADR を更新する。
- C6: **オープンセット**。ロール名・プラン名・グループ名はユーザー定義の自由文字列
  （capability と同じスタンス、ADR-20260429-07）。controlled vocabulary は持たない。
- C7: **既存の装飾チャンネル（タグ・アノテーション）を汚さない**。タグは「これは何の kind か」、
  アノテーションは「ライフサイクル / 出自」の装飾と用途が定まっており、認可ゲートを
  そこに混ぜると概念のホームを侵食する（後述）。

---

## Q0: そもそも karasu の言語に組み込むべきか

検討の途中で、語彙ブレ・属性体系の汎化困難・装飾チャンネルとの不整合を順に潰していった結果、
**選択肢が二極化**した。中間案（タグ / アノテーション流用）はどれも既存セマンティクスを
汚すため除外。詳細は後段の「中間案がなぜ機能しないか」「経緯（語彙設計の探索ログ）」を参照。

到達した二択:

### 案A: 専用機構として first-class に組み込む

`user_attributes` ブロックでモデル毎に属性語彙を**宣言**し、`requires` 述語で参照する
（後述「案A 詳細」）。

- ✅ #832 の課題に正面から答える（machine-checkable）
- ✅ レンダリング affordance を作れる（🔒 バッジ等）
- ✅ アノテーション / タグの意味論を汚さない
- ❌ 言語表面が増える（新ブロック + 述語 + 横断バリデータ）
- ❌ 述語式言語が tar pit 化するリスクは依然存在
  （AND 限定 + 宣言済み属性のみ参照、で抑え込む設計が必須）

### 案B: 言語に組み込まず、表現は既存手段に委ねる

```
usecase RefundOrder {
  label "Refund an order"
  description "Admin only — see policy doc"
  link "https://policy.example.com/refund" "Authorization policy"
}
```

- ✅ 言語複雑度ゼロ、tar pit 回避
- ✅ 認可は IAM ツール（OPA / Cedar）の権威に委ねる分業が明示される
- ✅ karasu は「アーキテクチャの伝達」に焦点を保てる
- ❌ machine-checkable な「誰が何を呼べるか」は得られない
- ❌ #832 の元の課題（図を読んで判断できる）には部分解にしかならない
- ⚠️ B を選ぶなら、`description` の書きぶりがチーム間でばらつかないよう
  spec に慣習を明文化する必要がある（語彙ブレ問題が `description` の自由文に逃げ込むだけになる）

### 判断の軸

| 哲学 | 結論 |
|---|---|
| 「karasu は伝達ツール、formal な検証は外部に委ねる」 | **B** |
| 「karasu は論理 / 物理を厳密に分離するのと同じ強さで、認可境界も first-class で表現すべき」 | **A** |
| 「C4 Model も authz を扱わない。karasu はそれより一歩踏み込むべきではない」 | **B** |
| 「現代の SaaS / B2B では authz が figure を歪める要因として無視できない」 | **A** |

### 設計者所感（暫定）

肌感は **B 寄り**:

1. karasu の他の語彙（system / domain / usecase / resource / client）は
   「物がそこにある」系の概念で、検証可能性が自然にある
2. 一方 authz は「ある条件のときだけ通る」系の概念で、本質的に dynamic。
   static な構文に押し込むと表現力 vs 複雑度の悪いトレードオフになりやすい
3. `description` + `link` は既存機構なので、ユーザーは今すぐ書ける。
   これで #832 の 80% は解決する可能性がある

ただし karasu が「論理 / 物理分離をここまで強く主張してきたのに、authz だけは
逃げる」と取られる可能性もあり、この軸は哲学的判断を要する。

**結論は保留**。一晩おいて A / B のどちらかを選び、選んだ側だけを ADR 化する。

---

## 案A 詳細（採用された場合の設計）

A を採るなら、以下の設計を出発点にする。B を採る場合はこのセクション全体を破棄。

### A.1 user 属性の宣言モデル

system / organization スコープで使う属性を**先に宣言**する:

```
system ECPlatform {
  user_attributes {
    plan      single   // 単一値属性
    cohorts   multi    // 集合値属性
    region    single
  }

  user Customer [human] {
    roles   ["customer"]
    plan    "pro"
    region  "apac"
    cohorts ["beta-tester"]
  }
}
```

- `roles` は**ビルトイン**として常時利用可能（`user_attributes` 宣言不要）
- それ以外の属性は宣言済みでなければ user 側で書けない（typo はバリデーションエラー）
- `single` / `multi` の 2 種のみ。階層・順序・型修飾は持たない
- 既存の `role "name"` は `roles ["name"]` の糖衣として残す

### A.2 `requires` 述語

```
usecase RefundOrder {
  requires role = "admin"
}
usecase AdvancedAnalytics {
  requires plan in ["pro", "enterprise"]
}
usecase OverrideShipping {
  requires role = "admin" and plan = "enterprise"
}
```

文法（最小):

- `<attr> <op> <value>` を `and` で繋ぐ
- `<op>` = `=`, `!=`, `in`, `not in`
- `or` / `not` / 比較演算子 / ネスト式は MVP では入れない
- 1 usecase につき `requires` は 0 または 1 行（複数行 AND は混乱の元）
- 参照する属性は `user_attributes` で宣言済みのもののみ（`role` はビルトイン）

### A.3 バリデーション

| カテゴリ | 内容 |
|---|---|
| `attribute-undeclared` | user 側で宣言外の属性を書いた、または requires で参照した |
| `usecase-requires-unsatisfiable` | どの user も満たせない requires（typo 検出） |
| `usecase-requires-violated-by-edge` | edge で繋いだ user が requires を満たさない（警告） |

### A.4 レンダリング

- usecase カードに **🔒 ×N** 制約バッジ（capability / resource と同じパターン）
- `NodeDetailPanel` で requires 式を全文表示
- user カードに `roles` / 宣言済み属性のサマリ行
- ホバー時の「この user × usecase が満たすか」描画は MVP 範囲外（組み合わせ爆発回避）

### A.5 `client.handles` との関係

ADR-20260428-06 の方針どおり、UI 露出（`handles`）と実行可否（`requires`）は
独立に検証される。両方の警告カテゴリ（`client-handles-not-exposed` と
`usecase-requires-unsatisfiable`）は分離。組み合わせ警告は需要が顕在化したら別 Issue。

### A.6 `policy` ブロック（将来）

`user_attributes` + `requires` で局所性は確保されるが、横断ルール（「経理ドメインは全部 admin」）
の DRY 需要が出てきたら、`policy` ブロックを後付けで追加できる。
キーワードは ADR-20260428-06 で予約済みのため非破壊的に追加可能。

---

## 中間案がなぜ機能しないか

検討初期に挙がった「軽量な中間案」は、いずれも karasu の既存セマンティクスと衝突するため
**棄却**。同じ議論を将来繰り返さないようにここに記録する。

### × 案C: エッジアノテーション (`Admin -> RefundOrder @allowed`)

- 組み合わせ爆発（user 数 × usecase 数のエッジが必要）
- 属性ベースのルール（「pro プラン以上なら誰でも」）を自然に表現できない
- → **早期棄却**

### × タグ流用 (`usecase RefundOrder [restricted]`)

- karasu のタグは `[human]` / `[mobile]` / `[external]` のように
  「**これは何の kind か**」を示す**分類子**として用途が確立している
- 「制限されている」は kind 分類ではなく**条件付け**であり、概念のホームが違う
- どの role / plan で制限しているかも tag 一語では表せない

### × アノテーション流用 (`@requires-role(admin)`)

- karasu のアノテーション (`@external`, `@deprecated` 等) は
  **ノードのライフサイクル / 出自を装飾する**用途に揃っている
- 認可ゲートは「ライフサイクル」ではなく「実行時条件」で、意味が違う
- アノテーションをこの用途に開放すると、装飾チャンネルが多義化して
  既存ノードの読解負担が上がる

### × 自由属性 (`attribute "<key>" "<value>"`)

- `attribute` を野放しに許すと、`tier` / `level` / `grade` が同居しはじめ
  チーム間の語彙ブレ問題が attribute の中に**移動するだけ**
- karasu が想定する「読めば伝わる」が破綻する

→ 結果、**既存装飾チャンネルへの相乗りは不可能**。やるなら専用機構（案A）、
やらないなら言語に組み込まない（案B）の二択になる。

---

## 経緯（語彙設計の探索ログ）

最初の検討で出した複数案を、議論の順に圧縮して記録する。
最終結論（A/B 二択）に到達するまでの思考の流れ。

### Step 1: 三案の素朴な比較

最初に出した三案:

- **案A (`requires` 述語)**: usecase 内に直接書く。読みやすいが式言語が要る
- **案B (`policy` ブロック)**: 第三軸の独立ブロック。一覧性は高いが語彙が大きい
- **案C (エッジ)**: 既存機構の延長。組み合わせ爆発で早期棄却
- 暫定方針: A から始めて、横断需要が出たら B を後付け

### Step 2: 語彙ブレ問題の発見

`role` / `license` / `plan` / `group` / `policy` は SaaS / IAM 業界でも定義が揺れる:

| 語彙 | 揺れの典型例 |
|---|---|
| `role` | RBAC 的「権限の束」 vs ビジネスロール vs 職種 |
| `group` | ユーザー集合（cohort）vs 組織グループ vs 認可単位 |
| `plan` | 単一契約レベル vs 機能パック vs 課金単位 |
| `license` | 1ユーザー利用権 vs 機能アドオン vs プラン |
| `policy` | OPA/Cedar の「ルール」vs IAM の「権限セット」vs 組織方針 |

karasu が typed core vocabulary としてこれらを採用すると、チームごとに解釈ブレが起きる
リスクがあると判明。

### Step 3: plan の階層性問題

`plan` を単一値として扱うと、よくある「pro 以上」を `requires plan in ["pro", "enterprise"]`
と enumerate する羽目になる。さらに plan 構造はプロダクトごとにまったく違う:

| プロダクト型 | 構造 | 階層的か |
|---|---|---|
| Notion / GitHub | Free → Pro → Enterprise | 線形 |
| Atlassian | Tier × Seats × Addons | 多次元 |
| Stripe | Product 単位の課金、tier なし | 非階層 |
| AWS | 従量制、plan という概念がない | 該当しない |

→ `plan` を typed first-class にすると、**多次元 / 非階層プロダクトに合わない**ミスマッチが構造的に発生。

### Step 4: 「ロール以外は `attribute` に逃がす」案

`roles[]` だけコアに残し、それ以外は `attribute "<key>" "<value>"` で表現する案。
karasu は `plan` 等の意味論を持たず、ユーザーが自分のドメイン語彙で書ける。

→ しかし「`attribute` は汎用的すぎてなんでも設定できる」と批判。
チーム内で `tier` / `level` / `grade` が同居すると、語彙ブレ問題が `attribute` の中に
**移動しただけ**になる。junk drawer 化のリスク。

### Step 5: 宣言型属性スキーマ案 (= A.1 の原型)

system / organization 冒頭で **使う属性を一度宣言**し、user 側はそれに従う方式。

- karasu は意味論を持たない（`plan` が階層的かは利用者が決める）
- チーム内ブレが構文で防げる（宣言外の属性はバリデーションエラー）
- karasu の既存設計思想（先に宣言してから関連を書く）と整合
- `roles` だけビルトインにすれば最小例の書き味は今と同じ

→ これが現時点の **案A 採用時の設計**（A.1 〜 A.5）。

### Step 6: そもそも組み込むかの問い (= Q0)

ここまで設計を磨いた上で、根本的な問い:
「karasu の language footprint をここまで広げる価値があるのか?」

- karasu の過去の語彙追加は「狭くスコープした kind 追加」が中心
- 案A は「横断的なルール記述基盤」であり、**追加の形が違う**
- 一度入れると `or` / `not` / 比較演算子 / 時刻条件 …と要求が滑り落ちる tar pit

中間案（タグ / アノテーション流用）が**既存セマンティクスを汚す**ため使えないことも判明
（前章「中間案がなぜ機能しないか」）。

→ 選択肢が **A（first-class 機構）/ B（言語に入れず既存手段に委ねる）の二極化**。
   **判断は保留**。

---

## 具体例（案A 採用前提のサンプル）

判断後に必要なら spec / examples に展開する材料として残す。

```
system ECPlatform {
  user_attributes {
    plan      single
    cohorts   multi
    region    single
  }

  user Customer [human] {
    roles ["customer"]
    plan  "free"
  }
  user ProCustomer [human] {
    roles ["customer"]
    plan  "pro"
  }
  user Admin [human] {
    roles ["admin"]
    plan  "enterprise"
  }
  user BetaTester [human] {
    roles   ["customer"]
    plan    "pro"
    cohorts ["beta-tester"]
  }

  service ECommerce {
    domain Order {
      usecase PlaceOrder { label "Place an order" }
      usecase RefundOrder {
        label "Refund an order"
        requires role = "admin"
      }
      usecase AdvancedAnalytics {
        label "Analytics dashboard"
        requires plan in ["pro", "enterprise"]
      }
      usecase OverrideShipping {
        label "Override shipping"
        requires role = "admin" and plan = "enterprise"
      }
      usecase BetaCheckout {
        label "New checkout flow"
        requires cohorts in ["beta-tester"]
      }
    }
  }
}
```

## スコープ外（明示）

- ランタイム認可（OPA / Cedar / Casbin への export 等）
- リソースレベル ABAC（行単位 / レコード単位）。**usecase 粒度に留める**
- 認証フロー（OAuth2 / OIDC 等）— ADR-20260428-06 と Issue #834 で扱う
- 動的属性（時刻・地理・端末状態）。MVP は静的属性のみ
- 階層付き属性（`>=` 演算子等）。多次元プロダクトと合わないため、最初から導入しない

## 未解決の問い

### Q0（最重要・保留中）
- **A / B のどちらを採るか**。一晩おいて判断する
- 判断後、選んだ側のみを ADR 化する（採用しない側は本ドキュメントに却下記録として残る）

### B を採る場合のフォローアップ
- `description` の書きぶり指針を spec に明文化する（語彙ブレを `description` の自由文に
  逃がさないため）
- `link` で外部 policy doc を参照する慣習をテンプレ化するか
- レンダラ側で「authz らしき情報がある usecase」をヒューリスティックに
  視覚化するか（しないのが素直）

### A を採る場合のフォローアップ
- `single` / `multi` 以外の型修飾は本当に不要か
- `requires` の OR / NOT を入れる将来トリガー条件を spec に書くか
- 別 system / organization 横断で属性を共有する仕組みは要るか
- `policy` ブロック（横断ルール）を後付けする閾値はどこか
- レンダラ側 🔒 バッジの仕様確定（別 AT で扱う）
