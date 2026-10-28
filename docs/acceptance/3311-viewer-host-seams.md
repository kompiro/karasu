# AT: viewer にホストが差し込む口（VS Code 対応のスライス A）

- **日付**: 2026-10-22
- **関連 Issue**: [#3311](https://github.com/kompiro/karasu/issues/3311)（スライス A）／親 [#2996](https://github.com/kompiro/karasu/issues/2996)
- **設計**: 親 Issue [#2996](https://github.com/kompiro/karasu/issues/2996) の決めること 3（ADR 昇格後はその ADR を参照する）
- **関連 TPL**: [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md)（スタイルの読み直しは、変化の次元をすべて含めて引き金にする）
- **対象ファイル**:
  - `packages/app/src/viewer/mount-viewer.tsx`、`packages/app/src/viewer/viewer-controller.ts`（引数とハンドル）
  - `packages/app/src/components/AppShell.tsx`（`onRevealNode` / `readOnly` / `sourceRevision`）
  - `packages/app/src/components/PreviewPane.tsx`（Cmd/Ctrl+クリック、読み取り専用での edge メニュー）
  - `packages/app/src/components/preview-toolbar-slot.ts`、`PreviewToolbar.tsx`、`PreviewViewControls.tsx`（隠す操作の一覧）
  - `packages/app/src/hooks/useStyleSource.ts`（スタイルの読み直し）

## 受け入れ条件

- [x] AT-A: 新しい引数を渡さないギャラリーの viewer は、これまでどおり投稿を描き、テーマと言語の切替を出し、共有を出さない

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `shows the submission with the theme and language switches and no Share`

- [x] AT-B: ホストのファイルが変わったと伝えると、ドリルの位置を保ったまま新しい内容で描き直す

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `re-reads a changed file and keeps the drill position`

- [x] AT-C: スタイルファイルだけを編集しても図が描き直される

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `redraws on a style-only edit`、`packages/app/src/hooks/useStyleSource.test.ts` › `re-reads the imported sheets when the revision changes`

- [x] AT-D: 別の entry を開くとビューは初期化される。マウント直後の呼び出しも失われない

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `opens another entry and starts the view over` / `applies a call made before the first render`

- [x] AT-E: テーマ・言語・表示モードを外から切り替えられ、表示中のビューは保たれる

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `switches theme and language without losing the view` / `switches the display mode`

- [x] AT-F: ホストが指定したノードが highlight され、一度消した後も同じノードをもう一度 highlight できる

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `highlights the node the host names, and again after a clear`

- [x] AT-G: `onRevealNode` を渡すと、詳細パネルの「Jump to editor」と Cmd/Ctrl+クリックが、ノードとそれを定義したファイル（import 先を含む）をホストに渡す。渡さなければどちらも出ない

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `hands the host the node and the file that defines it` / `offers no jump without onRevealNode`

- [x] AT-H: app でも Cmd/Ctrl+クリックで定義へジャンプし、子を持つノードはドリルせずにジャンプする。ジャンプ先が無いときは今までどおりドリルする（ADR-177）

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `jumps on %s+click of a drillable node instead of drilling` / `drills on Cmd+click when the host offers no jump` / `offers no 'Jump to editor' when the host offers no jump`

- [x] AT-I: `onOpenExternal` を渡すと、外部リンクのクリックはページの遷移ではなくホストに渡る

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `hands external links to onOpenExternal instead of following them`

- [x] AT-J: `readOnly` のときは edge の右クリックメニューを開かない。書き込めるときは開く

  > ✅ Automated — `packages/app/src/viewer/mount-viewer.test.tsx` › `opens no edge menu when read-only` / `opens the edge menu when the host can write`、`packages/app/src/components/PreviewPane.test.tsx` › `does not open the menu when the host is read-only`

- [x] AT-K: ホストが一覧に挙げたツールバーの操作だけが消え、他は残る

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `omits exactly the controls a host lists in hide` / `appends a host's extras after the toolbar's own controls and can drop Share`

## 手動確認

N/A — 自動テストですべて覆っている
