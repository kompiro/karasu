# ユーザー属性ベースの usecase 認可モデリング

- **日付**: 2026-05-01
- **ステータス**: 検討中 → **B-strict（一旦やらない）に収束**。ADR 化候補
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
- C4: **後方互換は重視するが絶対ではない**。当初は「既存の `user.role "name"` を壊さず
  新語彙が増えるだけ」を前提にしていたが、検討の結果（後述）、`user.role` 自体の二義性が
  問題の一部と判明したため、`user.role` の見直しは別 Issue で扱う余地を残す。
- C5: **語彙の予約は ADR-20260428-06 で済んでいる**。本ドキュメントの結論（B-strict）では
  新語彙を追加しないため、予約語彙の位置づけ（「将来 authz 用」→「衝突回避用」）を ADR で改める。
- C6: **オープンセット**。ロール名・プラン名・グループ名はユーザー定義の自由文字列
  （capability と同じスタンス、ADR-20260429-07）。controlled vocabulary は持たない。
- C7: **既存の装飾チャンネル（タグ・アノテーション）を汚さない**。タグは「これは何の kind か」、
  アノテーションは「ライフサイクル / 出自」の装飾と用途が定まっており、認可ゲートを
  そこに混ぜると概念のホームを侵食する（後述）。

---

## Q0: そもそも karasu の言語に組み込むべきか

検討の途中で、語彙ブレ・属性体系の汎化困難・装飾チャンネルとの不整合を順に潰し、
さらに concepts 整合性レビュー（後述 Step 7）で「user 属性宣言」と「`requires` 述語」を
**性質が違うもの**として分離した。中間案（タグ / アノテーション流用）はいずれも既存
セマンティクスを汚すため除外している（後段「中間案がなぜ機能しないか」参照）。

検討の結論として、**B-strict — authz は language に入れず、ロールを含めすべて
`description` + `link` に委ねる — に収束**した（後述「結論」参照）。決め手は

- `requires` のような machine-checkable なゲート構文は **validate → codegen の重力源**になり、
  concepts の非目標「モデルからコードは生成しない」と `translate` の情報非対称性に正面から抵触する
- half-A（属性宣言だけ入れる）も、宣言 → typo バリデータ → 「照合がないのは半端」→ `requires`、
  という滑り台の途中で一旦止まるだけで、滑り台そのものは残る
- 既存の `user.role` ですら "actor archetype" と "RBAC 権限の束" の二義を抱えており、
  後者を呼び込む gateway になりうる（後述「`user.role` の再検討」）

以下、検討した選択肢を A → half-A → B（B-soft / B-strict）の順に記録する。

### 案A: 専用機構として first-class に組み込む（属性宣言 + 述語）

`user_attributes` ブロックでモデル毎に属性語彙を**宣言**し、`requires` 述語で参照する
（後述「案A 詳細」A.1〜A.6 全体）。

- ✅ #832 の課題に正面から答える（machine-checkable）
- ✅ レンダリング affordance を作れる（🔒 バッジ等）
- ✅ アノテーション / タグの意味論を汚さない
- ❌ 言語表面が増える（新ブロック + 述語 + 横断バリデータ）
- ❌ 述語式言語が tar pit 化するリスクは依然存在
  （AND 限定 + 宣言済み属性のみ参照、で抑え込む設計が必須）
- ❌ `requires` は「ある条件のときだけ通る」を扱うため、
  `docs/concepts.ja.md` の非目標「振る舞い・シーケンス・時系列はモデリングしない」と
  同じ家系の関心事であり、コンセプト原則と摩擦する
- ❌ **validate → codegen の重力源**。`requires plan in [...]` は machine-checkable なので、
  `usecase-requires-unsatisfiable` バリデータ → 「だったら OPA / Cedar に export できる」と
  滑っていく。これは非目標「モデルからコードは生成しない」と、`translate`（code→model のみ、
  情報は抽象が上がる方向にしか流さない）の非対称性に正面から抵触する

### 案 half-A: user 属性宣言だけ入れ、`requires` 述語は入れない

A.1（属性宣言モデル）だけを採用し、A.2 の `requires` 述語は採用しない。
usecase 側の「誰が呼べるか」表現は案B と同様に `description` + `link` に逃がす。

