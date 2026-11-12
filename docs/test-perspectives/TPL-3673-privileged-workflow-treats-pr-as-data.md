---
id: TPL-3673
title: "書き込み権限を持つ workflow は、PR 由来のものをデータとして扱い、実行も信用もしない"
status: active
date: 2026-11-07
applicable_to:
  - "PR が書けるものを読みながら、書き込み権限のトークンや secret を持つ workflow を書く、または変えるとき"
  - "`workflow_run` / `pull_request_target` / `schedule` のように default branch の定義で動く workflow を足すとき"
  - "マージやラベルの付与など、main や PR の状態を workflow から変える経路を足すとき"
known_consumers:
  - rendering-change-label
  - review-request
  - low-pr-merger
discovered_from:
  - issue: "#3673"
  - root_cause_adr: ADR-3416
related_to:
  - TPL-3286
  - TPL-2658
  - TPL-2786
topic: build
scope:
  packages: []
  paths:
    - ".github/workflows/rendering-change-label.yml"
    - ".github/workflows/review-request.yml"
    - ".github/workflows/low-pr-merger.yml"
    - "scripts/review/low-pr-merger*.ts"
---

# TPL-3673: 書き込み権限を持つ workflow は、PR 由来のものをデータとして扱い、実行も信用もしない

## 観点

default branch の定義で動く workflow は、PR が定義を書き換えられないので判定を任せられる。ただしそれが成り立つのは、PR が書けるもの（ファイル、ブランチ名、タイトル、本文、artifact、起動元の workflow の名前）を実行せず、そのまま事実として使わない場合だけである。

権限は使うステップまで遅らせる。PR のファイルを読む処理と、鍵を持つ処理を同じ job に置かない。鍵は、PR 側の workflow から読めない場所（branch を絞った environment など）に置く。

## 想定される失敗モード

- 判定の前に PR の head を checkout して依存を install する、または PR 内のスクリプトを実行する。PR のコードが書き込み権限のトークンを持って動く
- `workflow_run` の名前の一致だけを信じて処理を進める。名前は PR が同じものを定義して真似られる
- artifact や `workflow_run` の payload の PR 番号を信じて、別の PR のラベルを変える、またはマージする
- ブランチ名やタイトルを shell にそのまま展開し、コマンドが注入される
- repository secret に鍵を置く。同じ repo のブランチから動く `pull_request` の workflow は、定義を書き換えるだけでそれを読める
- 判定と書き込みのあいだに push が入り、確かめていないコミットに書き込む
- 名義を選ばずに `GITHUB_TOKEN` で main に入れる。その push では deploy などの workflow が起動せず、失敗もしない（ADR-3416）

## チェックリスト

- [ ] PR の head を実行する処理と、書き込みのトークンを持つ処理が別の job に分かれているか [judgment]
- [ ] 起動イベントの中身を使わず、GitHub から読み直した状態で判断しているか。使うなら、起動元の workflow のパスと event と head の SHA まで確かめているか [judgment]
- [ ] 鍵が PR 側の workflow から読めないことを、本物の鍵を渡さずに実際に試して確かめたか
- [ ] 書き込みが、確かめた SHA に固定されているか（`sha` 付きのマージ、ラベルなら head が同じ間だけ）
- [ ] main に入れる経路が、push の workflow を起動する名義を使っているか

## 既知の対処パターン

- `rendering-change-label.yml`: artifact を展開せずに必要な値だけ読み、PR は run の head から求め、head が同じ間だけラベルを付ける。名前に加えて起動元の workflow のパスと event を確かめる
- `regenerate-pr-flow.ts`: 確かめた head の SHA を固定して REST でマージし、別の push があれば 409 で失敗する
- `low-pr-merger.yml`（#3673）: judge は `main` を checkout し、PR の head は `tier.ts` が読む object として fetch するだけで、checkout も実行もしない。起動したイベントの中身は読まず、どの起動でも open な Low の PR をすべて読み直す。App の鍵は checkout しない merge job だけが持ち、PR を読み直してから判定した head の SHA を固定してマージする。後の job には PR 番号・SHA・判定の結果（`outcome`）・理由コード・wait のときの `stalled` だけを `env` で渡し、コメントは理由コードから決まった文面で書く

## 関連テスト

- `scripts/render-equivalence/label.test.ts`: artifact の値だけでラベルを決める判定
- `scripts/adr/regenerate-pr-flow.test.ts`: head の SHA を固定したマージ
- `scripts/ci/low-pr-merger-triggers.test.ts`: merger の workflow が PR から起動されず、`main` を checkout し、依存を install せず、イベントの中身を読まず、judge が書き込みの権限を持たないこと。App の鍵を checkout しない merge job だけが持ち、判定した head でマージし、判定の結果を `env` でしか step に渡さないこと。merge step を偽の `gh` で動かし、判定の後に head・ラベル・draft・state のどれかが変わった PR をマージしないこと
- `scripts/review/low-pr-merger-flow.test.ts`: 判定の最中に push で head が動いたら（`tier.ts` が `moved` を返したら）、その PR を待ちにすること
- `scripts/review/low-pr-merger-notice.test.ts`: コメントが理由コードだけから書かれ、判定の結果を既知の形でしか読まないこと

## 派生元

- [ADR-3416](../adr/3416-regenerate-adr-index-daily-pr.md): `GITHUB_TOKEN` 名義のマージを却下した根拠
- Issue [#3673](https://github.com/kompiro/karasu/issues/3673): Low の PR を workflow がマージする設計で、この観点をまとめて扱う必要が出た
