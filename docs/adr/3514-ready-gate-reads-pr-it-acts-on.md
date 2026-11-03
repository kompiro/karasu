---
id: ADR-3514
title: gh pr ready のゲートは --repo をそのまま渡して同じ PR を読み、base は PR の base コミットで判定する
status: accepted
date: 2026-11-03
topic: build
authors: [kompiro]
refines:
  - ADR-3342
related_to:
  - ADR-3504
  - ADR-3326
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/coderabbit/ready-gate.sh"
  - "grep: scripts/coderabbit/ready-gate.sh :: so it reads the PR gh pr ready acts on"
  - "grep: scripts/coderabbit/ready-gate.sh :: headRefOid,baseRefOid"
  - "grep: scripts/coderabbit/ready-gate.sh :: --no-tags origin"
---

# ADR-3514: gh pr ready のゲートは --repo をそのまま渡して同じ PR を読み、base は PR の base コミットで判定する

- **日付**: 2026-11-03
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3514](https://github.com/kompiro/karasu/issues/3514)、PR [#3539](https://github.com/kompiro/karasu/pull/3539)
  - [ADR-3342](3342-ready-gate-local-review.md): ローカルの CLI レビューが済むまで `gh pr ready` を拒否するゲート。
    本 ADR は、その「拒否しない場合」から `--repo` / `-R` を外し、base の読み方を決めて、その決定を狭める
  - [ADR-3504](3504-low-adr-pr-without-draft.md): `gh pr create` 側で、gh の repo・head・base の選び方を読み直すのを
    やめた決定。本 ADR は同じ方針を `gh pr ready` 側に当てる
  - [ADR-3326](3326-coderabbit-cli-once-before-ready.md): CLI を 1 回だけ当てる。ゲートが「対象コミットが HEAD の
    祖先で base に無い」で判定するのはこのため

## 背景

ADR-3342 のゲートは、`--repo` / `-R` の付いた `gh pr ready` を確かめずに通していた。手元の checkout が
その repo を持つとは限らない、というのが理由だった。しかし値がこの repo を指していても通したので、
`gh pr ready <N> -R kompiro/karasu` と書くだけで CLI レビューの確認を飛ばせた（#3514）。

また、ゲートは「CLI がレビューしたコミットが base に無い」を、origin にある base と同じ名前のブランチで
確かめていた。PR が別の repo の PR なら、その名前のブランチは別のものを指す。

## 決定

**`gh pr ready` のゲートは、`--repo` / `-R` の値を自分の `gh pr view` にそのまま渡し、`gh pr ready` が
操作するのと同じ PR を読む。base は、その PR が返す base コミット（`baseRefOid`）だけで判定する。**

- `--repo` / `-R` は、どの書き方（`--repo X`・`--repo=X`・`-R X`・`-RX`・`-R=X`）でも値を読む。
  `GH_REPO` / `GH_HOST` は環境から gh にそのまま届くので、ゲートは読まない
- この repo を指す `--repo` は、`--repo` が無いときと同じく確かめる。別の repo の PR でも、その base コミットが
  手元にあれば同じ規則で確かめる（fork の PR など）
- base コミットが手元に無ければ origin から fetch する。それでも得られないとき（別の repo のコミット、
  `baseRefOid` を返さない古い gh）は通す。ADR-3342 の「分からないときは通す」のとおり
- origin の同名ブランチを base とみなす読み方はやめる
- 拒否したときに案内する飛ばし方（`KARASU_LOCAL_REVIEW_SKIPPED=<理由> gh pr ready ...`）は、元の PR の指定と
  `--repo` を残す。案内するレビューのコマンドも同じ base コミットに対して当てる
- `--undo` は、gh と同じく最後に指定した値で判断する。値の無い `-R` / `--repo` はゲートでは判定せず gh に任せる
  （gh がエラーを出す）
- ADR-3342 のうち、上に書いたもの以外（CodeRabbit を外した PR・draft でない PR・`--undo` を通すこと、
  記録が読めないときに通すこと）は変えない

## 理由

- **ゲートが gh の選んだ repo を推測しない。** `--repo` の値を gh と同じ `gh pr view` に渡せば、環境変数・URL での
  PR の指定・`gh repo set-default` まで含めて、gh 自身が同じ PR を選ぶ。ゲートは選び方を知らなくてよい
- **base コミットはどの repo の PR でも意味が同じ。** 名前のブランチは repo ごとに別物になりうるが、コミットは
  そうならない。コミットで判定すれば、どの repo の PR かを見分ける必要が無くなる
- **抜け道を閉じても、作業は止めない。** 自分の repo を指す `--repo` は確かめるようになった。判定できない場合は
  これまでどおり通す。ready の側には create の `--draft` に当たる代わりの道が無いので、分からないときに拒否すると
  作業が止まる
- **#3539 のレビューで、読み直す方式は収束しなかった。** ADR-3504 の create 側と同じく、gh の選び方を読み直す
  たびに、ラウンドごとに別のずれが見つかった（下の却下した案）

## 却下した案

- **`--repo` の値を origin の URL と比べ、この repo のときだけ確かめる**: #3539 の最初の方式。比べる対象が
  `--repo` だけでは足りず、`GH_REPO`、`GH_HOST`、URL での PR の指定、`gh repo set-default` が CodeRabbit の
  ラウンドごとに 1 つずつ見つかった。ADR-3504 が create 側で止めた、終わりの無い列挙と同じ形だった
- **`baseRefOid` が得られないときは origin の同名ブランチで判定し、別の repo を指す場合だけ除く**: 除く条件が
  上と同じ列挙になる。base コミットを fetch すれば、名前に戻る必要は無い
- **自分の repo を指す `-R` で base コミットが取れないときは拒否する**: 自分の repo かどうかを見分ける、
  やめた比較を戻すことになる。fetch した後も取れないのは origin に繋がらないときくらいで、そのときは通してよい
- **`baseRefOid` を返さない古い gh（2.63 未満）では拒否する**: ゲートの故障で作業を止めない、という ADR-3342 の
  原則に反する。開発環境の gh はこれより新しい
- **`--repo` の付いた ready はこれまでどおり通す**: 値を書くだけで確認を飛ばせる。飛ばすなら
  `KARASU_LOCAL_REVIEW_SKIPPED` で理由を残す、という ADR-3342 の決定が意味を持たなくなる
