---
id: ADR-3258
title: karasu serve は配信ディレクトリをまるごとブラウザのメモリに写して import を解決する
status: accepted
date: 2026-10-24
topic: cli
related_to: [ADR-9013, ADR-3138, ADR-2993, ADR-2687]
scope:
  packages:
    - cli
    - app
  concerns:
    - security
assumptions:
  - "symbol: packages/cli/src/serve.ts :: collectProjectFiles"
  - "symbol: packages/cli/src/serve.ts :: readFileInside"
  - "symbol: packages/cli/src/serve.ts :: PROJECT_READ_CONCURRENCY"
  - 'grep: packages/cli/src/serve.ts :: pathname === "/api/project"'
  - "grep: packages/cli/src/serve.ts :: O_NOFOLLOW"
  - "grep: packages/cli/src/watcher.ts :: data\\.file = path\\.replace"
  - "symbol: packages/app/src/ServeModeApp.tsx :: SERVE_ROOT"
  - "grep: packages/app/src/ServeModeApp.tsx :: fetch\\(\"/api/project\"\\)"
  - "grep: packages/app/src/ServeModeApp.tsx :: sourceRevision"
  - "grep: packages/app/src/components/AppShell.tsx :: displayRoot\\?: string"
  - "grep: packages/i18n/src/en.ts :: serve\\.error\\.fileNotFound"
  - "file: packages/e2e/tests/at-3258-serve-import-resolution.spec.ts"
  - "file: docs/acceptance/3258-serve-resolves-imports.md"
  - "file: docs/test-perspectives/TPL-3258-host-supplies-whole-import-graph.md"
---

# ADR-3258: karasu serve は配信ディレクトリをまるごとブラウザのメモリに写して import を解決する

- **日付**: 2026-10-24
- **ステータス**: 決定済み
- **関連**:
  - Issue #3258（起点）、設計 PR #3261（本 ADR に集約し削除: `docs/design/serve-import-resolution.md`）、実装 PR #3327
  - [ADR-9013](9013-cli-serve-mode.md)（serve モードと API。本 ADR は API を 1 つ足すだけで、既存の API 表は変えない）
  - [ADR-3138](3138-serve-app-without-monaco.md)（serve 専用 build）
  - [ADR-2993](2993-gallery-client-side-rendering.md)（gallery viewer は 1 ファイルだけを渡す。本 ADR とは別の画面）
  - TPL: [TPL-3258](../test-perspectives/TPL-3258-host-supplies-whole-import-graph.md)（本件で起こした proactive TPL）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、[TPL-239](../test-perspectives/TPL-239-convenience-vs-principled-api.md)、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)
  - AT: [AT-3258](../acceptance/3258-serve-resolves-imports.md)

## 背景

`karasu serve` のプレビューで `import` が効かなかった。`karasu serve examples/en/multi-file-system` を開くと、
`index.krs` の system ラベルだけが描かれ、import した 3 ファイルすべてに `File not found: /serve/reader.krs` などの
診断が付いた。同じディレクトリは `karasu render` では正しく描ける。

原因は app 側にあった。`ServeModeApp` は `GET /api/file/:name` で開いたファイル 1 つだけを取り、ブラウザ内の
`InMemoryFileSystemProvider` に `/serve/index.krs` として書いていた。`compileProject` は正しい API（TPL-239）だが、
渡された fs に import 先が 1 つも無かった。同じ近道が、ほかに 2 つの症状を生んでいた。

1. どのファイルを開いても `/serve/index.krs` に名前が変わるので、サブディレクトリのファイルの相対 import が
   誤ったディレクトリから解決される
2. SSE のハンドラは開いているファイル自身の変更しか読み直さないので、import 先を保存しても描き直さない。
   watcher は `.krs.style` の変更をそもそも通知していなかった

設計時点の規模の実測は、`.krs` と `.krs.style` の合計で karasu repo 全体が 108 ファイル / 164KB、
`examples/` が 93 ファイル / 155KB だった。

## 決定

server に `GET /api/project` を足し、配信ディレクトリの `.krs` と `.krs.style` をすべて相対パスと本文の組で返す。
app はそれを `/serve/<path>` という実際のパスでメモリに写し、開いたファイルをその実際のパスからコンパイルする。
watch イベントを受けるたびに、また SSE が再接続するたびに snapshot を取り直す。

## 理由

- コンパイルはメモリ内で閉じたままになり、fs の実装を増やさない。directory import は
  `InMemoryFileSystemProvider` の `readDir` でそのまま効き、`karasu render` と同じ規則で解決される
- 新しい API はリクエストからパスを受け取らない。返すパスは server が自分で walk して作るので、
  信頼境界の入力が増えない（TPL-168）
