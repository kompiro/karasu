# ギャラリー投稿の OGP プレビュー画像

- **日付**: 2026-10-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2995](https://github.com/kompiro/karasu/issues/2995)（スライス 1 のタイトルと説明は PR [#3013](https://github.com/kompiro/karasu/pull/3013) で済み）
  - Design Doc の PR: [#3014](https://github.com/kompiro/karasu/pull/3014)
  - 関連 ADR: [ADR-1805](../adr/1805-resvg-wasm-png-rasterization.md)（resvg-wasm で PNG にする）、[ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（app の `/s` の OGP）、[ADR-105](../adr/105-png-export-not-adopted.md)（core/cli/app に PNG を入れない）、[ADR-2993](../adr/2993-gallery-client-side-rendering.md)（投稿ページは sandbox の viewer）、[ADR-2592](../adr/2592-nest-as-a-gallery.md)（ギャラリーの構築）、[ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)、[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)
  - 関連 TPL: [TPL-1799](../test-perspectives/TPL-1799-raster-pipeline-glyph-coverage.md)、[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2284](../test-perspectives/TPL-2284-purge-scope-identity-is-canonical.md)、[TPL-2993](../test-perspectives/TPL-2993-third-party-content-runs-outside-session-origin.md)
  - コード: `packages/nest/src/routes/gallery.ts`、`packages/nest/src/gallery/ogp.ts`、`functions/render.ts`、`packages/app/src/render/ogp-frame.ts`

## 背景・課題

#3013 で、公開投稿の `/g/<id>` はタイトルと説明の OGP カードを出すようになった。画像が無いので `twitter:card` は `summary` で、Slack・X・GitHub では小さなカードになる。Issue の完了条件は「system view の画像付きのカードが出る」ことである。

多くの OGP の消費者は SVG を `og:image` として描かないので、PNG が要る。app の `/s` は同じことを Pages Function の `/render` で毎回描いて返している（ADR-1801、ADR-1805）。nest はこれを呼べない。app と nest をつなぐことになり、モデルを URL に載せる経路（8000 文字上限、ADR-2259）でもあるからである。nest は投稿を KV に持っているので、投稿のバージョンごとに 1 回だけ描けばよい。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| app の PNG 経路 | `functions/render.ts`: core で system view の SVG → `wrapSvgForOgpFrame`（1200×630 の枠に contain で収める）→ resvg-wasm で PNG。wasm の初期化とフォントの読み込みは isolate ごとに 1 回キャッシュする |
| フォント | `packages/app/public/fonts/` の 4 本（Noto Sans / Noto Sans JP / Noto Emoji / Noto Sans Symbols 2、計 8.3MB）。カバレッジは `packages/app/src/render/png-font-coverage.test.ts` が検査する（TPL-1799） |
| 枠の関数 | `wrapSvgForOgpFrame` は `packages/app/src/render/ogp-frame.ts` にある純粋な文字列変換 |
| nest の配信 | `wrangler.toml` の `[assets]` で viewer を配る。静的に直接返すのは `/assets/*` だけで、他のパスは Worker を通る（ADR-2993） |
| nest の KV | 投稿・アカウント・セッションを 1 つの namespace にキー接頭辞で分けて持つ。アカウント削除はアカウント起点の接頭辞を掃除する（TPL-2226、`gallery-purge-coverage.test.ts`）。`KVNamespaceLike` は文字列の値だけを扱う |
| nest の公開 URL | `https://karasu-nest.kompiro.workers.dev`（独自ドメインではない） |
| 投稿レコード | `updatedAt` は差し替え・公開範囲の変更で進む |

### 測定（Node、`reports/2995-ogp-image/measure.mts`）

app の `/render` と同じ手順（system view の SVG → 1200×630 の枠 → resvg-wasm + 4 フォント）を 5 回ずつ実行した。Node での値なので Workers の CPU 時間とは一致しないが、桁は分かる。

| モデル | `.krs` | SVG | PNG | 中央値（SVG 生成 / ラスタライズ / 合計） | 初回 |
| --- | --- | --- | --- | --- | --- |
| getting-started | 5KB | 17KB | 48KB | 5 / 33 / 38ms | 109ms |
| Dify | 291KB | 55KB | 100KB | 44 / 49 / 93ms | 117ms |

wasm の初期化は 18ms。初回の増分はフォントの解析によるもの。`wrangler.toml` の記録では、Workers 上での Dify の単一 view の描画は 20〜36ms だった。1 枚の生成は Workers でも 100ms 前後に収まる見込みで、無料プランの 10ms には収まらないが、現在の `cpu_ms = 5000` には十分に収まる。メモリは Node の RSS からは判断できないが、同じ 1200×630 のラスタライズと同じフォントで、app の `/render` が Pages Functions（同じ isolate の上限）で本番稼働している。

## 制約・前提

- **app に nest への接続口を足さない。** `/render` を呼ばない。モデルを URL に載せない。
- **公開範囲を広げない。** 限定公開と削除済みの投稿の画像は、存在しない投稿と同じ 404 で答える。
- **保存したものはアカウント削除で必ず消える。** 新しいキー接頭辞はアカウント起点にし、掃除の対象に含める（TPL-2226、TPL-2284）。
- **PNG は Worker の中だけで作る。** core/cli/app は SVG-only のまま（ADR-105、ADR-1805）。
- **グリフの欠けを出さない。** app の `/render` と同じフォントの組を使う（TPL-1799）。
- **Cache API は使えない。** Cloudflare の Cache API は `*.workers.dev` では何もしない（[Cloudflare Workers の Cache API のドキュメント](https://developers.cloudflare.com/workers/runtime-apis/cache/)）。nest は workers.dev で動いているので、「保存せず edge にキャッシュする」形（ADR-1828 の方式）は今のドメインでは効かない。
- out of scope: 投稿者が画像を差し替える機能、system 以外の view の画像。

## 検討した選択肢

### いつ描くか

#### 案 T1: 投稿・差し替えのリクエストの中で描く

**メリット**: 最初のクローラーも待たない。

**デメリット**: 投稿の応答が 100ms 以上遅くなる。描画の失敗を投稿の失敗にするか握りつぶすかを決めることになる。公開範囲の変更や旧バージョンの扱いなど、書き込みのたびに画像を気にする箇所が増える。

#### 案 T2: 投稿・差し替えの後に `ctx.waitUntil` で描く

**メリット**: 投稿の応答は遅くならない。

**デメリット**: T1 と同じく書き込みの経路が画像を知ることになる。失敗したときに後で直す仕組みが別に要るので、結局 T3 の経路も持つことになる。

#### 案 T3: 画像が初めて求められたときに描いて保存する

`/g/<id>/og.png` が呼ばれたら、保存済みの画像のバージョンが投稿の `updatedAt` と一致すればそれを返し、一致しなければ（または無ければ）描いて保存してから返す。

**メリット**: 画像を扱うのはこのルートだけで、投稿・差し替え・公開範囲の変更の経路は何も変えない。失敗しても次の要求で描き直す。差し替えは `updatedAt` が変わるだけで自然に描き直しになる。

**デメリット**: 差し替え後の最初のクローラーが描画を待つ（100〜200ms 程度）。クローラーのタイムアウトは秒単位なので問題にならない。

### どこに保存するか

#### 案 S1: 既存の KV namespace

キーは `og/v1/<account>/<slug>`、値は PNG のバイト列、metadata に元にした投稿の `updatedAt` を持つ。

**メリット**: 新しい binding も新しい課金項目も要らない。PNG は 100KB 前後で、KV の値の上限（25MiB）に余裕で入る。アカウント起点の接頭辞なので、既存の掃除の仕組みにそのまま乗る。

**デメリット**: `KVNamespaceLike` を ArrayBuffer の値に広げる必要がある。KV の書き込みは同じキーに 1 秒 1 回までだが、1 投稿の画像の書き込みは差し替えのときだけなので問題ない。

#### 案 S2: R2

**メリット**: 大きなオブジェクトに向く。

**デメリット**: binding が 1 つ増え、アカウント削除の掃除も KV とは別に要る。100KB の画像には過剰。

#### 案 S3: 保存せず Cache API に載せる

**デメリット**: workers.dev では効かない（制約・前提）。独自ドメインに移ったときの選択肢として残す。

### 共有するコードをどこに置くか

#### 案 C1: `wrapSvgForOgpFrame` を core に移し、app の Pages Function と nest の両方が core から使う

**メリット**: nest の Worker の bundle に app のコードが入らない（nest は app を build 時の依存としてだけ持つ、ADR-2993）。枠の作り方が 1 か所に保たれる。

**デメリット**: core の公開 API が 1 つ増え、changeset が要る。

#### 案 C2: nest が app のソースを直接 import する

**デメリット**: nest の README の「app は build 時の依存だけで、Worker に bundle しない」という約束を崩す。

#### 案 C3: nest に複製する

**デメリット**: 2 か所に同じ関数ができ、枠の比率を変えたときにずれる。

## 比較

| 観点 | T1 | T2 | T3 |
| --- | --- | --- | --- |
| 書き込みの経路への影響 | 大 | 中 | なし |
| 失敗からの回復 | 別途要る | 別途要る | 次の要求で自動 |
| 最初のクローラーの待ち | なし | ほぼなし | 100〜200ms |

| 観点 | S1（KV） | S2（R2） | S3（Cache API） |
| --- | --- | --- | --- |
| 今のドメインで動く | ○ | ○ | × |
| 追加の binding | なし | 1 つ | なし |
| アカウント削除の掃除 | 既存の仕組みに乗る | 別途要る | 不要 |

## 現時点の方針

**T3（初めて求められたときに描いて保存）+ S1（既存の KV）+ C1（枠の関数を core に移す）を採用する。** 画像を扱うのが 1 つのルートに閉じ、投稿の書き込みの経路を変えずに済み、失敗しても次の要求で直る。保存先は既存の KV で足り、アカウント削除の掃除にもそのまま乗る。

### 実装の指針

1. **core**: `wrapSvgForOgpFrame` を `packages/app/src/render/ogp-frame.ts` から core に移して export し、`functions/render.ts` と app のテストを core 参照に変える。changeset は `@karasu-tools/core` と `karasu`。
2. **nest のフォントと wasm**:
   - `@resvg/resvg-wasm` を nest の依存に足す。nest の「core 以外に runtime 依存を持たない」約束は、Worker の中だけで PNG を作るという ADR-1805 の例外として更新する。
   - `packages/nest/scripts/stage-viewer.ts` が app の `public/fonts/` の 4 本を `viewer-assets/og-fonts/` に置く。`/assets/*` の外なので静的には配られず、Worker が `ASSETS` binding から読む。
   - フォントの組は app の `png-font-coverage.test.ts` が検査する組と同じであることをテストで固定する（TPL-1799）。
3. **ルート `GET /g/<id>/og.png`**:
   - `visibleSubmission` で可視判定する。公開の投稿でなければ、所有者の要求でも 404 にする（OGP は公開投稿だけのもの、#3013 と同じ線）。
   - KV の `og/v1/<account>/<slug>` の metadata のバージョンが `updatedAt` と一致すれば返す。一致しなければ描いて保存して返す。
   - 描画は core の `compile(krs, { diagramType: "system" })`（既定のテーマ = ダーク）→ `wrapSvgForOgpFrame(svg, 1200, 630, "#ffffff")` → resvg-wasm。テーマと余白の色は app の `/s` の画像と同じにする（ADR-1801）。ライトのテーマも試したが、コストは同じで、`/s` と見た目を揃えることを優先した。wasm とフォントは isolate ごとに 1 回だけ読み込む。
   - 応答は `image/png`、`X-Content-Type-Options: nosniff`。キャッシュは投稿ページと同じ `public, max-age=600`。
   - 描画に失敗したら 500 で返し、保存しない。
4. **ページの OGP**:
   - 公開投稿では `og:image`（`${NEST_PUBLIC_ORIGIN}/g/<id>/og.png?v=<updatedAt を数値にしたもの>`）、`og:image:width` / `og:image:height` / `og:image:type` を出す。`twitter:card` は `summary_large_image` にする。
   - `?v=` は、差し替えた後にクローラーが古い画像のキャッシュを使い続けないためのもの。ルートは `?v=` を見ず、常に最新の `updatedAt` で判断する。
5. **掃除**:
   - 投稿の削除で `og/v1/<account>/<slug>` も消す。
   - アカウント削除の掃除に `og/v1/<account>/` を足し、`gallery-purge-coverage.test.ts` が新しい接頭辞を検査するようにする（TPL-2226、TPL-2284）。
   - 限定公開にした投稿の画像は消さない。どこからも配られず（ルートが 404）、もとの `.krs` 自体も保存されたままなので、画像だけを消す意味が無い。公開に戻したときは `updatedAt` が進むので描き直しになる。
6. **テスト**:
   - 公開投稿で PNG が返る
   - 限定公開・削除済み・存在しない投稿で同じ 404 になる
   - 2 回目は描かずに保存済みを返す
   - 差し替えで描き直す
   - 削除とアカウント削除で消える
   - ページの `og:image` と `summary_large_image`
   - フォントの組が app と一致する
7. **計測**: deploy 後に Dify の投稿で `/g/<id>/og.png` を初回に叩き、Workers の CPU 時間（observability のログ）を記録する。
8. **AT**: `docs/acceptance/2995-nest-gallery-ogp.md` に画像の項目を足す。手動項目は、公開投稿の URL を貼って画像付きのカードが出ること。
9. **ADR 昇格**: 実装後に `docs/adr/2995-...md` として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 公開投稿のカードが大きな画像付きに変わる。既存の投稿は、最初に画像が求められたときに描かれる。
- Worker の bundle: resvg-wasm（約 2.4MB）が加わる。有料プランの上限（10MB）には収まる。wasm の初期化は画像のルートでだけ行う。
- ドキュメント更新: `packages/nest/README.md`（ルート、runtime 依存の約束、`viewer-assets` の中身）。
- テスト・examples への影響: app の `ogp-frame` のテストは core に移る。

## 未解決の問い / 決めないこと

- 独自ドメインに移ったら、Cache API（S3）に切り替えて KV の保存をやめられるかを再評価する。
- system 以外の view の画像や、投稿者が画像を差し替える機能は扱わない。
