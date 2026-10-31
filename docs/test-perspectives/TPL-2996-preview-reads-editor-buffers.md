---
id: TPL-2996
title: "エディタの中で動く機能は、開いているファイルを保存前のバッファから読む。entry だけでなく import 先も"
status: active
date: 2026-10-17
applicable_to:
  - "エディタの拡張ホストや言語サーバーの中で、`.krs` / `.krs.style` を読んで結果を出す機能（preview・定義ジャンプ・診断）"
  - "core の `FileSystemProvider` をホストのファイル API で実装し、`compileProject` や `ImportResolver` に渡す箇所"
known_consumers:
  - vscode-preview
  - lsp-definition-imports
discovered_from:
  - issue: "#2996"
related_to:
  - TPL-1207
  - TPL-1024
topic: vscode
scope:
  packages:
    - vscode
    - lsp
---

# TPL-2996: エディタの中で動く機能は、開いているファイルを保存前のバッファから読む

## 観点

エディタの中で動く機能にとって、利用者が見ている `.krs` は **エディタのバッファ** であって、ディスク上のファイルではない。保存前の編集はバッファにしか無い。ホストのファイル API（VS Code の `vscode.workspace.fs`、Node の `fs`）はディスクを読むので、それで `FileSystemProvider` を作ると、保存するまで結果が古いままになる。

entry のファイルだけをバッファから読むのでは足りない。`@import` した `.krs` や `.krs.style` を別のタブで編集している場合、その内容もバッファにある。読み出しの口を 1 か所にまとめ、**開いているファイルはバッファ、開いていないファイルはディスク** の順で引く。

## 想定される失敗モード

- 編集のたびに再描画は走るが、描いているのは保存済みの内容で、図が変わらない。保存した瞬間に変わるので「debounce が長い」「たまに反映されない」と読まれやすい（#2996 の調査で、VS Code の preview がこの形になっていることがコードから分かった）
- entry はバッファから読むが import 先はディスクから読み、別タブでのスタイルの編集だけが反映されない
- 定義ジャンプが import 先の保存前の行番号を知らず、編集後の位置からずれた行に飛ぶ（`definition-imports.ts` は import 先を `readFileSync` で読む）
- 変更通知を entry のバッファの変更にだけ繋ぎ、import 先のバッファの変更や外部での保存では再描画しない

## チェックリスト

- [ ] `FileSystemProvider` の `readFile` が、開いている文書（`workspace.textDocuments` / LSP の `documents`）を先に引いているか
- [ ] entry 以外のファイル（import 先の `.krs`、`.krs.style`）の未保存の編集でも結果が変わるか
- [ ] 再描画のきっかけが、entry だけでなく project 内のどのファイルのバッファの変更・保存にも繋がっているか
- [ ] 保存前の編集が結果に出ることを、保存しない操作だけで確かめるテストがあるか（e2e で入力した後に保存しない）

## 既知の対処パターン

- 読み出しの口を 1 つにし、`uri` で開いている文書を引いて `getText()`、無ければディスクを読む overlay の `FileSystemProvider` にする（#2996 の Design Doc で、VS Code の preview のホスト FS をこの形にすると決めた）

## 由来

<!-- absent-path-next-line: deleted by #3312 (ADR-2996), named as history -->
#2996 の調査で読んだ root cause は `packages/vscode/src/vscode-fs-provider.ts`（拡張ホストで `vscode.workspace.fs` だけを読む `FileSystemProvider`）だった。このファイルは #3312（ADR-2996）で消え、読み出しの口は `packages/vscode/src/host-files.ts` の `readThroughBuffers` に移った。frontmatter の引用は 2026-10 のレビュー（#3357）で外した。LSP の定義ジャンプ（`definition-imports.ts`）は今も import 先をディスクから読むので、本 TPL の consumer は残っている。

## 関連テスト

- `packages/vscode/src/host-files.test.ts` › `readThroughBuffers (#3312, TPL-2996)` — 開いている文書はバッファ（未保存の編集を含む）、開いていない文書はディスクから読む。空のバッファを「無い」と取り違えない（チェックリストの 1）
- `packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts` › `TPL-2996: an unsaved edit reaches the preview and keeps the drilled view` — 保存しない操作だけで、編集が VS Code の preview に出ることを実 webview で見る（チェックリストの 4）
- `packages/app/src/viewer/mount-viewer.test.tsx` › `redraws on a style-only edit` — import 先のスタイルだけを変えても図が描き直される（チェックリストの 2、viewer 側）
- `packages/lsp/src/definition-imports.test.ts` — import 先をたどる定義ジャンプの fence。今はディスク上のファイルだけを読む前提で、import 先のバッファを優先する項目はまだ無い（LSP の consumer は未対応）