- 「どのファイルが import グラフに入るか」を app も server も求めなくてよい。全ファイルがあるので必ず足りる。
  core に import グラフを返す公開 helper が無くても成り立つ
- 送る量の欠点は実測で小さい（repo 全体でも 164KB）。`/api/files` は今すでに同じ walk を毎回している
- fs は書き込み可能のままなので、app の他の書き込み経路の振る舞いが変わらない

### 実装で固めたこと

設計から実装（#3327）とレビューの過程で、次を決めた。

- **symlink をたどらない。** walk は `Dirent.isDirectory()` / `isFile()` で振り分けるので link は拾わない。
  加えて、walk のあとに差し替えられた場合に備え、各ディレクトリは読む前に `realpath` で配信ディレクトリ内に
  あることを確かめ、ファイルは `O_NOFOLLOW` で開く（`ELOOP` は除外扱い）。Node に `openat` が無いので、確認と
  open のあいだの差し替えは残るが、配信ディレクトリへの書き込み権限と正確なタイミングが要る。Windows には
  `O_NOFOLLOW` が無く、親ディレクトリの確認だけになる
- **walk と読み出しのあいだに消えたファイルは snapshot から外す。** エディタの atomic save（一時ファイル → rename）で
  起きる。snapshot 全体を失敗させず、そのファイル自身の watch イベントが次の snapshot を連れてくる
- **同時に開くファイルは 32 個まで**（`PROJECT_READ_CONCURRENCY`）。macOS の既定の file descriptor 上限
  （1 プロセス 256）を数百ファイルのディレクトリで使い切らないため
- **watcher は `.krs.style` も通知し、payload に拡張子付きの `path` を入れる。** 拡張子なしの `file` は
  `.krs` のときだけ今までどおり入れ、既存の利用者を壊さない
- **取り直しは直列にし、走っている間に来たイベントは 1 回の取り直しにまとめる。** 書くのは本文が変わった
  ファイルだけで、snapshot から消えたファイルは fs から消す
- **import 先だけが変わったときは entry を差し替えずに再コンパイルする**（`sourceRevision`）。ドリルダウンした
  view を保つためで、entry 自身の変更は従来どおり `UPDATE_FILE_CONTENT` を通す
- **診断のパスは配信ディレクトリからの相対で出す。** `AppShell` に任意の `displayRoot` を足し、serve モードでは
  `/serve` を渡す
- **URL のパスは decode してから snapshot を引く。** これまで `/services/order` は `services%2Forder` として
  そのまま server に問い合わせられ、サブディレクトリのファイルは開けなかった
- **serve モードのエラー文言は i18n に置く**（`serve.error.fileNotFound` / `serve.error.loadFailed`）
- **snapshot の上限や streaming は入れない。** 上の実測では要らず、必要になったと計測で分かってから入れる

`/`・`/:name`・`/api/files`・`/api/file/:name` の形は変えていない。ADR-9013 の API 表は書き換えない（ADR-2687）。

## 却下した案

### 案B: HTTP 越しに遅延に読む fs（`GitHubRawFileSystemProvider` 型）

app に `readFile` を `GET /api/source/<path>`、`readDir` を `GET /api/dir/<path>` につなぐ provider を足し、
コンパイルのたびに import グラフのファイルだけを取る案。写しが古くならない利点はあるが、パスを受け取る API が
2 つ増えてどちらも TPL-168 の検査が要る。コンパイル 1 回ごとにファイル数ぶん往復し、memo で抑えると保存のたびの
無効化を作ることになる。読み取り専用の fs になるので、serve モードの書き込み経路をメモリに逃がす重ね合わせの層も要る。

### 案C: server が import グラフを求め、そのファイルだけを送る

server 側で `ImportResolver` を Node の fs で走らせ、開いたファイルから届くファイルだけを返す案。送る量は最小だが、
import グラフを返す公開 helper が core に無く（walk は `ImportResolver` の private メソッド）、core の API を足す必要がある。
import 文を書き換えるとグラフが変わるので保存のたびに求め直すことになり、案A に比べて減る転送はこの規模では
数十 KB にとどまる。

## 決めないこと

- ファイル単位の取り直し（イベントの `path` だけを取る）。案A の転送量が問題になったと計測で分かったら入れる
- walk から `node_modules` や `.git` を除くこと。`/api/files` も同じ walk なので、両方まとめて別 Issue で扱う
- 既存 `/api/file/:name` の symlink 越えと、bind address・CORS の見直し（#3283）
- VS Code 拡張の更新契機（開いているファイルを追う設計で、別の論点）
