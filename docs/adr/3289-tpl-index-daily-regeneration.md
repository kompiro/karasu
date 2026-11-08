---
id: ADR-3289
title: TPL の索引は PR に含めず、ADR の生成物と同じ毎日の再生成 PR で生成する
status: accepted
date: 2026-11-03
topic: testing
authors: [kompiro]
related_to:
  - ADR-3416
  - ADR-788
  - ADR-1192
  - ADR-2810
scope:
  concerns:
    - ci
assumptions:
  - "grep: tpl.config.json :: \"indexCheck\": false"
  - "grep: tpl.config.json :: \"indexFile\": \"index.md\""
  - "symbol: scripts/adr/generated.ts :: readTplPaths"
  - "symbol: scripts/adr/generated.ts :: strayPaths"
  - "symbol: scripts/adr/regenerate-at.ts :: rootAt"
  - "grep: .github/workflows/adr-validate.yml :: docs/test-perspectives/\\*\\*"
  - "grep: .github/workflows/adr-validate-skip.yml :: docs/test-perspectives/\\*\\*"
  - "grep: lefthook.yml :: docs/test-perspectives/\\*\\*"
  - "file: .claude/rules/tpl-index.md"
---

# ADR-3289: TPL の索引は PR に含めず、ADR の生成物と同じ毎日の再生成 PR で生成する

