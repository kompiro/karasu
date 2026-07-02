---
type: product
---

# AT-1148: ObservableFileSystemProvider — refresh FileTree on external file writes

- **日付**: 2026-05-06
- **関連 Issue**: [#1148](https://github.com/kompiro/karasu/issues/1148)
- **対象ファイル**:
  - `packages/app/src/fs/observable-provider.ts`、`packages/app/src/fs/observable-provider.test.ts`
  - `packages/app/src/App.tsx`
  - `packages/app/src/components/FileTree.tsx`
- **関連 Design Doc**: [`docs/adr/20260507-01-observable-fs-provider.md`](../adr/20260507-01-observable-fs-provider.md)
- **依存**: [#1145](https://github.com/kompiro/karasu/pull/1145)（GUI style bootstrap — 隣接 `.krs.style` を新規作成する経路）

## 受け入れ条件

- [x] AT-A: `ObservableFileSystemProvider.writeFile` は対象パスが存在しないときに `{ type: "create", path }` を emit する
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `writeFile › emits "create" when the file does not exist yet`

- [x] AT-B: `ObservableFileSystemProvider.writeFile` は対象パスが既存のときに `{ type: "change", path }` を emit する
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `writeFile › emits "change" when the file already exists`

- [x] AT-C: `delete` は `{ type: "delete", path }` を emit する
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `delete and mkdir › emits "delete" after a successful delete`

- [x] AT-D: `mkdir` は `{ type: "create", path }` を emit する（ディレクトリ生成も create として扱う）
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `delete and mkdir › emits "create" for mkdir`

- [x] AT-E: 読み取り操作（`readFile` / `readDir` / `exists`）は emit しない
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `read ops pass through without emitting`

- [x] AT-F: `watch(rootPath, cb)` は **rootPath 配下の** 変更だけを伝える（`/foobar` は `/foo` の子孫ではない、文字列 prefix 一致では拾わない）
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `watch › filters events by rootPath prefix` / `... does not fire a sibling subscription for a non-prefix path`

- [x] AT-G: `watch("/")` はあらゆる書き込みを受け取る（root subscriber は wildcard 相当）
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `watch › treats "/" as ancestor of every path`

- [x] AT-H: `Disposable.dispose()` で subscribe を解除でき、解除後は emit が届かない
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `watch › dispose removes the subscription`

- [x] AT-I: 同一 rootPath に複数の subscriber が居る場合、全員に並行通知される
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `watch › supports multiple concurrent subscribers on the same root`

- [x] AT-J: delegate の `writeFile` が throw した場合、emit は発火しない（FS 状態は変わっていない）
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `error handling › does not emit when the delegate write throws`

- [x] AT-K: delegate の `exists` が throw した場合でも `writeFile` 自体は通り、`create` として扱う（exists の失敗を理由にユーザー操作を止めない）
  > ✅ Automated — `packages/app/src/fs/observable-provider.test.ts` › `error handling › treats an "exists" failure as "create" ...`

- [ ] AT-L（manual）: brand-new な `.krs`（`@import` 無し）を `pnpm --filter @karasu-tools/app dev` の Preview で開き、edge を右クリック → Direction ▸ Down を選ぶ。**サイドバーに `<basename>.krs.style` がリロード操作なしで現れる** ことを目視
  > 🧑 Manual — PR #1145 で実装済みの bootstrap 経路と組み合わせた end-to-end 確認。本 PR の主要な体験改善ポイント

- [ ] AT-M（manual）: 同じ Preview で複数回 Direction を変更しても、`@import` 行は重複追記されず、サイドバーの `.krs.style` 表示も一定（リロードが過剰に走らないこと、エディタのフォーカスが保たれること）
  > 🧑 Manual — fs.watch のイベント発火頻度・FileTree の reload が体感で違和感ないことを目視

- [ ] AT-N（manual）: ファイルを右クリック → Delete でファイルを削除すると、サイドバーから消える（既存挙動の継続。新しい watch 経路でも壊れていないことを確認）
  > 🧑 Manual — `useFileTreeOps` の delete 経路は手動 `reload` も呼ぶので二重 reload になる可能性があるが、見た目には影響しないこと

- [ ] AT-O（manual）: `App.tsx` の `ModeWrapper` が OPFS / Memory どちらの delegate も `ObservableFileSystemProvider` で包んで `AppProvider` に渡している（`refreshKey` プロパティは廃止済み）
  > 🧑 Manual — コードレビューおよび上記 AT-L の体感確認で間接的に検証

## 補足

- 本実装は **MVP**: `FileTree` は変更通知を受けるたびに `loadDir(rootPath)` で **全 reload** する。partial update（ノード単位の追加・削除）は将来課題（Design Doc 参照）。
- rename 操作は `useFileTreeOps.renameItem` で `writeFile(new) + delete(old)` の合成として行われるため、本 wrapper は自然に `create` + `delete` の 2 イベントを emit する。新しい `renamed` イベント種別を追加する必要は無かった（Design Doc では 4 種類を想定していたが、interface 既存の 3 種類で足りると確認した）。
- `SnapshotOverlayFs` はラップしない。diff 表示用の overlay は underlying fs に書き込むため、underlying 側で 1 回だけ通知される設計（Design Doc の確定方針どおり）。
