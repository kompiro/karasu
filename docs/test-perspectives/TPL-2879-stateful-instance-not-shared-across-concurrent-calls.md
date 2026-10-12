---
id: TPL-2879
title: "呼び出しごとに状態を作り直すインスタンスを、並行する呼び出しで共有しない"
status: active
date: 2026-10-11
applicable_to:
  - "メソッドの冒頭でインスタンスのフィールド（診断の配列・訪問済みの集合・キャッシュ）をリセットするクラスを使うとき"
  - "そのクラスのインスタンス 1 つで、メソッドを `Promise.all` などで並行に呼ぶとき（before / after の 2 入力、複数エントリの一括処理）"
  - "そのクラスに await を挟む非同期のメソッドを足す、または同期のメソッドを非同期に変えるとき"
known_consumers:
  - import-resolver
  - compile-diff
discovered_from:
  - issue: "#2879"
  - root_cause_file: "packages/core/src/compile/compile-diff.ts"
  - root_cause_file: "packages/core/src/fs/import-resolver.ts"
related_to:
  - TPL-219
  - TPL-1534
topic: build
scope:
  packages:
    - core
---

# TPL-2879: 呼び出しごとに状態を作り直すインスタンスを、並行する呼び出しで共有しない

## 観点

`ImportResolver.resolve()` は冒頭で `diagnostics` / `loadedKrs` / `visitedStyles` / `resolvedCache` などのフィールドを消してから解決を始める。1 回の呼び出しを 1 つのインスタンスで閉じる設計で、逐次に呼ぶかぎり正しい。

並行に呼ぶと壊れる。`resolve()` は途中でファイルの読み込みを await するので、2 つ目の呼び出しの冒頭のリセットが 1 つ目の途中に割り込み、1 つ目が積んだ状態を消す。返す `diagnostics` は同じ配列を指す。#2879 で `compile*Diff` は before と after を 1 つのインスタンスで `Promise.all` していた。結果、両側の診断が両側に入って全件が 2 回出て、両側が同じ style sheet を import すると後から来た側が `visitedStyles` に当たって sheet を落とし、存在しない循環 import を報告した。

型も単体テストもこれを見ない。メソッドを 1 回ずつ呼ぶテストはすべて通り、並行に呼ぶ側も型は正しい。症状は「診断が 2 回出る」「片側の style が効かない」という、原因から遠い形で現れる。

## 想定される失敗モード

- 2 入力を並行に処理する経路（diff の before / after）で、片側の診断がもう片側の結果にも入り、出力で 2 回並ぶ
- 両側が同じファイルに到達すると、訪問済みの集合が共有されているので後の側がそのファイルを読まず、内容が欠けるか、循環の誤報が出る
- リセットとリセットの間に割り込んだ側の状態が消え、キャッシュ前提の処理が作り直しになる（害は性能だけに見えて、訪問済みの判定が狂うと上の 2 つになる）
- 逐次に呼んでいたコードを「速くするため」に `Promise.all` へ変えた瞬間に壊れ、変更の差分には壊れる理由が見えない

## チェックリスト

状態を持つクラスのメソッドを並行に呼ぶ、またはそのクラスを書き換えるとき:

- [ ] そのメソッドは冒頭でインスタンスのフィールドをリセットしているか。しているなら、呼び出し 1 回につきインスタンスを 1 つ作っているか
- [ ] 並行に呼ぶ箇所を grep で洗い出したか（`Promise.all` の中で同じ変数のメソッドを 2 回呼んでいないか）
- [ ] 同じファイルに両側が到達する入力（共通の import、同じ style sheet）で、両側の結果が逐次に呼んだときと一致することをテストしたか
- [ ] 返す配列・集合が、インスタンスのフィールドそのものではなく呼び出しごとの値か（返した後で次の呼び出しが同じ配列に積まないか）

## 既知の対処パターン

- **呼び出しごとにインスタンスを作る**: `new ImportResolver(fs).resolve(path)` のように、並行する呼び出しにはそれぞれ別のインスタンスを渡す。並行性は保てる。`resolveBeforeAfter` の修正（#2879）
- **状態をフィールドではなくローカルに持つ**: リセットが要るフィールドを呼び出しのローカル変数（または呼び出しごとの context オブジェクト）に移すと、インスタンスを共有しても安全になる。クラスの書き換えが要るので、使う側を直すより範囲が広い

## 関連テスト

- `packages/core/src/compile/compile-diff-warnings.test.ts`（「before and after resolve independently」: 両側の診断が 1 回ずつ出ること、両側が同じ style sheet を import しても循環 import を報告せず after の sheet が残ること）

## 派生元 spec

なし（bug [#2879](https://github.com/kompiro/karasu/issues/2879) の調査で見つけた前提の欠陥から起こした retrospective TPL）