- **日付**: 2026-11-03
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3289](https://github.com/kompiro/karasu/issues/3289)、設計 PR [#3538](https://github.com/kompiro/karasu/pull/3538)、実装 PR [#3579](https://github.com/kompiro/karasu/pull/3579)、マージ後の確認 [#3578](https://github.com/kompiro/karasu/issues/3578)
  - [ADR-3416](3416-regenerate-adr-index-daily-pr.md)（ADR の生成物は PR に含めず、毎日の再生成 PR でだけ更新する）。本 ADR はこれを覆さず、対象を TPL の索引に広げる
  - [ADR-788](788-adr-knowledge-graph.md)（生成物を repo に置いたまま読む）、[ADR-1192](1192-test-perspective-library.md)（TPL の運用）、[ADR-2810](2810-tpl-source-path-check-ownership.md)（TPL ディレクトリの検査は tpl-tools の CLI が持つ）
  - tpl-tools の ADR-27（`tpl regenerate` と `indexFile`）と ADR-35（`"indexCheck": false`）。`@kompiro/tpl-tools@0.0.13` で公開
  - hane 側: [kompiro/hane#99](https://github.com/kompiro/hane/issues/99)（生成された索引を PR で触らない）

## 背景

`docs/test-perspectives/README.md` の末尾の一覧表は手書きで、TPL を足す PR はそこに 1 行ずつ追記していた。
TPL の id は Issue 番号で単調に増えるので、新しい行はいつも表の末尾に入り、同時に開いた 2 本の PR は
同じ位置への挿入として衝突した（#3289 の測定では、2026-09-19〜10-19 に README を触った 28 commit のうち 23 が 1 行の追記）。

#3289 は当初、`tpl regenerate` で topic ごとの索引 `index.md` を生成し、各 PR がそれをコミットして CI の
`tpl regenerate --check` で鮮度を見る、と提案していた。topic で分けても同じ topic に足す並行 PR は衝突し続ける。
これは ADR の生成物が 2026-11-01 まで採っていた形と同じで、ADR-3416 は、生成物を PR が運ぶこと自体が
無関係な PR 同士の衝突を生み、衝突した Low の PR が auto-merge で止まる、という理由でこの形をやめていた。
TPL の PR も段階は Low（`docs/test-perspectives/**`）で、同じ止まり方をする。

## 決定

TPL の索引 `docs/test-perspectives/index.md` は PR に含めず、ADR の生成物を書く毎日の再生成 PR
（`pnpm adr:regenerate-pr`）が一緒に生成する。README の一覧表は廃止し、`index.md` へのリンクに置き換える。

## 仕組み

- **生成物のパスの集合を生成器ごとの根に広げる**（`scripts/adr/generated.ts`）。ADR は `adr.config.json`
  の `paths.adrDir` と `paths.outputs`、TPL は定数 `docs/test-perspectives` と `tpl.config.json` の
  `indexFile` から作る。どちらも素の JSON として読む（`scripts/review/tier.ts` が install なしの `node` で
  import するため）。TPL のディレクトリは karasu 側の定数で持ち、`regenerate-at.ts` と `regenerate-pr.ts` は
  `--tpl-dir` で渡す。`pnpm tpl:validate` と `pnpm tpl:regenerate` は CLI の既定値（同じ
  `docs/test-perspectives`）に頼っているので、両者が食い違ったら tpl-tools の config にディレクトリのキーを
  足す。`tpl.config.json` が無いか `indexFile` が無ければ TPL の根は出力を持たない。
  差分の分類（ふつうの PR / 再生成の PR / 混在）の規則は ADR-3416 のままで、判定の対象を両方の和集合にする
- **`indexFile` は TPL ディレクトリ配下の素のパスだけを許す。** 生成物のパスは glob として照合するので、
  `..` や glob・extglob の文字（`!(README).md` など）を含む名前は、ほかのファイルを生成物として扱わせる。
  英数字・`.`・`_`・`-` だけの区切りを許し、`..` の区切りと、最後の区切りが `.` だけのものを拒む
- **`tpl validate` は索引を見ない。** `tpl.config.json` に `"indexCheck": false` を置く。索引は毎日の
  再生成 PR が書くので、TPL を足した直後の PR では古いか、まだ無いのが正常である。キーを置いても README の
  表の検査へは戻らない（tpl-tools ADR-35）。索引が TPL と一致していることは、再生成 PR の `Validate` が
  head の入力から生成し直した結果とちょうど一致するかを比べて確かめる。生成器はその commit に実在する TPL
  だけを並べるので、一致した索引のリンクはその commit で解決する
- **生成器を 2 つ動かすときの規則**（`scripts/adr/regenerate-at.ts`・`regenerate-pr.ts`・`check-freshness.ts`）
  - `indexFile` の無い commit では TPL の生成器を動かさない。鮮度の見張りの 50 時間の窓には移行前の commit が残る
  - `tpl regenerate` は作業ディレクトリに書くので、`git archive` で展開した一時ディレクトリで動かし、
    書かれた索引を読み戻す（`regenerate-at.ts`。routine の `regenerate-pr.ts` は自分の worktree で直接動かす）
  - 入力の同一性（`inputKey`）と lockfile から読む版は生成器ごとに取る
  - 鮮度の見張りは生成器ごとに、その生成器の config だけで生成し直して判定する（`rootAt`）。片方の生成器が
    古い commit の config を拒んでも、もう片方の判定は失われない。窓の中で版が変わり、どの commit とも一致
    しなかった生成器だけ判定を見送り、どちらを見送ったかを出力に書く（TPL-2786）
  - 再生成 PR の worktree で生成器が生成物の外に書いたら失敗にする（`strayPaths`）
- **再生成 PR の名前は変えない。** ブランチ `chore/adr-regenerate` と本文の印 `<!-- adr-regenerate -->` は
  再生成 PR を見分ける印・`review-request.yml`・routine の設定が持っているので、そのまま使う。PR のタイトルと
  本文の出力の一覧だけを ADR と TPL の両方を挙げる形にした
- **`Review tier` が記録を求めない再生成 PR**（`regenerationWaivesRecord`）も両方の config で判定する。
  `.coderabbit.yaml` は生成された索引をレビューの対象から外す
- **検査の場所は `Validate` のまま。** `adr-validate.yml` の `paths` と `adr-validate-skip.yml` の
  `paths-ignore` に `docs/test-perspectives/**` を足し（TPL-1480、`adr-validate-paths-sync.test.ts` が固定）、
  pre-push の `adr-generated-check` の glob に TPL のディレクトリと `tpl.config.json` を足した
- **書き手への案内**: README の「一覧」節と `.claude/rules/tpl-index.md`（TPL の編集で読み込まれる）が、
  索引を PR に含めないことと、手元で `pnpm tpl:regenerate` した索引を捨てるコマンドを書く
- **移行**: 移行 PR（#3579）は `indexFile` を設定したが `index.md` は書かなかった（出力の設定を変える PR が
  生成物を書くと混在として落ちる）。README の表を消したので、リンク先が翌日の routine まで 404 にならないよう、
  マージの直後にマージ後の `main` の checkout から `pnpm adr:regenerate-pr` を手で実行した。開いた再生成 PR
  #3584 が最初の `index.md` を作ってマージされた

## 理由

- 索引で衝突する PR が無くなる。再生成 PR も生成物しか触らない
- ADR の生成物と同じ形にそろい、routine・required check・鮮度の見張りを二重にしない
- `index.md` は repo に置いたままなので、GitHub でも clone 直後でも読める（ADR-788 と同じ読み方）
- TPL だけを変える PR でも `Validate` が走るようになる。job は install とスクリプトのテストを含めて 1 回
  45 秒ほどかかる
- 代償は ADR と同じで、`main` の索引は最大 1 日（待ちきれない日を挟むと 2 日）遅れる。その日に足した TPL は
  ファイルを直接読めば分かる。索引に出す TPL ごとの状態（#3488）も同じだけ遅れるが、Design Doc を書く人が
  使う `tpl related --status` と `tpl checklist` は手元で導出するので遅れない
- #3038 の設計が持っていた「状態の変化が PR の diff に索引として見える」性質は手放す。状態を決める印の変更は
  TPL のファイルの diff として、導出の仕方を変える設定や版上げは config や lockfile の diff として見え、
  drift しない保証は再生成 PR の `Validate` に移るので、失うものは小さい

## 却下した案

- **各 PR が `index.md` をコミットし、CI の `--check` で鮮度を見る（#3289 の当初の提案）。** 同じ topic に
  足す並行 PR は衝突し続け、衝突した Low の PR は誰かが生成し直して push するまで止まる。ADR-3416 が
  却下した形を TPL にだけ残すことになる
- **TPL 専用の再生成 PR を別に作る。** ブランチ・印・routine の起動・鮮度の見張りが二重になり、2 本の PR が
  同じ required check を待つ。利点は生成器が互いの失敗に巻き込まれないことだが、どちらかの生成器が壊れるのは
  その版・config・入力を変える PR で、どれも `Validate` がその PR で落とす。鮮度の見張りは生成器ごとに判定するので、
  片方の失敗がもう片方の判定を奪うこともない
- **`validate` 用と `regenerate` 用に config を分ける。** `indexFile` の無い config では `tpl validate` が
  README の一覧表を検査するので、表を消した README で全 TPL が落ちる
- **karasu 側に tpl-tools のライブラリを呼ぶ検査を書く。** `pnpm tpl:validate` を tpl-tools の CLI から
  karasu のスクリプトに置き換えることになり、TPL ディレクトリの検査は tpl-tools の CLI が持つ（ADR-2810）を崩す。
  tpl-tools にキーを足す release は小さかった
- **`indexFile` を `{ "path": "index.md", "check": false }` の形に広げる。** tpl-tools 側の設計で、既存の
  `indexFile` の型を変えない真偽値のキー `indexCheck` を選んだ（tpl-tools ADR-35）

## 確かめたこと

- 移行 PR のブランチで、PR 自体が `Validate` を通ること、上に再生成の commit を重ねると「ちょうど再生成」として
  通り、`index.md` を手で書き換えると落ちることを確かめた
- 実際の `main` の履歴で鮮度の見張りを動かし、TPL の索引は `indexFile` を足す前の commit を反映している
  （移行の直後は見送りなしで一致する）と判定されることを確かめた
- 片方の生成器が古い commit で失敗する場合のテストは、両方をまとめて生成し直す実装に戻すと落ちる
- マージの直後の再生成 PR #3584 が `docs/test-perspectives/index.md` を作り、`main` の索引は 187 の TPL を
  すべて載せた。手で起動した鮮度の見張りは、ADR と TPL の索引がどちらも最新の commit を反映していると判定した
  （確認の記録は #3578）

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md): 再生成 PR を人を通さずマージしてよいかは、最終の差分で `Validate` が判定する。TPL の索引を足しても判定の仕方は変えない
- [TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md): routine が書いてよい範囲は prompt ではなく生成物のパスの宣言で検証する
- [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md): `Validate` の `paths` と skip の `paths-ignore`、pre-push の glob をそろえる
- [TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md): 鮮度の見張りが結論を出せないときは失敗にし、版の変化による見送りは理由と生成器を出力する
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md): 索引は TPL の frontmatter から導出できる値で、手で持たない
