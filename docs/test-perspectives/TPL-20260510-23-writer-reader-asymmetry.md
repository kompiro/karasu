---
id: TPL-20260510-23
title: "新しい edge / relation 機能は writer の coarse 表現と reader の progressive disclosure を両立する"
status: active
date: 2026-05-10
applicable_to:
  - "新しい関係性プリミティブ（edge / cross-reference / annotation の継承 / ownership 系 relation）を導入する変更"
  - "既存 relation の構文や semantics を変えるとき、writer 側に詳細化を求める方向の変更"
  - "AI / Chat / refactor で relation を生成する経路の出力設計"
known_consumers:
  - parser
  - resolver
  - view-extract
  - renderer
  - chat-panel
related_to:
  - TPL-20260510-07
  - TPL-20260510-21
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
  - root_cause_adr: "ADR-20260410-01"
  - root_cause_adr: "ADR-20260413-02"
  - root_cause_adr: "ADR-20260415-01"
topic: edges
scope:
  packages:
    - core
    - app
---

# TPL-20260510-23: 新しい edge / relation 機能は writer の coarse 表現と reader の progressive disclosure を両立する

## 観点

karasu の edge モデルの根幹は **書き手と読み手の非対称性** にある（`docs/concepts.ja.md` 「エッジ → explicit と implicit」、ADR-20260410-01）。書き手はドメインモデリングの自然な粒度（domain edge）でエッジを書くだけで、読み手は service レベルの俯瞰図でそれが集約された implicit edge として見える。この **「writer は coarse、reader は progressive disclosure」** が drill-down 全体の動機を支えている。

新しい関係性プリミティブ（edge / cross-reference / inherited annotation / ownership 系 relation）を追加するときは、この非対称性を **設計レベルで** 保つ必要がある。両者を同じ粒度に強制する API を導入すると:

- writer 側の authoring コストが膨らむ（同じ意図を level ごとに繰り返し書く）
- reader 側の集約 / drill-down が機能しない（aggregation の自動化を諦めることになる）
- karasu の中核価値である scoped glance（→ TPL-20260510-21）が崩れる

既存の例を観察すると、karasu の relation はどれも非対称になっている:

| relation | writer が書く粒度 | reader が見る粒度 |
|---|---|---|
| domain edge (`->` / `-->`) | domain-to-domain | service レベルでは implicit service edge に集約 |
| `realizes` | deploy unit が指す論理 service | deploy view と system view 両方で意味を取れる |
| `owns` | team が直下の service / domain を 1 行で指定 | organization view と system view 両方で扱う |
| 親 service の `@deprecated` | service レベルに 1 つ書く | 配下 domain / usecase / resource すべてに継承（ADR-20260415-01）|

新しい relation を提案するときは、この表に新しい行を加えられる形になっているかを問う。「書き手は何を書くか」「読み手は何種類の view でどう見るか」を **2 列に分けて設計する**。

## 想定される失敗モード

- writer が意図を表現するために **複数 view 用に同じ情報を別々に書かされる**（ownership と deployment と logical を別々に手で書き分ける、など）
- writer が「読み手が後でどの view を見るか」を意識して粒度を選ばないといけない（authoring が読み手依存になる）
- 同じ relation を **書く level ≠ 見る level** にしたとき、自動の集約 / drill-down が無く、reader の view ごとに手書きで再生成する必要が生まれる
- 結果として: 「便利な機能を追加した」のに **authoring 体験が悪化** し、`.krs` が冗長化する。気づいたときには後方互換のためにそのまま残る

## チェックリスト

新しい relation / edge / cross-reference 機能を提案・実装するとき、以下を確認する:

- [ ] writer は **意図を表現する自然な粒度** だけでこの relation を書けるか（最小の入力で意味が伝わるか）
- [ ] reader 側に **drill-down / aggregation / collapse / inheritance** のいずれかの自動的な progressive disclosure 経路があるか（そのまま手書きの粒度で表示する以外の選択肢があるか）
- [ ] writer→reader の集約 / 派生は **karasu が自動で行う** か。reader 側に手作業のマッピングを要求していないか
- [ ] writer が選んだ粒度の semantic（`kind` / 親の annotation など）が **すべての reader view で保存** されているか（→ 実装側は TPL-20260510-07 が担保）
- [ ] 既存 relation の表（domain edge / realizes / owns / inherited annotation）の **隣に置いたときに違和感のない形** になっているか。違和感があるなら、設計が非対称性から外れているサイン

## 既知の対処パターン

- 設計フェーズで **「writer 列 / reader 列 / 自動変換」の 3 カラム表** を Design Doc に書く。3 列が埋まらない場合は設計をやり直す
- writer の入力をそのまま render するのではなく、**view-extract / resolver で新しい relation 用の集約関数を 1 つ追加** する経路を default にする（`deriveImplicitServiceEdges` のような関数を新 relation ごとに 1 つ）
- inherited annotation のように reader 側で「親から継承する」型の progressive disclosure を採るときは、**子が自分の値を持てばそこで止まる** という挙動を明示（ADR-20260415-01 のパターン）
- AI / Chat 経路で relation を生成するときも、AI に **writer の自然な粒度** で出力させる（reader-level での冗長な再記述を生成させない）。これによって `.krs` が AI 出力 / 手書きで一貫した粒度に揃う

## TPL-07 との境界

TPL-20260510-07（派生タグの semantic 区別）とは **対**になる観点:

- **TPL-23（本エントリ）**: 設計時 — writer / reader の粒度をそもそも非対称に設計する
- **TPL-07**: 実装時 — derive / aggregate するとき、writer が指定した semantic 区別を派生後にも保存する

両方が機能して初めて、書き手は coarse に書け、読み手は集約された結果を semantic 区別を保ったまま見られる。新 relation の design doc で TPL-23 を満たし、実装 PR で TPL-07 を満たす、という 2 段階のチェックが想定される使い方。

## 関連テスト

- `packages/core/src/view/view-extract.test.ts` — implicit edge の集約が writer 側の入力から自動的に生成される動作
- `packages/core/src/resolver/style-resolver.test.ts` — 親 annotation の継承（writer は親に 1 つ書く / reader は子で見える）
- `docs/concepts.ja.md` 「エッジ → explicit と implicit」「アノテーションの継承」
