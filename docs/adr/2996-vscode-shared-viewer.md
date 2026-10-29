---
id: ADR-2996
title: VS Code 拡張の preview は app の viewer を webview で動かし、ファイルはホストへの要求で読み書きする
status: accepted
date: 2026-10-24
topic: vscode
authors: [kompiro]
supersedes: [ADR-176, ADR-218, ADR-299]
refines: [ADR-1014]
depends_on: [ADR-2993]
related_to:
  - ADR-9014
  - ADR-177
  - ADR-2906
  - ADR-2677
  - ADR-2818
  - ADR-2917
  - ADR-1742
scope:
  packages: [vscode, app, vscode-e2e]
  concerns: [security]
assumptions:
  - "file: packages/app/src/viewer/vscode/main.tsx"
  - "file: packages/app/src/viewer/vscode/protocol.ts"
  - "symbol: packages/app/src/viewer/vscode/host-fs.ts :: HostFileSystem"
  - "file: packages/app/vite.vscode-webview.config.ts"
  - "symbol: packages/vscode/src/host-files.ts :: decideFileRead"
  - "symbol: packages/vscode/src/host-files.ts :: decideFileWrite"
  - "symbol: packages/vscode/src/webview-html.ts :: webviewCsp"
  - "file: packages/vscode/scripts/stage-webview.ts"
  - "grep: packages/app/src/viewer/vscode/main.tsx :: keyboardShortcuts: false"
---

# ADR-2996: VS Code 拡張の preview は app の viewer を webview で動かし、ファイルはホストへの要求で読み書きする

