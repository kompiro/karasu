---
id: ADR-3020
title: karasu-nest を karasu-nest.kompiro.dev カスタムドメインだけで公開し、workers.dev を閉じる
status: accepted
date: 2026-10-01
topic: build
authors: [kompiro]
depends_on: [ADR-2578, ADR-2969]
related_to: [ADR-1809, ADR-2592, ADR-3000]
scope:
  packages: [nest]
  concerns: [deployment, security]
assumptions:
  - "grep: packages/nest/wrangler.toml :: NEST_PUBLIC_ORIGIN = \"https://karasu-nest\\.kompiro\\.dev\""
  - "grep: packages/nest/wrangler.toml :: workers_dev = false"
  - "grep: packages/nest/wrangler.toml :: custom_domain = true"
---

# ADR-3020: karasu-nest を karasu-nest.kompiro.dev カスタムドメインだけで公開し、workers.dev を閉じる

- **日付**: 2026-10-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3020](https://github.com/kompiro/karasu/issues/3020)
  - [ADR-1809](1809-app-custom-domain-karasu-kompiro-dev.md)（app を `karasu.kompiro.dev` に移した先例）
  - [ADR-2578](2578-nest-retires-server-side-reverse.md)（決定 5: nest は Pages app と別の deploy）
  - [ADR-2592](2592-nest-as-a-gallery.md)（nest をギャラリーにする。app とは別のサイト）
  - [ADR-2969](2969-nest-operator-only-sign-in.md)（サインインを運用者の許可リストに限る）
  - [ADR-3000](3000-nest-deploys-on-main.md)（main への push で自動 deploy）
  - `packages/nest/wrangler.toml`

## 背景

karasu-nest は Cloudflare Workers の既定ホスト `https://karasu-nest.kompiro.workers.dev` で公開してきた。ギャラリーの URL は submit の応答や OGP の `og:url` として外に出るため、app（ADR-1809）と同じくプロダクトのドメインで出したい。

nest では origin がただの住所ではない。`wrangler.toml` の `NEST_PUBLIC_ORIGIN` が次の 4 つを決めている。

- GitHub OAuth の `redirect_uri`（`<origin>/auth/callback`）
- 状態を変えるリクエスト（submit・logout・console）で照合する `Origin`
- submit が返すギャラリー URL
- 公開ページの `og:url`

サインイン後のリダイレクト（`/console`）や console 内の遷移は相対パスなので、ホストに追随する。ホストを固定しているのは `NEST_PUBLIC_ORIGIN` の 1 箇所だけである。

## 決定

karasu-nest の公開 origin を `https://karasu-nest.kompiro.dev` にする。カスタムドメインは `wrangler.toml` の `routes`（`custom_domain = true`）で宣言し、`workers_dev = false` で workers.dev のホストを閉じる。

## 理由

- **workers.dev を残しても動く入口にならない。** `NEST_PUBLIC_ORIGIN` は 1 つしか持てないので、workers.dev で始めたサインインは `state` cookie が workers.dev に付き、コールバックは kompiro.dev に戻る。そのため必ず `state_mismatch` になる。POST も `Origin` 照合で必ず落ちる。読むだけなら開けるが、壊れた写しを公開し続けるより閉じたほうが分かりやすい。
- **origin をリクエストから導出しない方針（#2586）はそのまま守れる。** 複数ホストを受けるには `Host` ヘッダから origin を決める必要が出る。`redirect_uri` と `Origin` 照合を攻撃者が選べる値に預けることになるので採らない。
- **ドメインの宣言を repo に置く。** `[vars]` を dashboard ではなく `wrangler.toml` に置いたのと同じ理由で、どこで公開しているかも deploy の設定が語るべきである。dashboard で付けたカスタムドメインは repo から見えない。
- セッション cookie は `__Host-` 付きでホスト単位なので、移行で既存セッションは引き継がれない。サインインは運用者だけ（ADR-2969）なので、再サインインの負担は小さい。

## 移行時の運用作業

マージすると ADR-3000 の自動 deploy で即座に切り替わる。次の 2 点をマージの前後で揃える。

- GitHub OAuth App の callback URL を `https://karasu-nest.kompiro.dev/auth/callback` に変える。OAuth App の callback は 1 つなので、deploy と同時に切り替える
- `CLOUDFLARE_NEST_API_TOKEN` が `kompiro.dev` zone でカスタムドメインを作成できる権限を持つこと。`custom_domain = true` は wrangler が DNS レコードと証明書を作るため、Workers Scripts の権限だけでは deploy が落ちる

## 却下した案

- **workers.dev を残して並行公開する**: 上記のとおりサインインと POST が必ず失敗するので、並行公開にならない。
- **workers.dev から kompiro.dev へ Worker 内でリダイレクトする**: 閉じる場合と比べて得るのは旧 URL を知っている人の救済だけである。公開してまだ日が浅く、外に出た URL はほぼない。リダイレクトのためだけに `Host` を見るコードを足すと、origin を `Host` から導出しない方針の境界があいまいになる。
- **カスタムドメインを dashboard で付ける**: deploy 設定から公開先が読めなくなる。`wrangler.toml` の他の設定と扱いが分かれる。
