# AT-2161: boundary 所属の 1:N 化と多重包含描画

- **日付**: 2026-07-30
- **Issue**: #2161（親） / slice A #2178 / slice B #2179 / slice C #2180 / 配置 #2176
- **PR**: slice A（この PR）
- **関連 ADR**: [ADR-1974](../adr/1974-boundary-declaration-syntax.md)（決定 2 の refine 対象 — 1:1 + first-wins）、[ADR-2036](../adr/2036-scoped-boundary-declaration.md)（スコープ宣言 — scoped が勝つ）、[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（diff backfill）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（experimental 据え置き）
- **設計**: `docs/design/boundary-membership-1n.md`（全体）、`docs/design/boundary-membership-slice-a.md`（slice A）
- **Related TPLs**:
  - [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（宣言された多重所属を派生 index で捨てない）
  - [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生 state の二重持ち）
  - [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（軸を全 call site に通す）
  - [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)（診断の register）
  - [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)（全要素ちょうど一度配置）
  - [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理・無効果の禁止）
- **対象**: `packages/core/src/parser/parser.ts`（`buildBoundaryMembership` / `buildScopedBoundaryMembership`）、`packages/core/src/types/ast.ts`（`boundaryMembership` / `primaryBoundaryOf` / `mergeMembership`）、`packages/core/src/fs/import-resolver.ts`、`packages/core/src/compile/compile-diff.ts`、`packages/core/src/renderer/layout.ts` / `group-layout.ts` / `group-labels.ts`、`packages/i18n`

## 概要

`boundary` の所属をモデル層で **1:N** にする（#2161）。宣言された所属はすべて保持され、
1 band しか使えない banded view は **primary（最初に宣言された boundary）** で配置する。

slice A（本 PR）は model 層のみで、**ノードの配置とフレームは変わらない**。ユーザーから見える
変化は診断 `duplicate-boundary-assignment` の文言（事実だけを述べる register に修正）と、
import 先ファイルで宣言された `boundary` が効くようになったこと。多重包含の描画は slice B（#2179）、
共有ノードの配置と枠の復活は #2176、collapse の二重性は slice C（#2180）が受け持つ。

parse / merge 3 経路（multi-file import・diff・scope 合成）/ 群の並び / 全 render surface への
軸の配線 / 診断の params と severity は
`packages/core/src/renderer/boundary-membership.test.ts` /
`packages/core/src/parser/parser.test.ts` /
`packages/core/src/parser/scoped-boundary.test.ts` /
`packages/i18n/src/render-diagnostic.test.ts` で自動化済み。
本 AT は**目視でしか判定できない項目**のみを扱う。

## 受け入れ条件

### slice A

検証用サンプル: `examples/en/feature-samples/boundary-multi-membership.krs`
（app の builtin **Feature samples** プロジェクトをファイルツリーから開く）。
`Ledger` が `payments` と `pci` の両方に `contains` されている。

#### AC-1: 多重所属モデルでも図が変わらない

- [ ] **手動**: 上記サンプルを開いて Group by: **Boundary** にする。`Ledger` は図中に**ちょうど 1 つ**だけ
      現れ、**先に宣言された** `payments` の枠の中に描かれる（`pci` の枠は `Card vault` だけを囲む）。
      枠・エッジが視覚的に破綻していない。
- [ ] **手動**: サンプル内の 2 つの `boundary` ブロックの順序を入れ替えると、`Ledger` が `pci` の枠へ移り、
      それ以外は変わらない（primary だけが変わったことを確認する）。

#### AC-2: 診断がモデルの事実だけを述べる

- [ ] **手動**: 同じファイルで診断リストを開き、`duplicate-boundary-assignment` が **info** として出る。
      文言が「複数の boundary に所属する」という事実だけを述べ、「最初に宣言された boundary を採用」
      のようなビューの解決規則を含んでいない（en / ja 両方）。

### slice B（#2179）— 未着手

- [ ] **手動**: 帯が隣接する共有で、ノードが**両方の枠に囲まれて**見える（枠が重なる）。
- [ ] **手動**: boundary ごとの識別色で、重なりが**入れ子ではなく重なり**として読める。
- [ ] **手動**: 縮退したノードに `◇ <boundary>` のタブが出て、そのグリフが PNG 書き出しでも豆腐にならない。
- [ ] **手動**: 縮退に落ちたケースで、偽の包含（非メンバーが枠に入る）が起きていない。

### slice C（#2180）— 未着手

- [ ] **手動**: 一方の boundary を畳んでも、他方が expanded ならそのノードが消えない。両方畳むと消える。
