# AT: karasu-nest inline share (single file)

- **日付**: 2026-06-25
- **関連 Issue**: [#1783](https://github.com/kompiro/karasu/issues/1783)（karasu-nest 壁打ち）
- **関連 ADR**: [ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)（karasu-nest）（Phase 1 / PR 1）
- **関連 TPL**: [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（共有ビューも新しい描画 surface）
- **対象ファイル**:
  - `packages/app/src/utils/inline-share.ts`
  - `packages/app/src/components/ShareDialog.tsx`
  - `packages/app/src/components/PreviewColumn.tsx`
  - `packages/app/src/App.tsx`、`packages/app/src/MemoryModeApp.tsx`
  - `packages/i18n/src/{types,en,ja}.ts`

> スコープは **単一ファイルの inline 共有**。multi-file 合成・静的 SVG/PNG エンドポイント・ホスティングは後続 PR（Design Doc「実装フェーズ分割」参照）。

## 受け入れ条件

- [x] AT-A: `.krs` ソースが encode → decode でラウンドトリップする

  > ✅ Automated — `packages/app/src/utils/inline-share.test.ts` › `round-trips a .krs source`

- [x] AT-B: 日本語など multi-byte を含むソースもラウンドトリップする

  > ✅ Automated — `inline-share.test.ts` › `round-trips multi-byte (Japanese) content`

- [x] AT-C: ペイロードが URL-safe（`+` `/` `=` を含まない base64url）

  > ✅ Automated — `inline-share.test.ts` › `produces a URL-safe payload`

- [x] AT-D: 壊れた／空のペイロードは throw せず復元不能として扱われる

  > ✅ Automated — `inline-share.test.ts` › `returns null for corrupt payloads` / `flags an error for an empty or corrupt share fragment`

- [x] AT-E: ソースは **fragment** に載り、query には載らない（サーバ非送信＝ステートレス）

  > ✅ Automated — `inline-share.test.ts` › `embeds the source in the fragment under the s= key`

- [x] AT-F: Share ボタン押下で inline URL がクリップボードへコピーされ、ダイアログに表示される（コピー URL がソースへラウンドトリップ）

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `copies an inline share URL and opens the dialog on click (round-trips)` / `packages/e2e/tests/at-1783-inline-share.spec.ts` › `Share opens the dialog with a private #s= link that is copied, and Copy re-copies`

- [x] AT-G: ソースが無いとき Share ボタンは disabled

  > ✅ Automated — `PreviewColumn.test.tsx` › `disables Share when there is no source` / `packages/e2e/tests/at-1783-inline-share.spec.ts` › `Share is disabled while the source is empty and enabled once it is not`

- [x] AT-H: ダイアログの Copy ボタンで再コピーでき、コピー済み表示が出る

  > ✅ Automated — `packages/app/src/components/ShareDialog.test.tsx` › `re-copies the URL and shows confirmation when Copy is clicked` / `packages/e2e/tests/at-1783-inline-share.spec.ts` › `Share opens the dialog with a private #s= link that is copied, and Copy re-copies`

- [x] M-2: 生成 URL を別タブ／別ブラウザで開くと、元の図が **drill-down 付き**で再現されること

  > ✅ Automated — `packages/e2e/tests/at-1783-inline-share.spec.ts` › `the private link opens in memory mode and leaves the visitor's OPFS project untouched` / `packages/e2e/tests/at-1827-permalink-deep-element.spec.ts` › `a link shared while drilled into a service opens drilled into it`

- [x] M-3: OPFS 対応ブラウザで共有 URL を開いても、訪問者のローカル（OPFS）プロジェクトが汚れない（ephemeral）こと

  > ✅ Automated — `packages/e2e/tests/at-1783-inline-share.spec.ts` › `the private link opens in memory mode and leaves the visitor's OPFS project untouched`（`/meta/projects.json` と訪問者の `index.krs` が開く前と同じ）

- [x] M-5: 壊れた `#s=` URL を開くと警告バナーが出て、ProjectMode で開かれる（白画面／クラッシュにならない）こと

  > ✅ Automated — `packages/e2e/tests/at-1783-inline-share.spec.ts` › `a corrupt #s= link shows the restore-failed banner and opens Project mode`

### 手動確認（CI で検証できない項目）

- [ ] M-1: 実ブラウザで Share → 実際に別アプリへ貼り付け、URL が有効なこと（clipboard の実挙動）。ブラウザ内のクリップボードへの書き込みは AT-F の e2e が見ている。残るのは OS のクリップボードを経由して別アプリに貼る部分
- [ ] M-4: 実リバース `.krs`（Dify, system + deploy）を共有 → 全ビューに drill-down できること。e2e は小さな合成モデルで同じ経路を通している。実リバースの大きなモデルでの確認は、そのモデルを手元に置いて行う
- [ ] M-6: クロスブラウザ（特に Safari）でアドレスバーの URL 長が問題にならないこと。Playwright の project は chromium だけなので、Safari では手で確かめる
