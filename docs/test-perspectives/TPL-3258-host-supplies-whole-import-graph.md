---
id: TPL-3258
title: "project を自前の fs でコンパイルする画面は、import グラフに届く全ファイルを実際のパスで渡し、そのどれが変わっても描き直す"
status: active
date: 2026-10-17
applicable_to:
  - "`compileProject` に渡す fs を、画面側で組み立てる（in-memory に書く、HTTP で取る、別の store から写す）とき"
  - "開いたファイルを fs に書くときのパスを決めるとき（固定の名前に置き換えていないか）"
  - "プレビューを描き直す契機（ファイル監視・SSE・エディタのイベント）を決めるとき"
known_consumers:
  - serve-mode-app
  - gallery-viewer
  - repo-permalink
discovered_from:
  - issue: "#3258"
  - root_cause_file: "packages/app/src/ServeModeApp.tsx"
  - root_cause_file: "packages/cli/src/watcher.ts"
related_to:
  - TPL-239
  - TPL-1024
topic: cli
scope:
  packages:
    - app
    - cli
---

# TPL-3258: project を自前の fs でコンパイルする画面は、import グラフに届く全ファイルを実際のパスで渡し、そのどれが変わっても描き直す

## 観点

TPL-239 は「`compile()` ではなく `compileProject()` を使う」ことを求める。だが `compileProject()` を呼んでも、
渡す fs に import 先が入っていなければ import は解決されない。`compileProject()` は fs に書かれたものしか読めない。

#3258 では `karasu serve` のプレビューが、開いたファイル 1 つだけを in-memory fs に `/serve/index.krs` として書いていた。
API は正しく、型も通り、1 ファイルの model ではすべて正しく描ける。multi-file の model を開いたときだけ、import 先すべてに
`File not found` が付く。さらに固定の名前に置き換えたせいで、サブディレクトリのファイルの相対 import が別のディレクトリから
解決され、描き直しの契機は開いたファイルの変更だけを見ていたので、import 先を保存しても描き直されなかった。

fs を組み立てる画面ごとに、3 つを確かめる必要がある: 何を入れるか（import グラフに届くファイル全部。`.krs.style` を含む）、
どこに入れるか（開いたファイルと import 先の、実際の相対位置）、いつ入れ直すか（グラフ内のどのファイルが変わっても）。

## 想定される失敗モード

- 開いたファイルだけを fs に入れ、import 先が `File not found` になる。1 ファイルの fixture だけのテストは全部通る
- 開いたファイルを固定の名前（`index.krs`）で書き、サブディレクトリのファイルの相対 import が別の場所を指す
- `.krs` だけを入れて `.krs.style` を入れない、または監視が `.krs` だけを見て `.krs.style` の保存で描き直さない
- 描き直しの条件が「変わったファイル == 開いたファイル」で、import 先の保存を無視する
- directory import（`import "dir/"`）が `readDir` を呼ぶのに、fs の `readDir` が空を返すか投げる

## チェックリスト

`compileProject` に渡す fs を組み立てる画面を作る、または変えるとき:

- [ ] 2 ファイル以上の fixture（whole-file import・named import・directory import・`@import` の style を含む）でテストしたか
- [ ] 開いたファイルを、元の相対パスのまま fs に書いているか。サブディレクトリのファイルを開くテストがあるか
- [ ] fs が `readDir` を持つか。持たないなら directory import が効かないことを診断で示しているか
- [ ] import 先の `.krs` と `.krs.style` を変えたとき、開いている図が描き直されるテストがあるか
- [ ] ファイルが消えたとき、fs からも消えるか（古い写しで描き続けないか）

## 既知の対処パターン

- **配信元をまるごと写す**: 画面の fs に元のディレクトリのファイルを相対パスのまま全部書き、どの変更でも取り直す。import グラフを求めなくても必ず足りる（#3258、`karasu serve`）
- **元の store を読む fs を渡す**: VS Code は extension host で `vscode.workspace.fs` を包んだ provider を渡す。CLI は `NodeFileSystemProvider`。写しを持たない
- **解決し終えた 1 ファイルを渡す**: 共有リンクは `synthesizeSharePayload` で import を解決したあとの `.krs` と `.krs.style` を作る。受け取る側は 1 ファイルのままでよい

## 関連テスト

- `packages/app/src/ServeModeApp.test.tsx`（#3258 で import 先・サブディレクトリ・更新契機のケースを足す）
- `packages/cli/src/watcher.test.ts`（`.krs.style` の通知）

## 派生元 spec

なし（bug [#3258](https://github.com/kompiro/karasu/issues/3258) の調査で見つけた retrospective TPL）
