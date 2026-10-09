---
id: ADR-2995
title: ギャラリーの公開投稿の OGP 画像を要求時に描き、保存せず edge のキャッシュに置く
status: accepted
date: 2026-10-09
topic: project
authors: [kompiro]
depends_on: [ADR-2592, ADR-3020, ADR-1805]
related_to:
  - ADR-1801
  - ADR-105
  - ADR-2993
  - ADR-1994
  - ADR-1828
  - ADR-3000
  - ADR-2259
scope:
  packages: [nest, core, app]
  concerns: [security, performance, dependencies]
assumptions:
  - "grep: packages/nest/src/app.ts :: /g/:id/og\\.png"
  - "symbol: packages/nest/src/routes/gallery.ts :: submissionOgImage"
  - "symbol: packages/nest/src/gallery/og-image.ts :: OG_EDGE_CACHE_SECONDS"
  - "symbol: packages/nest/src/gallery/og-image.ts :: ogImageCacheKey"
  - "symbol: packages/nest/src/gallery/og-rasterize.ts :: rasterizeOgPng"
  - "symbol: packages/core/src/renderer/ogp-frame.ts :: wrapSvgForOgpFrame"
  - "grep: packages/nest/package.json :: \"@resvg/resvg-wasm\""
  - "grep: .coderabbit.yaml :: @resvg/resvg-wasm"
  - "grep: docs/policy/nest-data-handling.md :: 公開投稿の OGP 画像"
---

# ADR-2995: ギャラリーの公開投稿の OGP 画像を要求時に描き、保存せず edge のキャッシュに置く

