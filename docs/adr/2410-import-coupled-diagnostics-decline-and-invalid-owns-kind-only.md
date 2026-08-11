---
id: ADR-2410
title: import 結合の存在検査は未解決 import が残る file では判定しない（invalid-owns は kind 専任にする）
status: accepted
date: 2026-08-11
topic: resolver
related_to:
  - ADR-2408
  - ADR-1381
  - ADR-2075
scope:
  packages: [core, lsp]
assumptions:
  - "symbol: packages/core/src/parser/reference-validation.ts :: validateContainsReferences"
  - "symbol: packages/core/src/parser/reference-validation.ts :: validateScopedContainsReferences"
  - "symbol: packages/core/src/parser/reference-validation.ts :: validateOwnsReferences"
  - "symbol: packages/core/src/resolver/warnings.ts :: detectInvalidOwns"
  - "grep: packages/core/src/parser/reference-validation.ts :: nodeImports\\.length > 0"
  - "file: docs/test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md"
---

# ADR-2410: import 結合の存在検査は未解決 import が残る file では判定しない（invalid-owns は kind 専任にする）

- **日付**: 2026-08-11
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2410](https://github.com/kompiro/karasu/issues/2410)（単一ドキュメント文脈で `contains-target-not-found` / `invalid-owns` が cross-file 参照に偽陽性）
  - 実装 PR: [#2443](https://github.com/kompiro/karasu/pull/2443)
  - 先行: [#2082](https://github.com/kompiro/karasu/issues/2082)（`owns-target-not-found` に同じガードを入れた）、[#2032](https://github.com/kompiro/karasu/issues/2032)（存在検査をマージ後 id 空間へ）
  - 残件: [#2442](https://github.com/kompiro/karasu/issues/2442)（存在検査が対象に含めない kind での二重報告）
  - 関連 ADR: [ADR-1381](1381-multi-file-import-semantics.md)（解決はマージ後の水準）、[ADR-2408](2408-owns-infra-target-and-chip-gate.md)（`owns` の対象 kind）、[ADR-2075](2075-edge-endpoint-scope-diagnostic.md)（同じ文脈差を「抑制しない」側で判断した先例）
  - 派生 TPL: [TPL-1522](../test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md)（台帳）、[TPL-2032](../test-perspectives/TPL-2032-reference-existence-validated-on-merged-space.md)
  - spec: `docs/spec/diagnostics.md` / `.ja.md`

## 背景

LSP は import を解決せず 1 ドキュメントだけを parse し、parse 診断をそのまま表示する。
このため「この id はどこにも宣言されていない」を根拠に発火する検査は、エディタ上で
**偽陽性しか生まない** — 欠けているのはモデルではなく入力である。[#2082](https://github.com/kompiro/karasu/issues/2082)
は `owns-target-not-found` にこの判断を入れ、[TPL-1522](../test-perspectives/TPL-1522-style-coupled-diagnostics-sheetless-context.md)
の台帳に「どの診断がどちら側か」を表として記録した。その表に **未決定のまま残った 2 件**が
本 ADR の対象である。

2 件は同じ症状だが原因が違った。

- `contains-target-not-found` は純粋な存在検査で、member が import 先で宣言されている
  ことがある。スコープ内 `boundary` の形（[#2036](https://github.com/kompiro/karasu/issues/2036)）は
  さらに、cross-file の `system` 再オープンで直下の子が後から増えうる（[#2246](https://github.com/kompiro/karasu/issues/2246)）。
  どちらも per-file では確定しない。
- `invalid-owns` は kind 検査のはずが、**id が不在の場合も同じコードで報告していた**。
  そのため単一ドキュメントでは「他ファイルにある id」を「所有できない kind」と言い、
  さらに同一ファイル内の単純な打ち間違いには `owns-target-not-found` と 2 つのコードが
  並んで出ていた。カタログの文言は初版から "an `owns` target **resolves to** a kind that
  cannot be owned"（解決した先の kind を述べる）であり、**spec と実装が食い違っていた**。

## 決定

**1. 存在検査は未解決 import が残る file では判定しない。** `contains-target-not-found`
（top-level・スコープ内の両形）に、`owns-target-not-found` と同じ早期 return を入れる。
ガードは **surface の filter ではなく検査側**（`packages/core/src/parser/reference-validation.ts`）に
置く。マージ後の `KrsFile` は `nodeImports` を持たないため、project mode の判定は変わらない。

**2. `invalid-owns` は「ノードに解決した参照の kind」だけを述べる。** id がどのノードにも
解決しない場合は報告しない（不在は `owns-target-not-found` の担当）。ガードは足さない —
定義を絞った結果として、単一ドキュメントで cross-file の対象について何も言わなくなる。

## 理由

- **単一ドキュメントは入力が欠けた状態であり、そこで不在を根拠に発火する検査は偽陽性
  しか生まない。** 逆に、不足が過少報告にしかならない検査（`edge-endpoint-not-at-scope` /
  `shared-infra-fan-in`）は抑制しない — [ADR-2075](2075-edge-endpoint-scope-diagnostic.md)
  が選んだ側と同じ原則を、逆向きのケースに適用している。
- **ガードを検査側に置くのは app の single-file 経路も覆うため。** LSP の filter に足すと
  同じ穴が別 surface に残る（[#2082](https://github.com/kompiro/karasu/issues/2082) の判断を継承）。
- **`invalid-owns` はガードではなく定義の絞り込みで解決する方が正しい。** ガードを足せば
  偽陽性は止まるが、二重報告は残る。「診断が答えている問いは 1 つか」を先に問うと、
  抑制が要るのか定義が広すぎるのかが分かれる。ここは後者だった。**この観点を TPL-1522 に
  追記した** — 台帳が「どちら側に倒すか」しか問わない形だと、定義が広すぎるケースを
  抑制で覆ってしまう。
- **spec の文言に実装を合わせる方向である。** カタログは元から解決を前提にした書き方で、
  実装がそれに追いついていなかった。新しい判断ではなく追随。

## 影響

- **org のみの file の `owns Ghost` は沈黙する。** そこでは何も解決せず、そういう file の
  対象は定義上他ファイルにある。#2082 以降 存在検査が沈黙しているのと同じ理由。
  この挙動を固定していた既存テスト 2 件は、新しい規則を述べる形に書き換えた。
- **label 衝突は存在検査が報告する。** `service Backend { label "MyService" }` に対する
  `owns MyService` は、`invalid-owns` ではなく `owns-target-not-found` になる。
  「identity は id で解決し label では解決しない」という規則自体は不変で
  （[TPL-2167](../test-perspectives/TPL-2167-id-not-label-for-identity.md)）、述べるコードが
  変わった。meta-test の該当行は診断側の表に移した。
- **二重報告が 1 ケース残る。** 存在検査が対象に含めない kind（`entity` / `usecase` /
  `resource` / `user`）のノードを `owns` すると、今も 2 コード出る。存在検査が集める
  対象を変える話であり、[#2408](https://github.com/kompiro/karasu/issues/2408) で確定させた
  集合を再び動かすため [#2442](https://github.com/kompiro/karasu/issues/2442) に分離した。
- `MERGED_SPACE_REFERENCE_CODES` の strip は引き続き必要。import を持つ file は
  判定しないので落とす verdict が無く、**strip が効くのは import を持たない leaf file** —
  その `contains` / `owns` 対象が、import する側の wildcard や `system` 再オープンで
  初めて満たされるケース。

## 却下した案

- **`invalid-owns` にも import ガードを足す** — 挙動変更を最小にして #2410 だけ閉じる案。
  偽陽性は止まるが二重報告と spec 文言との食い違いが残り、「なぜこの診断は不在も報告するのか」
  という問いを次の担当者に残す。却下。
- **LSP の filter で 2 件とも抑制する** — surface 側で消す案。app の single-file 経路に
  同じ穴が残る（#2082 で同じ理由により検査側を選んでいる）。却下。
- **`contains` も「解決したときだけ」に絞る** — `invalid-owns` と同じ手法を適用する案。
  `contains` は kind 制限を持たない純粋な存在検査（`boundary` は宣言済みの任意ノードを
  含められる）なので、絞る余地がそもそも無い。却下。
- **存在検査の集合を全 kind に広げ、1 診断 1 コードを完遂する** — 二重報告を残さない案。
  正しい終着点だが、#2082 / #2408 で確定させた存在検査の集合を再び動かすことになり、
  本 Issue の範囲（単一ドキュメントの偽陽性）を超える。#2442 として分離。却下（見送り）。
