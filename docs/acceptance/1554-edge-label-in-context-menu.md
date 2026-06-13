# AT: エッジコンテキストメニューへのラベル表示

- **日付**: 2026-06-12
- **関連 Issue**: [#1554](https://github.com/kompiro/karasu/issues/1554)
- **関連 TPL**: [TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md), [TPL-20260518-01](../test-perspectives/TPL-20260518-01-involutive-toggle-renders-both-states.md)
- **対象ファイル**: `packages/core/src/renderer/edge-routing.ts`,
  `packages/app/src/components/{PreviewPane,EdgeContextMenu}.tsx`,
  `packages/app/src/styles/components/panels.css`

## 概要

キャンバス上のエッジラベルが重なり・長文で読めない場合の回復手段として、
エッジ右クリックメニューのヘッダーに `.krs` で記述したラベル文字列を表示する。
レンダラーが edge グループに `data-edge-label` を出力し（ラベル無しエッジでは属性ごと省略）、
app がそれを読み取ってヘッダーの `from → to` の直下に表示する。
エッジの識別は引き続き `canonicalId` であり、ラベルは表示専用（TPL-20260510-20）。

## 受け入れ条件（自動）

### AC-1: core — `data-edge-label` の出力

- [x] ラベル付きエッジの SVG グループに `data-edge-label="<label>"` が出力される

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `emits data-edge-label only for labelled edges`

- [x] ラベル無しエッジには `data-edge-label` 属性が出力されない（空文字属性を残さない）

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `emits data-edge-label only for labelled edges`

- [x] usecase→resource の機械生成 `W`/`R` マーカーは `data-edge-label` に出力されない（属性は authored ラベル専用）

  > ✅ Automated — `packages/core/src/renderer/drill-down-svg.test.ts` › `omits data-edge-label for synthesized W/R usecase→resource edges`

- [x] 集約 implicit エッジの `N domain edges` カウントラベルは `syntheticLabel: true` でマークされ、`data-edge-label` に出力されない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `aggregates multiple cross-service domain edges into one implicit edge with count label`

- [x] 集約数 1 の implicit エッジは authored ラベルをそのまま保持し、`data-edge-label` も出力される

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `keeps the authored label (no syntheticLabel) when a single domain edge passes through`

### AC-2: app — メニューヘッダーのラベル行

- [x] `data-edge-label` 付きエッジを右クリックすると、メニューにラベル文字列が表示される

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `shows the edge's authored label when data-edge-label is present`

- [x] ラベル無しエッジではラベル行（`.context-menu-header__label`）が描画されない

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `omits the label row for unlabelled edges (no data-edge-label)`

## 受け入れ条件（手動）

- [ ] app で getting-started プロジェクトを開き、`ECommerce` にドリルダウンして
      domain エッジ（例: 受注 → 商品カタログ）を右クリックすると、メニューヘッダーに
      `“商品情報を参照する”` がノード id 行の下に表示される
- [ ] ラベルを持たないエッジ（例: `A -> C` のような無ラベルエッジを書いた場合）の
      メニューにはラベル行が表示されず、従来どおり `from → to` と `edge#<id>` のみが並ぶ
- [ ] 日本語ラベル・長いラベルでもメニューの幅が崩れない
      （`.edge-context-menu` は `max-width: 320px`、ヘッダーは `overflow-wrap: anywhere` で折り返す）