- **日付**: 2026-10-09
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2995](https://github.com/kompiro/karasu/issues/2995)（スライス 1 のタイトルと説明は PR [#3013](https://github.com/kompiro/karasu/pull/3013)）
  - 設計 PR: [#3014](https://github.com/kompiro/karasu/pull/3014)（本 ADR の元になった Design Doc）、実装 PR: [#3096](https://github.com/kompiro/karasu/pull/3096)
  - 同じ画像を使う一覧ページ: [#3016](https://github.com/kompiro/karasu/issues/3016)
  - [ADR-2592](2592-nest-as-a-gallery.md)（ギャラリーの構築。決定 5「アカウント削除ですべて消える」を本 ADR が補足する）
  - [ADR-3020](3020-nest-custom-domain-karasu-nest-kompiro-dev.md)（nest を独自ドメインに移す。Cache API が効く前提）
  - [ADR-1805](1805-resvg-wasm-png-rasterization.md)（resvg-wasm で PNG にする）、[ADR-105](105-png-export-not-adopted.md)（core/cli/app に PNG を入れない）
  - [ADR-1801](1801-karasu-nest-ogp-share-page.md)（app の `/s` の OGP。枠とテーマを揃える）
  - [ADR-2993](2993-gallery-client-side-rendering.md)（投稿ページは sandbox の viewer。Worker から描画を外した理由）
  - [ADR-1994](1994-karasu-nest-free-tier-quota.md)（Durable Object を見送った判断）
  - TPL: [TPL-2995](../test-perspectives/TPL-2995-purge-must-catch-writes-that-land-after-it.md)（本件の設計から起こした proactive TPL）、[TPL-1799](../test-perspectives/TPL-1799-raster-pipeline-glyph-coverage.md)、[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2284](../test-perspectives/TPL-2284-purge-scope-identity-is-canonical.md)
  - 受け入れテスト: [2995-nest-gallery-ogp](../acceptance/2995-nest-gallery-ogp.md)（AT-F〜K、AT-M2、AT-M3）
  - データの扱い: [nest-data-handling](../policy/nest-data-handling.md)「保存しないが、一時的にキャッシュするもの」

## 背景

公開投稿の `/g/<id>` はタイトルと説明の OGP カードを出していたが（#3013）、画像が無いので `twitter:card` は `summary` だった。Issue の完了条件は「system view の画像付きのカードが出る」ことである。同じ画像を一覧（#3016）のサムネイルにも使う。

多くの OGP の消費者は SVG を描かないので PNG が要る。app の `/s` は Pages Function の `/render` で毎回描いているが（ADR-1801、ADR-1805）、nest はそれを呼べない。app と nest をつなぎ、モデルを URL に載せることになる（8000 文字上限、ADR-2259）。nest は投稿を KV に持っているので、自分で描ける。

決めることは 3 つあった。いつ描くか、描いた画像をどこに置くか、そして削除との関係である。nest は「投稿者が削除するまで保持し、アカウント削除ですべて消える」と約束している（ADR-2592 決定 5）。画像を保存物にすると、この約束の対象が増える。

設計の途中で、nest は workers.dev から `karasu-nest.kompiro.dev` に移った（ADR-3020）。Cloudflare の Cache API は workers.dev では何もしないが、独自ドメインでは効く。これで「保存せずキャッシュに置く」案が選べるようになった。

## 決定

**`GET /g/<id>/og.png` は、キャッシュに無いときに system view を 1200×630 の枠に収めて resvg-wasm で PNG にし、Cloudflare の Cache API に 1 日置く。KV には何も保存しない。**

1. **いつ描くか（T3）**: 画像が求められ、キャッシュに無いときに描く。投稿・差し替え・公開範囲の変更の経路は画像を知らない。
2. **どこに置くか（S3）**: Cache API に置く。キャッシュキーは要求の URL ではなく、保存されたレコードの `updatedAt` と描画の版から、サーバーが組み立てる。差し替えるとキーが変わり、自然に描き直しになる。要求のクエリで描画を強制することはできない。
3. **期限と削除（P1）**: キャッシュの期限は 1 日で、削除のときに purge しない。ルートは **キャッシュを引く前に毎回 KV で投稿を読む**。削除・非公開が KV に伝わった後（最大 60 秒程度）は 404 を返し、キャッシュに残った画像は配られずに 1 日で消える。
4. **ADR-2592 決定 5 の補足**: 約束の対象は nest が KV に持つ保存物であり、edge のキャッシュは含めない。そう扱ってよい条件は、上の 2 つ（毎回の可視判定と、期限 1 日）である。利用者向けの事実は `docs/policy/nest-data-handling.md` に書き、期限は定数 `OG_EDGE_CACHE_SECONDS` と sync テストで突き合わせる。
5. **ルートはセッションを読まない**: 画像は誰が見ても同じなので、投稿が `public` かどうかだけで判定する。限定公開の投稿の画像は、所有者にも 404 を返す。Design Doc はページのルートの `visibleSubmission` を流用していたが、それはセッションを読んで所有者を判定した結果を、`public` の確認で打ち消すだけだった。呼び出し元の多くはセッションを持たないクローラーで、一覧のサムネイルとしてサインイン中のブラウザが取りに来ると、セッションの更新（KV への書き込み）を無駄に起こす。
6. **枠の関数は core に置く（C1）**: `wrapSvgForOgpFrame` を app から core に移し、app の `/render` と nest の両方が core から使う。nest に app のソースを bundle しない（ADR-2993）。
7. **resvg-wasm を nest の runtime 依存の例外にする**: nest は「core 以外に runtime 依存を持たない」約束だったが、`@resvg/resvg-wasm` を唯一の例外にする。import してよいのは `og-rasterize.ts` だけで、`.coderabbit.yaml` のレビュー指示にもそう書く。OAuth の secret を持つ Worker に依存が 1 つ増えることは受け入れる。版は lockfile で固定し、app の `functions/render.ts` が既に本番で使っている版と同じにする。フォントは app と同じ 4 本を `viewer-assets/og-fonts/` に置き（`/assets/*` の外なので直接は配られない）、その組が app の組と一致することをテストで固定する（TPL-1799）。

ページは `og:image`（`/g/<id>/og.png?v=<updatedAt>`）と幅・高さ・型を出し、`twitter:card` を `summary_large_image` にする。テーマは app の `/s` と同じ既定（ダーク）にする。

## 理由

- 画像を扱うのが 1 つのルートに閉じ、投稿の書き込みの経路を変えずに済む。描画に失敗しても、次の要求で描き直す。
- 保存しないので、アカウント削除との競合（削除の後に古い値を読んだ要求が画像を書き戻す）を閉じる仕組みが要らない。保存（S1）では、その競合を閉じるために Cron で孤立した画像を回収する仕組みが必要だった（却下した案）。キャッシュなら、競合で置かれたエントリは配られず、期限で消える。
- KV の型、キーの接頭辞、`purgeAccount`、purge の網羅テスト（TPL-2226）のどれにも手を入れずに済む。
- app の `functions/[[path]].ts` に、Cache API を「新しい store ではない ephemeral なキャッシュ」として使う前例がある。

### 本番の測定（deploy 後、Workers の observability）

| 要求 | CPU | 経過時間 |
| --- | --- | --- |
| キャッシュに無い（umami のモデル、約 110KB） | 523ms / 620ms | 954ms / 1.32s |
| キャッシュから返す | 2〜5ms | 27〜42ms |

キャッシュに無いときの描画は、ローカルの `wrangler dev`（umami 相当で約 40ms、Dify で約 84ms、約 900KB・サービス 300 個の合成モデルで約 255ms）の 5 倍前後だった。手元の比較では、日本語フォントを渡さなくても温まった後の描画時間は変わらず、最初の 1 回だけが 2〜3 倍遅かった。本番の重さは、冷えた isolate（wasm がまだ最適化されていない状態）での描画が Workers の CPU で走った結果と見ている。公開投稿へのアクセスが少ないうちは、キャッシュに無いときはほぼ毎回この重さになる。

Design Doc は「1 枚が数百 ms を大きく超えるなら S1 に戻す」と定めていたが、この値でも S3 を続ける。

- 費用: 1 回 600ms で、公開投稿 50 件 × 1 日 10 拠点 × 30 日と見積もっても月 900 万 ms ほどで、有料プランに含まれる月 3,000 万 ms の 3 割程度に収まる。CPU の上限（`wrangler.toml` の 5,000ms）にも余裕がある。
- 表示: 待つのはキャッシュに無いときの最初の要求（経過時間 1 秒前後）だけで、クローラーは秒単位で待つ。
- S1 に戻すと、上の競合を閉じる仕組みが要る。今の規模では費用に見合わない。

キャッシュはデータセンターごとなので、Slack や X のクローラー（多くは国外の拠点）が描いた画像は、別の拠点の閲覧者には効かない。本番でも、国外から来たと見られる最初の描画のあと、東京からの要求はもう一度描いていた。これは S3 の性質どおりである。

## 却下した案

- **T1（投稿・差し替えの要求の中で描く）/ T2（その後に `ctx.waitUntil` で描く）**: 書き込みの経路が画像を知ることになり、描いたものを置く先（保存）が前提になる。失敗したときに直す経路も別に要る。
- **S1（既存の KV に保存する）**: 描くのは投稿のバージョンごとに 1 回で済むが、画像が保存物になり、アカウント削除の約束の対象が増える。削除と描画の競合は次のように検討し、閉じるには R5 が要ると結論した。
  - R1 読み直しと期限だけ: 取りこぼした画像が期限（30 日）まで残る。
  - R2 削除のマーカーを書きの前後で確かめる: 別の拠点の要求にはマーカーも最大 60 秒程度見えず、閉じない。
  - R3 マーカーを Cron が拾い、5 分後にもう一度掃除する: 「古い値を読んだ要求は一定時間内に書き終わる」という前提に頼るが、Workers は I/O の待ちに経過時間の上限を設けず、KV の操作にも時間の上限が無い。マーカーに期限を付けると、Cron が長く止まったときに再掃除の機会ごと失う。
  - R4 アカウントごとの Durable Object: ADR-1994 と同じ理由で見送る。
  - R5 投稿の無い画像を Cron が定期的に回収する: 時刻ではなく状態で判定するので閉じるが、`scheduled` の入口・回収のロジック・列挙の費用が増える。
- **S2（R2 に保存する）**: S1 の削除の問題をすべて持ったうえで、binding とその掃除が増える。
- **P2（`Cache-Tag` を付け、削除のときに purge する）**: API token の secret と、Worker から Cloudflare API への呼び出しが増える。purge の後に競合で置かれたエントリは期限まで残るので、期限 1 日は結局要る。
- **P3（期限を 10 分にする）**: 描き直しの回数が最大 144 倍になる。残るエントリはもともと配られないので、短くして得るものが小さい。
- **C2（nest が app のソースを import する）/ C3（nest に複製する）**: C2 は「app は build 時の依存だけ」の約束を崩し、C3 は枠の比率を変えたときにずれる。
- **フォントを減らして描画を軽くする**: 本番の測定のあとに検討したが、手元の比較で温まった後の描画時間が変わらなかったので採らない。

## 未決事項

- **S1 との併用を見直す条件**: 公開投稿の数やアクセスが増え、`og.png` の描画の CPU が有料プランの月の枠に近づいたら、KV に保存した画像を Cache API の後ろに置く形（その場合は R5 の回収が要る）を再検討する。判断の材料は Workers の observability の CPU 時間である。
- **system 以外の view の画像**と、投稿者が画像を差し替える機能は扱わない。
- **プライバシーポリシーの草案**（`docs/policy/nest-privacy.md`）にキャッシュの扱いを書くかは、別に判断する。