- **日付**: 2026-10-24
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2996](https://github.com/kompiro/karasu/issues/2996)（経緯は [#2993](https://github.com/kompiro/karasu/issues/2993)）
  - 設計 PR: [#3262](https://github.com/kompiro/karasu/pull/3262)（本 ADR の元になった Design Doc）
  - 実装: スライス A [#3311](https://github.com/kompiro/karasu/issues/3311)（PR [#3318](https://github.com/kompiro/karasu/pull/3318)）、スライス B [#3312](https://github.com/kompiro/karasu/issues/3312)（PR [#3329](https://github.com/kompiro/karasu/pull/3329)）、スライス C [#3313](https://github.com/kompiro/karasu/issues/3313)（PR [#3331](https://github.com/kompiro/karasu/pull/3331)）。#3252（webview の edge に hover が無い）は B で閉じた
  - 後続: [#3330](https://github.com/kompiro/karasu/pull/3330)（vscode-e2e を app だけの PR では走らせない）、[#3325](https://github.com/kompiro/karasu/issues/3325)（ノードの hover で説明を出すか）
  - supersede: [ADR-176](176-vscode-phase3-webview-architecture.md)（独立 HTML webview）、[ADR-218](218-vscode-phase3-5-drilldown.md)（ホストが持つ drill の状態）、[ADR-299](299-vscode-icon-mode-toggle.md)（ホストが持つ Icon Mode の状態）
  - refine: [ADR-1014](1014-vscode-webview-e2e-automated.md)（webview の DOM テストは ExTester。harness が読む DOM を app のものに置き換えた）
  - [ADR-2993](2993-gallery-client-side-rendering.md)（viewer のビルド。`mountViewer()`）、[ADR-9014](9014-vscode-extension-lsp-first.md)（未決事項「Vite でビルドした静的ファイルを拡張に同梱する」）、[ADR-177](177-node-click-ux.md)（Cmd/Ctrl+クリック = エディタへジャンプ）、[ADR-2906](2906-icon-mode-removal-release-undecided.md)（VS Code の Icon Mode トグルは据え置き）、[ADR-2677](2677-language-v2-act.md)（エラー中は新しい図を出さない）、[ADR-2818](2818-cross-navigation-highlight-id-space.md) / [ADR-2917](2917-multi-system-root-same-id-nodes.md)（highlight と drill の id 空間）、[ADR-1742](1742-vscode-e2e-path-filter-trigger.md)（vscode-e2e の path filter）
  - TPL: [TPL-2996](../test-perspectives/TPL-2996-preview-reads-editor-buffers.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、[TPL-1207](../test-perspectives/TPL-1207-text-as-single-source-of-truth.md)、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)、[TPL-3137](../test-perspectives/TPL-3137-bundled-notices-cover-workspace-deps.md)
  - 受け入れテスト: [3312-vscode-shared-viewer](../acceptance/3312-vscode-shared-viewer.md)、[3313-vscode-preview-writes](../acceptance/3313-vscode-preview-writes.md)

## 背景

VS Code 拡張の preview は手書きの webview だった（`webview-content.ts`、約 870 行）。拡張ホストが core で SVG を描き、webview は独自のツールバー・詳細パネル・script を持っていた。app の preview に入った機能（パン/ズーム、CRUD 行列、facet、edge の hover と詳細パネル、collapse など）は、作り直さない限り VS Code に届かなかった。#3252（edge の hover が無い）はその一例である。

ADR-176 はこの形を Phase 3 の範囲に合わせて選び、「webview が複雑になったら UI の切り出しを再評価する」と残した。却下した案（React + Vite で preview を共用する）の理由は、別ビルドの構成と `PreviewPane` の整理が Phase 3 には重すぎることだった。

**その前提が変わった。** #2997 が app の preview をエディタ抜きの別ビルド（viewer）として切り出し、ネットワークに出ない形で `.krs` を受け取って描くところまで作った（ADR-2993）。ADR-176 が重いとした 2 つの作業は済んでいた。

調べる中で、もう 1 つ問題が見つかった。手書きの preview は `vscode.workspace.fs` 経由でディスクのファイルをコンパイルしていたので、**保存前の編集が図に出なかった**（TPL-2996）。

## 決定

**VS Code の preview は app の viewer を webview で動かし、コンパイルも webview で行う。viewer が読み書きするファイルは、ホストへの要求で取る（Design Doc の案 3a）。** ホストは、エディタで開いているファイルはそのバッファから、開いていないファイルはディスクから返し、書き込みはエディタのバッファに `WorkspaceEdit` で当てる。

### 1. ビルドと配置

- app の VS Code 用の入口 `src/viewer/vscode/main.tsx` を、`vite.vscode-webview.config.ts` で 1 本の `viewer.js` と `viewer.css` に固定名でビルドする（`base: "./"`、code splitting なし、Monaco が入ればビルドを落とす）。`acquireVsCodeApi` とメッセージの型を知るのはこの入口だけで、app 側には「ホストが差し込む口」だけを足した（`mountViewer()` の `fs` / `entryPath` / `onRevealNode` / `onOpenExternal` / `readOnly` / `keyboardShortcuts` と、戻り値のハンドル）。
- 拡張の `build` がこのビルドを `out/webview/` に置き（`scripts/stage-webview.ts`）、置かれていなければ `postbuild` が落とす（TPL-1024）。拡張は app を devDependency に持ち、同梱した app の依存は拡張の notices に入る（TPL-3137）。

### 2. ページと CSP

ページはパネルごとに 1 度だけ書く。CSP は `default-src 'none'`、script は nonce 付きの 1 本、style は拡張の配下と inline（SVG の `<style>` と React の style 属性のため）、画像は拡張の配下と `data:`。`localResourceRoots` は `out/webview` だけ。テーマと言語は `<html>` に書いてから script を読むので、描画前の inline script は要らない。開始値（entry・テーマ・言語）は JSON の data block で渡す。

### 3. メッセージ

webview と拡張の契約は `@karasu-tools/app/vscode-webview-protocol`（`src/viewer/vscode/protocol.ts`）の 1 か所に置く。拡張は受けたメッセージをすべてこの形で組み立て直してから扱う（TPL-168）。

- webview → ホスト: `ready`、`fs`（`readFile` / `readDir` / `exists` / `writeFile`）、`revealNode`、`openExternal`
- ホスト → webview: `fsResult`、`setEntry`、`refresh`、`filesChanged`、`setTheme`、`highlight`
- ページの準備ができる前に送るメッセージは種類ごとに 1 つへ畳んで待たせる。要求 id は無作為な値から始め、再読み込みしたページが前のページ宛ての応答を受けないようにする。

### 4. 読める範囲と書ける範囲

ホストは受けたパスを正規化し（`..` を解き、符号化した区切りと NUL を拒否する）、`realpath` で実体を取ってから判定する。

| 操作 | 範囲 |
| --- | --- |
| ファイルの中身・存在 | 実体が `.krs` / `.krs.style` なら場所を問わない。ワークスペースフォルダの外を import するモデルも描けるようにするためで、旧 preview と LSP もそこを読む。名前だけ `.krs` で実体が別のファイルは拒否し、拡張子は Windows と macOS で大文字小文字を区別しない |
| ディレクトリの一覧 | ワークスペースフォルダの中だけ。entry がどのフォルダにも無いときは、entry のディレクトリも加える。外のものの存在には `false` を返す |
| 書き込み | ワークスペースフォルダ（と外の entry のディレクトリ）の中の `.krs` / `.krs.style` だけで、実パスで判定する。まだ無いファイルは親ディレクトリの実パスと自分の名前で判定する |

### 5. キャッシュと変更の通知

viewer 側のホスト FS は世代つきのキャッシュを持つ。`filesChanged`・`setEntry`・`refresh` のたびに世代を進め、それより前に出した要求の応答はキャッシュに入れない（要求したコンパイルには返すが、`useDebouncedCompile` が古い結果として捨てる）。`unmount` では待っている要求をすべて reject する。

拡張は、どの `.krs` / `.krs.style` のバッファの変更・閉じる操作・ディスク上の変更も `filesChanged` で送る。entry のエディタにフォーカスが戻ったとき（または preview を開き直したとき）は `refresh` を送り、監視の外にある import 先の変更も拾う。viewer は表示中のビューと drill の位置を保ったまま描き直す。

### 6. エディタとの連携

- アクティブな `.krs` エディタが変わったら、それを entry にする。ただし、ジャンプが開いたエディタでは entry を変えない。
- カーソル位置のノードは LSP の `NodeAtPositionRequest` を通して highlight する。
- Cmd/Ctrl+クリックと詳細パネルの「Jump to editor」は、viewer が `nodeFileIndex` から引いた定義のファイルを開き、そのファイルに LSP の `PositionOfNodeRequest` を送る（ADR-177）。別ファイルへのジャンプと、切り替えた後に古いファイルを引く問題がこれで直った。app でもジャンプ先があれば Cmd/Ctrl+クリックがジャンプになる。
- テーマは `activeColorTheme` に追従し、言語は `vscode.env.language` をパネルを開いたときに 1 度読む。viewer のテーマ・言語の切替は出さない。

### 7. ツールバーとキー操作

VS Code 用のツールバーには Icon Mode のトグルと「ⓘ for details · Cmd/Ctrl+Click to jump」の案内を置く（ADR-2906 が Icon Mode の削除を決めるまで据え置く）。Icon Mode の状態は webview の中で持ち、ホストに往復しない（ADR-299 の「ホストが管理する」を置き換える）。共有・書き出し・全層表示・Docs は出さない。

app のキーボードショートカットは webview では登録しない。VS Code は webview の中の keydown も自分のキーバインドとして扱うので、`mod+1` や `mod+shift+f` が二重に動くからである。

### 8. 書き込み

preview の書き込みは edge の右クリックで選ぶ向き（`edge#… { direction: … }`）だけで、CRUD 行列は表示だけである。書き込みはエディタのバッファに `WorkspaceEdit` で当て、保存しない。文書は dirty になり、エディタの undo で取り消せる（TPL-1207）。

- 置き換えるのは前後の共通部分を除いた範囲だけにし、カーソルと他の編集を崩さない。
- 書き込みには viewer が最後に読んだ本文を `base` として添える。バッファがそれと違う（利用者が間で編集した）か、既にあるファイルに `base` が無いときは、ホストは書かずに断る。
- まだ無いスタイルファイルは `createFile` で作る。判定の後にファイルが現れていたら、先頭に挿し込まずに編集を失敗させる。

### 9. テスト

webview の DOM テストは ExTester で続ける（ADR-1014）が、harness が読むのは app の DOM（`.node-detail-panel`、`DiagramTabBar` の `role="tab"`、`nav.breadcrumb`）になった。viewer は図の上の押下を mousedown と mouseup の組で読み、tab は mousedown で切り替わるので、harness のクリックは 3 つのイベントを順に送る。viewer の挙動そのものは app の unit test と Playwright が正本で、ExTester はエディタとの往復・ホストの読み書き・`.vsix` での起動を見る。vscode-e2e は app だけの変更では起動しない（#3330）。

## 理由

- app に機能が入るたびに VS Code 向けに作り直す必要がなくなる。今後 app に入る機能も、VS Code が隠すものを除いて自動で届く。
- 複数ファイルの `@import` が、core の `ImportResolver` のまま動く。ホストに解決のロジックを複製しない。
- 保存前の編集が、entry だけでなく import 先の分も図に出る。
- 書き込みがエディタのバッファに入るので、undo と未保存の状態に乗り、テキストを迂回しない。
- ADR-176 が重いとした別ビルドと `PreviewPane` の整理は、#2997 で済んでいた。

## 却下した案

- **手書きの webview を続け、機能を 1 つずつ移植する（ADR-176 のまま）。** app に機能が入るたびに二重実装になり、VS Code が遅れ続ける。移植した部分も app と挙動がずれる。
- **拡張ホストでコンパイルを続け、viewer には結果だけを渡す。** app の preview はコンパイル結果を同じプロセスで扱う前提で書かれており、直列化できる形に分け直すのは ADR-176 が重いとした整理そのものになる。ビュー切替や drill のたびにホストとの往復も要る。
- **ホストが import の閉包を解決して全ファイルを先に送る（案 3b）。** ホストが `ImportResolver` を別に回すことになり、編集のたびに閉包を求め直し、ディレクトリ import の一覧も先回りして送る必要がある。
- **ホストされた app を iframe で埋める。** オフラインで動かず、ローカルのファイルを外のサイトに渡す経路が要る。ADR-2993 の「app に接続口を足さない」に反する。
- **読み出しをワークスペースフォルダの中だけに限る（Design Doc の当初案）。** モノレポの一部だけを開いて外を import するモデルが描けなくなる。旧 preview と LSP は読めていたので後退になる。モデルファイルだけを、実体で判定して返す形にした。

## 結果

- preview の見た目と操作は app と同じになった。設定項目は無いので、利用者の移行作業は無い。
- `.vsix` は viewer の JS 約 1.5MB（gzip 約 445KB）の分だけ大きくなった。
- hover でノードの説明を出す機能は落とした（app に無いため）。app に入れるかは #3325 で決める。
- 拡張ホストの `drilldown-state.ts`・`render-gate.ts`・`webview-i18n.ts`・`vscode-fs-provider.ts` は消え、drill・エラー時の図・文言は app の実装に乗った。

## 未解決の問い

- **バンドルの大きさ。** Chat（Anthropic SDK）と `@monaco-editor/react` が `EditPane` 経由でバンドルに入っている。ギャラリーにも効くので、別 Issue で遅延 import に分ける。
- **書き出し。** SVG / draw.io の書き出しを VS Code の保存ダイアログにつなぐかは、別に決める。
- **Windows のパス。** core のパスの扱いは `/` を前提にしているので、`\` 区切りの entry では import が解決できない。旧 preview からある問題である。
- **大きなモデルの速度。** webview の main thread でコンパイルするのは app と同じ。ホストとの往復が効くかは、まだ計っていない。
