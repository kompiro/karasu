---
id: ADR-2234
title: boundary フレーム色の style セレクタ — `boundary` / `boundary#<id>`
status: accepted
date: 2026-08-05
topic: styling
depends_on: [ADR-9004, ADR-1974, ADR-2036]
related_to: [ADR-833, ADR-1820, ADR-1314, ADR-2124, ADR-1858]
scope:
  packages: [core]
  concerns: []
assumptions:
  - "symbol: packages/core/src/types/style.ts :: boundaryId"
  - "symbol: packages/core/src/types/style.ts :: ResolvedBoundaryFrames"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: resolveBoundaryPaint"
  - "symbol: packages/core/src/builtins/reference-data.ts :: SELECTOR_SPECIFICITY"
  - "file: packages/core/src/renderer/boundary-style-selector.test.ts"
  - "grep: docs/spec/style.md :: Boundary frame selectors"
---

# ADR-2234: boundary フレーム色の style セレクタ — `boundary` / `boundary#<id>`

- **日付**: 2026-08-05
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2234](https://github.com/kompiro/karasu/issues/2234)（`epic: boundary` / 親 [#2161](https://github.com/kompiro/karasu/issues/2161)）。follow-up: [#2269](https://github.com/kompiro/karasu/issues/2269)（team フレームの色指定）
  - 実装 PR: [#2279](https://github.com/kompiro/karasu/pull/2279)。設計 PR: [#2266](https://github.com/kompiro/karasu/pull/2266)
  - ADR: [ADR-9004](9004-css-inspired-styling.md)（CSS インスパイアの styling）、[ADR-833](833-diagram-legend-syntax.md)（legend 構文。本件が「足さない」と決めた相手）、[ADR-1974](1974-boundary-declaration-syntax.md) / [ADR-2036](2036-scoped-boundary-declaration.md)（boundary 宣言と scoped identity）、[ADR-1820](1820-notation-promotion-gate.md)（`boundary` は experimental 据え置き）、[ADR-1314](1314-krs-spec-v1-freeze.md) / [ADR-2124](2124-version-vocabulary.md)（言語版）、[ADR-1858](1858-system-view-group-by-team.md)（team フレーム）
  - AT: [2234-boundary-style-selector.md](../acceptance/2234-boundary-style-selector.md)
  - TPL: [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)（本件の proactive — 見た目の決定は 1 つの関数に閉じる）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md) / [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（scoped boundary の引き当て）
  - spec: `docs/spec/style.md` §「Boundary frame selectors」（+ja）
  - 昇格元: `docs/design/boundary-style-selector.md`（本 PR で削除。詳細な棚卸し・PoC 計測は設計 PR [#2266](https://github.com/kompiro/karasu/pull/2266) の履歴で追える）

## 背景

[#2179](https://github.com/kompiro/karasu/issues/2179) で boundary フレームは宣言順の固定サイクルで識別色を持つようになったが、色は著者が選んでいない。[#2234](https://github.com/kompiro/karasu/issues/2234) は「監査スコープは赤」のような自分たちの慣習に図を合わせたいという要求で、`.krs.style` が担う表現の層の話である。Issue はあわせて legend での説明も求めていた。

設計の主眼は、追加する文法が既存の `.krs.style` と地続きに見えるかの検証に置いた。`edge` / `edge#<id>` が構造的に同一の前例である: 論理ノードの kind ではないキーワードが、自分の `#id` 形・自分の解決結果マップ・自分のプロパティ部分集合を持つ。

## 決定

`.krs.style` にセレクタ `boundary`（全フレーム、specificity 1）と `boundary#<id>`（特定 boundary、specificity 101 = 100 + 1）を追加する。`edge` / `edge#<id>` と同型で、新しい文法機構は導入しない。legend の新語彙は足さない。

- **解決結果は `ResolvedStyles.boundaryFrames`** に置く（`nodes` に混ぜない）。ルール集合から構築するので、存在しない boundary を名指すルールは `#NoSuchNode` と同じく無警告で不発になる。
- **効くプロパティは `border-color` / `background-color` / `color` / `border-width` / `border-style` のみ**。`border-color` は枠線・薄い塗り・タイトル・縮退タブ（`◇`）を一括で追従させる（#2179 が「1 boundary = 1 色」を多重包含の可読性条件と決めているため）。個別に割りたい著者だけが `background-color` / `color` を明示する。
- **色の決定は `resolveBoundaryPaint` 1 本に閉じる**。フレームと縮退タブが別々に `palette.boundaryHues` を読む二重導出を先に畳んだ（PoC で「紫の枠 + 緑のタブ」に割れる欠陥を実証。TPL-2234 の素材）。
- **修飾なしの `boundary#<id>` は全スコープの同 id に一致する**（[ADR-2036](2036-scoped-boundary-declaration.md) の scoped 宣言に対して、スコープ修飾を持たない = 修飾を問わない）。スコープ限定が要る場合は、この意味を変えずに修飾形を後付けできる。引き当ては group id を `displayGroupId` で著者向け id に正規化してから行う（TPL-1666 / TPL-1352）。
- **言語版は動かさない**。`boundary` は [ADR-1314](1314-krs-spec-v1-freeze.md) の凍結スコープ外の experimental notation（[ADR-1820](1820-notation-promotion-gate.md) 据え置き）で、boundary の面の一部として言語 v2.0 に載る。

## 理由

- `edge#<id>` の前例に乗る限り、パーサは同型の分岐 1 つ、specificity は既存の採点式（id +100、kind +1）のままで済み、概念が 1 つも増えない。
- 裸の `boundary` は従来「parse は通るが何にもマッチせず無警告」で、TPL-1503 が禁じる受理・無効果に隣接していた。本件で正当なセレクタになる。
- `boundary#<id>` は node id 空間と衝突しない。boundary はノードではないので、キーワードが id をどの空間で読むかを言う。
- specificity 表は手書きせず `reference-data.ts` の `SELECTOR_SPECIFICITY` に 2 行足して `pnpm gen:reference` で en / ja を再生成した（TPL-1296）。

## legend を足さない（Issue Part 2 の結論）

`spike/boundary-legend` の 4 プレート比較で判断した。生成 legend の行は、すぐ上のフレームに同じ色で描かれているタイトルと同一文字列になり、図が既に述べていることの言い直しにしかならない（#2179 でタイトルが boundary 色を取るため）。図から復元できない情報は著者の散文だけで、それは既存の `swatch #hex "label"`（[ADR-833](833-diagram-legend-syntax.md)、言語 v1.0）で書ける。凍結された言語に取り消せない語彙を足す割に得るものが無い。

hex が style シートと legend の 2 箇所に載る drift は `swatch` 全般の性質として残す。実利用で問題になったら `ref boundary#pci "..."` のようにセレクタ文法を ref target に流用する案を別 Issue で検討する。

## 却下した案

- **裸の `#pci`**: `#id` は既にノード id を指す。`boundary pci` と `service pci` が同居したときに指す先が決まらない。
- **合成 container id を晒す（`#__group_pci__`）**: `__group_<id>__` はレイアウトの内部表現で、spec に載せる語彙ではない。
- **属性セレクタ形（`boundary[id=pci]`）**: `[k=v]` は端点などの属性の述語であって identity ではない。identity には `#` を使うのが既存の一貫性。
- **team フレームを同じ回で扱う**: `team` は org tree view でカード（ノード）の kind として既に style 語彙であり、`team#Platform` の CSS 的に自然な読みは「カードを絞る複合セレクタ」になる。そこにフレームという別対象を割り当てると `#Platform`（カード）との非対称が生まれる。綴りの決定が要る面と要らない面を混ぜないため [#2269](https://github.com/kompiro/karasu/issues/2269) に分けた。`ResolvedStyles` は対象ごと別マップという型なので、team が来ても `boundaryFrames` の構造は変わらない。
