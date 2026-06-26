# karasu-nest — 共有リンクの OGP 画像（system 図 unfurl）

- **日付**: 2026-06-26
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1801](https://github.com/kompiro/karasu/issues/1801)
  - 関連 ADR: [ADR-20260626-01](../adr/20260626-01-karasu-nest-hosted-preview.md)（karasu-nest v1。OGP は本 ADR の「後続（範囲外）」に挙げられている）
  - 関連 TPL: [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（URL 由来の payload を server-rendered HTML に埋める trust boundary）、[TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)（share page と `/render`・SPA で payload セマンティクスを揃える）
  - コード: `functions/render.ts`, `packages/app/src/render/share-render.ts`, `packages/app/src/utils/inline-share.ts`, `packages/app/src/components/ShareDialog.tsx`

## 背景・課題

karasu-nest の inline 共有 URL はプロジェクトを URL **fragment**（`https://host/#s=<payload>`）に格納する。fragment はサーバへ送られないため、ステートレスかつプライバシー的に素直（ADR-20260626-01）。

一方、共有 URL を Slack / Discord / X などに貼ったとき **リンクプレビュー（OGP）にアーキ図が出ない**。OGP クローラは

- JavaScript を実行せず、
- fragment をサーバへ送らない

ため、`#s=` リンクを fetch しても静的な `index.html` しか見えず、共有ごとの `og:image` を出せない。

per-share の OGP 画像を出すには、**payload を server-visible な部分（path / query）に置き、server-rendered なページから OGP meta を返す**必要がある。画像生成自体は既に `/render?s=…&format=png`（#1795 / #1796）で揃っており、本設計が足すのは **OGP `<meta>` を返す共有ページ**だけである。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `/render` エンドポイント | `functions/render.ts`（Cloudflare Pages Function）。`?s=<payload>` を受け取り SVG / `format=png` で PNG を返す。ロジックは `packages/app/src/render/share-render.ts` の `renderSharePayload(params)`（unit-tested）に集約 |
| payload エンコード | `packages/app/src/utils/inline-share.ts`。`{ krs, style }` を JSON → fflate deflate → base64url。文字集合は `[A-Za-z0-9_-]` のみ（`+/=` を置換・除去） |
| 共有 URL 生成 | `buildShareUrl(payload, location)` が `${origin}${pathname}#s=<encoded>` を返す（fragment 固定） |
| 復元経路 | `readSharedProjectFromHash(hash)`（App.tsx で `#s=` を読み MemoryMode に seed） |
| Share UI | `ShareDialog.tsx`（単一 URL を read-only field で表示 + Copy）。`PreviewColumn.tsx` の `handleShare` が `buildShareUrl` で URL 構築 |
| デプロイ | Cloudflare Pages。repo ルートの `functions/` を拾い、`packages/app/dist` を配信（`.github/workflows/deploy.yml`） |

## 制約・前提

- 新パッケージ・サービス・DB を作らない（ADR-20260626-01 の方針を踏襲）。既存 app + core + Cloudflare Pages に内包する。
- クローラは JS 非実行・fragment 非送信 → unfurl 用 payload は **query** に置く（本設計で確定: path ではなく `/s?s=`）。
- **プライバシーのトレードオフ**: query payload はサーバ（とログ）に届く。ADR の private fragment 方針はデフォルトとして維持し、unfurl リンクは「プレビューを出すために共有内容がサーバに見える」ことを **UI で明示**してユーザーに選ばせる。
- 画像生成は既存 `/render?…&format=png` を再利用（新規描画なし）。
- query は fragment より長さ上限が厳しい。大きい payload は unfurl 不可とし fragment-only にフォールバックする。
- **trust boundary**（TPL-20260510-17）: URL 由来 payload を server-rendered HTML に埋めるため、injection を防ぐ。
- out of scope: 画像レンダリング自体（done）、deploy ビューの og:image（system のみ）、保存型 paste / `/<owner>/<repo>` resolver（Phase 2）。

## 検討した選択肢

### URL スキーム（確定: query）

`/s?s=<payload>` を採用する。理由:

- 既存 `/render?s=` と `s` パラメータ規約を共有でき、`renderSharePayload` の decode 経路と一致。
- payload は base64url 1 トークンで path にも置けるが、path セグメントは一部 CDN / プロキシで長さ上限が低く、大きいプロジェクトで先に詰まる。query の方が素直。
- path catch-all ルーティング（`functions/share/[[payload]].ts`）が不要。

（path 案 `/share/<payload>` は機能上の利点がなく却下。）

### 共有ページの実装（確定: SPA への bounce）

`/s` を Pages Function（`functions/s.ts`）で受け、以下を返す:

- server-rendered な OGP `<meta>`（クローラが読む）
- `<title>` と最小の人間向け body
- `location.replace(origin + "/#s=" + payload)` で **既存の fragment 復元経路へ橋渡し**するスクリプト（クローラは JS 非実行なので無視）
- スクリプト無効時の `<noscript>` リンク（同じ `/#s=` へ）

**この設計の要点**: 人間の訪問者は `/#s=` に bounce され、SPA は既存の `readSharedProjectFromHash` でそのまま復元する。**SPA 側の新規配線は不要**。共有ページは「OGP を出して fragment へ送り返すだけ」の薄い層になる。

（SPA shell をインラインで返して meta を注入する案は、配信・キャッシュ・二重メンテが増えるため却下。）

### og:image（確定: system のみ 1 枚）

```html
<meta property="og:image" content="https://host/render?s=<payload>&view=system&format=png&width=1200">
<meta property="og:image:width" content="1200">
<meta name="twitter:card" content="summary_large_image">
```

system 図 1 枚。多くのプラットフォームは 1 枚しか表示せず、ADR でも system 図が最も強いと記録。deploy 追加は後続で検討可。

### og:title / og:description（確定: 動的・best-effort）

`og:title` / `og:description` は krs から抽出した最初の system の情報を反映する。抽出は **best-effort**:

- payload を `decodeShare` → `compile(krs, { diagramType: "system" })` し、`systems[]` の先頭（synthetic な `__unassigned__` を除く最初の system）を採る。
- **og:title** = その system の `label ?? id`（例:「勤怠管理システム」「HRTool」）。
- **og:description** = その system の `properties.description` が設定されていればそれを使う。未設定なら静的フォールバック。
- decode / compile / 抽出のいずれかが失敗・該当なしなら、それぞれ **静的文言**（title 例:「karasu — shared architecture diagram」）にフォールバックする。
- **重要（後述の security と直結）**: 抽出した title / description は krs 由来の任意文字列なので、`s` の charset validation では守られない。属性の `content` に入れる前に **HTML escape を必ず行う**（escaping が load-bearing になる）。description は長すぎる場合に備え一定長で truncate する。

これは「事前検証しない」方針と矛盾しない: 抽出は失敗しても静的にフォールバックするだけで、**不正 payload でもページはエラーにならず OGP を出す**。

## 現時点の方針

**query スキーム `/s?s=` + SPA への bounce + system 1 枚 OGP + 動的 title（best-effort）** を採用する。既存の `/render` PNG・`encodeShare`・`readSharedProjectFromHash` をすべて再利用し、新規描画も SPA 配線も持たずに最小実装で OGP unfurl を実現する。Share ダイアログは private / unfurlable の 2 リンクを **トレードオフを伝える文面付き**で提示し、oversize（encoded > ~8000 文字）時は private のみへフォールバックする。

### 実装の指針

**1. 共有ページビルダー（framework-agnostic, unit-tested）**

`packages/app/src/render/share-page.ts` に `buildSharePageHtml({ s, origin })` を追加。`share-render.ts` と同じく `{ status, contentType, body }` を返し、Workers runtime なしでテストできるようにする。

- **payload validation（TPL-20260510-17）**: `s` が base64url 文字集合 `[A-Za-z0-9_-]+` に厳密一致するかを検証。外れたら 400。base64url には `"` `<` `>` `&` `'` が含まれないため、`s` をそのまま埋める箇所（og:image URL・bounce・noscript）への injection を構造的に封じる。
- **decode 由来の文字列は別扱い**: 動的 `og:title` / `og:description` は `decodeShare` 後の任意文字列で charset validation の外。属性に入れる前に **HTML escape を必須**とする（`&` `<` `>` `"` `'`）。抽出は try/catch の best-effort、失敗時は静的フォールバック（事前検証はしない）。
- **title / description 抽出**: `decodeShare(s)` → `compile(krs, { diagramType: "system" })` の `systems[]` 先頭（synthetic `__unassigned__` を除く最初の system）から、title = `label ?? id`、description = `properties.description`（未設定なら静的）。該当なし・例外時は静的フォールバック。description は長すぎる場合 truncate。
- og:image の `content` は `${origin}/render?s=${s}&view=system&format=png&width=1200`。
- bounce スクリプトと `<noscript>` href は `${origin}/#s=${s}`。
- `s` 欠落時は 400（人間向けに app トップへの導線を出してもよい）。
- キャッシュ: payload に対して決定的なので `Cache-Control: public, max-age=600`（`/render` と整合）。

**2. Pages Function**

`functions/s.ts`: `onRequestGet` で `?s=` を読み、`buildSharePageHtml` を呼んで `Response` にマップ（`functions/render.ts` と同じ薄さ）。`Content-Type: text/html; charset=utf-8`。

**3. URL ビルダー**

`packages/app/src/utils/inline-share.ts` に追加:

- `encodeShare` を 1 回呼び、fragment URL と unfurl URL（`${origin}/s?s=<encoded>`）の両方を組み立てるヘルパー（例: `buildShareUrls(payload, location, { maxUnfurlLength })`）。二重エンコードを避ける。
- `maxUnfurlLength`（既定 ~8000 文字）を超える encoded payload は unfurl 不可とし、ヘルパーは `unfurlUrl: null` を返す。閾値は Cloudflare の URL 長（~16KB）とクローラ互換を見た安全側の値。tunable な定数として定義。

**4. Share ダイアログ UX**

`ShareDialog.tsx` / `PreviewColumn.tsx` を改修:

- `handleShare` は `buildShareUrls` で両 URL を取得。
- ダイアログは 2 つの read-only field（それぞれ Copy）を **トレードオフ説明付き**で表示:
  - **Private link**（`#s=`、デフォルト）: 「サーバに送信されず非公開。ただし Slack / X などではプレビュー画像が出ません。」
  - **Unfurlable link**（`/s?s=`）: 「Slack / X などでアーキ図プレビューが出ます。共有内容がサーバ（とログ）に送られます。」
- oversize（`unfurlUrl === null`）時は unfurl field を出さず、「このプロジェクトは大きすぎて unfurlable リンクを作れません（private リンクは利用可）」と警告。
- 文言は i18n（en / ja 両方、`docs/spec/i18n.md` 準拠）。

**5. AT**: `docs/acceptance/` に新規。TC は:
- `/s?s=<valid>` が system og:image・twitter:card・bounce を含む HTML を返す（自動）
- `/s?s=<不正文字>` が 400（自動 — TPL-20260510-17）
- Share ダイアログが 2 リンクと各説明を表示、oversize で private のみ + 警告（自動）
- **人間検証**: 実際に Slack / Discord / X に unfurl リンクを貼り、system 図プレビューが出ることを確認

**6. ADR 昇格**: 実装完了後 `docs/adr/YYYYMMDD-NN-karasu-nest-ogp-share-page.md` として昇格（ADR-20260626-01 を `related_to`）、本 Design Doc は同 PR で削除。TPL-20260510-17 の `known_consumers` に share-page を追記。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（fragment 共有はデフォルトのまま。unfurl は opt-in の追加リンク）。
- ドキュメント更新: ADR-20260626-01 の後続節リンク更新、reverse ガイドに unfurl 共有の一言を足してもよい。
- テスト・examples への影響: なし。

## 決めたこと（旧・未解決の問い）

- **oversize 閾値**: encoded payload > **~8000 文字**で unfurl 不可 → private のみ + 警告。Cloudflare の URL 上限（~16KB）に余裕があり、実測リバース `.krs`（圧縮後 ~5k 文字）は問題なく収まる。tunable な定数で定義。
- **og:title / og:description**: 最初の system から抽出して**動的化**する（title = `label ?? id`、description = `properties.description` があれば使用）。best-effort、失敗・未設定時は静的。抽出値は HTML escape 必須、description は truncate。
- **事前検証**: 行わない。不正 payload でもページはエラーにせず OGP を出す（画像は `/render` が適切な status を返し unfurl が空になるだけ）。タイトル抽出の失敗も静的フォールバックで吸収。

## 未解決の問い / 決めないこと

- deploy ビューの og:image（複数 og:image）は後続。