```
system ECPlatform {
  user_attributes {
    plan    single
    cohorts multi
  }
  user Customer [human] { roles ["customer"]; plan "free" }
  user Admin    [human] { roles ["admin"];    plan "enterprise" }

  service ECommerce {
    domain Order {
      usecase RefundOrder {
        label "Refund an order"
        description "Admin only — see policy doc"
        link "https://policy.example.com/refund" "Authorization policy"
      }
    }
  }
}
```

- ✅ **構造的情報と条件式情報を分離できる**。user 属性は「誰が何を持っているか」という
  *持ち物の構造*で、`organization → team → member` の「誰が所有するか」と同じ系の概念。
  対して `requires` は条件式で性質が違う。前者だけ取り込むのは
  「ゆっくり変化する構造的な文脈」フィルタに正面から沿う
- ✅ user 側の語彙ブレを宣言型スキーマで防げる（半分の効果は確保）
- ✅ tar pit 完全回避（述語式言語そのものが存在しない）
- ✅ 既存 `role "name"` の自然な拡張で、書き手のメンタルモデル変化が小さい
- ✅ `client.handles` との直交性が自然に保たれる（条件式同士が衝突しない）
- ❌ usecase 側「誰が呼べるか」は依然として description の自由文 — B と同じ問題が残る
- ❌ machine-checkable なゲート判定は得られない（属性 typo 検出までは効く）
- ❌ **滑り台の途中で止まるだけ**。`user_attributes` 宣言を入れた瞬間「typo を検出する」
  バリデータが付き、すると「宣言だけあって照合がないのは半端」→ `requires` 述語 → `policy`
  ブロック、と引っ張られる。half-A は滑り台そのものを撤去しない
- ⚠️ 「属性宣言だけあるのに照合する仕組みがない」非対称さに違和感を覚える読み手はいる

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

B はさらに、既存の `user.role` キーワードをどう扱うかで二つに分かれる:

- **B-soft**: `user.role` は残す。ただし spec で「これは *actor archetype* ラベルであり
  authz プリミティブではない」と明示的に縛り、それ以上の authz 詳細（plan / license /
  cohort / requires）は language に入れない。後方互換・最小変更。
- **B-strict**: `user.role` も再検討対象に含める（deprecate 方向）。authz 系の情報は
  ロールも含めてすべて `description` + `link` に逃がす。一貫性は最強だが、既存 spec /
  examples の変更が要る。

> "role" という単語自体が "RBAC の権限の束" を誘発するため、B-soft でも「actor archetype」と
> いう縛りが緩むと再び gateway 化する。B-strict はその曖昧さごと断つ選択。

### 判断の軸

| 哲学 | 結論 |
|---|---|
| 「karasu は伝達ツール、formal な検証は外部に委ねる」 | **B** |
| 「karasu は論理 / 物理を厳密に分離するのと同じ強さで、認可境界も first-class で表現すべき」 | **A** |
| 「C4 Model も authz を扱わない。karasu はそれより一歩踏み込むべきではない」 | **B** |
| 「現代の SaaS / B2B では authz が figure を歪める要因として無視できない」 | **A** |
| 「user の *持ち物* は構造、`requires` の *条件式* は振る舞い。前者は取り込み、後者は外に出す」 | **half-A** |
| 「属性宣言だけあっても照合が機械化されないなら半端 — 入れるなら全部、入れないなら何も入れない」 | **A or B** |
| 「machine-checkable なゲート構文は validate → codegen の重力源。karasu に持ち込まない」 | **B** |
| 「"role" の二義（archetype vs RBAC）を断つには role 自体も description に逃がす」 | **B-strict** |

### 設計者所感（収束）

**B-strict — 一旦やらない** に寄せる。理由:

1. karasu の他の語彙（system / domain / usecase / resource / client / team）は
   「物がそこにある」「誰が持っているか」系で、検証可能性が*構造から自然に*出てくる。
   authz のゲート判定は逆で、構文を盛らないと machine-checkable にならない — その盛り方が
   そのまま実装側への重力（validate → OPA/Cedar export → codegen）になる
2. `requires` 述語は非目標「振る舞い・シーケンス・時系列はモデリングしない」と同じ家系。
   static 構文に押し込むと表現力 vs 複雑度の悪いトレードオフ + tar pit
