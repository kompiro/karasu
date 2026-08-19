---
id: ADR-2078
title: 物理参照の存在検査は診断、物理層の回復度は coverage — 主張の種類で置き場を分ける
status: accepted
date: 2026-08-19
topic: resolver
authors: [kompiro]
related_to: [ADR-1895, ADR-1870, ADR-1314]
scope:
  packages: [core, cli]
assumptions:
  - "file: packages/core/src/spec/infra-index.ts"
  - "symbol: packages/core/src/spec/infra-index.ts :: indexDeclaredInfra"
  - "symbol: packages/core/src/parser/reference-validation.ts :: validatePhysicalRefs"
  - "symbol: packages/core/src/view/coverage-extract.ts :: PhysicalCoverage"
  - "grep: docs/spec/diagnostics.md :: unresolved-resource-ref"
  - "file: docs/acceptance/physical-reference-fidelity.md"
  - "file: .claude/skills/reverse-architecture/SKILL.md"
---

# ADR-2078: 物理参照の存在検査は診断、物理層の回復度は coverage — 主張の種類で置き場を分ける

- **日付**: 2026-08-19
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2078](https://github.com/kompiro/karasu/issues/2078)（要求）、[#1991](https://github.com/kompiro/karasu/issues/1991)（証拠元の spike）、[#2090](https://github.com/kompiro/karasu/issues/2090)（SKILL 側の誘導は先行して着地済み）
  - [ADR-1895](1895-reverse-architecture-harness.md)（reverse harness — 意味層/構造層の分担）
  - [ADR-1870](1870-domain-entity-modeling.md)（entity / resource の解決、canonical form）
  - [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md)、[TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md)、[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)、[TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md)
  - `docs/spec/diagnostics.md` / `.ja.md`、`docs/spec/syntax.md` / `.ja.md` §S6

## 背景

reverse-architecture harness（[ADR-1895](1895-reverse-architecture-harness.md)）の Phase 3 synthesis で
**物理層が黙って落ちる**ことが #1991 の hato 逆生成で観測された。実 D1 テーブル 35 本のうち、
merge 後の `index.krs` は `database` 宣言ブロックを 1 つも持たず、**どの entity からも参照されなかった
9 本が model から消滅**した。消えたテーブルに対応する entity は存在するのに、deep-dive agent が
`table HatoDB.X` 行を書き落としていた（極端な例は `entity Goal {}`）。

調査で分かったのは、これが harness 固有の問題ではないことである。`compileProject` に直接かけて
診断を観測したところ、**次の 4 形すべてが無診断**だった: (A) `database` ブロックが存在しないまま
`resource HatoDB.goals` を書く、(B) entity に mapping が無い、(C) 宣言したテーブルを誰も参照しない、
(D) 正しく結線されている（対照）。

原因は `resolver/resource-entity.ts` にある。dot 記法の `resource X.Y` は `resource.ref` を
**そのまま解決済みとして返し**、`X` / `Y` が宣言済みかを一切問わない。一方 bare `resource X` は
解決できなければ `unassigned-resource` warning が出る。同じ「ノードを指す」行為でありながら
**記法によって存在検査の有無が違う**という非対称で、`docs/spec/diagnostics.md` の
`unassigned-resource` の記述は dot 記法を明示的に検査対象外と宣言していた。
`docs/spec/syntax.md` §S6 は「参照先 id は宣言済みノードに解決しなければならない」を規定するが、
対象は edge / `realizes` / `owns` / `handles` に限られていた。

これは [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md)（新しい
cross-reference には resolver 側の検証と unresolved warning を必ず付ける）が禁じている状態そのもので、
TPL-907 が起こされる前に入った構文がその穴に残っていた。

## 決定

**「その指摘が誰にとっても defect か」で置き場を分ける。** 宣言されていない物理を指す参照は
**診断**（`unresolved-resource-ref` / `unresolved-table-ref`）にし、物理層がどれだけ表現されたかは
**`karasu coverage` の測定値**にする。新規 CLI コマンドは立てない。

- **診断側（構造層 / 決定的）** — usecase の `resource <Infra>.<Leaf>` と entity の
  `table <Infra>.<Leaf>` が、merge 後のモデルに宣言されていない infra ブロックまたは leaf を
  指していたら warning を出す。`§S6` の warn-don't-error ファミリに収める。
- **測定側** — `coverage` に `physical` セクションを足し、宣言された leaf のうち entity が
  対応付けた数・resource が参照した数と、**「参照はされているが mapping が無い leaf」と
  「対応付けも参照も無い leaf」を別のリスト**で報告する。`table` を持たない entity は
  事実として列挙するだけで、診断にはしない。

## 理由

- **register の意味論に一致する。** 宣言されていないものを指す参照は、手書きでも逆生成でも
  常に defect なので診断が正しい。一方「entity に mapping が無い」は karasu が支持する
  正当な中間状態である — #1991 の実測でも 44 entity 中 9 個は正当に tableless
  （read-model projection / KV backed / 計算ビュー）で、`EntityNode.tableRef` の doc comment 自身が
  forward design の状態を正当と宣言している。これを warning にすると手書きモデルが常時
  警告まみれになる。
- **診断側は harness 以外にも効く。** bare / dotted の非対称が解消され、`render`（harness が
  既に validator として使っている）・LSP・app のすべてに同じ信号が届く。`resource TypoDB.users`
  と書いた人が黙って壊れたモデルを得る状態が終わる。
- **測定側は量を出せる。** 「35 本中 26 本が mapping 済み」は診断の粒度では表現できないが、
  harness が repair の要否を判断するには件数が要る。
- **2 つのリストを分けるのは修復手段が違うから。** 「参照はされているが mapping が無い」は
  entity が既にあるので `table` 行を足すだけの機械的修復、「対応も参照も無い」はその domain が
  掘られていないので再 dive が要る。畳むとどちらの手当てをすべきか判断できない
  （[TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md)）。
- **回復度は宣言側から数える。** 論理モデルから外向きに辿ると「既に何かが指している leaf」しか
  見つからないので、誰も参照していないテーブルは原理的に見えない — #1991 が 9 本を失いながら
  clean に見えたのはこの数え方の問題でもある。
- **score には混ぜない。** `coverage` の score は domain 間の相対正規化で、ADR-1895 が
  「enrichment 後は再測定が要る」と明記する程度に敏感である。物理次元を足すと既存の `thin`
  判定が全部ずれる。`domains` / `threshold` / `score` は不変とし、テストで固定した。
- **宣言済み物理の列挙は 1 つに閉じる。** `indexDeclaredInfra`（`packages/core/src/spec/infra-index.ts`）
  を唯一の walk とし、参照検査・coverage・`crud-matrix-extract` の列生成が共有する。
  同じ「どんな物理が存在するか」を 3 か所で手書きすると必ずずれる
  （[TPL-1720](../test-perspectives/TPL-1720-validation-target-set-enumerates-all-kinds.md)）。

## 実装で確定した細部

- **どちらが欠けているかを報告する。** `missing: "block" | "leaf"` を params に持たせ、
  メッセージも分ける。ブロックごと無いのは「`database` 宣言そのものを失った」（#1991 の症状）、
  leaf だけ無いのは「sub-resource の欠落」で、当たりを付ける先が全く違う。
- **import-coupled にする。** 共有 infra を専用ファイルに置き各スライスが import するのが
  §S4.5 の正準形なので、単一ドキュメントでは判定しない（`owns` / `contains` と同じ扱いで、
  ImportResolver が per-file の結果を抑止して merged model で再導出する）。
- **「infra 宣言がゼロなら黙る」ガードは置かない。** `validateOwnsReferences` は
  org-only ファイルのために「宣言が 1 つも無ければ何も言わない」ガードを持つが、ここでは
  宣言ゼロこそが検出対象（`database` ブロックを失った merged model は infra を 1 つも宣言しない）
  なので、同じガードを置くと本来の用途を潰す。
- **`[external]` は対象外。** `unassigned-resource` と同じ逃げ道を dot 記法側にも用意する。
- **参照の解決は `buildEntityResolver` を通す。** bare `resource Order` → `entity Order` →
  `table OrderDB.orders` が [ADR-1870](1870-domain-entity-modeling.md) の canonical form なので、
  dotted 形式だけを見ると完全にモデル化された表を「未参照」と誤判定する。
- **物理宣言を持たないモデルでは物理セクションを空にし、md 出力からも省く。** 「計測して 0 だった」
  と読まれないため。そのようなモデルが抱える dangling 参照は診断側が報告する。
- **SKILL.md には到達状態と検証コマンドを書く。** Phase 3 手順 5-6 は従来「検証せよ」という
  指示だけで判定手段が無かった。`render` の warning が空であること、`coverage` の
  `unmappedButReferenced` が空であることを到達状態とし、3 つのフィールドと修復手段の対応表を置いた。
  **両診断とも warning なので `render` は 0 で終了する** — 出力を grep する、終了コードを信じない、
  と明記した。

## 却下した案

- **診断だけで解く。** B（mapping 無し）/ C（未参照）は defect ではないので warning にできず、
  info に落としても部分的なモデルでは常時大量に出て事実としてすら読まれなくなる
  （[TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md) の register 判断に反する）。
  「35 本中 26 本」という量的な回復度も診断の粒度では表現できない。
- **`coverage` の拡張だけで解く。** A は普遍的な defect であり harness だけの関心事ではない。
  手書きで未宣言の store を指した人に何も届かず、TPL-907 の穴が残る。
- **`karasu fidelity` 新コマンド。** 責務は最も明確に分かれるが、「逆生成モデルがどれだけ回復
  できているか」という**同じ問い**に対して 2 コマンドを読ませることになる。ADR-1895 が `coverage` を
  `matrix` と別コマンドにしたのは問い自体（CRUD マトリクス vs 密度）が違ったからで、ここは
  問いが同じで軸（論理 / 物理）が違うだけ。
- **`karasu diff skeleton.krs index.krs` で「宣言ブロックが落ちた」を検出する。** 一見
  「merge 前後の差分」という問いの形に合うが、`diff` の出力は SVG のみで機械判定に使えない。
- **新規 TPL を起こす。** A は [TPL-907](../test-perspectives/TPL-907-cross-reference-validation.md) が
  既に規定している観点の未適用箇所であって新しい観点ではない。#2078 を TPL-907 の
  `discovered_from` に足し、「記法違いは検証の免除理由にならない」を派生元 spec 節に記録した。
  受理する記法を全サイトで揃える隣接観点は
  [TPL-2088](../test-perspectives/TPL-2088-id-reference-notation-uniform-across-sites.md) が持つ
  （本 ADR はその**検証**側の適用で、`resource X.Y` が受理する形は変えていない）。

## 派生（後続・未解決）

- **`unreferenced`（宣言されたが誰も参照しないテーブル）を診断にも出すか。** 現状は coverage 限定。
  論理側の対応物を持たない物理宣言はそれ自体としては正当（論理/物理分離）で、逆生成の文脈でのみ
  「掘り残し」の signal になる。運用して誤検知が少なければ info への昇格を検討する。
- **repair ループの自動化。** 「`unmappedButReferenced` が空でなければ該当 domain を再 dive する」を
  CLI 側で駆動するかは決めていない。ADR-1895 の分担どおり判断は agent 側に残す。
