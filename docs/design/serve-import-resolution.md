# `karasu serve` で import を解決する: 配信ディレクトリを丸ごとブラウザのメモリに写す

- **日付**: 2026-10-17
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3258](https://github.com/kompiro/karasu/issues/3258)
  - 関連 ADR: [ADR-9013](../adr/9013-cli-serve-mode.md)（serve モードと API。本設計はその API を足す）、[ADR-3138](../adr/3138-serve-app-without-monaco.md)（serve 専用 build）、[ADR-2993](../adr/2993-gallery-client-side-rendering.md)（gallery は 1 ファイルのみを渡す）
  - 関連 TPL: [TPL-239](../test-perspectives/TPL-239-convenience-vs-principled-api.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)、[TPL-3258](../test-perspectives/TPL-3258-host-supplies-whole-import-graph.md)（本 PR で起こす）
  - コード: `packages/app/src/ServeModeApp.tsx`、`packages/cli/src/serve.ts`、`packages/cli/src/watcher.ts`

## 背景・課題

`karasu serve` のプレビューで `import` が効かない。`karasu serve examples/en/multi-file-system` を開くと、
`index.krs` の system ラベルだけが出て、import した 3 ファイルすべてに `File not found: /serve/reader.krs` などの
診断が付く。同じディレクトリは `karasu render` では正しく描ける。

原因は app 側にある。`ServeModeApp` は `GET /api/file/:name` で開いたファイル 1 つだけを取り、ブラウザ内の
`InMemoryFileSystemProvider` に `/serve/index.krs` として書く。`compileProject` は正しい API（TPL-239）だが、
渡された fs に import 先が 1 つも無い。

同じ近道が、ほかに 2 つの症状を生む。

1. **どのファイルを開いても `/serve/index.krs` に名前が変わる。** `/services/order` を開くと、相対 import が
   `/serve/services/` ではなく `/serve/` から解決される。import 先を fs に入れても、この名前のままでは見つからない
2. **import 先を保存しても描き直さない。** SSE のハンドラは、変わったファイルが開いているファイルと同じときだけ
   読み直す。`index.krs` を見ながら `reader.krs` を保存しても何も起きない

## 現状（インベントリ）

| 観点                       | 現状                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| server の API              | `/api/files`（`.krs` の一覧、拡張子なし）、`/api/file/:name`（`.krs` 1 つ。`.krs` を後置するので `.krs.style` は取れない）、`/api/default`、`/api/watch`（SSE）                                                                                                                                                           |
| watcher                    | `.krs` で終わらないパスを捨てる（`watcher.ts`）。`.krs.style` の変更は通知されない。payload は `{ file: "<拡張子なしの相対パス>" }`                                                                                                                                                                                       |
| app の fs                  | serve モードは `ObservableFileSystemProvider(InMemoryFileSystemProvider)`（`App.tsx`）。書き込むのは開いたファイルの 1 回だけ                                                                                                                                                                                             |
| import の解決              | `ImportResolver` は `readFile` と `readDir`（directory import のみ）を呼ぶ。`exists` は呼ばない。相対パスは import する側のファイルのディレクトリから、`@import` の style は entry のパスから解決する                                                                                                                     |
| import グラフを返す helper | core に公開のものは無い。walk は `ImportResolver` の private メソッド。`CompileResult` も読んだファイルの一覧を持たない                                                                                                                                                                                                   |
| 他の画面                   | VS Code はコンパイルを extension host で `vscode.workspace.fs` 越しに行う（ブラウザに渡さない）。gallery viewer は 1 ファイルのみ。共有リンクは import を解決し終えた 1 ファイルを渡す。HTTP で遅延に読む fs は repo permalink の `GitHubRawFileSystemProvider` があり、`readDir` は投げる（directory import は効かない） |
| 規模                       | `.krs` と `.krs.style` の合計: karasu repo 全体で 108 ファイル / 164KB、`examples/` で 93 ファイル / 155KB、`examples/en/multi-file-system` で 5 ファイル / 7KB                                                                                                                                                           |

## 制約・前提

- `karasu render` と同じ import を解決する。whole-file、named、directory（`import "dir/"`）、style（`@import "x.krs.style"`）、それぞれ開いたファイルの実際のパスを起点に
- import グラフ内のどのファイル（`.krs.style` を含む）を保存しても、開いている図を描き直す
- 配信ディレクトリの外は読ませない（TPL-168）。新しい API がパスを受け取るなら、`/api/file/:name` と同じ検査を通す
- symlink をたどって配信ディレクトリの外を読まない（TPL-168 の symlink 越えの観点）。既存の `/api/file/:name` は文字列の検査だけで symlink を解決しない（`serve.ts` のコメントに既知として書いてある）ので、新しい API はこの穴を広げない形にする。`/api/file/:name` 自体の修正は #3283 で行う
- 既存の URL（`/` と `/:name`）と `/api/files`・`/api/file/:name` の形は変えない。ADR-9013 の利用者（e2e #3049 を含む）を壊さない
- out of scope: VS Code 拡張の更新契機（開いているファイルを追う設計で、別の論点）、配信ディレクトリから `node_modules` などを除く walk の見直し（`/api/files` が今すでに同じ walk をしている）、既存 `/api/file/:name` の symlink 越えと bind address・CORS の見直し（#3283）

## 検討した選択肢

### 案A: 配信ディレクトリをまるごとメモリに写す（snapshot）

server に `GET /api/project` を足す。配信ディレクトリの `.krs` と `.krs.style` をすべて、相対パスと本文の組で返す:

```json
{
  "files": [
    { "path": "index.krs", "content": "..." },
    { "path": "theme.krs.style", "content": "..." }
  ]
}
```

app は受け取ったファイルを `/serve/<path>` に書き、新しい snapshot に無いファイルを消す。開いたファイルは
`/serve/<name>.krs` という実際のパスで `compileProject` に渡す。SSE で何かしらのイベントを受けたら snapshot を取り直して描き直す。

**メリット**

- コンパイルはこれまでどおりメモリ内で閉じる。fs の実装を増やさない。directory import は `InMemoryFileSystemProvider` の `readDir` でそのまま効く
- 新しい API はパスを受け取らない。返すパスは server が自分で walk して作るので、新しい信頼境界の入力が増えない
- fs は書き込み可能のまま。app の他の書き込み経路（style の追記など）の振る舞いが変わらない
- 「どのファイルが import グラフに入るか」を app が知らなくても、全ファイルがあるので必ず足りる。グラフを求める helper が core に無くても成り立つ

**デメリット**

- import グラフに入らないファイルも送る。配信ディレクトリの `.krs` が多いほど 1 回の転送が増える。ただし上の実測で repo 全体でも 164KB で、`/api/files` は今すでに同じ walk を毎回している
- 保存のたびに全体を取り直す。ファイル単位で取り直す最適化はできるが、計測で必要になるまで入れない
- イベントを取りこぼすとメモリ上の写しが古くなる。SSE の再接続時にも snapshot を取り直して塞ぐ

### 案B: HTTP 越しに遅延に読む fs（`GitHubRawFileSystemProvider` 型）

app に `ServeFileSystemProvider` を足し、`readFile` を `GET /api/source/<path>`、`readDir` を `GET /api/dir/<path>` に
つなぐ。コンパイルのたびに import グラフのファイルだけを取る。

**メリット**

- 送るのは import グラフのファイルだけ
- 写しを持たないので古くならない。どのイベントでも描き直せば最新になる

**デメリット**

- パスを受け取る API が 2 つ増える（`.krs.style` も読めるファイル読み出しと、ディレクトリ一覧）。どちらも TPL-168 の検査が要る
- コンパイル 1 回ごとに import グラフのファイル数だけ往復する。前例の `GitHubRawFileSystemProvider` はこれを memo で抑えるが、serve では保存のたびに memo を消す仕組みが要り、結局キャッシュの無効化を作ることになる
- 読み取り専用の fs になる。app には serve モードでも fs に書く経路があり（開いたファイルの読み込み、style の追記）、書き込みをメモリに逃がす重ね合わせの層が要る

### 案C: server が import グラフを求め、そのファイルだけを送る

server 側で `ImportResolver` を Node の fs で走らせ、開いたファイルから届くファイルだけを返す。

**メリット**

- 送るファイルが最小。app は案A と同じくメモリに書くだけ

**デメリット**

- import グラフを返す公開 helper が core に無い。walk は `ImportResolver` の private メソッドで、外に出すには core の API を足す
- import 文を書き換えるとグラフが変わるので、保存のたびに server でグラフを求め直す。案A に比べて減る転送は、上の規模では数十 KB にとどまる

## 比較

| 観点               | 案A snapshot                        | 案B 遅延 fs                                | 案C server がグラフを求める        |
| ------------------ | ----------------------------------- | ------------------------------------------ | ---------------------------------- |
| 新しい API         | 1 つ（パスを受け取らない）          | 2 つ（パスを受け取る）                     | 1 つ（開いたファイル名を受け取る） |
| app の fs          | 既存の in-memory のまま             | 新しい provider + 書き込みの重ね合わせ     | 既存の in-memory のまま            |
| core の変更        | なし                                | なし                                       | import グラフの公開 helper         |
| 1 回の保存で送る量 | 配信ディレクトリ全体（実測 ≤164KB） | グラフ内のファイル（ファイル数ぶんの往復） | グラフ内のファイル                 |
| 写しが古くなる危険 | あり（再接続で取り直して塞ぐ）      | なし                                       | あり（案A と同じ）                 |

## 現時点の方針

**案A を採用する** — app のコンパイル経路と fs をそのまま使え、新しい信頼境界の入力を増やさない。案A の欠点は
送る量だが、実測でこの repo 全体を配信しても 164KB で、困る規模ではない。案B は古くならない利点があるが、
パスを受け取る API が 2 つ増え、読み取り専用の fs を書き込み可能に見せる層が要る。案C は送る量を減らすために
core の API を増やすが、減る量が小さい。

### 実装の指針

1. **server**（`packages/cli/src/serve.ts`）: `GET /api/project` を足す。`collectKrsFiles` と同じ walk で
   `.krs` と `.krs.style` を集め、`{ files: [{ path, content }] }` を返す。`path` は `/` 区切りの相対パス
   （Windows でも `/`）。symlink はたどらない: walk は `Dirent.isDirectory()` / `isFile()` で振り分け、どちらも
   link を解決しないので、symlink は file としても directory としても拾われない。読むのは walk が返したパスだけで、
   request からパスを受け取らない。既存の `/api/files`・`/api/file/:name` は残す
2. **watcher**（`packages/cli/src/watcher.ts`）: `.krs.style` の change / add / unlink も通知する。payload に
   拡張子付きの相対パス `path` を足す。`file`（拡張子なし）は `.krs` のときだけ今までどおり入れる
3. **app**（`packages/app/src/ServeModeApp.tsx`）:
   - 起動時に `/api/project` を取り、各ファイルを `/serve/<path>` に書く。開くファイルが snapshot に無ければ
     今と同じ `File not found: <name>.krs` を出す
   - `entryPath` を `/serve/<name>.krs`（実際のパス）にする。`SERVE_FILE_PATH` 定数は消す
   - SSE は `change` / `add` / `unlink` のどれを受けても snapshot を取り直し、前回あって今回無いファイルを fs から
     消してから描き直す。取り直しは直列にし、走っている間に来たイベントは 1 回の取り直しにまとめる
   - `EventSource` が切れて再接続したとき（`open` が 2 回目以降に来たとき）も取り直す
4. **テスト**
   - `packages/cli/src/serve.test.ts`: `/api/project` が `.krs` と `.krs.style` を入れ子のパスつきで返し、他の拡張子を返さない。
     配信ディレクトリの外を指す symlink（`.krs` の file link と directory link の両方）の中身を返さない
   - `packages/cli/src/watcher.test.ts`: `.krs.style` の変更が `path` つきで通知される
   - `packages/app/src/ServeModeApp.test.tsx`: import 先・directory import・style import がメモリに入り、サブディレクトリのファイルを
     実際のパスで開く。import 先の変更イベントで取り直し、消えたファイルが fs から消える
   - `packages/cli/src/serve.e2e.test.ts`（実 watcher）: import 先を書き換えると SSE が届き、`/api/project` が新しい本文を返す
5. AT: `docs/acceptance/3258-serve-resolves-imports.md` を新規に作る。TC は:
   - `examples/en/multi-file-system` を serve し、`/` に `File not found` が出ず 3 ファイルのサービスが描かれる
   - サブディレクトリのファイルを `/<dir>/<name>` で開き、相対 import が解決される
   - `import "dir/"` と `@import "x.krs.style"` が効く
   - import 先の `.krs` を保存すると、開いている図が再読み込みなしで描き直される
   - `.krs.style` を保存すると描き直される
   - import 先のファイルを消すと、その import に `File not found` が出る
6. ADR 昇格: 実装完了後、`docs/adr/3258-serve-import-resolution.md` として昇格し、本 Design Doc は同じ PR で削除する。
   ADR-9013 の API 表は書き換えない（ADR-2687）。新 ADR から ADR-9013 を `related_to` で参照する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: multi-file の model が serve で描けるようになる。1 ファイルの model の振る舞いは変わらない
- ドキュメント更新: `docs/guide/` の serve の説明に import が効く旨の記述があれば確認する（無ければ追記しない）
- テスト・examples への影響: #3049 の serve e2e は 1 ファイルの fixture だけを使い、`/api/file/:name` を直接見ないので影響しない

## 決めないこと

- ファイル単位の取り直し（イベントの `path` だけを取る）。案A の転送量が問題になったと計測で分かったら入れる
- walk から `node_modules` や `.git` を除くこと。`/api/files` も同じ walk なので、両方まとめて別 Issue で扱う
