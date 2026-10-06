---
id: ADR-2993
title: ギャラリーの投稿ページを origin を持たない sandbox の viewer として配信し、ブラウザで描画する
status: accepted
date: 2026-10-01
topic: project
authors: [kompiro]
depends_on: [ADR-2592, ADR-2578]
related_to:
  - ADR-2259
  - ADR-9013
  - ADR-3000
scope:
  packages: [nest, app]
  concerns: [security, deployment]
assumptions:
  - "grep: packages/nest/src/routes/gallery.ts :: sandbox allow-scripts allow-downloads allow-popups"
  - "grep: packages/nest/wrangler.toml :: run_worker_first = \\[\"/\\*\", \"!/assets/\\*\"\\]"
  - "symbol: packages/app/src/viewer/mount-viewer.tsx :: mountViewer"
  - "file: packages/app/viewer.html"
  - "file: packages/app/vite.viewer.config.ts"
  - "file: packages/nest/scripts/stage-viewer.ts"
  - "file: scripts/ci/nest-viewer-assets.test.ts"
---

# ADR-2993: ギャラリーの投稿ページを origin を持たない sandbox の viewer として配信し、ブラウザで描画する

- **日付**: 2026-10-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2993](https://github.com/kompiro/karasu/issues/2993)（経緯は [#2969](https://github.com/kompiro/karasu/issues/2969)、[#2992](https://github.com/kompiro/karasu/pull/2992)）
  - 実装: [#2997](https://github.com/kompiro/karasu/issues/2997)（viewer のビルド、PR [#2999](https://github.com/kompiro/karasu/pull/2999)）、[#2998](https://github.com/kompiro/karasu/issues/2998)（nest の配信、PR [#3006](https://github.com/kompiro/karasu/pull/3006)）
  - 設計 PR: [#2994](https://github.com/kompiro/karasu/pull/2994)（本 ADR の元になった Design Doc）
  - [ADR-2592](2592-nest-as-a-gallery.md)（ギャラリーの構築、§6 コンソールにクライアント JS を置かない）
  - [ADR-2578](2578-nest-retires-server-side-reverse.md)（決定 5: nest を app と別デプロイにする）
  - [ADR-2259](2259-permalink-payload-cap.md)（permalink の 8000 文字上限）
  - [ADR-9013](9013-cli-serve-mode.md)（serve mode の `hideEditor`）
  - [ADR-3000](3000-nest-deploys-on-main.md)（nest を main への push で自動 deploy する）
  - [TPL-2993](../test-perspectives/TPL-2993-third-party-content-runs-outside-session-origin.md)、受け入れテスト [2993-gallery-client-side-rendering](../acceptance/2993-gallery-client-side-rendering.md)

## 背景

ギャラリーの投稿ページ（nest の `/g/<id>`）は、投稿された `.krs` を Worker 上で SVG に描画して返していた。大きなモデルでは、この形が両端で合わない。

- **コストが Worker に載る。** 既定のページは全ビュー（ドリルダウン先を含む）を 1 枚の SVG にまとめる。Dify の reverse（355KB、21 ドメイン）は、1 回の描画に Worker の CPU を約 600ms（初回 740ms）使い、8.4MB の SVG を返した。#2992 は `cpu_ms` を 5 秒に上げてこれを収めたが、描画コストはドメイン数に比例して増えるので、上限を上げ続ける形になる。
- **読み手が受け取るのは絵であってモデルではない。** app（`packages/app`）はブラウザ側で描画し、ドリルダウン・ビュー切り替え・検索ができる。静的な SVG ではそれが失われる。

描画をサーバーからブラウザへ移せば両方が解ける。その際に守る前提は次の 4 つだった。

- **app に nest への接続口を追加しない。** app の配信物は nest の本文を取りに行く経路・中継ルート・nest からの埋め込みを受ける設定を持たない。app のコンポーネントをコードとして再利用するのは構わない。
- **第三者が書いた内容を、セッションを持つ origin の権限で描画しない。** nest のセッション cookie は `HttpOnly` だが、同じ origin の script は cookie 付きで nest にリクエストを送れ、`Origin` 検査も通る。描画経路に XSS が 1 つあれば、閲覧者のアカウントで削除などが実行できる（TPL-2993）。
- **公開範囲を広げない。** unlisted の投稿は、描画の経路を変えても「存在しない」と区別できないままにする。
- **8000 文字上限（ADR-2259）の適用範囲を変えない。** URL 埋め込みの面に対して有効なまま残す。

## 決定

nest は `/g/<id>` の応答そのものを、app の preview を別ビルドにした viewer の HTML にし、本文を JSON として埋め込んで、`Content-Security-Policy: sandbox allow-scripts allow-downloads allow-popups`（`allow-same-origin` なし、iframe なし）で返す。ページ全体が origin を持たない状態で動き、図はブラウザで描かれる。Worker は `?format=svg` のときだけ SVG を描く。

具体的には次のとおり。

1. **viewer は app の別ビルドにする**（#2997）。`packages/app/viewer.html` と `src/viewer/` を `vite.viewer.config.ts` で `dist-viewer/` に出力する。app の Pages の配信物には含めない。viewer は
   - 埋め込まれた本文（`<script type="application/json" id="krs-source">`）を読み、メモリ上の 1 ファイルのプロジェクトとして `AppShell hideEditor` で開く
   - ネットワークに出ない。app の web font（Google Fonts）は `styles/web-fonts.css` に分け、app の `main.tsx` だけが読む
   - bundle より前に走る inline script で `localStorage` / `sessionStorage` をメモリ上の代替に差し替える（opaque origin の document は storage へのアクセスで例外を投げる）
   - テーマと表示言語の切り替えを preview のツールバーに置く。ツールバーには外から差し込む口（`PreviewToolbarSlotContext`）を 1 つ足し、viewer だけが使う。共有（クリップボード）は出さない
   - 単一ファイルの投稿が `@import` するスタイルファイルを、空として扱う（サーバー側の `compile(krs)` と同じ挙動）
   - 本文・初期テーマ・初期言語・ツールバーを `mountViewer()` の引数として受け取り、VS Code の webview（#2996）から再利用できる形にする
2. **nest は viewer のビルドを static assets として配る**（#2998）。`build:viewer` が app のビルドを `packages/nest/viewer-assets/` に配置し、`nest-deploy.yml` は deploy の前にこれを実行する。`/assets/*` には `_headers` で `Access-Control-Allow-Origin: *` を付ける（sandbox の document は module script と stylesheet を CORS モードで取得する）。
3. **静的に直接返すのは `/assets/*` だけにする。** `wrangler.toml` の `run_worker_first = ["/*", "!/assets/*"]` で他のすべての path を Worker に通し、`html_handling` / `not_found_handling` は `none` にする。Worker はテンプレート `viewer.html` を `ASSETS` binding から読み、本文を埋めて sandbox を付けたときにだけ返す。テンプレート単体はセッションの origin でページとして開けない。
4. **ページに form を置かず、リンクは同じタブで開く。** 投稿ページの上にサーバーで組み立てたヘッダーを 1 行置き、タイトル・投稿者・`.krs` / `SVG` / `Manage`（所有者のみ）を並べる。opaque origin から送る form は `Origin: null` になり `sameOrigin` 検査で弾かれる。新しいタブで開くと sandbox を引き継ぎ、コンソールが origin を持たずに開く。
5. **viewer の入口の JS と CSS はハッシュの無い固定名（`assets/viewer.js` / `assets/viewer.css`）にする。** 公開投稿のページは共有キャッシュに最大 10 分載り、deploy は assets を丸ごと入れ替える。ハッシュ付きの名前だと、キャッシュされた古いページが新しい deploy に無いファイルを求めて何も描かない。static assets は `max-age=0, must-revalidate` と ETag で返るので、固定名でも古くならない。

## 理由

- **セッションの権限から切り離される。** opaque origin の document は cookie を読めない。script が出す fetch はサイトをまたぐ扱いになり `SameSite=Lax` のセッション cookie が付かず、`Origin: null` になるので `sameOrigin` 検査でも弾かれる。nest で状態を変える操作はすべて `POST` + `sameOrigin` なので viewer からは通らない。
- **cookie が一切付かないわけではないが、それは許容する。** viewer の script がページ遷移やポップアップで nest の URL を開くと、トップレベルの `GET` には cookie が付く。遷移先は viewer の手を離れた別の document で、opaque origin からは中身を読めない。状態を変える `GET` は `GET /auth/callback` と `GET /auth/login` だけで、callback は `__Host-` の state cookie との二重送信検査を通らないと何もせず、login は閲覧者自身のサインインを始めるだけである。
- **ADR-2592 §6 の決定は変えない。** §6 が守っているのは「セッションを持つ document にクライアント JS を置かない」ことである。投稿ページは script を持つが、その document は origin を持たないので、セッションを持つ document ではない。コンソールは引き続き JS を持たない。
- **app に手を入れずに済む。** viewer は app のコンポーネントを再利用した別ビルドで、nest だけが配る。app の配信物は変わらず、nest への接続口も持たない。
- **1 つのホストで完結する。** 同じ分離を別ホストで得る案（D2）は、ホスト名・ルーティング・証明書を 1 組増やす。CSP の `sandbox` は応答ヘッダなので、リンクで開いたトップレベルのページにもそのまま効く。
- **費用が下がる。** Worker は KV から本文を読んで HTML に埋めるだけになる。static assets の配信は Worker を起動しないので CPU を使わない。実測で、Dify（355KB）の最初の図はブラウザで約 1 秒に出る。viewer の bundle は JS 1.40MB（gzip 418KB）。
- **iframe ではなくページそのものを sandbox にする。** iframe で埋め込んでも同じ隔離は得られるが、viewer が枠の大きさに縛られ、キーボード操作も iframe にフォーカスがあるときに限られる。app の preview をそのまま提供するには画面全体が要る。

## 却下した案

- **A: app の Pages Function が nest をサーバー側で中継し、app で開く。** app に nest への接続口を追加することになる。
- **B: nest に CORS を足し、app がブラウザから直接 fetch する。** A と同じく app に接続口を足す。nest の origin を別サイトから直接叩く形を公式に作ることにもなり、ADR-2592 §6 が避けた cross-site cookie の論点に近づく。
- **C: 本文を `/s?s=` に詰めて app に渡す。** 8000 文字上限（ADR-2259）に掛かり、対象の大きなモデルが入らない。
- **D1: nest の投稿ページに viewer の script を直接載せる。** セッションを持つ origin で第三者の内容を描画することになる。bundle を app の origin から配っても同じで、script の権限は読み込んだ document の origin で決まる。nest が app の deploy を信頼することにもなり、ADR-2578 決定 5 で分けた 2 つの deploy の被害範囲がつながる。
- **D2: nest が cookie の届かない別ホストで viewer を配る。** 安全性は採用案と同等だが、ホスト名・ルーティング・証明書の運用が 1 組増える。採用案が成り立たなかったときの退避先として残す。viewer から出るどのリクエストにも cookie が付かないことまで要件にするなら、こちらを選ぶ。
- **D3: nest のページに app の閲覧 URL を iframe で埋め込む。** A の中継が前提で、app に nest からの埋め込みを受ける設定も要る。
- **E: nest を API 専用の Worker と Pages のフロントに分ける。** 費用の問題を解くのは「描画をブラウザに移すこと」で、それは採用案で得られる。`*.pages.dev` と `*.workers.dev` は別サイトなので、CORS とサイトをまたぐ cookie か、セッションと JS の同居かのどちらかになる。コンソールをクライアント JS で作り直すことにもなり、ADR-2592 §6 を覆す。利用者が増えてコンソールの UI を作り込む段階で別に設計する。
- **viewer のテンプレートを Worker の bundle に取り込む。** テンプレートには build の出力（asset のパス）が要るので、Worker の型検査とテストがビルドの成果物に依存する。`ASSETS` binding から読めば、テストは binding を差し替えるだけで済む。
- **入口のファイル名をハッシュ付きのままにし、ページのキャッシュを止める。** 共有キャッシュは公開投稿の配信を軽くするためのもので、固定名にすれば両立する。

## 未決事項

- **Worker の `cpu_ms` と有料プランを下げられるか**は、本番で計測してから決める。重い描画は `?format=svg` にだけ残るが、投稿時の構文検査で大きな `.krs` を parse する時間は未計測である。
- **非公開化・削除の反映には最大 10 分の遅れを許容する。** 共有キャッシュに載った公開時の応答は、非公開化・削除の後も `max-age` の間は配られうる。これは従来の投稿ページと同じ性質である。即時の取り下げが必要になったら、操作時に `/g/<id>` のキャッシュを purge する。
- 投稿ページの OGP（#2995）と、viewer の VS Code での再利用（#2996）は別の Issue で扱う。
