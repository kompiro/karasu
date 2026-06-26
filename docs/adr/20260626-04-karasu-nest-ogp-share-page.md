---
id: ADR-20260626-04
title: karasu-nest — 共有リンクの OGP 画像（system 図 unfurl）
status: accepted
date: 2026-06-26
topic: project
related_to: [ADR-20260626-01, ADR-20260626-02]
scope:
  packages: [app]
  concerns: [security, deployment]
assumptions:
  - "file: functions/s.ts"
  - "file: packages/app/src/render/share-page.ts"
  - "symbol: packages/app/src/render/share-page.ts :: buildSharePage"
  - "file: packages/app/src/render/ogp-frame.ts"
  - "symbol: packages/app/src/render/ogp-frame.ts :: wrapSvgForOgpFrame"
  - "symbol: functions/render.ts :: wrapSvgForOgpFrame"
  - "symbol: packages/app/src/utils/inline-share.ts :: buildShareUrls"
  - "symbol: packages/app/src/utils/inline-share.ts :: MAX_UNFURL_PAYLOAD"
  - "file: packages/app/src/components/ShareDialog.tsx"
---

# ADR-20260626-04: karasu-nest — 共有リンクの OGP 画像（system 図 unfurl）

- **日付**: 2026-06-26
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1801](https://github.com/kompiro/karasu/issues/1801)
  - 実装 PR: [#1810](https://github.com/kompiro/karasu/pull/1810)（Design Doc PR: [#1808](https://github.com/kompiro/karasu/pull/1808)）
  - 前提 ADR: [ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)（karasu-nest v1。OGP は本 ADR の「後続（範囲外）」に挙げられていた）
  - 関連 TPL: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（URL 由来 payload を server-rendered HTML に埋める trust boundary）、[TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)
  - 受け入れ条件: `docs/acceptance/karasu-nest-ogp-share-page.md`

## 背景

karasu-nest の inline 共有 URL はプロジェクトを URL **fragment**（`#s=<payload>`）に格納する。fragment はサーバへ送られないため、ステートレスかつプライバシー的に素直（ADR-20260626-01）。

一方、共有 URL を Slack / Discord / X / LinkedIn 等に貼っても **リンクプレビュー（OGP）にアーキ図が出ない**。OGP クローラは JavaScript を実行せず、fragment をサーバへ送らないため、`#s=` リンクを fetch しても静的な `index.html` しか見えず、共有ごとの `og:image` を出せない。per-share の OGP を出すには、payload を **server-visible な部分**（path / query）に置き、server-rendered なページから OGP meta を返す必要がある。画像生成自体は既存 `/render?s=…&format=png`（ADR-20260626-02）で揃っており、足すのは **OGP `<meta>` を返す共有ページ**だけである。

## 決定

`/s?s=<payload>`（query, server-visible）を Cloudflare Pages Function（`functions/s.ts`）で受け、`system` 図を指す OGP `<meta>` を返す **server-rendered な共有ページ**を追加する。人間の訪問者は `/#s=<payload>` へ bounce し、SPA は既存の fragment 復元経路（`readSharedProjectFromHash`）でそのまま開く（SPA 側の新規配線なし）。Share ダイアログは private（`#s=`）と unfurlable（`/s?s=`）の 2 リンクを **トレードオフ明示**で提示する。

具体的な決定:

- **URL スキームは query `/s?s=`**。既存 `/render?s=` と `s` パラメータ規約を共有し、`renderSharePayload` の decode 経路と一致。path 案（`/share/<payload>`）は catch-all ルーティングが要り、path セグメントの長さ上限が厳しい分だけ不利で却下。
- **共有ページは SPA への bounce**。ページは OGP `<meta>` ＋ 最小 body ＋ `location.replace("/#s=…")` ＋ `<noscript>` リンクを返すだけの薄い層。ロジックは framework-agnostic な `buildSharePage`（`packages/app/src/render/share-page.ts`, unit-tested）に集約し、Function は薄いアダプタ（`functions/render.ts` ↔ `share-render.ts` と同じ分割）。SPA shell をインライン化して meta 注入する案は配信・キャッシュ・二重メンテが増えるため却下。
- **og:image は system 図 1 枚**。既存 `/render?…&view=system&format=png` を再利用（新規描画なし）。多くのプラットフォームは 1 枚しか表示せず、system 図が最も強い（ADR-20260626-01）。
- **og:title / og:description は最初の system から動的抽出（best-effort）**。`decodeShare` → `compile(krs, { diagramType: "system" })` の先頭 system（synthetic `__unassigned__` を除く）の `label ?? id` / `properties.description` を使い、失敗・未設定時は静的文言にフォールバック。事前検証はしない（不正 payload でもページはエラーにせず OGP を出す）。
- **oversize は fragment-only にフォールバック**。`buildShareUrls` が `encodeShare` を 1 回呼んで private / unfurl 両 URL を組み立て、encoded payload が `MAX_UNFURL_PAYLOAD`（~8000 文字）を超えたら unfurl URL を `null` にし、ダイアログは private のみ + 警告にする。
- **OGP フレームに全体を contain**。OGP カードは ~1.91:1 にクロップするが karasu の図は縦長が多い。`/render` に `fit=contain`（width+height 指定時）を足し、`wrapSvgForOgpFrame`（`packages/app/src/render/ogp-frame.ts`, unit-tested）が SVG を 1200×630 フレームへ `preserveAspectRatio="xMidYMid meet"` で**全体を縮小して収め**、余白を背景で埋める。README `<img>` 埋め込み（`fit` 無し）は従来の width-fit を維持。

## 理由

- **既存資産（`/render` PNG・`encodeShare`・`readSharedProjectFromHash`）を全再利用**し、新規描画も SPA 配線も DB も持たずに最小実装で OGP unfurl を実現できる（ADR-20260626-01 の「新規パッケージ・サービス・DB を作らない」方針を踏襲）。
- **bounce 方式**は SPA の復元経路に手を入れず、共有ページを「OGP を出して fragment へ送り返すだけ」に保てる。
- **trust boundary 対策**（TPL-20260510-17）: `s` は base64url 文字集合 `[A-Za-z0-9_-]+` を厳密検証（外れたら 400）し、そのまま埋める箇所（画像 URL・bounce・noscript）への injection を構造的に封じる。decode 由来の title / description は charset 検証の外なので **HTML escape を必須**（動的化で escaping が load-bearing になる）。
- **プライバシーは選択制**。fragment 共有はデフォルトのまま（サーバ非送信）。unfurl は「プレビューと引き換えに共有内容がサーバ／ログに見える」ことを UI で明示した opt-in リンクにし、ADR-20260626-01 の private 方針を壊さない。

### クローラ互換のための追補（実装時に判明）

- **og:image URL の `&` は `&amp;` にエスケープする**。生の `&` だと厳格なクローラが画像 URL を最初の `&` で切り、`format=png` が落ちて SVG を取りに行きプレビューできない（title/description だけ出て画像が出ない）。
- **`og:url` を必須で出す**（共有ページ自身の `/s?s=` URL）。LinkedIn など一部クローラは `og:url` 無しのカードを拒否する。併せて `og:image:secure_url` / `og:image:type` / `og:image:width` / `og:image:height` / `og:image:alt` を付与してカードを完成させる。
- LinkedIn / X / Facebook / Slack / Discord で unfurl を実機確認済み。Discord はチャンネルの「Embed Links」権限やクライアント設定でカード自体を抑制できる（OGP の問題ではない）。

## 却下した案

- **path スキーム `/share/<payload>`**: 機能上の利点がなく、catch-all ルーティングが要り、path セグメントの長さ上限が query より厳しいため不利。
- **SPA shell をインライン化して meta 注入**: 配信・キャッシュ・描画面の二重メンテが増える。bounce で十分。
- **payload を decode して描画可能性を事前検証**: 不正 payload は `/render` 側が適切な status を返し unfurl が空になるだけで足り、Function に重い検証を持ち込む動機が薄い。

## 後続（本 ADR の範囲外）

- deploy ビューの og:image（複数 og:image）。
- PNG の cold-start 対策（事前ウォーム／キャッシュ強化）。
