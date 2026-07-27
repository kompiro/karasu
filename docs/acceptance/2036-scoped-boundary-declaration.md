# AT-2036: スコープ内 boundary 宣言（scoped boundary declaration）

- **日付**: 2026-07-27
- **Issue**: #2036（parent: #1822 comprehension）
- **PR**: slice A #2128（文法 + index）、slice B #2132（描画）、slice C (この PR — collapse 独立化 + spec/examples/AT)
- **関連 ADR**: [ADR-1983](../adr/1983-boundary-drilldown-grouping.md)（per-view 交差 — スコープ形はこの上に乗る）、[ADR-1884](../adr/1884-group-by-team-multi-system-root-per-system-frames.md)（top-level 形の collapse-everywhere 先例 — スコープ形は**対照的に**独立 collapse）、[ADR-1820](../adr/1820-notation-promotion-gate.md)（experimental 据え置き）
- **設計 / ADR**: [ADR-2036](../adr/2036-scoped-boundary-declaration.md)（design doc から昇格）
- **Related TPLs**:
  - [TPL-20260512-01](../test-perspectives/TPL-20260512-01-composite-key-must-cover-all-distinguishing-dimensions.md)（scoped index / group identity は (scope, id) でキー）
  - [TPL-20260716-02](../test-perspectives/TPL-20260716-02-view-state-gate-parity-across-surfaces.md)（全 surface parity）
  - [TPL-20260610-01](../test-perspectives/TPL-20260610-01-accepted-vocabulary-must-have-effect.md)（parse-and-vanish の禁止）
  - [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（ネスト構文の fmt round-trip）
- **対象**: `packages/core/src/parser/parser.ts`（配置受理 + `scopedBoundaryIndex`）、`packages/core/src/renderer/layout.ts`（`boundaryAxisFor` / scope-qualified group id）、`packages/core/src/renderer/group-labels.ts`

## 概要

`boundary` ブロックをノードブロック内に宣言できるようにした（#2036）。メンバは宣言ノードの
**直下の子**を bare id で指し、フレームは**宣言キャンバスにだけ**出る。identity = 宣言スコープ + id
で、別スコープの同名 boundary は別グループ（フレーム・label・collapse 状態が独立）。

parse 受理・診断（`boundary-not-in-context` / `duplicate-boundary-id`）・index のキー・
フレームの出るキャンバス / 出ないキャンバス・collapse 独立性・fmt round-trip・診断の
merged-space 再導出は `packages/core/src/parser/scoped-boundary.test.ts` /
`packages/core/src/renderer/scoped-boundary-render.test.ts` /
`packages/core/src/renderer/group-frame-label.test.ts` ほかで自動化済み。
本 AT は**目視でしか判定できない項目**のみを扱う。

## 受け入れ条件

### AC-1: 枠が宣言キャンバスに 1 枚だけ出る

- [ ] **手動**: `examples/en/feature-samples/scoped-boundary.krs` を app で開き（builtin の
      Feature samples プロジェクトからファイルツリーで選択）、Group by: **Boundary** にする。
      root system view には `Edge services` の枠だけが出て、`Core domains` は出ない。
      `Checkout` へ drill すると `Core domains` の枠が 1 枚出て、`Ledger` / `Cart` を囲み、
      `Reporting (unclustered)` は枠の外に描かれる。配置が読める（枠・エッジが視覚的に破綻しない）。

### AC-2: 同名 boundary が層をまたいでも独立に見える

- [ ] **手動**: system スコープと service スコープの両方に同じ id の boundary（例: `core`）を
      書いたモデルを開き、Group by: Boundary で root と drill にそれぞれ**自分の label** の枠が
      出る。drill ビューで ⊖ collapse しても、root へ戻ったとき root 側の枠は**展開されたまま**
      （collapse 状態が混線しない）。⊕ で drill 側も元に戻る。

### AC-3: 既存の top-level boundary モデルが見た目ごと不変

- [ ] **手動**: `examples/en/feature-samples/boundary-clusters.krs` を実装前後で開き比べ、
      枠の位置・ラベル・collapse 挙動（1 つの boundary が複数レベルに断片化し、collapse が
      全レベルに効く従来挙動）が変わらないこと。
