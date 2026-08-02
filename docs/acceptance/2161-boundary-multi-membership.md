# AT-2161: boundary 所属の 1:N 化と多重包含描画

- **日付**: 2026-07-30
- **Issue**: #2161（親） / slice A #2178 / slice B #2179 / slice C #2180 / 配置 #2176
- **PR**: slice A #2213 / 配置 #2176 / slice B #2179（この PR）
- **関連 ADR**: [ADR-1974](../adr/1974-boundary-declaration-syntax.md)（決定 2 の refine 対象 — 1:1 + first-wins）、[ADR-2036](../adr/2036-scoped-boundary-declaration.md)（スコープ宣言 — scoped が勝つ）、[ADR-1886](../adr/1886-group-by-diff-removed-node-placement-and-aggregated-edge-state.md)（diff backfill）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（experimental 据え置き）
- **設計**: `docs/design/boundary-membership-1n.md`（全体）、`docs/design/boundary-membership-slice-a.md`（slice A）
- **Related TPLs**:
  - [TPL-2161](../test-perspectives/TPL-2161-declared-membership-not-discarded-in-derived-index.md)（宣言された多重所属を派生 index で捨てない）
  - [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（派生 state の二重持ち）
  - [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（軸を全 call site に通す）
  - [TPL-1386](../test-perspectives/TPL-1386-diagnostic-register-fact-vs-style.md)（診断の register）
  - [TPL-1738](../test-perspectives/TPL-1738-relayout-into-group-preserves-placement-and-edges.md)（全要素ちょうど一度配置）
  - [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理・無効果の禁止）
  - [TPL-2179](../test-perspectives/TPL-2179-derived-outline-measured-on-coverage-not-bbox.md)（広げた図形は実被覆で測る — slice B の proactive）
  - [TPL-1927](../test-perspectives/TPL-1927-routing-measures-crossings-and-penetrations.md)（貫通 0 + 共線オーバーラップ 0 の再計測）
  - [TPL-1799](../test-perspectives/TPL-1799-raster-pipeline-glyph-coverage.md)（`◇` の PNG グリフカバレッジ）
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
cross-file の多重所属が診断されること（#2221）は
`packages/core/src/fs/import-resolver.test.ts` で自動化済み。
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

### 配置（#2176）— seam 配置 + co-membership band 順

自動化済み: band 順のコスト項・seam bias・band 無し boundary の member 引き取り・
配置のちょうど一度は `packages/core/src/renderer/group-layout.test.ts` と
`packages/core/src/renderer/boundary-membership.test.ts`、P2c の再計測
（penetration 0 / collinear overlap 0）は
`packages/core/src/renderer/edge-routing-groups.test.ts` で固定済み。

検証用サンプルは slice A と同じ
`examples/en/feature-samples/boundary-multi-membership.krs`。

#### AC-3: 共有する boundary が隣り合い、共有ノードが継ぎ目に座る

- [ ] **手動**: サンプルを Group by: **Boundary** で開く。`payments` と `pci` の帯が隣り合い、
      共有メンバーの `Ledger` が `payments` の**最下行**（`pci` に接する側）に座っている。
      枠・エッジが視覚的に破綻していない。
- [ ] **手動**: `boundary` を 3 つ以上持つモデル（共有するペアが宣言順では離れているもの）で、
      共有するペアの帯が隣り合う位置まで寄る。かつ**依存の矢印が上から下に流れる**ままである
      （co-membership のために依存の流れが逆転していない）。

#### AC-4: band を持てない boundary が枠を得る

- [ ] **手動**: メンバー全員が他の boundary と共有の `boundary` を書き足す
      （例: サンプルに `boundary audit { label "Audit" contains Ledger contains CardVault }` を追加）。
      その boundary の枠とラベルが図に現れ、引き取られたノードは**図中にちょうど 1 つ**のまま。
      引き取られた元の boundary の枠も残っている（空にならない）。
- [ ] **手動**: 引き取りが起きた図で、**どの枠も非メンバーを囲んでいない**（偽の包含が無い）。

### slice B（#2179）— 多重包含 geometry + 識別色 + 縮退タブ

自動化済み: reach の成立・縮退への分岐・記録矩形が帯本体のままであること・輪郭
ポリゴンの生成・hue の宣言順割り当て・タブと診断は
`packages/core/src/renderer/boundary-multi-containment.test.ts`、
偽の包含が無いことは `packages/core/src/renderer/boundary-frame-containment.test.ts`
（実被覆に対する全ペア absence assertion + 検出器自身の柵 2 本）、
P2c の再計測（penetration 0 / collinear overlap 0）は
`packages/core/src/renderer/edge-routing-groups.test.ts`、
`◇`（U+25C7）の PNG カバレッジは
`packages/app/src/render/png-font-coverage.test.ts` で固定済み。

検証用サンプルは slice A / 配置と同じ
`examples/en/feature-samples/boundary-multi-membership.krs`。

#### AC-5: 共有ノードが両方の枠に囲まれ、重なりが重なりとして読める

- [ ] **手動**: サンプルを Group by: **Boundary** で開く。`Ledger` が `payments` と
      `pci` の**両方の枠に囲まれて**見える（`pci` の枠が自分の帯から上に伸びて `Ledger` を包む）。
      `Ledger` は図中に**ちょうど 1 つ**しか現れない。
- [ ] **手動**: 2 つの枠が**別々の色**で描かれ、重なりが**入れ子ではなく重なり**として読める
      （枠線・薄い塗り・タイトルが同じ色で、重なったセルが第 3 の色味になる）。
      **light / dark 両テーマ**で確認する（識別色はテーマごとに別の値を持つ）。
- [ ] **手動**: 枠のタイトルが伸びた先のカードに重なっていない（タイトルは帯の本体に載ったまま）。

#### AC-6: 届かない共有が縮退タブに落ち、偽の包含を作らない

- [ ] **手動**: サンプルに `Ledger -> Wallet "settle"` を足す（サンプル冒頭のコメントに手順あり）。
      `pci` の枠は伸びなくなり、`Ledger` の下端に `◇ PCI scope` の破線タブが出る。
      診断リストに `boundary-membership-not-drawn` が **info** で出る。
- [ ] **手動**: その状態で**どの枠も非メンバーを囲んでいない**（`pci` の枠が `Wallet` を含んでいない）。
- [ ] **手動**: 同じ図を PNG に書き出し、`◇` が豆腐（□）にならない。

### slice C（#2180）— 未着手

- [ ] **手動**: 一方の boundary を畳んでも、他方が expanded ならそのノードが消えない。両方畳むと消える。
