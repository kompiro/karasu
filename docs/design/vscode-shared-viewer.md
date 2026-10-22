# VS Code 拡張の preview を共有 viewer に置き換える

- **日付**: 2026-10-17
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2996](https://github.com/kompiro/karasu/issues/2996)（経緯は [#2993](https://github.com/kompiro/karasu/issues/2993)、viewer のビルドは [#2997](https://github.com/kompiro/karasu/issues/2997)）
  - 本件で閉じる Issue: [#3252](https://github.com/kompiro/karasu/issues/3252)（webview の edge に hover が無い）
  - 関連 ADR: [ADR-176](../adr/176-vscode-phase3-webview-architecture.md)（独立 HTML webview。本件で supersede する）, [ADR-9014](../adr/9014-vscode-extension-lsp-first.md)（LSP first。未決事項に「Vite でビルドした静的ファイルを拡張に同梱する」）, [ADR-2993](../adr/2993-gallery-client-side-rendering.md)（viewer のビルド。`mountViewer()` は VS Code からの再利用を見越した形）, [ADR-177](../adr/177-node-click-ux.md)（クリック = drill / 詳細、Cmd/Ctrl+クリック = エディタへジャンプ）, [ADR-218](../adr/218-vscode-phase3-5-drilldown.md)（drill-down）, [ADR-299](../adr/299-vscode-icon-mode-toggle.md) と [ADR-2906](../adr/2906-icon-mode-removal-release-undecided.md)（VS Code の Icon Mode トグルは据え置き）, [ADR-1014](../adr/1014-vscode-webview-e2e-automated.md)（webview の DOM テストは ExTester）, [ADR-2677](../adr/2677-language-v2-act.md)（エラー中は新しい図を出さない）, [ADR-2818](../adr/2818-cross-navigation-highlight-id-space.md) / [ADR-2917](../adr/2917-multi-system-root-same-id-nodes.md)（highlight と drill の id 空間）
  - 関連 TPL: [TPL-2996](../test-perspectives/TPL-2996-preview-reads-editor-buffers.md)（本 PR で起こす）, [TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)（dev と `.vsix` の配置の差）, [TPL-3137](../test-perspectives/TPL-3137-bundled-notices-cover-workspace-deps.md)（同梱物の notices）, [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)（webview からのメッセージは信頼境界の入力）, [TPL-1207](../test-perspectives/TPL-1207-text-as-single-source-of-truth.md)（書き込みは `.krs` テキストに収束させる）, [TPL-2536](../test-perspectives/TPL-2536-locale-source-chain-completeness.md)（locale の情報源の鎖）
  <!-- absent-path-next-line: the hand-written webview slice B (#3312) removed, named as the starting point -->
  - コード: `packages/vscode/src/preview-panel.ts`, `packages/vscode/src/webview-content.ts`, `packages/app/src/viewer/mount-viewer.tsx`, `packages/app/vite.viewer.config.ts`

## 背景・課題

VS Code 拡張の preview は手書きの webview である（`webview-content.ts` 約 870 行）。拡張ホストが core で SVG を描き、webview は独自のツールバー・詳細パネル・script を持つ。app の preview に入った機能（パン/ズーム、CRUD 行列、facet、edge の hover、edge の詳細パネル、collapse など）は、ここに作り直さない限り VS Code には届かない。#3252（edge の hover が無い）はその一例である。

<!-- absent-path-next-line: the package ADR-176 rejected, named as history -->
ADR-176 はこの形を Phase 3 の範囲に合わせて選び、「webview が複雑になったら UI の切り出しを再評価する」と残した。却下した案 1（`packages/ui` を切り出して React + Vite で共用）の理由は、別ビルドの構成と `PreviewPane` の整理が Phase 3 には重すぎることだった。

**その前提が変わった。** #2997 が app の preview をエディタ抜きの別ビルド（viewer）として切り出し、ネットワークに出ない形で `.krs` を受け取って描くところまで作った（ADR-2993）。`mountViewer()` は本文・初期テーマ・初期言語・ツールバーを引数で受け、VS Code の webview から再利用できる形にしてある。ADR-176 が重いとした 2 つの作業は、もう済んでいる。

調べる中で、現行の preview にもう 1 つ問題が見つかった。**コンパイルがディスク上のファイルを読んでいる。** `compileProject(document.uri.fsPath, new VsCodeFileSystemProvider())` は `vscode.workspace.fs.readFile` を通るので、保存前の編集は図に出ない（コードを読んだ限り。`getText()` の呼び出しは拡張に無い）。キー入力ごとの再描画は、保存済みの内容を描き直しているだけになる。

## 現状（インベントリ）

### 現行の webview

| 観点 | 現状 |
| --- | --- |
| パネル | `createWebviewPanel("karasu.preview", …, { enableScripts: true, retainContextWhenHidden: true })`。`localResourceRoots` / `asWebviewUri` は使っていない |
| 更新 | 編集・ビュー切替・drill のたびに `webview.html` を丸ごと差し替える（編集は 300ms debounce）。host → webview のメッセージは `highlight` の 1 種だけ |
| CSP | `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-…'` |
| コンパイル | 拡張ホストで `compileProject` を呼ぶ。ファイルは `workspace.fs` 経由でディスクから読む |
| webview → host | `switchView` / `drillDown` / `navigateTo` / `switchViewAndHighlight` / `toggleIconMode` / `navigate`（エディタへジャンプ）/ `openExternal`。`message-validation.ts` で検査 |
| エディタ連携 | カーソル移動 → LSP `NodeAtPositionRequest` → `highlight`。Cmd/Ctrl+クリック → LSP `PositionOfNodeRequest` → `revealRange`。ジャンプは同じファイルで、表示中のエディタがあるときだけ動く。パネル作成時のエディタを掴んだままなので、別のファイルに切り替えた後も古いファイルを引く |
| テーマ / 言語 | `activeColorTheme.kind` を light / dark に写し、変化で再描画。言語は `vscode.env.language` をパネル作成時に 1 回だけ読む。ツールバーの文言は英語の直書き |
| エラー時 | 同じキーの最後の正常な図を残す（ADR-2677、`render-gate.ts`） |
| 機能 | System / Deploy / Org の切替、Icon Mode トグル（ADR-299）、パンくず、hover の説明、詳細パネル、「Cmd/Ctrl+Click to jump」の案内 |
| 無い機能 | パン/ズーム、CRUD 行列、deploy block の選択、edge の hover と詳細パネル、collapse、facet、focus canvas、全層表示、警告の表示、書き出し |

### 共有 viewer（#2997）

| 観点 | 現状 |
| --- | --- |
| 入口 | `mountViewer(container, { source, initialTheme?, initialLocale?, toolbar? })`。戻り値は React の `Root` だけ |
| ファイル | `SingleFileFileSystemProvider` の 1 ファイル。`@import` したスタイルは空として扱う |
| 更新 | 本文はマウント時に 1 回書くだけ（「ページの寿命のあいだ固定」） |
| エディタへのジャンプ | `AppShell` は `hideEditor` のとき `onJumpToEditor` を渡さないので、詳細パネルの「Jump to editor」が出ない |
| ツールバー | `PreviewToolbarSlot { extras, hideShare }`。書き出し・全層表示・Docs/Reference は消せない |
| テーマ / 言語 | `ThemeProvider` / `LocaleProvider` は初期値を `useState` に入れるだけで、外から変える口が無い |
| ネットワーク | 出ない。Worker・`eval`・wasm・動的 import も無い。ただし `AppShell` が `EditPane` を静的に import するので、Chat（Anthropic SDK）と `@monaco-editor/react` がバンドルに入る |
| サイズ | JS 1.40MB（gzip 418KB）（ADR-2993） |
| 配置 | `base` は `/`。入口は固定名の `assets/viewer.js` / `assets/viewer.css` |

## 制約・前提

- **app に VS Code への接続口を作らない。** ADR-2993 の「app に nest への接続口を足さない」と同じ線を引く。app 側に足すのは「ホストが差し込む口」（ファイルの読み書き・ジャンプ・外部リンク・テーマ / 言語 / highlight の更新）で、VS Code の API や `acquireVsCodeApi` を知るのは VS Code 用の入口だけにする。
- **ギャラリーの viewer の挙動を変えない。** `mountViewer()` に足す引数はすべて省略可能にし、省略時は今の挙動のままにする。
- **現行の preview にある操作は、すべて新しい preview でも届くようにする**（下の「現行機能の対応表」）。落とすものは理由を書いて落とす。
- **VS Code の Icon Mode トグルは残す。** ADR-2906 が「削除 release を決める ADR が扱う」としてスコープ外にしている。
- **エラー中は最後の正常な図を残す**（ADR-2677）。app の `useDebouncedCompile` が同じ挙動を持つので、それに乗る。
- **`.vsix` で動くことを確かめる**（TPL-1024）。viewer の asset が dev の配置（`../app/dist-…`）を前提にすると、配布物でだけ白紙になる。
- out of scope: 書き出し（SVG / draw.io）を VS Code の保存ダイアログにつなぐこと、Chat と Monaco をバンドルから外すこと。どちらも別 Issue にする。

## 検討した選択肢

### 案1: 手書きの webview を続け、機能を 1 つずつ移植する（ADR-176 のまま）

**メリット**

- 新しいビルドも依存も増えない。`.vsix` が小さいまま
- 既存の e2e がそのまま使える

**デメリット**

- app に機能が入るたびに二重実装になり、VS Code が遅れ続ける（#3252 がその実例）
- 移植した部分も app と挙動がずれる。core の SVG 以外の UI ロジック（詳細パネル、drill、highlight）を 2 か所で持つ

### 案2: 拡張ホストでコンパイルを続け、webview の viewer には結果だけを渡す

ホストが `compileProject` を呼び、SVG とメタデータを `postMessage` で viewer に渡す。viewer は描くだけにする。

**メリット**

- ファイルの読み出しがホストに閉じる。webview に FS の口が要らない

**デメリット**

- app の preview はコンパイル結果のオブジェクト（views、`nodeFileIndex`、drill-down 用の SVG 生成など）を同じプロセスで扱う前提で書かれている。それを直列化できる形に分け直すのは、ADR-176 が重いとした `PreviewPane` の整理そのものである
- ビュー切替・drill・collapse のたびにホストとの往復が要り、app と別の経路で状態を持つことになる

### 案3: viewer を webview で動かし、コンパイルも webview で行う。ファイルはホストへの読み出し要求で取る（推奨）

viewer をそのまま webview で動かす。viewer の `FileSystemProvider` を、ホストに `postMessage` で読み出しを頼む実装（以下「ホスト FS」）に差し替える。ホストは要求されたファイルを、**エディタで開いていればそのバッファから、開いていなければディスクから**返す。ファイルが変わったらホストが変わったパスを通知し、viewer は表示中のビュー（drill の位置・選択中のビュー）を保ったまま再コンパイルする。

**メリット**

- app の preview がそのまま動く。今後 app に入る機能も、VS Code の都合で消すものを除いて自動で届く
- 複数ファイルの `@import`（ディレクトリ import の `readDir` を含む）が、core の `ImportResolver` のまま動く。ホストに解決のロジックを複製しない
- 保存前の編集が図に出る（今の問題が解ける）。import 先のファイルの未保存の編集も出る
- 書き込み（CRUD、edge の向き）を同じ口に通せば、ホストが `WorkspaceEdit` で適用できる。エディタの undo と未保存の状態に乗り、テキストを迂回しない（TPL-1207）

**デメリット**

- 読み出しが非同期の往復になる。1 回のコンパイルで import の数だけ往復する。viewer 側でキャッシュし、ホストからの変更通知で捨てる
- webview からの要求でホストがファイルを読むので、読める範囲を絞る必要がある（TPL-168）
- `.vsix` が JS 約 1.4MB 増える

#### 案3 の内側の選択: ファイルを渡す向き

- **3a（採用）: viewer が必要なファイルを要求する（pull）。** core の `FileSystemProvider` の形のまま使える
- **3b: ホストが import の閉包を解決して、全ファイルを先に送る（push）。** ホストが `ImportResolver` を別に回すことになり、編集のたびに閉包を求め直す。ディレクトリ import の `readDir` も先回りして送る必要がある

### 案4: ホストされた app（`karasu.kompiro.dev`）を webview に iframe で埋める

**デメリット**

- オフラインで動かない。ローカルのファイルを外のサイトに渡す経路が要り、ADR-2993 の「app に接続口を足さない」に反する

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| app の機能が VS Code に届くか | 移植したものだけ | 結果の直列化に乗るものだけ | ほぼすべて |
| app 側の変更量 | なし | 大（PreviewPane とコンパイル結果の分離） | 中（ホストが差し込む口） |
| VS Code 側の変更量 | 機能ごとに中 | 大 | 中（ブリッジ + ビルドの取り込み） |
| 保存前の編集 | 別途直す | 別途直す | 同時に直る |
| `.vsix` のサイズ | 変わらない | +1.4MB 程度 | +1.4MB 程度 |
| e2e | そのまま | 書き直し | 書き直し |

## 現時点の方針

**案3（3a）を採用し、ADR-176 を supersede する。** ADR-176 が却下した案 1 の理由（別ビルドの構成と `PreviewPane` の整理の重さ）は #2997 で解消している。案2 はその整理をやり直すことになる。案3 なら app に足すのはホストが差し込む口だけで、二重実装がなくなり、保存前の編集が図に出ない問題も同時に直る。

### 決めること

1. **ビルド。** app に VS Code 用の入口（`src/viewer/vscode/main.tsx`）と設定（`vite.vscode-webview.config.ts`、出力は `dist-vscode-webview/`）を足す。ギャラリーの `viewer.html` は使わない。webview の HTML はホストが組み立て、`asWebviewUri` で解決した `viewer.js` / `viewer.css` を読む。serve のビルドと同じく Monaco の混入を落とすガードを付ける。`packages/vscode` の build はこれを `out/webview/` に配置し（nest の `stage-viewer.ts`、CLI の `stage-app.ts` と同じ形）、同梱した分の notices を生成する（TPL-3137）。
2. **CSP。** `default-src 'none'; script-src 'nonce-…' ${cspSource}; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}`。`localResourceRoots` は `out/webview` だけにする。inline の style は SVG の `<style>` が必要とするので残す。storage の代替と描画前のテーマ設定は、nonce 付きの inline script でホストが置く。
3. **app に足す口**（すべて省略可能。省略時はギャラリーの今の挙動）。
   - `mountViewer()` の引数に `fs`（ホスト FS）と `entryPath`、`onRevealNode(nodeId, filePath)`、`onOpenExternal(url)`、`readOnly`、ツールバーで隠す操作の一覧
   - 戻り値をハンドルにする: `filesChanged(paths)`（表示中のビューを保って再コンパイル。`SELECT_FILE` ではなく `UPDATE_FILE_CONTENT` の経路）、`setEntry(path)`（別のファイルを開く。こちらはビューを初期化する）、`setTheme` / `setLocale` / `setDisplayMode`、`highlight(nodeId, attribute)`、`unmount`
   - `onRevealNode` を渡したときは、詳細パネルの「Jump to editor」を出し、Cmd/Ctrl+クリックをジャンプにする（ADR-177）。app でエディタがあるときの `onJumpToEditor` も同じ条件で Cmd/Ctrl+クリックに乗せるかは、スライス A で決める
   - スタイルファイルだけの編集でも図が更新されるようにする。`useStyleSource` は今、entry の import の並びが変わったときだけ読み直す
4. **ホスト FS とメッセージ。** 読み出しは要求 id 付きの往復にする（`readFile` / `readDir` / `exists`）。webview から来るメッセージはすべて今の `message-validation.ts` と同じく形を検査する（TPL-168）。
   - **読める範囲と書ける範囲。** 許可ルートはワークスペースフォルダ（ワークスペースが無いときは entry のディレクトリ）とする。ホストは受けたパスを正規化して `..`・符号化した区切り・NUL を落とし、許可ルート + 区切りの前方一致で範囲を確かめる。`file` スキームでは `realpath` を取ってもう一度確かめ、symlink が許可ルートの外を指していれば拒否する（書き込みでファイルがまだ無いときは親ディレクトリの `realpath` で見る）。書き込みはこれに加えて `.krs` / `.krs.style` だけを受け、検査を通った URI にだけ `WorkspaceEdit` を適用する。読み出しと書き込みは同じ検査関数を通す
   - **古い応答を捨てる。** viewer 側のホスト FS は世代番号を持ち、`filesChanged`・`setEntry` のたびに進める。要求には出したときの世代を付け、応答の世代が今と違えばキャッシュに入れない。応答そのものは要求したコンパイルに返してよい。そのコンパイルは `useDebouncedCompile` が古い結果として捨てる（#1534）。世代をまたいで同じパスの要求を相乗りさせない。`unmount` では待っている要求をすべて reject し、後から届いた応答は無視する
5. **エディタとの連携。** アクティブな `.krs` エディタが変わったら `setEntry`。どこかの `.krs` / `.krs.style` のバッファが変わるか保存されたら、そのパスを `filesChanged` で送る（300ms debounce は viewer 側の既存の debounce に任せる）。カーソル → highlight は今の LSP 経路のままハンドルの `highlight` に渡す。ジャンプは viewer が `nodeFileIndex` から引いたファイルを開き（表示されていなければ開く）、そのファイルに LSP `PositionOfNodeRequest` を送る。これで別ファイルへのジャンプと、切替後に古いファイルを引く問題が直る。
6. **テーマと言語。** `activeColorTheme.kind` を今の `theme-mapping.ts` で light / dark に写して初期値と `setTheme` に渡す。言語は `vscode.env.language` を `resolveLocaleTag` に通して渡す（TPL-2536）。viewer のテーマ / 言語の切替ボタンは出さない。VS Code の設定に従うのが期待であり、webview の中で別の値を持つと次の起動で食い違う。
7. **ツールバー。** VS Code 用のツールバーの差し込みには Icon Mode のトグルを置く（ADR-299 / ADR-2906）。隠すのは共有・書き出し（SVG / draw.io）・全層表示（`blob:` の新しいウィンドウ）・Docs / Reference。どれも webview では動かないか、別ウィンドウを前提にしている。現行の preview に無いので、隠しても後退にはならない。書き出しを保存ダイアログにつなぐのは別 Issue にする。
8. **書き込み。** CRUD 行列と edge の向きの書き込みは、ホスト FS の書き込みを通して `WorkspaceEdit` で適用する。これはスライス C で入れ、それまでは `readOnly` で書き込みの操作を隠す。
9. **e2e。** `packages/vscode-e2e/tests/webview` を新しい DOM に合わせて書き直す。`data-node-id` / `data-node-path` / `data-realized-node-id` は core の SVG が付けるので残る。ツールバーの選択状態は inline style ではなく app のツールバーの属性で読む（ADR-1014 が harness に書いた inline style への依存は、このとき置き換える）。ホスト側を偽装しない ADR-1014 の方針は変えない。

### 現行機能の対応表

| 現行の機能 | 新しい preview |
| --- | --- |
| System / Deploy / Org の切替 | app のビュー切替（Matrix、deploy block の選択も増える） |
| drill-down とパンくず | app の drill-down とパンくず |
| ⓘ / 葉のクリックで詳細パネル | app の詳細パネル（edge の詳細も増える） |
| Cmd/Ctrl+クリックでエディタへジャンプ | `onRevealNode`（別ファイルへも飛ぶ） |
| 詳細パネルの「Jump to editor」 | `onRevealNode` を渡すと出る |
| 「Cmd/Ctrl+Click to jump」の案内 | VS Code 用ツールバーに残す（AT-0038） |
| カーソル位置の highlight | ハンドルの `highlight` |
| 詳細パネルからの他ビューへの移動（team / deploy） | app のクロスナビゲーション（ADR-2818） |
| 外部リンク | `onOpenExternal` → `vscode.env.openExternal`（`isSafeLinkUrl` の検査はホストに残す） |
| Icon Mode トグル | VS Code 用ツールバーの差し込み → `setDisplayMode` |
| テーマ追従 | `setTheme` |
| エラー中は最後の正常な図 | app の `useDebouncedCompile` |
| 文言の i18n | app の i18n（ツールバーの英語直書きがなくなる） |

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** viewer にホストが差し込む口を足す（app） | — | 引数はすべて省略可能で、ギャラリーの挙動は変わらない。unit test で口ごとに確かめられる |
| **B** VS Code の preview を viewer に置き換える（app のビルド + vscode） | A | ビルド・配置・ブリッジ・e2e の書き直しは同時でないと成り立たない（e2e が DOM を読むので、片方だけでは CI が通らない）。書き込みは `readOnly` で隠すので、現行より後退しない。旧 `webview-content.ts` はこの PR で消す |
| **C** 書き込みを `WorkspaceEdit` につなぐ（vscode） | B | 書き込みの操作は B で隠れている。C はそれを出すだけで、出さなくても B の preview は完結している |

> スライスごとの到達点は親 Issue [#2996](https://github.com/kompiro/karasu/issues/2996) の `## Slice status` に置く。

### 実装の指針

1. スライス A: `mount-viewer.tsx` の引数とハンドル、`AppShell` の `onJumpToEditor` の条件、`PreviewToolbarSlot` の隠す一覧、`useStyleSource` の読み直し。`toolbar-slot-owner.test.ts` の provider 一覧に VS Code の入口を足す。
2. スライス B:
   - app: `src/viewer/vscode/main.tsx`（`acquireVsCodeApi` とメッセージの型はここだけが持つ）、`vite.vscode-webview.config.ts`、ビルド設定のガードテスト（固定名、Monaco の混入、ネットワークに出る `url(` が無いこと）
   <!-- absent-path-next-line: a file slice B creates in packages/vscode -->
   - vscode: `scripts/stage-webview.ts`、build への組み込み、notices、`preview-panel.ts` の書き直し（HTML の組み立て、CSP、ホスト FS、エディタ連携）、`message-validation.ts` の拡張、`webview-content.ts` の削除
   - ホスト FS の unit test: (1) `filesChanged` / `setEntry` の後に届いた古い世代の `readFile` 応答がキャッシュに入らず、次のコンパイルが新しい内容を読む。(2) `unmount` の後に届いた応答が何も更新しない。(3) 許可ルートの外を指すパス（`..`、許可ルート外の絶対パス、符号化した区切り、NUL、外を指す symlink）を読み出し・書き込みの両方で拒否し、許可ルート内の絶対パスは受け入れる（TPL-168 の negative test と正例。`entryPath` / `setEntry` は今の `document.uri.fsPath` と同じく絶対パスを受ける）
   - `.vsix` に `out/webview/` が入ることを `marketplace-manifest.test.ts` の並びで確かめる（TPL-1024）
   - e2e: `tests/webview/` の harness と AT-0038 / AT-0039 / AT-2917 の spec を書き直す。#3252 の edge hover を 1 件足す
3. スライス C: ホスト FS の書き込みを `WorkspaceEdit` で適用し、`readOnly` を外す。
4. AT: `docs/acceptance/` に新規ファイル。TC は:
   - 保存前の編集が図に出る（entry と import 先の両方）
   - drill した状態で編集しても drill の位置が保たれる
   - アクティブな `.krs` エディタを切り替えると、その図に変わる
   - Cmd/Ctrl+クリックで定義のある別ファイルが開き、その行に移る
   - カーソル位置の node が highlight される
   - VS Code のテーマを切り替えると図とツールバーが追従する。表示言語が ja のとき文言が日本語になる
   - Icon Mode のトグルが効く
   - edge に hover すると他の edge が薄くなる（#3252）
   - エラーを入れても最後の正常な図が残る
   - `.vsix` を入れた環境で preview が描かれる
5. ADR 昇格: 実装完了後、`docs/adr/2996-vscode-shared-viewer.md` として昇格し（ADR-176 を supersede、ADR-1014 の harness の記述を refine）、本 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: preview の見た目と操作が app と同じになる。設定項目は無いので移行は要らない
- ドキュメント更新: `packages/vscode/README.md`（スクリーンショットと機能説明）、`docs/` の VS Code の章、`.claude/rules/vscode-webview-tests.md`（ラベルで opt-in という古い記述もこのとき直す）
- テスト・examples への影響: `webview-content.test.ts` と snapshot は消える。vscode-e2e の webview の spec は書き直す。examples は影響なし

## 未解決の問い / 決めないこと

- **webview のキーボードショートカット。** viewer は app のショートカット（`KeyboardShortcutDispatcher`）を持ち込む。webview に focus があるときに VS Code のキーバインドとぶつかるものがないかは、スライス B で確かめる。ぶつかるものはショートカットの登録から外す
- **`.vsix` のサイズ。** Chat（Anthropic SDK）と `@monaco-editor/react` が `EditPane` 経由でバンドルに入る。ギャラリーにも効くので、別 Issue で遅延 import に分ける
- **書き出し。** SVG / draw.io の書き出しを VS Code の保存ダイアログにつなぐかは、別 Issue で決める
- **大きなモデルの速度。** webview の main thread でコンパイルするのは app と同じ。ホスト FS の往復が効くかは、スライス B で Dify 規模の reverse を開いて測る
