---
id: ADR-20260507-01
title: "FileTree の外部書き込み反映 — ObservableFileSystemProvider で fs ラッパー経由に集約する"
status: accepted
date: 2026-05-07
topic: app-ui
related_to:
  - ADR-20260317-02
  - ADR-20260506-01
  - ADR-20260506-06
scope:
  packages: [app]
assumptions:
  - "file: packages/app/src/fs/observable-provider.ts"
  - "file: packages/app/src/fs/observable-provider.test.ts"
  - "symbol: packages/app/src/fs/observable-provider.ts :: ObservableFileSystemProvider"
  - "file: packages/app/src/components/FileTree.tsx"
  - "file: packages/app/src/App.tsx"
---

# ADR-20260507-01: FileTree の外部書き込み反映 — ObservableFileSystemProvider で fs ラッパー経由に集約する

- **日付**: 2026-05-07
- **ステータス**: 決定済み
- **関連**:
  - 引き金 PR: [#1145](https://github.com/kompiro/karasu/pull/1145)（GUI style bootstrap が `.krs.style` を暗黙作成するが、FileTree に反映されない）
  - 実装 Issue/PR: [#1148](https://github.com/kompiro/karasu/issues/1148) / [#1151](https://github.com/kompiro/karasu/pull/1151)
  - 親 ADR: [ADR-20260317-02](./20260317-02-project-and-filesystem.md)（`FileSystemProvider` 抽象）
  - 関連 ADR: [ADR-20260506-01](./20260506-01-gui-driven-style-editing.md)、[ADR-20260506-06](./20260506-06-krs-style-open-affordance.md)

## 背景

`FileTree` は `useFileTreeOps`（右クリックメニュー経由の New File / Rename
/ Delete）でしか自前で reload しない。それ以外の経路で
`FileSystemProvider` に書き込みが起きると、サイドバーは古いまま表示される。

直近で具体化した経路:

- **GUI style bootstrap**（PR #1145） — `@import` 未設定の `.krs` で edge を
  右クリックすると、`<basename>.krs.style` を **暗黙的に新規作成** する。
  サイドバーには現れず、ユーザーがリロードするまで見えない。
- **AI 機能**（translate CLI / Chat UI、Issue #355/#356/#362） — 複数ファイル
  を生成する。FileTree が反映しないと生成結果が見つけられない。
- **Snapshot / project zip import / LSP code-action / 将来の拡張** — いずれも
  FileTree の op を経由しない。

`FileTree.tsx` には `refreshKey?: number` プロパティが残っていたが、コード
ベース内のどこからも値を渡しておらず、機能としては未実装だった。

## 決定

`FileSystemProvider` を実装する薄いラッパー
`ObservableFileSystemProvider` を `packages/app/src/fs/` に置き、
`writeFile` / `delete` / `mkdir` の **成功後** に
`{ type: "create" | "change" | "delete", path }` を emit する。`App.tsx`
で OPFS / Memory のどちらの delegate もこのラッパーで包み、`FileTree`
は `fs.watch?.(rootPath, …)` で subscribe して `loadDir` を呼び直す。

確定方針:

1. **イベント種別は既存の `FsEvent` 3 種**（`create` / `change` / `delete`）。
   `writeFile` は事前に `exists()` を確認して `create` か `change` を区別する。
   rename は `useFileTreeOps.renameItem` が `writeFile(new) + delete(old)` の
   合成として行うため、ラッパー側は `create` + `delete` の 2 イベントを
   自然に emit する。新しい `renamed` 種別は不要。
2. **subscribe の prefix 一致は segment-aware**。`/foobar` は `/foo` の
   子孫ではない（文字列 prefix だけで拾わない）。`/` を root にした
   subscriber はあらゆる書き込みを受け取る。
3. **包む対象は underlying fs のみ**（OPFS / InMemory）。`SnapshotOverlayFs`
   は包まない — diff 表示用 overlay は underlying fs に書き込むため、
   underlying 側で 1 回だけ通知される。
4. **`SnapshotOverlayFs` 以外の特殊 fs**（cli の `NodeFileSystemProvider`、
   `VsCodeFileSystemProvider`）は対象外。本機構は `packages/app` 内に閉じる。
5. **MVP では partial update せず full reload**。`loadDir(rootPath)` を毎回
   呼び直す。path で reload 範囲を絞る最適化は将来課題。
6. **親ディレクトリの自動展開・新規ファイルの自動選択は行わない**。サイドバーの
   現在の expand 状態とエディタのフォーカスを保つ。
7. **`refreshKey` プロパティは削除**（実利用が無いため後方互換コードは不要）。

## 理由

- **横断関心事を一箇所で吸収できる**: 機能側は `fs.writeFile(...)` を
  呼ぶだけで通知が走る。新機能（AI translate、snapshot 拡張、…）が増える
  たびに「FileTree を refresh する経路を覚えておく」必要が無い。
- **`FileSystemProvider` インターフェイスをそのまま満たす**: ラッパーを
  挟んでも下流（`AppShell`、各機能）にとっては破壊的変更にならない。
- **rename を合成として扱う設計が単純**: 既存 `FsEvent` の 3 種類で足り、
  種別を増やさずに済む。Design Doc 段階では 4 種を想定していたが、実装で
  合成性が確認できたため、interface 拡張をしないほうが API 表面が小さい。
- **segment-aware prefix で誤発火を防げる**: `/foo` を見ているサブツリー
  に対して `/foobar` の書き込みが届くと、無関係なリロードが走ってしまう。
  単純な `startsWith` ではなく `path === root || root === "/" ||
  path.startsWith(root + "/")` で判定する。
- **`exists()` の失敗を理由にユーザー操作を止めない**: `writeFile` の前段で
  `exists()` を呼ぶが、これが throw しても `writeFile` 自体は通し、`create`
  として emit する。可用性側に倒す（fs 側の一過性エラーを書き込みの可否に
  伝播させない）。

## 却下した案

### 案: 各機能から `refreshKey` を bump する（最小修正）

外部書き込みを行う側が state として `refreshKey` を持ち、書き込み後に
`setKey(k+1)` する。FileTree はその key を `useEffect` 依存に取って reload。

- 却下理由: **新機能を追加するたびに「bump を覚えていないと壊れる」**。
  AI 機能のように複数ファイル生成パスが今後増える前提では、横断漏れの
  リスクが高い。`refreshKey` を貫通させる prop drilling も増える。

### 案: FileTree を imperative ref API にする

`FileTree` が `useImperativeHandle` で `addNode(path)` /
`removeNode(path)` / `refresh()` を露出し、機能側は ref を呼ぶ。

- 却下理由: ref を引き回すために結局 prop drilling が必要。FileTree への
  結合が強くなり、`app` の AppShell 構造から外れる。部分更新の最適化目的
  でも、まずは fs ラッパー経由の path 情報があれば後付けできる。

### 案: グローバルな `FileTreeStore` を React Context に置く

ツリー state そのものをコンテキスト化し、書き込み時に
`fileTreeStore.dispatch({ type: "added", path })` する。

- 却下理由: state を 2 箇所（fs 自体とツリー state）で管理することになり、
  整合性バグの温床になる。fs ラッパーがあればツリー state は FileTree 内部
  のままでよい。

### 案: 明示的な `fileChangeBus.notify(...)` を機能側から呼ぶ

`useAppContext` が `fileChangeBus` を提供し、機能側が `notify("created",
path)` を明示的に呼ぶ。

- 却下理由: 案1 と同じく「呼び忘れ」リスクが残る。fs を直接呼ぶ箇所が
  限定的なら許容できるが、AI 機能を含む将来の経路を見据えると fs ラッパー
  で自動化したほうが安全。

### 案: `FsEvent` に `renamed` 種別を追加する

Design Doc 段階では `created` / `changed` / `deleted` / `renamed` の 4 種類を
想定していた。

- 却下理由: 既存の rename フロー（`writeFile(new) + delete(old)`）が
  ラッパーを通すと自然に `create` + `delete` を emit するため、`renamed`
  を追加しなくても受信側で同じ情報が得られる。interface 表面を増やさない
  ほうが、`FileSystemProvider` の他の実装（CLI / VS Code）に波及しない。

## スコープ外

- **partial update**: 現在は `loadDir(rootPath)` で全ツリーを再読込する。
  `event.path` を見て該当ノード周辺だけ更新する最適化は将来課題（受信側で
  path 情報は届いているので追加の API 変更は不要）。
- **OPFS の外部変更検知**: 別タブからの OPFS 書き込みなどは対象外。
  ブラウザ側に標準 API が無いため検討範囲外（同一プロセス内の書き込みに
  閉じる）。
- **CLI / LSP / VS Code の fs ラップ**: いずれもサイドバーを持たない / VS Code
  の場合は extension host が独自の watcher を持つため、`packages/app` に
  閉じる。
