# ギャラリーの投稿をブラウザで描画する

- **日付**: 2026-09-29
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2993](https://github.com/kompiro/karasu/issues/2993)（経緯は [#2969](https://github.com/kompiro/karasu/issues/2969)、[#2992](https://github.com/kompiro/karasu/pull/2992)）
  - 関連 ADR: [ADR-2592](../adr/2592-nest-as-a-gallery.md)（ギャラリーの構築、§6）、[ADR-2578](../adr/2578-nest-retires-server-side-reverse.md)（決定 5: nest を app と別デプロイにする）、[ADR-2259](../adr/2259-permalink-payload-cap.md)（permalink の 8000 文字上限）、[ADR-9013](../adr/9013-cli-serve-mode.md)（serve mode の `hideEditor`）
  - 関連 TPL: [TPL-2993](../test-perspectives/TPL-2993-third-party-content-runs-outside-session-origin.md)（本 PR で起こす proactive TPL）
  - コード: `packages/nest/src/routes/gallery.ts`、`packages/nest/src/auth/session.ts`、`packages/app/src/components/AppShell.tsx`、`packages/app/src/ServeModeApp.tsx`

## 背景・課題

ギャラリーの投稿ページ（nest の `/g/<id>`）は、投稿された `.krs` を Worker 上で SVG に描画して返している。大きなモデルでは、この形が両端で合わない。

- **コストが Worker に載る。** 既定のページは全ビュー（ドリルダウン先を含む）を 1 枚の SVG にまとめる。運用者が投稿した Dify の reverse（355KB、21 ドメイン）は、1 回の描画に Worker の CPU を約 600ms（初回 740ms）使い、8.4MB の SVG を返す。#2992 は `cpu_ms` を 5 秒に上げてこれを収めたが、描画コストはドメイン数に比例して増えるので、上限を上げ続ける形になる。
- **読み手が受け取るのは絵であってモデルではない。** app（`packages/app`）はブラウザ側で描画し、ドリルダウン・ビュー切り替え・検索ができる。静的な SVG ではそれが失われる。

描画をサーバーからブラウザへ移せば、両方が同時に解ける。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| nest の投稿ページ | サーバーで HTML と SVG を組み立てる。クライアント JS は無い（ADR-2592 §6） |
| nest の本文取得 | `/g/<id>?format=krs` がテキストで返す。unlisted は所有者以外に「存在しない」と同じ 404（`routes/gallery.ts` の `visibleSubmission`） |
| nest のセッション cookie | `__Host-` / `HttpOnly` / `Secure` / `SameSite=Lax` / `Path=/`（`auth/session.ts`）。状態を変えるリクエストは `Origin` の一致を検査する（`sameOrigin`） |
| app の描画 | ブラウザの main thread で `compileProject` を呼ぶ。Web Worker を使うのは Monaco エディタだけ（`monaco-setup.ts`） |
| app の読み取り専用表示 | serve mode が `<AppShell hideEditor />` を使う（`ServeModeApp.tsx:106`） |
| app の preview の依存 | `PreviewColumn` は `PreviewProvider` の context を前提にし、その値は `AppShell` がエディタ側の hook（`useAppViews` / `useEditorDocument` など）から組み立てる |
| app のブラウザ保存 | テーマ・言語・パネル幅などを `localStorage` に、プロジェクトを OPFS に保存する |

## 制約・前提

- **app に nest への接続口を追加しない。** app（`packages/app` の配信物）はクライアントサイドで完結させ、nest の本文を取りに行く経路・中継ルート・nest からの埋め込みを受ける設定を持たせない。app のコンポーネントをコードとして再利用するのは構わない
- **第三者が書いた内容を、セッションを持つ origin の権限で描画しない。** viewer が描画する `.krs`（label・description・link）は他人が書いたものである。nest のセッション cookie は `HttpOnly` なので script からは読めないが、同じ origin の script は cookie 付きで nest にリクエストを送れ、`Origin` 検査も通る。描画経路に XSS が 1 つあれば、閲覧した投稿者のアカウントで削除などが実行できる。ADR-2592 §6 がコンソールに「クライアント JS を置かない」とした理由と同じである（TPL-2993）
- **公開範囲を広げない。** unlisted の投稿は、描画の経路を変えても「存在しない」と区別できないままにする
- **8000 文字上限（ADR-2259）の適用範囲を変えない。** URL 埋め込みの面に対して有効なまま残す
- **out of scope**: 閲覧した投稿を app に取り込んで編集する導線、投稿ページの OGP

## 検討した選択肢

### 案 A: app の Pages Function が nest をサーバー側で中継し、app で開く

app の origin に中継ルート（`/g/<id>.krs`）を置き、app が同一 origin で本文を取得して読み取り専用で開く。

- nest に CORS を足さずに済み、unlisted も構造的に見えない
- **採らない。** app に nest への接続口を追加することになり、制約に反する

### 案 B: nest に CORS を足し、app がブラウザから直接 fetch する

- **採らない。** 案 A と同じく app に nest への接続口を足すことになる。加えて、nest の origin を別サイトから直接叩く形を公式に作ることになり、ADR-2592 §6 が避けた cross-site cookie の論点に近づく

### 案 C: 本文を `/s?s=` に詰めて app に渡す

- **採らない。** 8000 文字上限（ADR-2259）に掛かり、今回の対象（大きなモデル）が入らない

### 案 D1: nest の投稿ページに viewer の script を直接載せる

nest の `/g/<id>` が viewer の bundle を読み込み、同じ origin で描画する。

- **採らない。** セッションを持つ origin で第三者の内容を描画することになる（制約 2）
- bundle を app の origin から配っても（`<script src="https://<app origin>/viewer.js">`）同じである。script がどの origin の権限で走るかは、読み込んだ document の origin で決まり、script ファイルの置き場所では決まらない。加えて nest が app のデプロイを信頼することになり、ADR-2578 決定 5 で分けた 2 つのデプロイの被害範囲がつながる

### 案 D2: nest が cookie の届かない別ホストで viewer を配る

nest に閲覧専用のホスト名（別のサブドメインや別の Worker）を足し、そこから viewer を配る。セッション cookie は `__Host-` で元のホストに閉じているので届かない。

- 安全性は D4 と同等
- ホスト名・ルーティング・証明書を 1 組増やし、その運用が続く。D4 は同じ分離を 1 つのホストで得られるので、**D4 を優先する**

### 案 D3: nest のページに app の閲覧 URL を iframe で埋め込む

- **採らない。** 案 A の app 側の中継が前提であり、app に nest からの埋め込みを受ける設定も要る（制約 1）

### 案 D4: nest が投稿ページそのものを origin を持たない sandbox として配る

投稿ページ（`/g/<id>`）の応答を viewer の HTML にし、応答ヘッダに `Content-Security-Policy: sandbox allow-scripts allow-downloads allow-popups` を付ける。`allow-same-origin` を付けないので、ページ全体が **origin を持たない（opaque origin）** 状態で動く。iframe は使わない。CSP の `sandbox` は応答ヘッダなので、リンクで開いたトップレベルのページにもそのまま効く。

iframe で埋め込む形（投稿ページは JS を持たず、閲覧用の別ルートを `sandbox` 付きの iframe で入れる）も同じ隔離を得られるが、viewer が iframe の枠の大きさに縛られ、キーボード操作も iframe にフォーカスがあるときに限られる。app の preview（タブ・ツールバー・パンくず・キャンバス）をそのまま提供するには画面全体が要るので、ページそのものを sandbox にする。

- **ページを開くリクエストには cookie が付く。** 所有者判定（自分の unlisted を見られるか）はサーバー側でこれまでどおり行える。隔離されるのは、描画された後のページで走る script である
- **ページには form を置かない。** opaque origin のページから送る form は `Origin: null` になり、nest の `sameOrigin` 検査で弾かれる。コンソールへの導線は普通のリンク（ページ遷移）にし、サインアウトは遷移先のコンソールにある既存の form（`POST /auth/logout`）で行う

- **セッションの権限から切り離される。** 守る性質は 2 つである。(1) script がセッションの資格情報に触れられない: opaque origin の document は cookie を読めない。(2) viewer からセッションの権限で状態を変えられない: script が出す fetch はサイトをまたぐ扱いになり `SameSite=Lax` のセッション cookie が付かず、`Origin: null` になるので nest の `sameOrigin` 検査でも弾かれる。nest で状態を変える操作（投稿・非公開化・差し替え・削除・アカウント削除・サインアウト）はすべて `POST` + `sameOrigin` なので、viewer からは通らない
  - **cookie が一切付かないわけではない。** viewer の script がページ遷移やポップアップ（`allow-popups`）で nest の URL を開くと、トップレベルの `GET` には `SameSite=Lax` の cookie が付く。これは許容する。遷移先は viewer の script の手を離れた別の document で、opaque origin からは中身を読めない。`GET` のルートは表示と読み出しだけで、状態を変えるのは `GET /auth/callback`（サインインの完了）と `GET /auth/login`（OAuth の開始）だけである。callback は `__Host-` の state cookie との二重送信検査（`routes/auth.ts`）を通らないと何もせず、viewer の script はその state を知り得ない。login は閲覧者自身のアカウントでサインインを始めるだけである
  - viewer から出るどのリクエストにも cookie が付かないことまで要件にするなら、同じホストでは満たせないので D2（別ホスト）を採る
- **本文は応答に埋め込む。** `/g/<id>` はサーバーで `.krs` を JSON として HTML に埋め込んで返し、viewer は起動時にそれを読む。viewer 自身は nest にリクエストを送らない。unlisted の判定は `visibleSubmission` をそのまま使う
- **app の配信物は変わらない。** viewer は app のコンポーネントを再利用した別ビルドとして作り、nest だけが配る
- **描画はブラウザで行う。** Worker は SVG を描かない。Worker の仕事は KV から本文を読んで HTML に埋めるだけになる
- 費用: viewer の別ビルドと、nest に静的アセット（viewer の bundle）の配信を足すこと。Workers の静的アセット配信は Worker のスクリプトを起動しないので、CPU の費用は増えない
- **spike で確かめた（[#2993 のコメント](https://github.com/kompiro/karasu/issues/2993#issuecomment-5893621772)）。** Chromium で、app の `AppShell hideEditor` を別ビルドにしたものがこの sandbox の中で起動し、ドリルダウン・タブ切り替え・詳細パネル・エッジのホバー強調・SVG の書き出しが sandbox なしと同じに動いた。`self.origin` は `"null"`、`document.cookie` は読めず、cookie 付きを指定した POST はサーバーに `Origin: null`・cookie なしで届いた。Dify（355KB）の最初の図はブラウザで約 0.66 秒。bundle は JS 1.40MB（gzip 417KB）。成立の条件は 2 つあった
  - viewer のアセットに `Access-Control-Allow-Origin` が要る。opaque origin からは module script と stylesheet が CORS モードで取得され、ヘッダが無いと何も起動しない
  - `localStorage` / `sessionStorage` への参照が例外になり、app は起動時に落ちる。bundle より前に走る inline script でメモリ上の代替に差し替えると動く。設定は保存されず既定値になる

### 案 E: nest を API 専用の Worker と Pages のフロントに分ける

nest の Worker は JSON の API だけを返し、ギャラリー・コンソール・viewer は別の Pages プロジェクト（例: `karasu-nest.pages.dev`）が静的な JS として配る。

- **費用の問題を解くのは「描画をブラウザに移すこと」で、それは D4 で得られる。** Worker の CPU を使っていたのは SVG の描画で、HTML の組み立てや KV の読み出しは数 ms で終わる。フロントを Pages に移すことで上乗せで減る分は小さい
- **origin を分けると、セッションの扱いが問題になる。** `*.pages.dev` と `*.workers.dev` はどちらも Public Suffix List に載っており、別のサイトになる
  - Pages の JS から Worker の API を直接呼ぶと、CORS とサイトをまたぐ cookie が要る。`SameSite=Lax` の cookie はサイトをまたぐ fetch では送られず、サードパーティ cookie のブロックにも当たる。ADR-2592 §6 がコンソールについて避けた形そのものである
  - Pages Functions から service binding で Worker に中継して同じ origin にまとめると CORS は要らないが、セッションと JS が同じ origin に同居する。viewer を D4 と同じく opaque origin に隔離する設計が別途要る
- **コンソールをクライアント JS で作り直すことになる。** ADR-2592 §6 の「コンソールにクライアント JS を置かない」を覆す判断で、規模も D4 より大きい
- **現時点では採らない。** 利用者が増えてコンソールの UI を作り込む段階になったら別の Issue として設計する

## 比較

| 観点 | A（app 中継） | B（CORS） | C（URL 埋め込み） | D1（同一 origin） | D2（別ホスト） | D3（app を iframe） | D4（ページを opaque sandbox） | E（API + Pages） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| app に接続口を足さない | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| 大きなモデルを開ける | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| セッションと分離 | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | 設計次第 |
| 追加の運用 | 予約語 1 つ | CORS 設定 | なし | なし | ホスト 1 組 | ヘッダ | 静的アセット | Pages 1 つ + コンソール作り直し |

## 現時点の方針

**案 D4 を採用する。** app に手を入れずに描画をブラウザへ移し、第三者の内容をセッションの権限から切り離したまま、1 つのホストで完結するのは D4 だけである。D2 は同じ分離をホスト名 1 組の運用と引き換えに得る形なので、D4 が成り立たないと分かったときの退避先として残す。

ADR-2592 §6 との関係: §6 が守っているのは「セッションを持つ document にクライアント JS を置かない」ことである。D4 では投稿ページが script を持つが、その document は origin を持たないので、セッションを持つ document ではない。コンソールは引き続き JS を持たない。§6 が防ごうとした「script がセッションの権限で走る」状態は生じないので、§6 の決定は変えない。

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **0** spike: opaque sandbox で viewer が動くかを測る（済） | なし | マージしない。結論は Issue に残した |
| **A** viewer のビルドを作る（app のコンポーネントを再利用） | 0 | app の配信物は変わらない。viewer は単体でテストできる |
| **B** nest の投稿ページを viewer に置き換える | A | 投稿ページから SVG 描画が消える。`?format=svg` は残るので、ダウンロード経路は壊れない |

### 実装の指針

1. **spike（スライス 0、済）**: `spike/2993-opaque-sandbox-viewer`。結果は上の案 D4 の項と Issue のコメント
2. **viewer（スライス A）**: app のコンポーネントを再利用した別エントリとしてビルドする（spike では `packages/app` に `viewer.html` と専用の Vite 設定を足して成立した。app の配信物には含めない）。viewer は
   - 起動時に document に埋め込まれた本文を読み、メモリ上のプロジェクトとして開く
   - エディタを持たない（`hideEditor`）
   - ネットワークに出ない
   - bundle より前に走る inline script で `localStorage` / `sessionStorage` をメモリ上の代替に差し替える
   - テーマ（ライト / ダーク）と表示言語（日本語 / English）の切り替えボタンを preview のツールバーに置く。設定は保存できないので、初期値はブラウザの設定（`prefers-color-scheme`・言語設定）に従い、切り替えはそのページを開いているあいだだけ効く。ツールバーには外からボタンを差し込む口（context）を 1 つ足し、viewer だけがそこに差し込む。app は何も差し込まないので、app のツールバーは変わらない（spike で両方の切り替えが sandbox の中で動くことを確かめた）
   - 共有（クリップボード）の操作を出さない。単一ファイルの投稿でスタイルファイルを探しに行かない（spike で「Style file not found」の警告が出た）
3. **nest（スライス B）**
   - `wrangler.toml` に静的アセット（viewer の bundle）を足し、そのアセットに `Access-Control-Allow-Origin: *` を付ける（公開ファイルで credential を伴わない）
   - `/g/<id>`: `visibleSubmission` で可視判定し、本文を JSON として埋めた viewer の HTML を返す。応答ヘッダに `Content-Security-Policy: sandbox allow-scripts allow-downloads allow-popups` を付ける。埋め込みは `</script>` を含む本文でも壊れないようにエスケープする。ページに form は置かず、コンソールへの導線はリンクにする
   - サーバー側の SVG 描画は `?format=svg` の明示指定だけに残す。`?format=krs` も残す
   - キャッシュは既存の投稿ページと同じ扱い（公開投稿を所有者以外が見るときだけ `public, max-age=600`、`Vary: Cookie`）
   - **非公開化・削除の反映には最大 10 分の遅れを許容する。** 共有キャッシュに載った公開時の応答は、投稿を unlisted にしたり削除したりした後も `max-age` の間は配られうる。これは既存の投稿ページと同じ性質で、本設計で新しく生まれる遅れではない。即時の取り下げが必要になったら、非公開化・削除の操作で `/g/<id>` のキャッシュを purge する（本設計ではやらない）
4. **テスト**
   - `/g/<id>` の応答が `sandbox` を含み `allow-same-origin` を含まない CSP を持つ
   - `/g/<id>` の HTML が form を含まない
   - viewer のアセットの応答が `Access-Control-Allow-Origin` を持つ
   - unlisted は所有者以外に 404 で、存在しない投稿と同じ応答
   - 本文に `</script>` を含む投稿でも HTML が壊れない
   - 既定の投稿ページが SVG を描画しない（描画関数を呼ばない）
   - e2e: 投稿ページで viewer が起動し、ドリルダウンできる
5. **AT**: `docs/acceptance/2993-gallery-client-side-rendering.md`。手動項目は、Dify の投稿がブラウザで描画されドリルダウンできること、Chromium 以外（Firefox / Safari）でも起動すること
6. **ADR 昇格**: 実装完了後に `docs/adr/2993-gallery-client-side-rendering.md` として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 投稿ページの見た目が静的な SVG から操作できる viewer に変わる。`?format=svg` / `?format=krs` のリンクは変わらない
- ドキュメント更新: `packages/nest/README.md`
- テスト・examples への影響: nest の投稿ページのテストが SVG の存在を検査している箇所は書き換える

## 未解決の問い / 決めないこと

- **viewer の置き場所**は実装時に決める。spike では `packages/app` の別エントリで成立したので、それを第一候補とする
- **D4 が成り立たなかった場合**（Chromium 以外のブラウザで opaque origin の viewer が起動しない、など）は D2（別ホスト）に退避する
- **Worker を無料プラン（CPU 上限 10ms）へ戻せるか**は、実装後に測って決める。重い描画は無くなるが、投稿時の構文検査で大きな `.krs` を parse する時間が 10ms に収まるかは未計測である