3. half-A は構造的部分（user 属性）だけ取り込む筋の良い妥協に見えたが、`user_attributes`
   宣言 → typo バリデータ → 「照合がないのは半端」→ `requires` という滑り台の途中で
   止まるだけ。滑り台そのものを撤去するには「何も入れない」しかない
4. 既存の `user.role` も "actor archetype" / "RBAC 権限の束" の二義を抱え、後者が `requires` を
   呼び込む gateway になる。B-strict はこの曖昧さごと断つ
5. `description` + `link` はユーザーが今すぐ書ける。#832 の「図を読んで誰が何を呼べるか
   判断できる」は、散文 + 外部 policy doc へのリンクで実務上は満たせる範囲が大きい

ただし karasu が「論理 / 物理分離をここまで強く主張してきたのに authz だけは逃げる」と
取られうる点は残る。これに対する答えは「**authz は dynamic な実行時関心であって、karasu が
扱う『ゆっくり変化する構造的な文脈』の外側にある**」— DB スキーマ設計やシーケンス図を
スコープアウトしたのと同じフィルタの適用、と整理する。

**この方針（B-strict / 一旦やらない）を ADR 化候補とする。**

---

## 案A 詳細（却下案の設計記録）

> ⚠️ 検討の結論は **B-strict（一旦やらない）**。以下は **採用されなかった** 案A / half-A の
> 設計を、将来同じ検討を蒸し返さないために残すもの。B-strict を覆す決定が出ない限り実装対象ではない。

A を採るなら以下の A.1〜A.6 全体を出発点にする。
**half-A を採るなら A.1 のみ採用**し、A.2〜A.4 と A.6 は破棄、A.5 は「属性は宣言するが
ゲートは別チェック」として残す。

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
B-strict（一旦やらない）に到達するまでの思考の流れ。

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

→ 選択肢が **A（first-class 機構）/ B（言語に入れず既存手段に委ねる）の二極化**、と
   ここまでは見えていた。

### Step 7: concepts 整合性レビューによる half-A の発見

Q0 を立てた後、`docs/concepts.ja.md` に照らして二択を再評価したところ、
**A.1（属性宣言）と A.2（`requires` 述語）は karasu のコンセプト的に性質が違う**ことが
浮かび上がった:

- A.1 の user 属性（roles / plan / cohorts）は「誰が何を持っているか」という
  **持ち物の構造**。`organization → team → member` の「誰が所有するか」と同じ家系で、
  「ゆっくり変化する構造的な文脈」フィルタに正面から収まる
- A.2 の `requires` 述語は「ある条件のときだけ通る」**条件式**。非目標
  「振る舞い・シーケンス・時系列はモデリングしない」と同じ家系で、
  static 構文に押し込むと tar pit リスクと抽象度ミスマッチが両方発生する

両者を一塊で A として扱うと、構造的に取り込めるはずの A.1 まで A.2 の摩擦を共有して
B に押し戻されてしまう。逆に分離すれば **half-A**（A.1 のみ）が独立した選択肢として成立する。

これにより Q0 は **A / half-A / B の三択** に再構成された。

### Step 8: B-strict への収束

三択を「validate / codegen への重力」という軸で再評価したところ:

- `requires` は machine-checkable ゆえに `usecase-requires-unsatisfiable` バリデータを呼び、
  さらに「OPA / Cedar に export できる」へ滑る。これは非目標「モデルからコードは生成しない」と
  `translate` の情報非対称性（抽象が上がる方向にしか流さない）に正面から抵触する
- half-A も「`user_attributes` 宣言 → typo バリデータ → 照合がないのは半端 → `requires`」
  という滑り台の途中で止まるだけで、滑り台そのものは残る
- 既存の `user.role` ですら "actor archetype" / "RBAC 権限の束" の二義を抱え、後者が `requires` を
  呼び込む gateway。曖昧さを断つには role 自体も `description` に逃がす（後述「`user.role` の再検討」）

→ 「authz は dynamic な実行時関心であり、karasu が扱う『ゆっくり変化する構造的な文脈』の
   外側」という整理に落ち着く。DB スキーマ設計・シーケンス図をスコープアウトしたのと同じフィルタ。
   **B-strict（一旦やらない）を ADR 化候補とする。**

