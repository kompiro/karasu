# AT-2234: boundary フレーム色の style セレクタ

- **日付**: 2026-08-02
- **Issue**: [#2234](https://github.com/kompiro/karasu/issues/2234)（`epic: boundary` / 親 [#2161](https://github.com/kompiro/karasu/issues/2161)）。follow-up = [#2269](https://github.com/kompiro/karasu/issues/2269)（team フレーム）
- **設計**: `docs/design/boundary-style-selector.md`
- **関連 ADR**: [ADR-9004](../adr/9004-css-inspired-styling.md)（CSS インスパイアの styling）、[ADR-833](../adr/833-diagram-legend-syntax.md)（legend。本件は legend 語彙を足さないと決めた相手）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（`boundary` は experimental 据え置き）
- **Related TPLs**:
  - [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)（見た目の決定を 1 つの関数に閉じる。本 PR の proactive）
  - [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理・無効果の禁止。裸の `boundary` ルール）
  - [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)（specificity 表は `reference-data.ts` から生成）
- **対象**: `packages/core/src/parser/style-parser.ts`、`packages/core/src/resolver/style-resolver.ts`、`packages/core/src/renderer/svg-renderer.ts`、`packages/core/src/types/style.ts`、`packages/core/src/builtins/reference-data.ts`

## 概要

`.krs.style` から boundary フレームの色を指定できるようにする。セレクタは
`boundary`（全フレーム）と `boundary#<id>`（特定の boundary）で、`edge` / `edge#<id>`
と同型。名指ししなかった boundary は [#2179](https://github.com/kompiro/karasu/issues/2179)
の循環色のまま。

parse・specificity（1 / 101）・カスケード（`boundary#<id>` が裸の `boundary` に勝つ、
同点は後勝ち）・node id 空間と衝突しないこと・存在しない boundary への指定が無効果で
あること・team 軸に漏れないこと・`border-color` 1 つで枠線と塗りとタイトルが揃うこと・
`◇` タブがフレームと同色になることは
`packages/core/src/renderer/boundary-style-selector.test.ts` で自動化済み。

本 AT は**目視でしか判定できない項目**のみを扱う。

## 前提

- app が <https://karasu.kompiro.dev/> で開いている
- builtin の **Feature samples** プロジェクトから
  `boundary-multi-membership.krs` を開き、Group by: **Boundary** にしてある

## 受け入れ条件

### AC-1: 著者の指定色がフレームに出る

`.krs.style` に次を書く。

```css
boundary#pci { border-color: #C0392B; }
```

- [ ] **手動**: `pci` のフレームが赤系（`#C0392B`）で描かれる。枠線・薄い塗り・タイトルが
      すべて同じ色で、どれか 1 つだけ循環色のまま残っていない。
- [ ] **手動**: 名指ししていない `payments` のフレームは**色が変わっていない**（循環色の 1 色目）。
- [ ] **手動**: light / dark 両テーマで、指定した色がそのまま出る（循環色と違い、テーマごとの
      読み替えは行わない）。背景に対して読めない色を著者が指定した場合はそのまま暗い / 明るいまま
      描かれてよい。指定は著者の責任である。

### AC-2: 縮退タブがフレームと同じ色になる

サンプルに `Ledger -> Wallet "settle"` を足して `pci` の reach を縮退させる
（手順はサンプル冒頭のコメントにある）。

- [ ] **手動**: `Ledger` の下端に出る `◇ PCI scope` タブが、AC-1 で指定した赤系で描かれる。
      フレームだけ赤でタブが循環色（青系）のまま、という状態になっていない。

### AC-3: 裸の `boundary` が全フレームに効く

```css
boundary { border-style: solid; }
```

- [ ] **手動**: すべての boundary フレームが破線から実線に変わる。個別指定と併用したとき
      （`boundary { border-style: solid } boundary#pci { border-color: #C0392B }`）は、
      `pci` が「実線かつ赤」になる。

### AC-4: 図が破綻しない

- [ ] **手動**: 上記いずれの指定でも、枠の重なり・エッジ・タイトル位置が視覚的に破綻しない。
      特に帯の外へ伸びたフレーム（多重包含）に色を指定しても、輪郭が途切れたり
      タイトルがカードに重なったりしない。
