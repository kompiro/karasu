---
id: TPL-2942
title: "パス引数は「存在する」だけでは読めるファイルではない — 種類まで見て、理由を言うメッセージで止める"
status: active
date: 2026-10-08
applicable_to:
  - "利用者が入力したパスを受け取り、存在確認のあとでファイルとして読む CLI コマンド・ハンドラ"
  - "存在確認と読み込みが別の層（コマンド側のガードと core の resolver / reader）に分かれている経路"
  - "同じ種類の引数（エントリ .krs など）を、コマンドごとに別々のガードで確かめている構成"
known_consumers:
  - cli-render
  - cli-check
  - cli-matrix
  - cli-coverage
  - cli-team-dependencies
  - cli-subtree
  - cli-remove
  - cli-insert
  - cli-apply
  - cli-append
  - cli-fmt
  - cli-diff
  - cli-translate
discovered_from:
  - issue: "#2942"
  - issue: "#3106"
  - root_cause_file: "packages/cli/src/compile-system-view.ts:94"
related_to:
  - TPL-2715
  - TPL-168
topic: cli
scope:
  packages:
    - cli
---

# TPL-2942: パス引数は「存在する」だけでは読めるファイルではない — 種類まで見て、理由を言うメッセージで止める

## 観点

`stat` が成功したパスは「存在する」だけで、「読めるファイル」とは限らない。ディレクトリ・
ファイルの名前をしたディレクトリ（`index.krs/`）も存在確認を通る。存在確認だけのガードを
通したあと、別の層が `readFile` するとき、失敗は**その層の語彙**で報告される。

発見事例（#2942）: `karasu check dir` は `resolveKrsFileOrExit` の存在確認を通り、
import resolver が読み込みに失敗して `Error: dir: File not found: /abs/path/to/dir` と
出した。ディレクトリは存在するので、メッセージは事実と逆である。同じ根は
#3106 で他のコマンドにも見つかった（`remove` は生の `EISDIR`、`fmt` は Node のスタック
トレース、`diff` / `translate` は同じ偽の "File not found"）。各コマンドが自分でパスを
確かめているので、新しいコマンドが増えるたびに同じ欠落が複製される。

パスの種類を見たら、受け付けるか（ディレクトリを `index.krs` として読むなど）、
**なぜ受け付けないかを言うメッセージ**で止める。位置付きの診断は、利用者が開ける
ファイルを名指す（[TPL-2715]: `dir:3:5` ではなく `dir/index.krs:3:5`）。

## 想定される失敗モード

- 存在するパスを「見つからない」と報告する（利用者はパスの綴りを疑い、原因から遠ざかる）
- `EISDIR` などの OS のエラーコードや、未捕捉のスタックトレースがそのまま出る
- ディレクトリを受け付けるようにしたが、診断の位置がディレクトリ名のままで開けない
- 同じ種類の引数を取るコマンドの間で、ディレクトリを渡したときの挙動が食い違う

## チェックリスト

パスを受け取るコマンドを追加・変更するとき:

- [ ] 存在するディレクトリを渡すテストがあるか（受け付けるなら何を読むか、拒むならメッセージが
      「ディレクトリである」ことを言っているか）
- [ ] ファイルの名前をしたディレクトリ（`index.krs/`）を渡しても、ファイルとして読まないか
- [ ] ディレクトリを受け付ける場合、診断の位置が実際に読んだファイルを名指しているか
- [ ] 同じ種類の引数を取る既存コマンドの共有ガード（エントリ .krs なら
      `resolveKrsFileOrExit`）を通っているか、通らない理由があるか

## 既知の対処パターン

- エントリ `.krs` を取るコマンドは `resolveKrsFileOrExit` を通す。ディレクトリは
  `index.krs` に解決し、無ければ `Error: <dir> has no index.krs; pass the entry .krs file` で
  止める。返り値の `displayPath` を診断の表示に使う（#2942）
- 種類の判定は `stat().isDirectory()` で行い、解決先も同じ判定で「ファイルであること」を
  確かめる（解決先がディレクトリなら「無い」と同じ扱い）
- 「存在しない」と読んでよいのは `stat` の `ENOENT` / `ENOTDIR` だけ。`EACCES` / `ELOOP` /
  `EPERM` まで `catch {}` で「無い」に畳むと、存在するパスがまた "File not found" になる。
  それ以外のエラーはシステムの理由を 1 行で出して止める（#2942 のレビュー指摘）

## 関連テスト

- `packages/cli/src/compile-system-view.test.ts` — `resolveKrsFileOrExit`（ファイル /
  ディレクトリ / `index.krs` の無いディレクトリ / `index.krs/` ディレクトリ / 不在 /
  stat できないパス（`ELOOP`））
- `packages/cli/src/check.test.ts` — `given a directory`（実コンパイラでの位置表示と
  `render` との一致）

[TPL-2715]: TPL-2715-source-position-carries-its-document.md
