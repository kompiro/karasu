# ADR-20260420-02: グラフィカル diff ビューア

- **日付**: 2026-04-20
- **ステータス**: 決定済み（フェーズ実装中）
- **関連**:
  - Issue #650 (Closed), PR #719 (Design Doc), PR #725 (Phase 1 実装), PR #749 (#738 アノテーションバッジ diff)
  - フォローアップ Issue: #735 (deploy view), #736 (org view), #737 (集約暗黙エッジ), #738 (アノテーションバッジ, Closed), #739 (ペースト入力), #740 (OPFS スナップショット)
  - Design Doc: `docs/design/graphical-diff-viewer.md`
  - Acceptance Test: `docs/acceptance/0058-graphical-diff-viewer.md`
  - ADR-20260317-01 — 2 層レンダリング（layout → renderer）
  - `packages/core/src/diff/view-diff.ts`
  - `packages/core/src/renderer/svg-renderer.ts`
  - `packages/app/src/hooks/useSystemView.ts`

## 決定事項

`.krs` テキストの diff フレンドリ性（#645）を **ユーザー向けに支払う** 機能として、2 つの `.krs` プロジェクトを意味的に diff し、ダイアグラムに重ねて表示するビューアを導入する。

採用した設計軸（詳細は Design Doc 参照）:

| 軸 | 採用案 | 要点 |
|---|---|---|
| 計算層 | view-slice diff (`packages/core/src/diff/view-diff.ts`) | 描画されるものに対する diff。フォーマット差異で偽陽性が出ない |
| レイアウト | ユニオン AST + 既存レイアウト 1 回 | 変わらないノードは定義上 1 つの位置を持つ。第二のレイアウトパスを発明しない |
| 集約暗黙エッジ | 構成集合 diff（フォローアップ #737） | `EdgeDetailPanel` の拡張で完全な情報を保持 |
| アノテーション変更 | バッジ diff（フォローアップ #738） | ノード本体の視覚ノイズを抑える |

レンダリング側はノード・エッジ要素に `data-diff-state="added|removed|changed|unchanged"` を付与し、CSS で色・破線・透明度を制御する。core 層は装飾を持たず、UI 層だけで視覚言語を変更可能。

## 採用しなかった案と理由

- **テキスト diff（行ベース）**: フォーマット変更で偽陽性。Issue 本文で明示的に却下。
- **AST diff（集約前）**: 集約された暗黙エッジの diff が表現できない。描画されるものと一致しない。
- **両側を独立にレイアウトしてオーバーレイ**: 「変わらないノード」が両側で違う位置を持ちうる。事後の位置補正が必要で複雑度が高い。
- **after を主・before をゴーストとして周辺に追加**: 削除されたものが文脈から離れた場所に描かれ「何の隣にあった何が消えたのか」が読み取りづらい。

## 段階的リリース

Phase 1（PR #725, この ADR の対象）でコア + 描画 + system view + ファイルピッカー入力を実装。残りは独立 Issue として切り出し:

1. ✅ Phase 1: system view + file-picker source
2. Phase 2 (#735, #736): deploy view, org view への展開
3. Phase 3: 集約エッジ・アノテーションバッジの精緻化
   - #737: 集約暗黙エッジの構成集合 diff
   - ✅ #738 (PR #749): アノテーションバッジ diff（D-2） — 本体は `unchanged` のまま `<g data-node-badge data-diff-state>` で per-badge 表示、`NodeDetailPanel` に `+/-` 行を追加
4. Phase 4 (#739, #740): ペースト入力・OPFS スナップショット

Phase 1 はコンパイル時フラグ `ENABLE_DIFF_VIEWER` の背後にゲートしてマージ済み。プレビューでは `?diff=1` クエリで有効化、本番では完成まで非表示。

## 影響

- 新パッケージ的サブモジュール `packages/core/src/diff/` を導入
- `render()` / `renderFromLayout()` シグネチャに optional `RenderOptions` を追加（後方互換）
- SVG エッジが `<g data-edge-from data-edge-to>` でラップされるようになった（既存の DOM クエリは原則変更不要だが、`<line>` を直接拾うクエリには影響しうる）
- `compileSystemDiff` 公開 API として外部から利用可能（CLI / VS Code 拡張への展開余地）
