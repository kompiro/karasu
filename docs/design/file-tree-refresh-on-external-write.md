# FileTree refresh on external file writes

- **日付**: 2026-05-06
- **ステータス**: 検討中
- **関連**:
  - 親 Issue: なし（直近の引き金は #1141 の GUI style bootstrap）
  - 関連 PR: [#1145](https://github.com/kompiro/karasu/pull/1145) — GUI style edit が `.krs.style` を bootstrap で新規作成するようになった（FileTree に反映されない）
  - 関連設計: [`docs/design/gui-driven-style-editing.md`](./gui-driven-style-editing.md)
  - 関連 ADR: [`docs/adr/20260411-04-edit-area-and-sidebar-toggle-relocation.md`](../adr/20260411-04-edit-area-and-sidebar-toggle-relocation.md)、[`docs/adr/20260505-02-activity-bar-sidebar.md`](../adr/20260505-02-activity-bar-sidebar.md)
  - コード: `packages/app/src/components/FileTree.tsx`、`packages/app/src/hooks/useFileTreeOps.ts`、`packages/app/src/fs/*-provider.ts`

## 背景・課題

`FileTree` は `useFileTreeOps`（右クリック → New File / Rename / Delete）経由の
ファイル変更しか自前で reload しない。それ以外の経路で `FileSystemProvider`
に書き込みが起きても、ツリーは古いまま表示される。

直近で具体化した経路:

- **#1141 / PR #1145** — GUI style edit が、`@import` 未設定の `.krs` に対して
  隣接ディレクトリへ `<basename>.krs.style` を **暗黙的に新規作成** する。
  ユーザーは右クリックで Direction を選んだだけで、サイドバーには新しい
  `.krs.style` が現れない（リロード時まで見えない）。
- **AI 機能（メモリ参照）** — translate CLI / Chat UI が複数ファイルを
  生成する設計（#355/#356/#362）。FileTree が反映されないと、生成結果を
  ユーザーが見つけられない。
- **Snapshot 機能・Project zip import・LSP code-action・将来の VS Code 拡張** —
  いずれも FileTree の op を経由しない。

`FileTree.tsx` には `refreshKey?: number` プロパティが残っているが、現在の
コードベースで **どこからも値を渡していない**（`grep -rn refreshKey
packages/app/src` で declare/use の3箇所のみ）。設計上は外部 hook を意図して
いた形跡があるが、機能としては存在しない。

## 制約・前提

- `FileSystemProvider` には複数の実装がある: `InMemoryFileSystemProvider`、
  `OpfsFileSystemProvider`、`SnapshotOverlayFs`、`NodeFileSystemProvider`
  （cli）、`VsCodeFileSystemProvider`。プロバイダー側でイベントを emit する
  形にすると **全実装に変更が波及する**。
- OPFS には標準的なファイル変更通知 API がない（Chrome の File Handle 監視は
  未仕様化）。ブラウザ側で「外部から触れる」ことは現状ないので、検討対象は
  **同一プロセス内の書き込み** に閉じる。
- 既存の `FileTree` は `loadDir(rootPath, fs)` でツリー全体を再構築する。
  小規模なプロジェクトでは十分速いが、`onFileCreated?.(path)` のような
  partial-update API も既に存在する（mutation op が呼ぶだけで FileTree
  内部の state には触れていない）。
- `app` 以外（`cli` / `lsp` / `vscode`）はサイドバーを持たないので、本設計は
  `packages/app` に閉じる。
- AI 機能・snapshot 機能などは独立に進化するので、**FileTree のリフレッシュ
  経路を機能ごとに増やしたくない**（横断関心事として一箇所で扱いたい）。

## 検討した選択肢

### 案1: 各機能から `refreshKey` を bump する（最小修正）

GUI style bootstrap・AI translate・snapshot など、外部書き込みを行う
コンポーネントが state として `refreshKey` を持ち、書き込み後に `setKey(k+1)`
する。FileTree はその key を `useEffect` 依存に取って reload する。

- 利点:
  - 既存の API（`refreshKey` プロパティ）にそのまま乗る
  - 実装コストが最も低い
  - 失敗してもツリーが古くなるだけで、機能は壊れない
- 欠点:
  - **新機能を追加するたびに「refreshKey を bump する」を覚えていないといけない**
    — 横断関心事の典型的な漏れポイント
  - bump の責任が AppShell / 各機能 component に散る
  - 複数階層のコンポーネントを refreshKey が貫通する（prop drilling）

### 案2: `FileSystemProvider` をイベント発行ラッパーで包む（採用候補）

`FileSystemProvider` を実装する薄いラッパー `ObservableFileSystemProvider` を
作り、`writeFile` / `delete` / `mkdir` / `rename` の実行後に `onChange`
イベントを emit する。`useAppContext` が提供する `fs` をこのラッパーで
差し替えれば、**書き込みパスがどこを通っても自動で通知される**。FileTree は
コンテキスト経由でイベントを subscribe して reload する。

- 利点:
  - 横断関心事を一箇所（fs ラッパー）で吸収
  - 機能側は何も意識しなくてよい — `fs.writeFile(...)` を呼ぶだけ
  - イベントには path が乗るので、FileTree 側で「今のサイドバー範囲外の
    書き込みなら無視」「単一ノード差分更新」のような最適化が後付けできる
- 欠点:
  - `FileSystemProvider` のラッパーを介する層が一段増える（型・テスト
    複雑度が +1）
  - 「読み取り専用の `SnapshotOverlayFs` まで包むか」「diff 表示中の overlay
    fs はイベント発行不要では？」など 例外処理を仕様で線引きする必要がある
- 実装メモ:
  - emit は **書き込み成功後**（writeFile が resolve したあと）。失敗時は
    通知しない
  - 通知は同期 `EventTarget` または小さな `subscribe(listener)` API。React の
    外で動くので Context より subscribe pattern が素直
  - fs 提供は `useAppContext` が担っているので、置き換え点は1箇所

### 案3: FileTree を imperative ref API にする

`FileTree` が `useImperativeHandle` で `addNode(path)` / `removeNode(path)` /
`refresh()` を露出し、機能側はこの ref を呼ぶ。

- 利点:
  - 部分更新に最適化できる（ツリー全体を読まない）
  - ref の所在が明示的
- 欠点:
  - **ref を取り回すために結局 prop drilling が必要**
  - 案2 と比べて FileTree への結合が強い（FileTree がパッケージ内 API を持つ）
  - `app` の AppShell をまたいで ref を引き回すのは既存パターンから外れる

### 案4: グローバルな `FileTreeStore` を React Context に置く

ツリー state そのものをコンテキスト化。書き込み時に
`fileTreeStore.dispatch({ type: "added", path })` する。

- 利点:
  - 部分更新と subscribe が綺麗にまとまる
- 欠点:
  - state を 2 箇所（fs 自体とツリー state）で管理することになり、整合性
    バグの温床になる
  - 案2 のラッパーがあれば、ツリー state は FileTree 内部のままでよい

### 案5: ファイル変更を監視せずに、書き込み毎に **明示的に** subscribe を呼ぶ

`useAppContext` が `fileChangeBus` を提供して、機能側は **明示的に**
`fileChangeBus.notify("created", path)` を呼ぶ。FileTree は subscribe する。

- 利点:
  - 案2 と最終形はほぼ同じだが、**fs ラッパーを噛まさないので副作用が
    少なく見通せる**
  - `SnapshotOverlayFs` のような特殊 fs と独立にイベントを管理できる
- 欠点:
  - 案1 と同じく「呼び忘れ」リスクが残る（ただし fs を直接呼ぶ箇所が限定的
    なら許容できる範囲）

## 比較

| 観点 | 案1 refreshKey bump | 案2 fs ラッパー | 案3 ref API | 案4 store | 案5 明示 bus |
|---|---|---|---|---|---|
| 横断漏れ耐性 | 弱（呼び忘れ） | **強** | 中 | 強 | 中（呼び忘れ） |
| 実装コスト | **低** | 中 | 中〜高 | 高 | 中 |
| 部分更新可能 | 不可（全 reload） | 可（path で判定） | 可 | 可 | 可 |
| 既存コード破壊 | なし | プロバイダ抽象に1層 | FileTree API 増 | 大 | 小 |
| テスト容易性 | 高 | 中（fake bus） | 中 | 中 | 高 |

## 現時点の方針

**案2（fs ラッパーで横断的に通知）** を本命とする。

理由:

- 直近で「外部書き込みが FileTree に届かない」ケースが #1141 と AI 機能の
  両方で同時に立ち上がっており、横断関心事として扱う必要が高まっている
- 案1 / 案5 の「呼び忘れる」リスクは AI 機能のように **複数ファイルを
  生成する経路** が増えると現実の事故になりやすい
- 案2 のラッパーは `FileSystemProvider` インターフェイスをそのまま満たすので、
  AppShell から下流に対しては破壊的変更にならない
- 部分更新の余地（path で reload 範囲を絞る）を残せる

### MVP スコープ

1. `packages/app/src/fs/` に `ObservableFileSystemProvider` を追加
   - `writeFile` / `delete` / `mkdir` / `rename`（あれば）の **成功後** に
     `{ kind: "created"|"changed"|"deleted"|"renamed", path: string, oldPath?: string }`
     を emit
   - `writeFile` は **書き込み前に `exists(path)` を確認** し、未存在なら
     `created`、存在すれば `changed` を emit。`exists()` の往復コストは
     OPFS / Memory のいずれでも実用上無視できる
   - subscribe API は最小: `subscribe(listener) → unsubscribe`
2. `useAppContext` の fs 構築箇所で OPFS / Memory プロバイダをラップして提供
3. `FileTree` が context から bus を受け取り、変更通知を受けたら `reload()`
   を呼ぶ。**MVP では partial update せず full reload** にする（複雑度を
   後回し）
4. `refreshKey` プロパティは削除（後方互換コードがないので壊れない）
5. AT として「GUI style bootstrap で新規作成された `.krs.style` がサイドバー
   に現れる」「AI translate（仮実装でよい）でファイル生成→反映」を1本ずつ

### 副次的な扱い

- **`SnapshotOverlayFs` はラップしない**: diff 表示用の overlay は実ファイルに
  書かないので通知不要
- **CLI / VSCode の Provider はラップしない**: app 専用機構として閉じる
- **対象外スコープ**: 本設計では「ツリーを開いていないディレクトリ深部に
  ファイルが作られたとき」の自動展開は MVP では行わない（サイドバーの
  current expand 状態を保ったまま reload する）

## 確定した方針

レビューで以下を確定した:

- **親ディレクトリの自動展開**: しない。サイドバーの現在の expand 状態を保つ。
  気付きやすさは将来の通知 UI に委ねる。
- **新規ファイルの自動選択**: しない。編集中の `.krs` のフォーカスを保つ。
  bootstrap で生まれた `.krs.style` はサイドバーに現れるだけで、エディタは
  切り替えない。
- **`SnapshotOverlayFs` のラップ**: overlay 自体はラップせず、underlying fs
  のみラップする。書き込みは underlying を通るので二重発火しない。
- **イベントの粒度**: `created` / `changed` / `deleted` / `renamed` の 4 種類
  を emit する。`writeFile` 時は事前に `exists()` で created/changed を切り
  分ける。将来 toast/通知のような機能が追加されても受信側で再判定が要らない
  ように、**emit 時に差分情報を含めておく**。
