# ギャラリー投稿の OGP プレビュー画像

- **日付**: 2026-10-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2995](https://github.com/kompiro/karasu/issues/2995)（スライス 1 のタイトルと説明は PR [#3013](https://github.com/kompiro/karasu/pull/3013) で済み）
  - Design Doc の PR: [#3014](https://github.com/kompiro/karasu/pull/3014)
  - 同じ画像を使う一覧ページ: [#3016](https://github.com/kompiro/karasu/issues/3016)（`/` に公開投稿をカードで並べる）
  - 関連 ADR: [ADR-1805](../adr/1805-resvg-wasm-png-rasterization.md)（resvg-wasm で PNG にする）、[ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（app の `/s` の OGP）、[ADR-105](../adr/105-png-export-not-adopted.md)（core/cli/app に PNG を入れない）、[ADR-2993](../adr/2993-gallery-client-side-rendering.md)（投稿ページは sandbox の viewer）、[ADR-2592](../adr/2592-nest-as-a-gallery.md)（ギャラリーの構築）、[ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)、[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)
  - 関連 TPL: [TPL-1799](../test-perspectives/TPL-1799-raster-pipeline-glyph-coverage.md)、[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2284](../test-perspectives/TPL-2284-purge-scope-identity-is-canonical.md)、[TPL-2993](../test-perspectives/TPL-2993-third-party-content-runs-outside-session-origin.md)、[TPL-2995](../test-perspectives/TPL-2995-purge-must-catch-writes-that-land-after-it.md)（本設計から起こした proactive TPL）
  - コード: `packages/nest/src/routes/gallery.ts`、`packages/nest/src/gallery/ogp.ts`、`functions/render.ts`、`packages/app/src/render/ogp-frame.ts`

## 背景・課題

#3013 で、公開投稿の `/g/<id>` はタイトルと説明の OGP カードを出すようになった。画像が無いので `twitter:card` は `summary` で、Slack・X・GitHub では小さなカードになる。Issue の完了条件は「system view の画像付きのカードが出る」ことである。

同じ画像はギャラリーの一覧（`/` に公開投稿をカードで並べる、[#3016](https://github.com/kompiro/karasu/issues/3016)）のサムネイルにも使う。画像の生成と保存の仕組みは 1 つにし、投稿ごとに保存する画像も 1 枚にする。

多くの OGP の消費者は SVG を `og:image` として描かないので、PNG が要る。app の `/s` は同じことを Pages Function の `/render` で毎回描いて返している（ADR-1801、ADR-1805）。nest はこれを呼べない。app と nest をつなぐことになり、モデルを URL に載せる経路（8000 文字上限、ADR-2259）でもあるからである。nest は投稿を KV に持っているので、投稿のバージョンごとに 1 回だけ描けばよい。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| app の PNG 経路 | `functions/render.ts`: core で system view の SVG → `wrapSvgForOgpFrame`（1200×630 の枠に contain で収める）→ resvg-wasm で PNG。wasm の初期化とフォントの読み込みは isolate ごとに 1 回キャッシュする |
| フォント | `packages/app/public/fonts/` の 4 本（Noto Sans / Noto Sans JP / Noto Emoji / Noto Sans Symbols 2、計 8.3MB）。カバレッジは `packages/app/src/render/png-font-coverage.test.ts` が検査する（TPL-1799） |
| 枠の関数 | `wrapSvgForOgpFrame` は `packages/app/src/render/ogp-frame.ts` にある純粋な文字列変換 |
| nest の配信 | `wrangler.toml` の `[assets]` で viewer を配る。静的に直接返すのは `/assets/*` だけで、他のパスは Worker を通る（ADR-2993） |
| nest の KV | 投稿・アカウント・セッションを 1 つの namespace にキー接頭辞で分けて持つ。アカウント削除はアカウント起点の接頭辞を掃除する（TPL-2226、`gallery-purge-coverage.test.ts`）。`KVNamespaceLike` は文字列の値だけを扱う |
| KV の一貫性 | 書いた場所では直後に見えるが、他の場所では最大 60 秒程度古い値が返りうる（Cloudflare のドキュメント）。compare-and-set は無い。`submissions.ts` の `update` は、読んでから書くあいだに削除が割り込む競合を「閉じていない」と明記している。セッションの失効は、消えないマーカーを書きの前後で確かめて狭めている（`sessions.ts` の `refreshIfStale`） |
| 定期実行 | 無い。Worker は `fetch` だけを export し、`wrangler.toml` に `[triggers]` は無い |
| nest の公開 URL | `https://karasu-nest.kompiro.workers.dev`（独自ドメインではない） |
| 投稿レコード | `updatedAt` は差し替え・公開範囲の変更で進む |

### 測定（Node、`reports/2995-ogp-image/measure.mts`）

app の `/render` と同じ手順（system view の SVG → 1200×630 の枠 → resvg-wasm + 4 フォント）を 5 回ずつ実行した。Node での値なので Workers の CPU 時間とは一致しないが、桁は分かる。

| モデル | `.krs` | SVG | PNG | 中央値（SVG 生成 / ラスタライズ / 合計） | 初回 |
| --- | --- | --- | --- | --- | --- |
| getting-started | 5KB | 17KB | 48KB | 5 / 33 / 38ms | 109ms |
| Dify | 291KB | 55KB | 100KB | 44 / 49 / 93ms | 117ms |

測定の手順: `.krs` を core の `compile(krs, { diagramType: "system" })` で SVG にし（parse を含む）、`wrapSvgForOgpFrame(svg, 1200, 630, "#ffffff")` で枠に収め、`@resvg/resvg-wasm` に 4 本のフォントを渡して `fitTo: width 1200` で PNG にする。測定スクリプトは `reports/`（gitignore）に置いたので repo には残らない。上の手順で再現できる。

wasm の初期化は 18ms。初回の増分はフォントの解析によるもの。`wrangler.toml` の記録では、Workers 上での Dify の単一 view の描画は 20〜36ms だった。**ここまでが測定で、ここからは推定である。** 1 枚の生成は Workers でも 100ms 前後に収まる見込みだが、Workers 上の値、最大サイズ（1MiB）の投稿、コールドスタートは測っていない。`wrangler.toml` の記録が示すとおり、コストはバイト数ではなくドメインやビューの数に効くので、推定のまま上限を決めない（実装の指針 7）。メモリも Node の RSS からは判断できない。同じ 1200×630 のラスタライズと同じフォントを、app の `/render` が Pages Functions（同じ isolate の上限）で本番稼働させている、というのが現時点の根拠である。

ADR-2993 が Worker から描画を外したのは、全ビューを 1 枚にまとめた既定のページ（Dify で約 600ms、8.4MB の SVG）のためだった。この画像は system view の 1 枚だけで、投稿のバージョンごとに 1 回しか描かないので、その判断とは矛盾しない。

## 制約・前提

- **app に nest への接続口を足さない。** `/render` を呼ばない。モデルを URL に載せない。
- **公開範囲を広げない。** 限定公開と削除済みの投稿の画像は、存在しない投稿と同じ 404 で答える。
- **保存したものはアカウント削除で必ず消える。** 新しいキー接頭辞はアカウント起点にし、掃除の対象に含める（TPL-2226、TPL-2284）。削除の時点で進行中だった要求が後から書いた画像も含む。期限（TTL）で消えるのを待つことは、この約束を満たしたことにしない。
- **PNG は Worker の中だけで作る。** core/cli/app は SVG-only のまま（ADR-105、ADR-1805）。
- **グリフの欠けを出さない。** app の `/render` と同じフォントの組を使う（TPL-1799）。
- **Cache API は使えない。** Cloudflare の Cache API は `*.workers.dev` では何もしない（[Cloudflare Workers の Cache API のドキュメント](https://developers.cloudflare.com/workers/runtime-apis/cache/)）。nest は workers.dev で動いているので、「保存せず edge にキャッシュする」形（ADR-1828 の方式）は今のドメインでは効かない。
- **一覧のカードでも同じ画像を使う**（#3016）。一覧を初めて開くと、まだ描かれていない画像の要求がまとめて来る。
- **非公開化・削除の後も、キャッシュされた画像がしばらく配られうることは許容する。** `og.png` は投稿ページと同じ `public, max-age=600` で、その間は共有キャッシュから配られうる（ADR-2993 と同じ扱い）。Slack・X などが自分で持つ unfurl のキャッシュはこちらから消せない。即時に消す必要が出たら、ページと同じく purge を足す。
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

### 削除との競合をどう閉じるか

T3 では、匿名のクローラーの要求が画像を書く。要求が投稿を「見える」と読んでから画像を書くまでのあいだにアカウント削除の掃除が終わると、画像だけが掃除の後に書き戻される。保存の直後に投稿を読み直しても、KV の読み出しは古い値を返しうる（最大 60 秒程度）ので、読み直しは「まだ見える」と答えて画像を残しうる。

#### 案 R1: 読み直しと期限（TTL）だけで済ませる

**デメリット**: 取りこぼした画像は期限（30 日）まで残る。「アカウント削除で必ず消える」を満たさない。

#### 案 R2: 削除のマーカーを、書く前と書いた後に確かめる

削除の始めに、消えないマーカーを書く。画像のルートは書く前と書いた後にマーカーを確かめ、あれば書かない／消す。`sessions.ts` の失効マーカーと同じ形。

**メリット**: 書いた場所では直後に見えるので、同じ場所の要求との競合は閉じる。

**デメリット**: 別の場所の要求には、マーカーも最大 60 秒程度見えない。窓を狭めるが閉じない。

#### 案 R3: R2 に加え、削除から時間をおいて掃除をもう一度走らせる

削除のマーカーを Cron Trigger が拾い、削除から一定時間（5 分）たってから同じ掃除をもう一度走らせ、マーカーを消す。

**デメリット**: 待ち時間が足りる根拠は、「古い値を読んだ要求は一定時間内に書き終わる」という前提にしかない。Workers の CPU 時間の上限は I/O の待ちを含まず、クライアントがつながっているあいだは経過時間の上限も無い。KV の操作にも決まった時間の上限は無い（[Workers の limits](https://developers.cloudflare.com/workers/platform/limits/)）。再掃除がマーカーを消した後に `put` が届けば、画像は残る。マーカーに期限を付ければ、Cron が期限より長く止まったときに再掃除の機会そのものが消え、付けなければアカウント ID を持つ鍵が残り続けうる。

#### 案 R4: アカウントごとに Durable Object を置き、強い一貫性で書く

**デメリット**: ADR-1994 が正確なカウンタのために見送ったのと同じ判断で、1 つの画像の競合のために store 全体の持ち主を変えるのは見合わない。`ctx.waitUntil` で 2 回目の掃除を遅らせる案も考えたが、応答後に延ばせるのは 30 秒までで、KV の伝播（約 60 秒）より短い。Queues の遅延メッセージは binding がもう 1 つ増え、Cron で足りる。

#### 案 R5: 投稿の無い画像を、Cron が定期的に回収する

Cron Trigger が `og/v1/` と `sub/v1/` を列挙して突き合わせ、対応する投稿が無い画像を消す。

**メリット**: 消すかどうかを時刻ではなく状態（投稿があるか）で決めるので、書き込みがいつ届いても、届いた後の最初の回収で消える。要求の長さにも KV の伝播の時間にも上限を仮定しない。失って困るマーカーも無いので、Cron が長く止まっても、再開した最初の回収で消える。アカウント削除だけでなく、投稿の削除と競合した画像も同じ仕組みで消える。

**デメリット**: Worker に `scheduled` の入口と `[triggers]` が 1 つずつ増える。回収のたびに 2 つの接頭辞を列挙する（1 回の列挙で 1000 件まで返るので、投稿が 1000 件以下なら 1 回 2 操作）。遅れて書かれた画像は、回収の間隔（10 分）と列挙に反映されるまでの時間だけ残る。

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

| 観点 | R1（TTL） | R2（マーカー） | R3（マーカー + 再掃除） | R4（Durable Object） | R5（定期回収） |
| --- | --- | --- | --- | --- | --- |
| 削除後に書かれた画像 | 30 日残る | 別の場所なら残る | 要求が長引けば残る | 書かれない | 届いた後の最初の回収で消える |
| 前提にする時間の上限 | なし | KV の伝播 | 要求の長さ・KV の伝播 | なし | なし |
| 増える仕組み | なし | マーカー | マーカー + Cron | store の作り替え | Cron |

## 現時点の方針

**T3（初めて求められたときに描いて保存）+ S1（既存の KV）+ C1（枠の関数を core に移す）+ R5（投稿の無い画像を Cron が定期的に回収する）を採用する。** 画像を扱うのが 1 つのルートに閉じ、投稿の書き込みの経路を変えずに済み、失敗しても次の要求で直る。保存先は既存の KV で足り、アカウント削除の掃除にもそのまま乗る。一覧（#3016）を初めて開いたときに未生成の画像の要求がまとめて来ても、それぞれが別のリクエストとして描いて保存し、2 回目からは保存済みを返すので、一覧のために別の生成経路は要らない。

### 実装の指針

1. **core**: `wrapSvgForOgpFrame` を `packages/app/src/render/ogp-frame.ts` から core に移して export し、`functions/render.ts` と app のテストを core 参照に変える。changeset は `@karasu-tools/core` と `karasu`。
2. **nest のフォントと wasm**:
   - `@resvg/resvg-wasm` を nest の依存に足す。nest の「core 以外に runtime 依存を持たない」約束は、Worker の中だけで PNG を作るという ADR-1805 の例外として更新する。
   - wasm は `functions/render.ts` と同じく `@resvg/resvg-wasm/index_bg.wasm` を module として import し、wrangler に bundle させる。`initWasm` は画像のルートで初めて呼び、isolate ごとに 1 回だけにする。
   - `packages/nest/scripts/stage-viewer.ts` が app の `public/fonts/` の 4 本を `viewer-assets/og-fonts/` に置く。`/assets/*` の外なので静的には配られず、Worker が `ASSETS` binding から読む。
   - フォントの組は app の `png-font-coverage.test.ts` が検査する組と同じであることをテストで固定する（TPL-1799）。フォントの元は `packages/app/**` で、deploy の paths にすでに入っている。
3. **KV の型**:
   - `KVNamespaceLike` に、値をバイト列で読む `getWithMetadata(key, "arrayBuffer")` を足す。`put` の値に ArrayBuffer も受け付ける。今の `get` は文字列を返すので、PNG を通すと壊れる。
   - テスト用の `MemoryKV` も同じ形に広げる。
4. **ルート `GET /g/<id>/og.png`**:
   - `visibleSubmission` で可視判定したうえで、`submission.visibility === "public"` を別に確かめる。`visibleSubmission` は限定公開の投稿を所有者に返すので、これを省くと所有者に限定公開の画像が出て、`public, max-age=600` まで付く。所有者のセッションでも 404 になることをテストする。
   - KV の `og/v1/<account>/<slug>` を `getWithMetadata` で読み、metadata のバージョンが `updatedAt` と一致すれば返す。一致しなければ描いて保存して返す。
   - 描画は既存の `renderSubmission`（`gallery/render.ts`、`view=system`）を使う。表示できない文書は 422 で答える既存の扱いをそのまま引き継ぎ、画像は保存しない。得た SVG を `wrapSvgForOgpFrame(svg, 1200, 630, "#ffffff")` で枠に収め、resvg-wasm で PNG にする。テーマは既定（ダーク）のままで、app の `/s` の画像と同じ見た目にする（ADR-1801）。ライトのテーマも試したが、`/s` と見た目を揃えることを優先した。
   - ラスタライズそのものの失敗（wasm やフォントの読み込みの失敗）は 500 で返し、保存しない。
   - 応答は `image/png`、`X-Content-Type-Options: nosniff`。キャッシュは投稿ページと同じ `public, max-age=600` で、404・422・500 は `no-store`（`http.ts` の既定）。
   - **削除との競合（R5）。** 描いて保存するあいだに投稿の削除やアカウント削除が割り込むと、画像だけが書き戻されて掃除から漏れる（`submissions.ts` の `update` が書いているのと同じ種類の競合）。
     - 保存した直後に投稿を読み直し、消えていれば画像を消す。これで閉じるのは、削除と同じ場所で読み書きした要求との競合だけである（書いた場所では削除が直後に見える）。
     - 別の場所の要求や、長引いた要求が後から書いた画像は、6 の定期回収が消す。画像を消す約束はこの回収で満たす。
   - 画像の metadata には、元にした投稿の `updatedAt` に加えて、書いた時刻（`writtenAt`）を持たせる（6 の回収が使う）。
   - 画像のキーには `expirationTtl`（30 日）も付ける。Cron が止まったままになったときの最後の受け皿で、約束を満たす手段ではない。期限が来た画像は次の要求で描き直す。
5. **ページの OGP**:
   - 公開投稿では `og:image`（`${NEST_PUBLIC_ORIGIN}/g/<id>/og.png?v=<updatedAt を数値にしたもの>`）、`og:image:width` / `og:image:height` / `og:image:type` を出す。`twitter:card` は `summary_large_image` にする。`NEST_PUBLIC_ORIGIN` が無い deploy では `og:image` を出さず、`summary` のままにする。
   - `?v=` は、差し替えた後にクローラーが古い画像のキャッシュを使い続けないためのもの。ルートは `?v=` を見ず、常に最新の `updatedAt` で判断する。
6. **掃除**:
   - 投稿の削除で、投稿を消してから `og/v1/<account>/<slug>` を消す。
   - アカウント削除（`GalleryStore.purgeAccount`）に `og/v1/<account>/` の掃除を足す。順序は投稿の掃除の後で、結果に消した画像の件数を含める（TPL-2226 のチェックリスト）。`gallery-purge-coverage.test.ts` が新しい接頭辞を検査するようにし、`gallery-keys.ts` のキーの一覧も更新する（TPL-2226、TPL-2284）。
   - **定期回収（R5）**: Worker に `scheduled` の入口を足し、`wrangler.toml` に `[triggers] crons = ["*/10 * * * *"]` を足す。Cron は `og/v1/` と `sub/v1/` を metadata ごと列挙し、`og/v1/<account>/<slug>` に対応する `sub/v1/<account>/<slug>` が無い画像を消す。消した件数をログに出す。
   - 書いてから 5 分未満（metadata の `writtenAt`）の画像は回収しない。列挙は結果整合なので、作ったばかりの投稿がまだ `sub/v1/` の列挙に現れないことがあるためである。この猶予は消し過ぎを防ぐ側にだけ効き、外れても画像が次の要求で描き直されるだけで済む。遅れて書かれた画像を消せるかどうかは、猶予の長さに依存しない。
   - 遅れて書かれた画像は、「書かれてから 5 分」と「投稿の削除が列挙に反映されるまで」の遅い方を過ぎた最初の回収で消える。要求がどれだけ長引いても、書き込みが届いた後の回収が拾う。Cron が止まっていても、再開した最初の回収で消える。
   - 回収は削除の記録（マーカー）を持たないので、削除の後にアカウント ID を持つ鍵を新しく残さない。
   - 投稿が数千件を超える規模になったら、回収の間隔か方式を見直す（列挙の操作数が投稿 1000 件ごとに増えるため）。
   - 投稿の `update` の競合（`submissions.ts` が閉じていないと書いている分）は投稿そのものを書き戻すので、この回収では消えない。`update` の注記はそのまま残す。
   - 限定公開にした投稿の画像は消さない。どこからも配られず（ルートが 404）、もとの `.krs` 自体も保存されたままなので、画像だけを消す意味が無い。公開に戻したときは `updatedAt` が進むので描き直しになる。
7. **テスト**:
   - 自動テスト（`packages/nest/src/routes/gallery.test.ts` ほか）:
     - 公開投稿で PNG が返る
     - 限定公開・削除済み・存在しない投稿で同じ 404 になり、所有者のセッションでも 404 になる（既存の「unlisted は存在しない投稿と同じ応答」のテストと同じ形）
     - 2 回目は描かずに保存済みを返す
     - 差し替えで描き直す
     - 表示できない文書は 422 で、保存されない
     - 描いているあいだに投稿が消えたら、画像も残らない（同じ場所での読み直し）
     - **削除との競合の順序**: アカウント削除が画像の掃除まで終わった後に、古い投稿を読んだ要求が画像を書き、読み直しも古い投稿を返す。この状態から、書いてから 5 分以上たった定期回収で画像が消える。投稿の削除でも同じ順序を確かめる。KV の古い読み出しは、テスト用の `MemoryKV` に「指定したキーの削除前の値を返す」設定を足して再現する
     - 定期回収は、投稿のある画像と、書いてから 5 分未満の画像を消さない
     - 削除とアカウント削除で消え、アカウント削除の結果に件数が出る
     - ページの `og:image` と `summary_large_image`
     - フォントの組が app と一致する
   - 自動テストでは確かめられないもの: vitest は Workers の実行環境で wasm を読み込めない。マージ前に `wrangler deploy --dry-run`（bundle のサイズと wasm の取り込み）と `wrangler dev`（実際に PNG が返ること）で確かめ、PR に記録する。
   - **コストはマージ前に `wrangler dev` で測る。** Dify と、上限（1MiB）近くまで膨らませた合成の投稿で、コールドスタートを含めて測る。1 枚が数百 ms を超えるなら、上限を上げるのではなく、画像を作る投稿の大きさに上限を設けるか、生成を投稿時に移す（T2）ことを検討する。deploy 後は observability のログで Workers の CPU 時間を記録する。
8. **AT**: `docs/acceptance/2995-nest-gallery-ogp.md` に画像の項目を足す。手動項目は、公開投稿の URL を貼って画像付きのカードが出ること。
9. **ADR 昇格**: 実装後に `docs/adr/2995-...md` として昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 公開投稿のカードが大きな画像付きに変わる。既存の投稿は、最初に画像が求められたときに描かれる。
- Worker の bundle: resvg-wasm（約 2.4MB）が加わる。有料プランの上限（10MB）には収まる。wasm の初期化は画像のルートでだけ行う。
- Worker の入口: `worker.ts` が `fetch` に加えて `scheduled` を export し、`wrangler.toml` に `[triggers]` が入る。Cron は 10 分ごと（1 日 144 回）で、1 回あたりの KV 操作は 2 つの接頭辞の列挙（投稿 1000 件ごとに 1 操作ずつ）と、消す画像の数だけである。
- ドキュメント更新: `packages/nest/README.md`（ルート、runtime 依存の約束、`viewer-assets` の中身、Cron による画像の回収）。
- テスト・examples への影響: app の `ogp-frame` のテストは core に移る。

## 未解決の問い / 決めないこと

- 独自ドメインに移ったら、Cache API（S3）に切り替えて KV の保存をやめられるかを再評価する。
- system 以外の view の画像や、投稿者が画像を差し替える機能は扱わない。
