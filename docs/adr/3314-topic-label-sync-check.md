---
id: ADR-3314
title: "topic: ラベルと topics の一致を、topics を変える PR の Validate で確かめる"
status: accepted
date: 2026-10-30
topic: adr-tooling
authors: [kompiro]
related_to:
  - ADR-2092
  - ADR-953
scope:
  concerns:
    - ci
assumptions:
  - "symbol: scripts/lint/config-topics-sync.ts :: checkLabels"
  - "grep: package.json :: lint:config-topics-sync:labels"
  - "grep: .github/workflows/adr-validate.yml :: lint:config-topics-sync:labels"
  - "grep: .github/workflows/adr-validate-skip.yml :: scripts/lint/config-topics-sync.ts"
  - "grep: .github/workflows/adr-validate.yml :: github\\.sha"
  - "grep: .github/workflows/adr-validate.yml :: issues: read"
  - "grep: .github/workflows/adr-validate.yml :: fetch-depth: 2"
  - "grep: .claude/rules/adr-topics.md :: lint:config-topics-sync:labels"
---

# ADR-3314: topic: ラベルと topics の一致を、topics を変える PR の Validate で確かめる

- **日付**: 2026-10-30
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3314](https://github.com/kompiro/karasu/issues/3314)（設計 PR #3397、実装 PR #3398）
  - PR [#3315](https://github.com/kompiro/karasu/pull/3315)（`topic:` ラベルの導入）、[#3389](https://github.com/kompiro/karasu/issues/3389)（open の Issue すべてに付ける）
  - [ADR-2092](2092-tpl-config-split.md): `adr.config.json` と `tpl.config.json` に topics を複製し、`config-topics-sync` で揃える
  - [ADR-953](953-ci-docs-only-paired-stub-workflow.md): required check の paired stub（`adr-validate.yml` と `adr-validate-skip.yml`）
  - 関連 TPL: [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)、[TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)、[TPL-2046](../test-perspectives/TPL-2046-pnpm-double-dash-arg-forwarding.md)
  - `scripts/lint/config-topics-sync.ts`、`.github/workflows/adr-validate.yml`、`.github/workflows/adr-validate-skip.yml`、`.claude/rules/adr-topics.md`

## 背景

ADR と TPL の `topics` の語彙は `adr.config.json` と `tpl.config.json` に同じものが書かれ、repo の `topic: *`
ラベルにも写されている。2 つの config の一致は `scripts/lint/config-topics-sync.ts` が確かめていたが、ラベルとの
一致はどこも確かめておらず、`.claude/rules/adr-topics.md` の `diff` のコマンドを、topics を変える人が手で
回すだけだった。

ずれは 2 方向に起きる。`adr.config.json` に topic を足したのにラベルが無い（Issue に付けられない）場合と、
topics に無い `topic:` ラベルがある（GitHub の画面で作った、改名・削除の後に旧ラベルが残った）場合である。

## 決定

topics を変える PR の required check `Validate` で、config と `topic:` ラベルを突き合わせ、ずれていれば落とす。
そのため、ラベルの追加・改名はマージ前（push の前）に行う。削除だけは、レビューで合意してから行う。

- **チェッカー**: `config-topics-sync.ts` に `--labels` を足し、`pnpm run lint:config-topics-sync:labels` で
  呼ぶ（`pnpm run x -- --labels` の形にしない。TPL-2046）。`gh api --paginate` でラベル名を読み、`adr.config.json`
  の topics と和集合で比べる（TPL-1415）。大文字小文字を区別せず `topic:` で始まるラベル（空白の有無を問わない）を
  対象にし、`topic: <name>` とちょうど一致しないものは topics に無いラベルとして報告する。ずれは 1 件ずつ、
  `gh label create` / `edit` / `delete` の直し方を添えて出す。ラベルを自動では直さない
- **フラグ無しはオフライン**: `--labels` が無ければ API を呼ばず、pre-push の config 比較は今の速さのまま
- **いつ照合するか**: `adr-validate.yml` の最後のステップで、そのコミット（`git diff HEAD^1 HEAD`）が
  `adr.config.json`・`tpl.config.json`・`scripts/lint/config-topics-sync.ts` のどれかを変えたときだけ照合する。
  checkout は `fetch-depth: 2` にする。PR の merge commit でも main の squash commit でも親 1 が base になるのは、
  main が squash merge だけを受け付けるからで、rebase merge を許すと main では PR の最後のコミットしか見なくなる。
  差分は先に変数へ取り、`git diff` の失敗をステップの失敗にする（パイプのまま grep に渡すと、失敗が「topics の
  変更なし」と読まれる）。paths には、まだ無かった `tpl.config.json` とチェッカーのスクリプトを足し、
  `adr-validate-skip.yml` の `paths-ignore` も揃える（ADR-953、TPL-1480）
- **main の concurrency**: PR の run は ref ごとの group で cancel し合い、main の push は commit ごとに group を
  分けて cancel も置き換えもしない
- **権限**: `permissions` に `issues: read` を足し、`GH_TOKEN: ${{ github.token }}` で読む
- **ルール**: `.claude/rules/adr-topics.md` の到達状態 4 を `lint:config-topics-sync:labels` に替え、ラベル操作は
  topics の変更を push する前に行う、push の後に操作したら `gh run rerun --failed` で `Validate` を再実行する、
  照合が走る PR は 1 本ずつ通す、と書く
- **テスト**: 比較（`checkLabels`）は純粋関数にし、CLI の入口（`run`）はラベルの読み元を差し替えられる形にする。
  単体テストは API を呼ばずに、比較と終了コード（どちらかがずれたら 1、`--labels` が無ければ API を呼ばない）を
  確かめる。受け入れテストは作らない。開発プロセスだけの変更で、ずれの無い状態で `Validate` が通ることは PR の CI が
  確かめる

## 理由

- **ずれをマージ前に止める。** この repo のほかの drift ガードと同じ形で、ずれはほかの lint と同じ場所で
  見つかる。「マージ後に実行するラベル操作」を PR 本文に書いて覚えておく必要もなくなる
- **topics を変えたコミットだけで照合する。** `Validate` は ADR を触る PR すべてで走る。マージ前のラベル操作で
  ラベルが main の config より先に進むので、無条件に照合すると、そのあいだ topics と関係の無い ADR の PR まで
  落ちる。チェッカー自身を含めるのは、照合を変える PR の CI で照合が走るようにするため。workflow ファイルを
  含めないのは、Dependabot が action の pin を上げる PR まで巻き込むため
- **main の run を cancel させない。** 後続の push に置き換えられると、その run の差分には topics の変更が無く、
  マージ後の照合（main の config がラベルに追いついたことの確認）が失われる
- **綴りをちょうど `topic: <name>` に揃える。** `docs/process.md`「Issue トピックラベル」の確認クエリは
  `startswith("topic: ")` で大文字小文字を区別して照合するので、`Topic: cli` を付けた Issue はラベルが無いものと
  数えられる。GitHub のラベル名は大文字小文字を区別せず一意なので、`Topic: cli` だけがあるときの 2 件の報告は
  `gh label edit` 1 回で直る
- **topics を変える頻度は年に数回。** マージ前のラベル操作や、照合が走る PR を 1 本ずつ通す不便は小さい

## 却下した案

- **マージ後に main で落とす（push と週 1 回の schedule）**: 手順は変えずに済むが、ずれは PR では止まらず、
  マージの後に赤い run として現れ、誰かが気づくまで残る
- **ローカルのコマンドだけ用意する**: workflow を変えずに済むが、今と同じく読み込まれたルールに従う人の記憶に頼る
- **ずれたラベルを自動で直す**: 改名は自動の側からは「旧ラベルの削除と新ラベルの作成」に見え、旧ラベルを付けて
  いた Issue からラベルが外れる
- **`label` イベントでも起動する**（TPL-1480 の「両側の変更で起動する」に沿う形）: `label` イベントの run は
  main の config と照合するので、正しい手順（マージ前のラベル操作）でも必ず落ち、本物のずれと区別できない。
  画面で作られた余計なラベルは次に topics を変える PR の `Validate` で止まり、Issue の側は `docs/process.md` の
  確認で見つかる
- **照合を無条件にする**: マージ前にラベルが先に進むあいだ、topics と関係の無い ADR の PR まで落ちる
- **`package.json` も照合の条件に入れる**: スクリプト名の変更は次に照合が走る run で「script が無い」として
  落ちるので黙ってずれない。入れると依存の更新のたびに照合が走る

## 結果・影響

- topics を変える PR は、ラベルが追いついていなければ `Validate` で落ちる。削除の PR は、レビューで合意して
  ラベルを消すまで `Validate` が赤い
- 追加・改名・削除のどれでも、マージまでのあいだラベルが main の topics より先に進む。その間、照合が走る別の PR
  （config かチェッカーを変える PR）も落ちるので、1 本ずつ通す
- ラベルを操作しても `Validate` は再実行されない。push の後に操作したら run を再実行する
- PR を取り下げたら、マージ前に行ったラベル操作を手で戻す（足したラベルを消し、改名は名前を戻す）
- API の一時的なエラーで落ちたら再実行する。落ちるのは照合が走る PR だけ
- 画面で作られた余計なラベルを、作られた時点では止めない