---

## `user.role` の再検討（B-strict が含意するもの）

B-strict は新語彙を入れないだけでなく、**既存の `user.role` も見直し対象に含める**。

`role` という語は二つの意味を抱えている:

- **actor archetype ラベル** — 「この system には customer / admin / support の 3 種のユーザーがいる」。
  `[human]` / `[ai]` タグの細分化で、構造的。これだけなら残しても害は小さい
- **RBAC の権限の束** — 「admin role が refund 権限を持つ」。実装側の概念で、これを表に出すと
  「じゃあ usecase 側に `requires role = ...` を」という滑り台の入口になる

karasu の `user.role` は前者のつもりで入った気配があるが、"role" という単語自体が後者を
誘発する。Step 2 で見つけた語彙ブレ問題が、`role` という既存キーワードの中に既に潜んでいる。

選択肢:

- **B-soft**: `role` を残し、spec で「actor archetype ラベル、authz プリミティブではない」と
  明示的に縛る。後方互換・最小変更。ただし縛りが緩むと再び gateway 化するリスクは残る
- **B-strict（収束先）**: `role` を deprecate 方向で再検討。「この user は customer 型」程度の
  分類は `description` か、必要なら別途「actor archetype」専用の軽い仕組み（タグ的なもの）で
  扱い、authz 系の含意を持つ語は language から外す

B-strict を採る場合の作業は別 Issue / 別 PR に切り出す（既存 spec・examples・パーサに
影響するため、本 design doc の ADR 化とは分離する）。本 doc では「`user.role` も再検討対象」と
方向性を記録するに留める。

---

## 具体例（案A 採用前提のサンプル — 却下案の設計記録）

> ⚠️ これは **採用されなかった** 案A の設計サンプル。上の「案A 詳細」とともに、将来同じ検討を
> 蒸し返さないために残す。B-strict を覆す決定が出ない限り実装対象ではない。

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

## 結論

**B-strict — authz は karasu の language に入れない。** usecase 側の「誰が呼べるか」は
`description` + `link`（外部 policy doc 参照）で表現し、`user.role` も含めて authz の含意を
持つ語を language に持ち込まない。理由は「設計者所感（収束）」節と Step 8 を参照。

この方針を ADR 化する。ADR 本文では以下を述べる:
- karasu の非目標に「実行時認可（authz）のモデリングはしない」を追加する
- 理由は「authz は dynamic な実行時関心であり、karasu が扱う『ゆっくり変化する構造的な
  文脈』の外側」— DB スキーマ設計・シーケンス図と同じフィルタの適用
- `requires` / `policy` 等の machine-checkable なゲート構文は validate → codegen の重力源に
  なるため、特に避ける
- ADR-20260428-06 で予約した `role` / `license` / `group` / `plan` / `requires` / `allows` /
  `policy` の語彙予約は、**「将来 authz 機能を作るとき用」ではなく「衝突回避のための予約」**
  という位置づけに改める（または予約自体を見直す）

## フォローアップ（ADR 化とは分離）

- **`user.role` の再検討**（別 Issue）: B-soft（actor archetype として残し spec で縛る）か
  B-strict（deprecate 方向）か。既存 spec・examples・パーサに影響するため独立 PR で扱う
- `description` の書きぶり指針を spec に明文化するか（語彙ブレを `description` の自由文に
  逃がさないため。ただし「散文は散文」と割り切る選択もある）
- `link` で外部 policy doc を参照する慣習をテンプレ化するか
- レンダラ側で「authz らしき情報がある usecase」をヒューリスティックに視覚化するか
  （しないのが素直）

## 採用しなかった案を将来見直すとき

A（属性宣言 + `requires` 述語）/ half-A（属性宣言のみ）の設計は本 doc の
「案A 詳細（却下案の設計記録）」「具体例」に残してある。次の条件が揃ったら再検討の価値がある:

- 外部ユーザー検証（#638 等）で「図だけで authz 境界を判断したい」需要が繰り返し顕在化
- `description` 自由文での表現がチーム間でばらつき、実害が観測される
- かつ、validate / codegen への滑り落ちを構造的に防ぐ設計（語彙を凍結する仕組み等）が
  別途確立されている
