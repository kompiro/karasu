---
id: ADR-20260626-03
title: プレイグラウンドを karasu.kompiro.dev カスタムドメインで公開する
status: accepted
date: 2026-06-26
topic: project
related_to:
  - ADR-20260407-04
scope:
  packages:
    - app
  concerns:
    - deployment
assumptions:
  - "grep: packages/docs-site/scripts/lib/gallery-pages.ts :: karasu\\.kompiro\\.dev"
---

# ADR-20260626-03: プレイグラウンドを karasu.kompiro.dev カスタムドメインで公開する

- **日付**: 2026-06-26
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1809](https://github.com/kompiro/karasu/issues/1809): app URL の移行
  - [ADR-20260407-04](20260407-04-cloudflare-deployment-and-byok-ai.md): Cloudflare Pages デプロイ基盤（本 ADR はその「カスタムドメインは当面不要」という小決定のみ見直す）

## 背景

ブラウザ版プレイグラウンドは Cloudflare Pages の bare サブドメイン `https://karasu.pages.dev/` で公開してきた（ADR-20260407-04）。当時は「カスタムドメインは当面不要」と判断していたが、その後 `kompiro.dev` ドメインを取得したため、プロダクト固有のカスタムドメインで公開できるようになった。

## 決定

プレイグラウンドの公開 URL を `https://karasu.kompiro.dev/` に移行する。Cloudflare Pages の `karasu` プロジェクトにカスタムドメインを追加し、リポジトリ内でサービスが参照する **本番 URL** をすべて新ドメインに置き換える。`karasu.pages.dev` はフォールバックとして引き続き有効。

## 理由

- プロダクト固有ドメインのほうがブランディング・記憶しやすさ・将来のサブドメイン運用（docs 等）の点で優れる。
- examples の "Open in the app" deep-link は `gallery-pages.ts` の `APP_URL` 定数が単一ソースであり、1 箇所の変更で全 example ページの生成物に反映される。残りは README / docs / vscode README など静的参照のみで、移行コストが低い。
- Cloudflare Pages の **preview** デプロイは常に `<branch>.karasu.pages.dev` を使うため、preview URL 参照（PR テンプレ・過去の AT 記録）は据え置きで矛盾しない。

## 却下した案

- **`karasu.pages.dev` のまま据え置き**: ADR-20260407-04 の当初判断。ドメイン取得により前提が変わったため見直す。
- **ADR-20260407-04 を `superseded` にする**: 当該 ADR の本体（Cloudflare Pages 採用・BYOK AI）は有効なまま。覆るのは「カスタムドメインは当面不要」という小決定のみのため、`related_to` で参照するに留める。
