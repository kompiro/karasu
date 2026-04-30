# AT: `karasu diff` bundled all-views output

- **日付**: 2026-04-30
- **関連 Issue**: [#1025](https://github.com/kompiro/karasu/issues/1025)
- **対象ファイル**:
  - `packages/core/src/index.ts`（`buildAllViewsSvgDiffProject`）
  - `packages/core/src/renderer/drill-down-svg.ts`（`bundleSingleLevelViews`）
  - `packages/cli/src/diff.ts`
  - `packages/cli/src/index.ts`
- **関連 ADR**: ADR-20260420-02（graphical diff viewer）, ADR-20260429-06（`karasu diff` CLI）

## 受け入れ条件

- [x] `karasu diff old.krs new.krs`（`--view` 省略）がタブ付きの bundled SVG を emit する。各 view に diff state 注釈が付く。
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `emits a tabbed bundled SVG when --view is omitted`

- [x] `--view system | deploy | org` を指定した場合は従来通りの単一 view SVG を emit する（変更なし）。
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `compiles a deploy-view diff`（既存テスト）

- [x] 該当しない view はタブから除外される（例: deploy block が両側にない場合は deploy タブなし）。
  > ✅ Automated — `packages/cli/src/diff.test.ts` › `omits deploy / org tabs when neither side has those blocks` および `packages/core/src/index.test.ts` の bundled diff 各テストケース

- [x] core API `buildAllViewsSvgDiffProject` は applicable な view ごとに `compileSystemDiff` / `compileDeployDiff` / `compileOrgDiff` を呼び、それらの結果を 1 SVG に束ねる（独自の diff レンダリングを追加しない）。
  > ✅ Automated — `packages/core/src/index.test.ts` › `bundles system + deploy + org tabs when all three apply`（実装が既存 compile 関数を呼ぶことを SVG 出力経由で検証）

- [x] 片側にしか存在しない view（追加 / 削除）も bundled に含まれる。
  > ✅ Automated — `packages/core/src/index.test.ts` › `includes a view if it appears on only one side (added or removed)`

- [ ] `karasu diff --help` のヘルプテキストに「`--view` 省略時は bundled all views を出力する」旨の説明と Examples が記載されている。
  > 🧑 Manual — `karasu diff --help` を実行して、bundled がデフォルトであることが説明されており、`--view` 指定例も残っていることを目視確認する。

- [ ] bundled SVG をブラウザで開き、システム / デプロイ / オーガナイゼーションのタブを切り替えて、各 view の diff カラー（緑 / 赤 / オレンジ）が想定通りに描画されることを目視確認する。
  > 🧑 Manual — visual review。CSS-only タブナビゲーション（`:target` + `:has()`）が動作すること、`<style>`（`/* karasu-diff-style */`）が outer SVG 直下にあり各 view の inner SVG にも diff カラーが適用されることを確認する。

## 補足

- `compileSystemDiff` 等は内部で `ImportResolver.resolve` を行うため、bundled では同じ project を最大 4 回（事前判定 1 回 + 各 view 内で 1 回ずつ）解決する。最適化（resolver 結果を共有する）は将来の課題として保留。
- drawio bundled diff は範囲外（Issue 本文の Notes 参照）。
