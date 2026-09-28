---
id: ADR-2969
title: 運用者だけの段階をコードで守る — サインインを数値 user id の許可リストに限る
status: accepted
date: 2026-09-28
topic: project
authors: [kompiro]
depends_on: [ADR-2592]
related_to:
  - ADR-2578
  - ADR-1996
scope:
  packages: [nest]
  concerns: [deployment, security]
assumptions:
  - "symbol: packages/nest/src/auth/allowlist.ts :: signInAllowlist"
  - "grep: packages/nest/wrangler.toml :: NEST_SIGN_IN_ALLOWLIST = \"[0-9]"
  - "file: docs/policy/nest-data-handling.md"
---

# ADR-2969: 運用者だけの段階をコードで守る — サインインを数値 user id の許可リストに限る

- **日付**: 2026-09-28
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2969](https://github.com/kompiro/karasu/issues/2969)、[#2691](https://github.com/kompiro/karasu/issues/2691)
  - [ADR-2592](2592-nest-as-a-gallery.md)（ギャラリーの構築）
  - [`docs/policy/nest-data-handling.md`](../policy/nest-data-handling.md)「未了」

## 背景

`nest-data-handling.md` は「未了」節が空になるまでギャラリーを運用者以外に開かないと
定めており、その残りは法務レビュー（#2691）である。利用者がまだ一人もいない段階で
有償のレビューを先に済ませるのは順序が逆で、運用者は先に自分で使い始めたい。

運用者自身の利用はこの条件に反しない。問題は、その条件を守る仕組みが**文書にしか
無かった**ことである（#2691 本文: "Nothing in `packages/nest` gates this; the documents do."）。
deploy に到達した GitHub ユーザーなら誰でもサインインでき、その時点でアカウント記録
（数値 id と login）が書かれ、public な投稿を第三者に見せられる。これはまさに法務
レビューが前提条件になっている状態で、URL を宣伝しないことはその代わりにならない。

## 決定

サインインを `NEST_SIGN_IN_ALLOWLIST`（GitHub の数値 user id の列）に載った
アカウントに限り、それ以外は OAuth callback でアカウント記録もセッションも書く前に
403 で拒否する。リストは `packages/nest/wrangler.toml` に置き、当面は運用者の id
だけを載せる。

## 理由

- **拒否の位置はアカウント記録を書く前。** 法務レビューが守っているのは第三者の
  個人データと第三者の投稿で、どちらもサインインから始まる。ここで止めれば、それ以降の
  経路（投稿・コンソール）を個別に塞ぐ必要がない
- **数値 id で照合する。** login は改名でき、空いた login は他人が取れる。id は変わらない
- **設定の誤りは閉じる側に倒す。** 未設定・空・数値でない要素を含むリストはどれも
  503（`not_configured`）にする。「未設定なら誰でも可」は開いてしまい、「読めない要素は
  飛ばす」は運用者を黙って締め出す。どちらも黙って起きてはいけない
- **リストは dashboard ではなく repo に置く。** id を足すことはその人にギャラリーを
  開くことなので、#2691 の状態が見える場所でレビューを経た変更として入るべきである。
  GitHub の数値 id は公開情報で、秘密ではない
- **閲覧は制限しない。** public にした投稿はサインインなしで見える。閲覧についてアプリ
  ケーションが記録するものは無く、運用者だけの段階で閲覧者を増やしたくなければ投稿を
  unlisted にすればよい。閲覧まで閉じると、共有という用途そのものを試せない

## 却下した案

### 文書だけで守り続ける（現状維持）

運用者が使い始めた時点で、URL を知った第三者がサインインできる状態が本番に出る。
条件が守られているかを確認する手段が「誰もまだ来ていない」ことしか無い。

### 許可リストを dashboard の変数や secret に置く

変更の記録が残らず、「誰に開いたか」を repo から追えない。また `wrangler deploy` は
`wrangler.toml` に無い平文の変数を消すので、deploy のたびに消える。

### Cloudflare Access で Worker ごと閉じる

閲覧も閉じてしまい、public な投稿の共有を試せない。サインインの内側に GitHub OAuth が
あるのに、外側にもう一つ認証を重ねることになる。

### login で照合する

改名後に同じ login を取った他人が通る。
