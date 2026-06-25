# AT: karasu-nest multi-file + style share bundling

- **日付**: 2026-06-25
- **関連 Issue**: [#1783](https://github.com/kompiro/karasu/issues/1783)（karasu-nest 壁打ち）
- **関連 Design Doc**: [karasu-nest-hosted-preview](../design/karasu-nest-hosted-preview.md)（Phase 1 / PR 2）
- **対象ファイル**:
  - `packages/core/src/share/synthesize.ts`、`packages/core/src/formatter/formatter.ts`（`serializeKrsFile`）
  - `packages/app/src/utils/inline-share.ts`（bundle encode/decode）
  - `packages/app/src/components/AppShell.tsx`（`getShareBundle`）
  - `packages/app/src/components/ShareDialog.tsx`、`packages/app/src/components/PreviewColumn.tsx`
  - `packages/app/src/App.tsx`、`packages/app/src/MemoryModeApp.tsx`

> PR 1（単一ファイル inline 共有）の続き。`import` を跨ぐプロジェクトを単一 `.krs` に合成し、`.krs.style` もバンドルする。

## 受け入れ条件

- [x] AT-A: wildcard import を含むプロジェクトが、import の無い単一 `.krs` に合成され、両ファイルのノードを含む

  > ✅ Automated — `packages/core/src/share/synthesize.test.ts` › `inlines a wildcard import into one self-contained .krs`

- [x] AT-B: named import は指定ノードのみが取り込まれる

  > ✅ Automated — `synthesize.test.ts` › `merges a named import (only the named node is pulled in)`

- [x] AT-C: `.krs.style` がマージされ、合成 `.krs` は単一の `@import "index.krs.style"` を持つ

  > ✅ Automated — `synthesize.test.ts` › `bundles the merged style and points the .krs at a single @import`

- [x] AT-D: スタイルの無い単一ファイルは style 無しで返り、`@import` を含まない

  > ✅ Automated — `synthesize.test.ts` › `leaves a single-file project without style un-bundled`

- [x] AT-E: 共有ペイロード（`{krs, style}`）が encode→decode でラウンドトリップする

  > ✅ Automated — `packages/app/src/utils/inline-share.test.ts` › `round-trips a .krs + .krs.style bundle`

- [x] AT-F: PR 1 形式（生 `.krs`）の共有 URL も後方互換でデコードできる

  > ✅ Automated — `inline-share.test.ts` › `decodes a first-release raw-.krs payload (backward compatible)`

- [x] AT-G: Share 押下でプロジェクトが合成され（async）、URL がコピーされダイアログに表示される

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `flattens the project, copies the URL, and opens the dialog (round-trips)`

- [x] AT-H: ダイアログは生成中（flatten 中）は generating 表示、完了後に URL を表示する

  > ✅ Automated — `packages/app/src/components/ShareDialog.test.tsx` › `shows a generating state while the URL is being flattened`

### 手動確認（CI で検証できない項目）

- [ ] M-1: 実 multi-file プロジェクト（例: `examples/.../multi-file-system`）を app で開き、Share → 別タブで開くと **全 system/deploy が 1 つの図として**再現される
- [ ] M-2: `.krs.style` を持つプロジェクトを共有 → 別タブで開くと **作者のスタイル**が適用されて表示される（デフォルトスタイルにならない）
- [ ] M-3: 合成共有を開いても訪問者のローカル（OPFS）プロジェクトが汚れない（ephemeral）
- [ ] M-4: PR 1 で生成済みの旧 URL（生 `.krs` 形式）が引き続き開ける（後方互換）
- [ ] M-5: 大きな multi-file プロジェクトでも生成（flatten）が体感的に十分速く、URL 長が問題にならない
