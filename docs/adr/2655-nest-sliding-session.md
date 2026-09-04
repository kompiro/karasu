---
id: ADR-2655
title: nest のセッション期限を idle 窓と絶対上限に分ける
status: accepted
date: 2026-08-31
topic: project
authors: [kompiro]
depends_on: [ADR-2578]
refines: [ADR-2592]
scope:
  packages: [nest]
  concerns: [security]
assumptions:
  - "symbol: packages/nest/src/store/sessions.ts :: SESSION_IDLE_TTL_SECONDS"
  - "symbol: packages/nest/src/store/sessions.ts :: SESSION_ABSOLUTE_TTL_SECONDS"
  - "symbol: packages/nest/src/store/sessions.ts :: SESSION_REFRESH_AFTER_SECONDS"
---

# ADR-2655: nest のセッション期限を idle 窓と絶対上限に分ける

- **日付**: 2026-08-31
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2655](https://github.com/kompiro/karasu/issues/2655)
  - [ADR-2578](2578-nest-retires-server-side-reverse.md) — nest をセッションを持つ別 Worker とする方向
  - [ADR-2592](2592-nest-as-a-gallery.md) — セッションだけに期限を持たせるギャラリーの構築判断
  - [TPL-2655](../test-perspectives/TPL-2655-sliding-expiry-needs-an-unrenewable-cap.md)

## 背景

ADR-2592 は、投稿物とアカウント記録には期限を置かず、資格情報であるセッションだけに期限を置くと決めた。実装当初の期限は発行から 30 日の固定窓だったため、継続して使っている投稿者も作業中にサインアウトされる。

一方、期限を使用に合わせて無制限に延ばすと、漏れた資格情報も使われる限り失効しない。また、認証ごとの KV 書き込みは不要な負荷になる。

## 決定

**セッションは最終使用から 30 日の idle 窓を持ち、その記録は約 1 日ごとに更新する。ただし、発行から 90 日の絶対上限は延ばさない。**

KV が強制する TTL は idle 窓に使い、絶対上限は読み取り時に `issuedAt` から判定する。更新時の TTL は idle 窓と絶対上限までの残りの短い方に制限する。

## 理由

- 継続利用中の不意なサインアウトを避けつつ、漏れた資格情報の有効期間を 90 日以内に限定できる
- 更新を約 1 日ごとに間引けば、利用者から見える 30 日の窓をほぼ保ったまま、KV 書き込みを認証ごとに発生させない
- KV の TTL は鍵ごとに 1 つなので、延びる idle 窓と延びない上限を別の判定にする必要がある

ADR-2592 の「セッションだけが期限を持つ」という決定は変えず、期限の構成を具体化する。そのため、本 ADR は ADR-2592 を supersede しない。

## 却下した案

- **発行から 30 日の固定窓を維持する**: 使用中でも発行日だけで失効し、投稿者の作業を中断する
- **使用ごとに上限なく更新する**: 利用され続ける資格情報が失効しない
- **認証ごとに更新する**: idle 窓に対して過剰な精度のために KV 書き込みを増やす
