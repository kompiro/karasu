---
id: ADR-3162
title: karasu serve の Share は、公開版 app を指すリンクで出す
status: accepted
date: 2026-10-20
topic: build
refines: [ADR-3138]
related_to: [ADR-3017, ADR-2993, ADR-1809, ADR-2939]
scope:
  packages:
    - app
    - cli
assumptions:
  - "symbol: packages/app/src/utils/hosted-app.ts :: HOSTED_APP_ORIGIN"
  - "symbol: packages/app/src/ServeModeApp.tsx :: SERVE_TOOLBAR"
  - "grep: packages/app/src/components/preview-toolbar-slot.ts :: shareOrigin\\?: string"
  - "grep: packages/app/src/hooks/useShareDialog.ts :: pathname: \"/\""
  - "file: scripts/lint/hosted-app-origin.test.ts"
  - "grep: packages/e2e/tests/at-0032-cli-serve-mode.spec.ts :: TC-07: Share builds its links on the public app"
  - "file: docs/test-perspectives/TPL-3162-link-for-others-built-on-reachable-origin.md"
---

# ADR-3162: karasu serve の Share は、公開版 app を指すリンクで出す

- **日付**: 2026-10-20
- **ステータス**: 決定済み
- **関連**:
  - Issue #3162（起点）、設計 PR #3254（本 ADR に集約し削除: `docs/design/serve-share-hosted-links.md`）、実装 PR #3281
  - [ADR-3138](3138-serve-app-without-monaco.md)（決定 5「serve モードは Share を出さない」。本 ADR はこれを「公開版宛てのリンクで出す」に改める）
  - [ADR-3017](3017-serve-app-shipping.md)（npm の CLI に serve 用 app を同梱）
  - [ADR-2993](2993-gallery-client-side-rendering.md)（`PreviewToolbarSlotContext` と viewer。viewer の「Share を出さない」は変えない）
  - [ADR-1809](1809-app-custom-domain-karasu-kompiro-dev.md)（公開版 app の URL）
  - TPL: [TPL-3162](../test-perspectives/TPL-3162-link-for-others-built-on-reachable-origin.md)（設計 PR で起こした proactive TPL）、[TPL-1024](../test-perspectives/TPL-1024-dev-vs-packaged-mode-parity.md)、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)、[TPL-2259](../test-perspectives/TPL-2259-shared-budget-enforced-at-every-producer.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
  - AT: `docs/acceptance/3162-serve-share-hosted-links.md`

## 背景

ADR-3138 決定 5 で、`karasu serve` は Share を出さなくなった。Share のリンクは `buildShareUrls(payload, window.location)` で作られるので、
serve では `http://localhost:<port>/#s=…` になる。

- このリンクは、serve を動かしているマシンの上でしか開けない。
- `/s?s=`（Slack などでプレビューが展開されるリンク）は CLI が配っていないので 404 になる。
- npm の serve 用 build はエディタを持たず `#s=` を読まない（ADR-3138 決定 2）。リンクを開いても `index.krs` が開く。

しかし、ローカルで書いている途中のモデルを人に見せたいときこそ Share が欲しい。公開版 app（`https://karasu.kompiro.dev`）は
`#s=` を開けて `/s?s=` も配っているので、リンクの宛先を公開版にすれば、受け取った人は serve を動かしていなくても図を見られる。

## 決定

`karasu serve` の Share を戻し、リンクを公開版 app の origin から作る。

1. **公開版の URL は app の定数に置く**: `packages/app/src/utils/hosted-app.ts` の `HOSTED_APP_ORIGIN`。
   docs-site の `APP_URL`（ADR-1809）と値が同じであることを `scripts/lint/hosted-app-origin.test.ts` が固定する。
2. **宛先はツールバーの口で渡す**: `PreviewToolbarSlot` に `shareOrigin?: string` を足す。`ServeModeApp` の `SERVE_TOOLBAR` は
   `{ shareOrigin: HOSTED_APP_ORIGIN }` を渡す（ADR-3138 決定 5 の `hideShare: true` を置き換える）。`hideShare` は viewer 用に残す。
3. **リンクの組み立て**: `useShareDialog` は口に `shareOrigin` があれば `{ origin: shareOrigin, pathname: "/" }` を `buildShareUrls` に渡す。
   serve の `pathname` は開いているファイル名なので、公開版には持ち込まない。`/s?s=` の上限判定（`fitsUnfurlPayload`）は今と同じ 1 か所を通る。
4. **ダイアログは app と同じ 2 本のリンク**: fragment リンク（既定でコピー、中身はサーバーに届かない）と `/s?s=` のリンク。
   宛先が今いるページの origin と違うときだけ、「リンクは karasu.kompiro.dev で開きます」の 1 行（`preview.share.dialog.hostedHint`、en / ja）を足す。
5. **viewer は今のまま**: nest の投稿ページは URL 自体が共有先で、ADR-2993 の「Share を出さない」を変えない。

## 理由

- Pages 用 build の serve モードと npm の serve 用 build は同じ `ServeModeApp` を通るので、宛先をそこで決めれば 2 つの build で
  Share の有無と宛先が揃う（TPL-1024）。ADR-3138 決定 5 が守った「2 つの build で同じ見え方」はそのまま保たれる。
- 「Share を出すか」と「どこに向けるか」が同じ口に並び、口を提供してよいファイルを viewer と `ServeModeApp` に限る
  `toolbar-slot-owner.test.ts` もそのまま効く。VS Code の webview（#2996）も、同じ口に `shareOrigin` を渡せば Share を出せる。
- ダイアログを app と serve で分けないので、片方だけ直す事故が起きない（TPL-1983）。`/s?s=` の注意書き（中身がサーバーに届く）も同じものが出る。
- 他人に渡すリンクを今いるページの origin から作らない、という観点は TPL-3162 として残した。

## 却下した案

- **案 1B: serve 用 build の `define` で埋め込む**: Pages 用 build の serve モードには入らず、2 つの build で宛先が変わる（ADR-3138 決定 5、TPL-1024 に反する）。
  ADR-3138 自身も、build 時の定数で分岐する案を、何を外しているかがコードから読めないとして却下している。
- **案 1C: `karasu serve --share-origin <url>` で渡す**: 自前の app に向けたい利用者は今いない。API・起動時の非同期取得・オプションの説明が増える。
  口に渡す値の出どころを定数から API に変えるだけで後から足せる。
- **案 2B: serve では fragment のリンクだけ出す**: ダイアログが app と serve で分かれる（TPL-1983）。利用者は serve の図を app に貼れば
  `/s?s=` を作れるので、守れるものも少ない。
- **案 3B: viewer にも公開版宛ての Share を出す**: 投稿ページの URL と役割が重なり、ADR-2993 の決定を覆す。#3162 の問題とも関係しない。

## 影響

- `karasu serve` のツールバーに Share が戻り、リンクは公開版 app で開く。案内は `docs/tools/app.md` / `app.ja.md` を書き換えた。
- ADR-3138 の frontmatter の前提（`hideShare: true` の grep）は `symbol: ServeModeApp.tsx :: SERVE_TOOLBAR` に差し替えた（本文は不変）。
- 決めずに残したこと:
  - 自前の app に向けるオプション（案 1C）。利用者が現れたら足す。
  - 公開版 app は main から常に deploy され、CLI は月次リリース（ADR-2939）で出るので、古い CLI で書いたモデルを新しい app が開く向きになる。
    言語の削除に当たると公開版で診断が出うるが、app の Share でも同じ向きの話なので本 ADR では扱わない。
  - serve の fs には開いた 1 ファイルしか無いので、`import` 先は共有に入らない（serve での import 解決は #3258）。
