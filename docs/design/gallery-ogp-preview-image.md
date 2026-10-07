# ギャラリー投稿の OGP プレビュー画像

- **日付**: 2026-10-01（2026-10-07 に保存先を KV から Cache API に変更）
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2995](https://github.com/kompiro/karasu/issues/2995)（スライス 1 のタイトルと説明は PR [#3013](https://github.com/kompiro/karasu/pull/3013) で済み）
  - Design Doc の PR: [#3014](https://github.com/kompiro/karasu/pull/3014)
  - 同じ画像を使う一覧ページ: [#3016](https://github.com/kompiro/karasu/issues/3016)（`/` に公開投稿をカードで並べる）
  - 関連 ADR: [ADR-1805](../adr/1805-resvg-wasm-png-rasterization.md)（resvg-wasm で PNG にする）、[ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（app の `/s` の OGP）、[ADR-105](../adr/105-png-export-not-adopted.md)（core/cli/app に PNG を入れない）、[ADR-2993](../adr/2993-gallery-client-side-rendering.md)（投稿ページは sandbox の viewer）、[ADR-2592](../adr/2592-nest-as-a-gallery.md)（ギャラリーの構築）、[ADR-3020](../adr/3020-nest-custom-domain-karasu-nest-kompiro-dev.md)（nest を独自ドメインに移す）、[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md)、[ADR-1783](../adr/1783-karasu-nest-hosted-preview.md)、[ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)
  - 関連 TPL: [TPL-1799](../test-perspectives/TPL-1799-raster-pipeline-glyph-coverage.md)、[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)、[TPL-2284](../test-perspectives/TPL-2284-purge-scope-identity-is-canonical.md)、[TPL-2993](../test-perspectives/TPL-2993-third-party-content-runs-outside-session-origin.md)、[TPL-2995](../test-perspectives/TPL-2995-purge-must-catch-writes-that-land-after-it.md)（本設計から起こした proactive TPL）
  - コード: `packages/nest/src/routes/gallery.ts`、`packages/nest/src/gallery/ogp.ts`、`functions/render.ts`、`functions/[[path]].ts`、`packages/core/src/renderer/ogp-frame.ts`

## 背景・課題

#3013 で、公開投稿の `/g/<id>` はタイトルと説明の OGP カードを出すようになった。画像が無いので `twitter:card` は `summary` で、Slack・X・GitHub では小さなカードになる。Issue の完了条件は「system view の画像付きのカードが出る」ことである。

同じ画像はギャラリーの一覧（`/` に公開投稿をカードで並べる、[#3016](https://github.com/kompiro/karasu/issues/3016)）のサムネイルにも使う。画像を作る経路は 1 つにする。

多くの OGP の消費者は SVG を `og:image` として描かないので、PNG が要る。app の `/s` は同じことを Pages Function の `/render` で毎回描いて返している（ADR-1801、ADR-1805）。nest はこれを呼べない。app と nest をつなぐことになり、モデルを URL に載せる経路（8000 文字上限、ADR-2259）でもあるからである。nest は投稿を KV に持っているので、自分で描ける。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| app の PNG 経路 | `functions/render.ts`: core で system view の SVG → `wrapSvgForOgpFrame`（1200×630 の枠に contain で収める）→ resvg-wasm で PNG。wasm の初期化とフォントの読み込みは isolate ごとに 1 回キャッシュする |
| フォント | `packages/app/public/fonts/` の 4 本（Noto Sans / Noto Sans JP / Noto Emoji / Noto Sans Symbols 2、計 8.3MB）。カバレッジは `packages/app/src/render/png-font-coverage.test.ts` が検査する（TPL-1799） |
| 枠の関数 | `wrapSvgForOgpFrame` は純粋な文字列変換。設計時は app にあり、実装で `packages/core/src/renderer/ogp-frame.ts` に移した |
| nest の配信 | `wrangler.toml` の `[assets]` で viewer を配る。静的に直接返すのは `/assets/*` だけで、他のパスは Worker を通る（ADR-2993） |
| nest の公開 URL | `https://karasu-nest.kompiro.dev`（独自ドメイン、ADR-3020）。`workers_dev = false` で、workers.dev のホストは止めてある |
| nest の KV | 投稿・アカウント・セッションを 1 つの namespace にキー接頭辞で分けて持つ。アカウント削除はアカウント起点の接頭辞を掃除する（TPL-2226、`gallery-purge-coverage.test.ts`）。`KVNamespaceLike` は文字列の値だけを扱う |
| KV の一貫性 | 書いた場所では直後に見えるが、他の場所では最大 60 秒程度古い値が返りうる（Cloudflare のドキュメント）。compare-and-set は無い |
| Cache API の前例 | app の `functions/[[path]].ts` が repo-backed permalink の解決結果を `caches.default` に置いている。「ephemeral CDN cache で、新しい store ではない」と位置づけ、`put` の失敗は握りつぶす |
| 投稿レコード | `updatedAt` は差し替え・公開範囲の変更で進む |

### Cache API の性質（[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)、[How the Cache works](https://developers.cloudflare.com/workers/reference/how-the-cache-works/)）

- 独自ドメインの Worker でだけ効く。workers.dev や dashboard の preview では何もしない。
- 中身はデータセンターごとで、他のデータセンターには複製されない。`cache.put` は tiered cache に対応しない。
- `cache.delete` はそのデータセンターだけを消す。全拠点から消すには purge（`Cache-Tag`、ホスト名、接頭辞）を使う。Worker が独自のキーで置いたものは URL では purge できない。
- `put` に渡した応答の `Cache-Control` / `Expires` に従って期限が切れる。期限前に退避されないという保証は無い。

### 測定（Node、`reports/2995-ogp-image/measure.mts`）

app の `/render` と同じ手順（system view の SVG → 1200×630 の枠 → resvg-wasm + 4 フォント）を 5 回ずつ実行した。Node での値なので Workers の CPU 時間とは一致しないが、桁は分かる。

| モデル | `.krs` | SVG | PNG | 中央値（SVG 生成 / ラスタライズ / 合計） | 初回 |
| --- | --- | --- | --- | --- | --- |
| getting-started | 5KB | 17KB | 48KB | 5 / 33 / 38ms | 109ms |
| Dify | 291KB | 55KB | 100KB | 44 / 49 / 93ms | 117ms |

測定の手順: `.krs` を core の `compile(krs, { diagramType: "system" })` で SVG にし（parse を含む）、`wrapSvgForOgpFrame(svg, 1200, 630, "#ffffff")` で枠に収め、`@resvg/resvg-wasm` に 4 本のフォントを渡して `fitTo: width 1200` で PNG にする。測定スクリプトは `reports/`（gitignore）に置いたので repo には残らない。上の手順で再現できる。

wasm の初期化は 18ms。初回の増分はフォントの解析によるもの。`wrangler.toml` の記録では、Workers 上での Dify の単一 view の描画は 20〜36ms だった。**ここまでが測定で、ここからは推定である。** 1 枚の生成は Workers でも 100ms 前後に収まる見込みだが、Workers 上の値、最大サイズ（1MiB）の投稿、コールドスタートは測っていない。`wrangler.toml` の記録が示すとおり、コストはバイト数ではなくドメインやビューの数に効くので、推定のまま上限を決めない（実装の指針 6）。メモリも Node の RSS からは判断できない。同じ 1200×630 のラスタライズと同じフォントを、app の `/render` が Pages Functions（同じ isolate の上限）で本番稼働させている、というのが現時点の根拠である。

ADR-2993 が Worker から描画を外したのは、全ビューを 1 枚にまとめた既定のページ（Dify で約 600ms、8.4MB の SVG）のためだった。この画像は system view の 1 枚だけで、キャッシュが外れたときにしか描かないので、その判断とは矛盾しない。

## 制約・前提

- **app に nest への接続口を足さない。** `/render` を呼ばない。モデルを URL に載せない。
- **公開範囲を広げない。** 限定公開と削除済みの投稿の画像は、存在しない投稿と同じ 404 で答える。
- **nest の保存物を増やさない。アカウント削除の約束は KV の保存物に対するもので、edge のキャッシュは保存物として扱わない。** ADR-2592 決定 5 の「投稿者が削除するまで保持し、アカウント削除ですべて消える」は、nest が KV に持つものを指す。edge のキャッシュは、app の `functions/[[path]].ts` と同じく「ephemeral CDN cache で、新しい store ではない」と位置づける。その位置づけが成り立つ条件として、キャッシュは次の 2 つを満たす。
  - **削除・非公開が KV に伝わった後は配らない。** ルートは毎回 KV で可視判定してからキャッシュを引く。キャッシュに画像が残っていても、可視判定が削除・非公開を読めば 404 になる。可視判定の KV の読み出しは最大 60 秒程度古い値を返しうるので、その間は古い「公開」を読んだ要求がキャッシュの画像を配りうる。これは下の「しばらく配られうることは許容する」の範囲で、投稿ページも同じ窓を持つ。
  - **期限で必ず消える。** キャッシュの期限は 1 日に固定し、期限の無いキャッシュを作らない。
- **PNG は Worker の中だけで作る。** core/cli/app は SVG-only のまま（ADR-105、ADR-1805）。
- **グリフの欠けを出さない。** app の `/render` と同じフォントの組を使う（TPL-1799）。
- **Cache API は独自ドメインでだけ効く。** nest は ADR-3020 で `karasu-nest.kompiro.dev` に移り、workers.dev のホストを止めたので、本番の要求はすべて効く側を通る。効かない環境（`wrangler dev` の設定や将来の preview）では毎回描くだけで、正しさは変わらない。
- **一覧のカードでも同じ画像を使う**（#3016）。一覧を開くと、そのデータセンターでまだキャッシュされていない画像の要求がまとめて来る。
- **非公開化・削除の後も、キャッシュされた画像がしばらく配られうることは許容する。** `og.png` のクライアント向けの応答は投稿ページと同じ `public, max-age=600` で、その間はブラウザや共有キャッシュから配られうる（ADR-2993 と同じ扱い）。KV の可視判定も最大 60 秒程度古い値を読みうる。Slack・X などが自分で持つ unfurl のキャッシュはこちらから消せない。
- out of scope: 投稿者が画像を差し替える機能。system 以外の view の画像は本 Design Doc では扱わず、別に考える。

## 検討した選択肢

### いつ描くか

#### 案 T1: 投稿・差し替えのリクエストの中で描く

**メリット**: 最初のクローラーも待たない。

**デメリット**: 投稿の応答が 100ms 以上遅くなる。描画の失敗を投稿の失敗にするか握りつぶすかを決めることになる。公開範囲の変更や旧バージョンの扱いなど、書き込みのたびに画像を気にする箇所が増える。

#### 案 T2: 投稿・差し替えの後に `ctx.waitUntil` で描く

**メリット**: 投稿の応答は遅くならない。

**デメリット**: T1 と同じく書き込みの経路が画像を知ることになる。描いたものを置く先が要るので、保存（S1/S2）が前提になる。

#### 案 T3: 画像が求められたときに描き、置いておく

`/g/<id>/og.png` が呼ばれたら、置いてある画像が投稿の今の `updatedAt` のものならそれを返し、無ければ描いて置いてから返す。

**メリット**: 画像を扱うのはこのルートだけで、投稿・差し替え・公開範囲の変更の経路は何も変えない。失敗しても次の要求で描き直す。差し替えは `updatedAt` が変わるだけで自然に描き直しになる。

**デメリット**: 置いてあるものが無いときの最初の要求が描画を待つ（100〜200ms 程度）。クローラーのタイムアウトは秒単位なので問題にならない。

### どこに置くか

#### 案 S1: 既存の KV namespace に保存する

キーは `og/v1/<account>/<slug>`、値は PNG のバイト列、metadata に元にした投稿の `updatedAt` を持つ。

**メリット**: 描くのは投稿のバージョンごとに 1 回で、全拠点で共有される。新しい binding も要らない。

**デメリット**: nest の保存物が増えるので、アカウント削除の約束の対象になる。`KVNamespaceLike` を ArrayBuffer の値に広げ、`og/v1/` を `purgeAccount` と網羅テストに足す（TPL-2226）。それに加えて、削除との競合を閉じる仕組みが要る（次の節）。

#### 案 S2: R2 に保存する

**メリット**: 大きなオブジェクトに向く。

**デメリット**: S1 の削除の問題をすべて持ったうえで、binding が 1 つ増え、アカウント削除の掃除も KV とは別に要る。100KB の画像には過剰。

#### 案 S3: 保存せず、Cache API に置く

キャッシュキーは、要求の URL ではなくサーバーが投稿の `updatedAt` から組み立てる。期限は 1 日。

**メリット**: nest の保存物が増えない。KV の型、キーの接頭辞、アカウント削除、網羅テストのどれにも手を入れない。削除との競合（次の節）は、どこからも配られず 1 日で消えるキャッシュのエントリしか生まないので、閉じる仕組みが要らない。差し替えはキーが変わるだけで自然に描き直しになる。app の `functions/[[path]].ts` に前例がある。

**デメリット**: キャッシュはデータセンターごとで、tiered cache も効かないので、描く回数が「投稿のバージョンごとに 1 回」から「データセンターごと・1 日ごとに 1 回（退避されればさらに）」に増える。今の規模では CPU の費用は問題にならない（1 回 100ms として、公開投稿 50 件 × 1 日 10 拠点で 1 日 50 秒程度。有料プランに含まれる CPU 時間は 1 日あたり約 1000 秒）。独自ドメインの外では効かない。

### S1 を採った場合の削除との競合

T3 では、匿名のクローラーの要求が画像を置く。要求が投稿を「見える」と読んでから画像を置くまでのあいだにアカウント削除の掃除が終わると、画像だけが掃除の後に置かれる。置いた直後に投稿を読み直しても、KV の読み出しは古い値を返しうる（最大 60 秒程度）。S1 ではこれが「アカウント削除で必ず消える」を破るので、次を検討した。

- R1 読み直しと期限（TTL）だけ: 取りこぼした画像は期限（30 日）まで残る。約束を満たさない。
- R2 削除のマーカーを書きの前後で確かめる（`sessions.ts` の失効マーカーと同じ形）: 別のデータセンターの要求にはマーカーも最大 60 秒程度見えない。窓を狭めるが閉じない。
- R3 削除のマーカーを Cron が拾い、5 分後にもう一度掃除する: 待ち時間が足りる根拠は「古い値を読んだ要求は一定時間内に書き終わる」という前提にしかない。Workers の CPU 時間の上限は I/O の待ちを含まず、クライアントがつながっているあいだは経過時間の上限も無い。KV の操作にも決まった時間の上限は無い（[Workers の limits](https://developers.cloudflare.com/workers/platform/limits/)）。マーカーに期限を付ければ、Cron が期限より長く止まったときに再掃除の機会が消える。
- R4 アカウントごとの Durable Object: ADR-1994 が正確なカウンタのために見送ったのと同じ判断で、1 つの画像の競合のために store 全体の持ち主を変えるのは見合わない。
- R5 投稿の無い画像を Cron が定期的に回収する（`og/v1/` と `sub/v1/` を列挙して突き合わせる）: 時刻ではなく状態で判定するので閉じる。ただし `scheduled` の入口と `[triggers]`、回収のロジック、列挙の費用が増える。

S1 を採るなら R5 が要る。S3 ではこの節の全体が要らなくなる。古い値を読んだ要求が削除の後に `cache.put` しても、置かれるのはそのデータセンターのキャッシュだけで、可視判定が削除・非公開を読めるようになった後（KV の伝播、最大 60 秒程度）は配られず、1 日で消える。伝播の前に配られうるのは、エントリがいつ置かれたかに関係なく、投稿ページと同じ許容の範囲である。

### キャッシュの期限と、削除のときの扱い（S3 の場合）

#### 案 P1: 期限 1 日だけで、purge しない

**メリット**: secret も外向きの呼び出しも増えない。削除・非公開の投稿の画像は、KV に伝わった後は可視判定で配られず、残ったエントリも 1 日で消える。

**デメリット**: 削除の後も、どこからも配られないエントリが最大 1 日データセンターに残る。

#### 案 P2: `Cache-Tag` を付け、削除のときにタグで purge する

**メリット**: 通常の削除では全拠点からすぐに消える。タグでの purge は全プランで使える。

**デメリット**: zone の Cache Purge 権限を持つ API token の secret と、Worker から Cloudflare API への外向きの呼び出しが増え、その失敗の扱いも要る。古い値を読んだ要求が purge の後に置いたエントリは期限まで残るので、P1 の期限は結局要る。

#### 案 P3: 期限を 10 分（ページと同じ）にする

**メリット**: 残るのは最大 10 分。

**デメリット**: 描き直しの回数が 1 日の場合の最大 144 倍になる。残るエントリはもともと配られないので、短くして得るものが小さい。

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
| 最初の要求の待ち | なし | ほぼなし | 100〜200ms |

| 観点 | S1（KV） | S2（R2） | S3（Cache API） |
| --- | --- | --- | --- |
| 描く回数 | 投稿のバージョンごとに 1 回 | 投稿のバージョンごとに 1 回 | データセンターごと・1 日ごとに 1 回（退避されればさらに） |
| nest の保存物 | 増える | 増える | 増えない |
| アカウント削除の約束を守る仕組み | `purgeAccount` への追加 + Cron の定期回収（R5） | S1 と同じ + R2 の掃除 | 可視判定 + 期限 1 日 |
| 追加の binding・入口 | `scheduled` と `[triggers]` | binding 1 つ + `scheduled` と `[triggers]` | なし |
| 独自ドメインの外 | 動く | 動く | 毎回描く（正しさは同じ） |

| 観点 | P1（期限 1 日） | P2（タグで purge） | P3（期限 10 分） |
| --- | --- | --- | --- |
| 削除後に残るエントリ（配られない） | 最大 1 日 | 通常はすぐ消える。競合した分は最大 1 日 | 最大 10 分 |
| 増える仕組み | なし | secret + Cloudflare API の呼び出し | なし |
| 描き直しの回数 | 基準 | 基準 | 最大 144 倍 |

## 現時点の方針

**T3（求められたときに描く）+ S3（Cache API に置く）+ P1（期限 1 日、purge しない）+ C1（枠の関数を core に移す）を採用する。** 画像を扱うのが 1 つのルートに閉じ、投稿の書き込みの経路も nest の保存物も変えずに済み、失敗しても次の要求で直る。削除・非公開の投稿の画像は、KV に伝わった後（最大 60 秒程度）は毎回の可視判定で配られず、キャッシュに残ったものも 1 日で消えるので、削除との競合を閉じる仕組みが要らない。描く回数は S1 より増えるが、今の規模では問題にならない。マージ前の測定で 1 枚のコストが想定を大きく超えたら S1 + R5 に戻す（実装の指針 6）。一覧（#3016）を開いたときにキャッシュされていない画像の要求がまとめて来ても、それぞれが別のリクエストとして描いて置くので、一覧のために別の生成経路は要らない。

### 実装の指針

1. **core**: `wrapSvgForOgpFrame` を app から core（`packages/core/src/renderer/ogp-frame.ts`）に移して export し、`functions/render.ts` と app のテストを core 参照に変える。changeset は `@karasu-tools/core` と `karasu`。
2. **nest のフォントと wasm**:
   - `@resvg/resvg-wasm` を nest の依存に足す。nest の「core 以外に runtime 依存を持たない」約束は、Worker の中だけで PNG を作るという ADR-1805 の例外として更新する。
   - wasm は `functions/render.ts` と同じく `@resvg/resvg-wasm/index_bg.wasm` を module として import し、wrangler に bundle させる。`initWasm` は画像のルートで初めて呼び、isolate ごとに 1 回だけにする。
   - `packages/nest/scripts/stage-viewer.ts` が app の `public/fonts/` の 4 本を `viewer-assets/og-fonts/` に置く。`/assets/*` の外なので静的には配られず、Worker が `ASSETS` binding から読む。
   - フォントの組は app の `png-font-coverage.test.ts` が検査する組と同じであることをテストで固定する（TPL-1799）。フォントの元は `packages/app/**` で、deploy の paths にすでに入っている。
3. **キャッシュの差し込み口**:
   - `match` と `put` だけを持つ小さなインターフェースを nest に置き、`worker.ts` が `caches.default` を渡す。テストではメモリの実装を渡し、`put` された応答とその `Cache-Control` を検査できるようにする（vitest の Node には `caches` が無い）。
   - KV（`KVNamespaceLike`、`MemoryKV`）と鍵の一覧（`gallery-keys.ts`）は変えない。
4. **ルート `GET /g/<id>/og.png`**:
   - `visibleSubmission` で可視判定したうえで、`submission.visibility === "public"` を別に確かめる。`visibleSubmission` は限定公開の投稿を所有者に返すので、これを省くと所有者に限定公開の画像が出て、`public, max-age=600` まで付く。所有者のセッションでも 404 になることをテストする。**可視判定はキャッシュを引く前に毎回行う。** キャッシュを先に引くと、削除・非公開の投稿の画像が配られる。
   - キャッシュキーは、要求の URL ではなく、サーバーが組み立てる `${NEST_PUBLIC_ORIGIN}/g/<id>/og.png?v=<updatedAt を数値にしたもの>&r=<描画の版>`。要求の `?v=` やその他のクエリはキーに入れない（クエリを変えてキャッシュを外し、描画を繰り返させる経路を作らない）。`r` は描画の版を表す定数で、フォント・テーマ・枠を変えたときに上げる。
   - キャッシュにあればそれを返す。無ければ、描画は既存の `renderSubmission`（`gallery/render.ts`、`view=system`）を使う。表示できない文書は 422 で答える既存の扱いをそのまま引き継ぐ。得た SVG を `wrapSvgForOgpFrame(svg, 1200, 630, "#ffffff")` で枠に収め、resvg-wasm で PNG にする。テーマは既定（ダーク）のままで、app の `/s` の画像と同じ見た目にする（ADR-1801）。ライトのテーマも試したが、`/s` と見た目を揃えることを優先した。
   - キャッシュには `Cache-Control: public, max-age=86400` の応答を `ctx.waitUntil(cache.put(...))` で置き、`put` の失敗は握りつぶす（app の `functions/[[path]].ts` と同じ）。クライアントへの応答は、キャッシュから返すときも描いたときも `public, max-age=600` に揃える。キャッシュから取り出した応答は `max-age=86400` を持っているので、そのまま返さず付け替える。
   - ラスタライズそのものの失敗（wasm やフォントの読み込みの失敗）は 500 で返す。404・422・500 はキャッシュに置かず、`no-store`（`http.ts` の既定）。
   - 応答は `image/png`、`X-Content-Type-Options: nosniff`。`Set-Cookie` を付けない（付けると Cache API は置かない）。
   - 削除との競合のための仕組みは足さない。古い値を読んだ要求が削除の後に置いたエントリは、削除・非公開が KV に伝わった後は可視判定で配られず、1 日で消える（「S1 を採った場合の削除との競合」の節）。
5. **ページの OGP**:
   - 公開投稿では `og:image`（`${NEST_PUBLIC_ORIGIN}/g/<id>/og.png?v=<updatedAt を数値にしたもの>`）、`og:image:width` / `og:image:height` / `og:image:type` を出す。`twitter:card` は `summary_large_image` にする。`NEST_PUBLIC_ORIGIN` が無い deploy では `og:image` を出さず、`summary` のままにする。
   - `?v=` は、差し替えた後にクローラーやブラウザが古い画像のキャッシュを使い続けないためのもの。ルートは `?v=` を見ず、常に最新の `updatedAt` でキーを組み立てる。
6. **テスト**:
   - 自動テスト（`packages/nest/src/routes/gallery.test.ts` ほか）:
     - 公開投稿で PNG が返る
     - 限定公開・削除済み・存在しない投稿で同じ 404 になり、所有者のセッションでも 404 になる（既存の「unlisted は存在しない投稿と同じ応答」のテストと同じ形）
     - 2 回目はキャッシュから返し、描かない
     - 差し替えでキーが変わり、描き直す
     - **キャッシュにあっても配らない**: キャッシュに画像が置かれた後に、投稿の削除・非公開化・アカウント削除をすると 404 になる。これが削除の約束の中心なので、3 つとも確かめる。このテストが確かめるのは、可視判定が削除・非公開を読めた場合である。KV が古い「公開」を返す間に配られうることは許容の範囲として扱い（制約・前提）、テストでは固定しない
     - キャッシュに置く応答は `max-age=86400` を持ち、クライアントへの応答はキャッシュから返すときも描いたときも `max-age=600` を持つ
     - 要求のクエリ（`?v=` の値や余計なクエリ）を変えてもキーは変わらず、描き直さない
     - 表示できない文書は 422 で、キャッシュに置かない。ラスタライズの失敗も 500 で、置かない
     - `put` が失敗しても応答は返る
     - このルートは KV に書かない（`MemoryKV.puts` が空のまま）
     - ページの `og:image` と `summary_large_image`
     - フォントの組が app と一致する
   - 自動テストでは確かめられないもの: vitest は Workers の実行環境で wasm を読み込めず、`caches.default` も無い。マージ前に `wrangler deploy --dry-run`（bundle のサイズと wasm の取り込み）と `wrangler dev`（実際に PNG が返ること、2 回目がキャッシュから返ること）で確かめ、PR に記録する。
   - **コストはマージ前に `wrangler dev` で測る。** Dify と、上限（1MiB）近くまで膨らませた合成の投稿で、コールドスタートを含めて測る。1 枚が数百 ms を超えるなら、S3 では描く回数が多い分そのまま効くので、S1 + R5 に戻すか、画像を作る投稿の大きさに上限を設ける。deploy 後は observability のログで Workers の CPU 時間と、キャッシュの当たり外れを記録する。
7. **AT**: `docs/acceptance/2995-nest-gallery-ogp.md` に画像の項目を足す。手動項目は、公開投稿の URL を貼って画像付きのカードが出ることと、投稿を削除した後に `og.png` が 404 になること。
8. **ADR 昇格**: 実装後に `docs/adr/2995-...md` として昇格し、本 Design Doc を削除する。ADR には「edge のキャッシュはアカウント削除の約束の対象外で、可視判定と期限 1 日で扱う」ことを、ADR-2592 決定 5 への補足として書く。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 公開投稿のカードが大きな画像付きに変わる。既存の投稿は、最初に画像が求められたときに描かれる。
- Worker の bundle: resvg-wasm（約 2.4MB）が加わる。有料プランの上限（10MB）には収まる。wasm の初期化は画像のルートでだけ行う。
- KV・アカウント削除・Worker の入口: 変わらない。
- ドキュメント更新: `packages/nest/README.md`（ルート、runtime 依存の約束、`viewer-assets` の中身、画像を Cache API に置くこと）。
- テスト・examples への影響: app の `ogp-frame` のテストは core に移る。

## 未解決の問い / 決めないこと

- deploy 後にキャッシュの当たり外れを見て、退避が多く描く回数が想定を大きく超えるなら、S1 + R5 に戻すかを再評価する。
- system 以外の view の画像や、投稿者が画像を差し替える機能は扱わない。
