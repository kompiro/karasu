# ギャラリーの投稿を app のビューアで開く

- **日付**: 2026-09-29
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2993](https://github.com/kompiro/karasu/issues/2993)（経緯は [#2969](https://github.com/kompiro/karasu/issues/2969)、[#2992](https://github.com/kompiro/karasu/pull/2992)）
  - 関連 ADR: [ADR-2592](../adr/2592-nest-as-a-gallery.md)（ギャラリーの構築、§6）、[ADR-1646](../adr/1646-open-gallery-example-in-app.md)（examples を app で開く）、[ADR-2259](../adr/2259-permalink-payload-cap.md)（permalink の 8000 文字上限）、[ADR-2249](../adr/2249-permalink-generation-seam.md)、[ADR-1961](../adr/1961-bare-permalink-route.md)（bare permalink の catch-all）、[ADR-9013](../adr/9013-cli-serve-mode.md)（serve mode）
  - 関連 TPL: [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)、[TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)、[TPL-2993](../test-perspectives/TPL-2993-relay-of-access-controlled-content.md)（本 PR で起こす proactive TPL）
  - コード: `packages/nest/src/routes/gallery.ts`、`packages/app/src/render/repo-permalink.ts`、`packages/app/src/routes.ts`、`packages/app/src/ServeModeApp.tsx`、`functions/`

## 背景・課題

ギャラリーの投稿ページ（nest の `/g/<id>`）は、投稿された `.krs` を Worker 上で SVG に描画して返している。大きなモデルでは、この形が両端で合わない。

- **コストが Worker に載る。** 既定のページは全ビュー（ドリルダウン先を含む）を 1 枚の SVG にまとめる。運用者が投稿した Dify の reverse（355KB、21 ドメイン）は、1 回の描画に Worker の CPU を約 600ms（初回 740ms）使い、8.4MB の SVG を返す。#2992 は `cpu_ms` を 5 秒に上げてこれを収めたが、描画コストはドメイン数に比例して増えるので、上限を上げ続ける形になる。
- **読み手が受け取るのは絵であってモデルではない。** app（`packages/app`）はブラウザ側で描画し、ドリルダウン・ビュー切り替え・検索ができる。静的な SVG ではそれが失われる。

app で開ければ、描画はブラウザに移り、読み手は操作できる図を受け取る。問題は、**app には投稿を開く入口が無い**ことである。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| app が外部の `.krs` を開く入口 | `#s=` / `/s?s=`（URL 埋め込み、8000 文字上限、ADR-2259）、`?example=<slug>`（取得元固定・slug の許可リスト、ADR-1646）、`karasu serve` の同一オリジン API（`/api/files` ほか、ADR-9013）の 3 つだけ |
| repo-backed permalink | Pages Function が `raw.githubusercontent.com`（`RAW_HOST` 定数）からサーバー側で取得し、`/s?s=` に詰め直して 302。**8000 文字上限がそのまま掛かる**ので 355KB は入らない |
| 描画の場所 | app はブラウザで `compileProject` を呼ぶ（`hooks/useSystemView.ts`）。サーバー側の描画は OGP 用の `/render` だけ |
| 読み取り専用表示 | serve mode だけが `<AppShell hideEditor />` を使う（`ServeModeApp.tsx:106`）。利用者が指定できるビューアのフラグは無い |
| nest の本文取得 | `/g/<id>?format=krs` がテキストで返す。unlisted は所有者以外に「存在しない」と同じ 404（`routes/gallery.ts` の `visibleSubmission`）。CORS ヘッダは無い |
| app の URL 空間 | bare permalink の catch-all（`functions/[[path]].ts`）が `/<owner>/<repo>` を先に試す。予約語は `packages/app/src/routes.ts` の `RESERVED_TOP_SEGMENTS` が唯一の正（TPL-1961） |
| serve mode の判定 | `detectAppMode` が `/api/files` を 200ms で probe し、応答があれば serve mode に切り替わる（`fs/detect-storage-mode.ts`） |

## 制約・前提

- **nest に CORS も cookie の跨ぎも持ち込まない。** ADR-2592 §6 は、セッションを持つ面（コンソール）を app に相乗りさせる案を「CORS と cross-origin cookie を設計することになる」として却下した。本設計はコンソールを動かさないが、nest の origin を別サイトから直接叩く形を増やせば、同じ設計課題を別の入口から招く。
- **取得元を URL から選ばせない。** ADR-1646 は任意 URL からの読み込みを却下している（信頼できない内容・XSS・ビーコン）。取得元は nest に固定する。
- **公開範囲を広げない。** unlisted の投稿は、app 経由でも「存在しない」と区別できないままにする。所有者が app で自分の unlisted を開けないのは受け入れる（所有者はコンソールで見られる）。
- **8000 文字上限（ADR-2259）の適用範囲を変えない。** 本文を URL に載せない経路なので、上限は掛からない。ADR-2259 は URL 埋め込みの面に対して有効なまま残る。
- **サインインの公開条件（#2691、ADR-2969）は変わらない。** 公開投稿の閲覧は今も誰でもできる。app 経由の閲覧は、既に公開されている投稿の別の見せ方で、新しい個人データも新しい投稿者も生まない。
- **out of scope**: app での編集と保存・nest への書き戻し、app 側の OGP、所有者による unlisted のプレビュー。

## 検討した選択肢

### 案 A: app の Pages Function が nest をサーバー側で中継する

app の origin に中継ルートを置く。Function が nest の `/g/<id>?format=krs` をサーバー側で取得し、同じ origin で本文を返す。app はその本文を fetch して読み取り専用で開く。

**メリット**

- nest に CORS を足さない。ブラウザから見れば app の同一オリジンへの fetch で完結する
- Function は cookie を持たない（サーバー間の fetch に利用者の cookie は乗らない）ので、unlisted は構造的に見えない
- 取得先を定数にできる。repo-permalink の `RAW_HOST` と同じ SSRF 対策をそのまま踏襲できる
- 本文を URL に載せないので 8000 文字上限と無関係

**デメリット**

- app の URL 空間に予約語が 1 つ増える（TPL-1961 の catch-all との調整が要る）
- 中継の分だけ Pages Function の呼び出しが増える（キャッシュで緩和する）

### 案 B: nest に CORS を足し、app がブラウザから直接 fetch する

nest の `/g/<id>?format=krs` に `Access-Control-Allow-Origin: <app origin>` を付け、app がブラウザから直接取得する。

**メリット**

- 中継が要らず、実装が最小

**デメリット**

- nest の origin を別サイトから叩く形を公式に作る。いまは credential なしの GET だけでも、次に「所有者なら unlisted も見せたい」となった瞬間に `credentials: include` と cross-site cookie の設計に入る。ADR-2592 §6 が避けた入口そのものである
- nest 側の CORS 設定と app の origin（本番・preview の alias）の対応を管理し続ける必要がある

### 案 C: 本文を `/s?s=` に詰めて渡す（repo-backed permalink と同じ形）

**デメリット**

- 8000 文字上限（ADR-2259）に掛かり、そもそも今回の対象（大きなモデル）が入らない。上限を外すのは ADR-2259 の撤回になる

### 案 D: nest に app の preview コンポーネントを組み込む

app を経由せず、nest のギャラリーページそのものに app の preview（`PreviewColumn` 以下）を載せる案。どこから配るかで性質が大きく変わるので 3 通りに分けて評価した。

#### D1: nest の origin で preview の bundle を配る

nest の `/g/<id>` が React の bundle を読み込み、同じ origin の `?format=krs` を fetch して描画する。

- **セッションの権限で第三者の内容を描画することになる。** セッション cookie は `HttpOnly` なので script から読まれはしないが、同一 origin の script は cookie 付きで nest にリクエストを送れ、`Origin` 検査も同一 origin なので通る。preview が描画するのは他人が書いた `.krs`（label・description・link）であり、その描画経路に XSS が 1 つあれば、閲覧した投稿者のアカウントで投稿の削除やアカウント削除が実行できる。ADR-2592 §6 がコンソールに「クライアント JS を置かない」とした理由（ここで配る script はそのセッションの権限で走る）が、そのまま当てはまる
- 所有者が自分の unlisted を preview で見られる、という利点はこの危険と表裏である
- **bundle を app の origin から配っても（`<script src="https://<app origin>/viewer.js">`）同じである。** script がどの origin の権限で走るかは、読み込んだ document の origin で決まり、script ファイルの置き場所では決まらない。加えて nest が app のデプロイを信頼することになり、ADR-2578 決定 5 で分けた 2 つのデプロイの被害範囲が、app の侵害から nest のセッションへとつながる
- **却下する。**

#### D2: nest が cookie の無い別ホストで preview を配る

nest に閲覧専用のホスト名（例: `view.` のサブドメインや別の Worker）を足し、そこから preview の bundle を配る。セッション cookie は nest の元のホストに `__Host-` で閉じているので、別ホストには届かない。

- 安全性は案 A と同等になる
- **preview を app から切り出す必要がある。** `PreviewColumn` は `PreviewProvider` の context を前提にし、その値は `AppShell` が `useAppViews` / `useEditorDocument` などエディタ側の hook から組み立てている。nest から使うには、エディタに依存しない viewer をパッケージとして切り出すリファクタが先に要る
- **同じ UI を 2 か所から配ることになる。** app の preview と nest の viewer で版がずれ、片方でだけ直った不具合・片方にだけある機能が生まれる（`render.ts` の冒頭コメントが「`packages/app` を nest の依存にしない」としているのも、この結合を避けるためである）
- nest（Worker）にフロントエンドのビルドと静的アセット配信を持ち込み、ADR-2578 決定 5 で分けたデプロイ単位の責務が増える
- 案 A と比べて得るものが「nest のホスト名で見える」ことだけで、上の費用に見合わない。**現時点では採らない。**

#### D3: nest のページに app の閲覧 URL を iframe で埋め込む

案 A の `/g/<id>`（app の origin）を、nest のギャラリーページに `<iframe>` で埋め込む。見た目は「nest のページの中で preview が動く」になる。

- script は app の origin で走るので、nest のセッションとは無関係（D1 の問題が起きない）
- preview の実装は app の 1 か所のまま（D2 の問題が起きない）
- iframe には `sandbox="allow-scripts allow-same-origin"` を付け、nest 側の DOM・cookie には触れさせない。`allow-same-origin` は app 自身の origin での fetch（`/g/<id>.krs`）に必要で、nest の origin を与えるものではない
- 追加の費用は、iframe の高さの扱いと、app 側で `frame-ancestors` を nest の origin に絞るヘッダ（現状 app は framing を制限していないので、埋め込み元を明示する機会にもなる）
- **案 A の上に足せる。** A が前提で、A 単体でも「Open in app」リンクとして成立する

### 案 E: nest を API 専用の Worker と Pages のフロントに分ける

nest の Worker は JSON の API だけを返し、ギャラリー・コンソール・viewer は別の Pages プロジェクト（例: `karasu-nest.pages.dev`）が静的な JS として配る。描画はブラウザで行う。

- **費用の問題を解くのは「描画をブラウザに移すこと」で、それは案 A で得られる。** Worker の CPU を使っていたのは SVG の描画で、HTML の組み立てや KV の読み出しは数 ms で終わる。フロントを Pages に移すことで上乗せで減る分は小さい
- **origin を分けると、セッションの扱いが問題になる。** `*.pages.dev` と `*.workers.dev` はどちらも Public Suffix List に載っており、別のサイトになる
  - Pages の JS から Worker の API を直接呼ぶと、CORS とサイトをまたぐ cookie が要る。`SameSite=Lax` の cookie はサイトをまたぐ fetch では送られず、サードパーティ cookie のブロックにも当たる。ADR-2592 §6 がコンソールについて避けた形そのものである
  - Pages Functions から service binding で Worker に中継して同じ origin にまとめると CORS は要らないが、セッションと JS が同じ origin に同居する。viewer が第三者の `.krs` を描画するので、D1 と同じ問題が起きる。防ぐには viewer を `sandbox="allow-scripts"`（`allow-same-origin` なし）の iframe に入れ、origin を持たない状態で描画させる設計が要る
- **コンソールをクライアント JS で作り直すことになる。** ADR-2592 §6 の「コンソールにクライアント JS を置かない」を覆す判断で、規模も案 A より大きい
- **現時点では採らない。** 利用者が増えてコンソールの UI を作り込む段階になったら別の Issue として設計する。その場合の前提は、service binding による同一 origin 化と、origin を持たない iframe による viewer の隔離の 2 点である

## 比較

| 観点 | 案 A（中継） | 案 B（CORS） | 案 C（URL 埋め込み） | 案 D1（nest 同一 origin） | 案 D2（nest 別ホスト） | 案 D3（A + iframe） |
| --- | --- | --- | --- | --- | --- | --- |
| 大きなモデルを開けるか | 開ける | 開ける | 開けない | 開ける | 開ける | 開ける |
| nest のページ内で動くか | 動かない（リンク） | 動かない | 動かない | 動く | 動く（別ホスト） | 動く（iframe） |
| セッションとの分離 | 分離 | 分離（credential なし） | 分離 | **分離されない** | 分離 | 分離 |
| preview の実装の置き場 | app のみ | app のみ | app のみ | app と nest | app と nest | app のみ |
| 変更量 | app に Function と入口 | nest に CORS、app に入口 | 上限の撤回 | viewer の切り出し + nest にフロント | viewer の切り出し + nest にフロントと別ホスト | A + iframe とヘッダ |
| 記録済みの決定との関係 | ADR-2592 §6 と両立 | §6 の懸念に近づく | ADR-2259 と衝突 | §6（クライアント JS を置かない）と衝突 | ADR-2578 決定 5 の分離に負荷 | §6 と両立 |

## 現時点の方針

**案 A を採用する。** 大きなモデルを開けて、nest の origin を別サイトから直接叩く形を増やさず、unlisted が中継の構造上見えない、の 3 つを同時に満たすのは案 A だけである。予約語が 1 つ増えるコストは、TPL-1961 が既に機械検査の仕組みを持っているので小さい。

nest のページの中で preview を動かしたい場合は、**案 D3（iframe）を A の上に足す**。D1 はセッションの権限で第三者の内容を描画するので採らず、D2 は D3 と同じ見た目を viewer の切り出しと二重配信の費用で得る形なので採らない。D3 を A と同じ PR で入れるか後に回すかは、実装時に iframe の高さの扱いを試してから決める（下の「未解決の問い」）。

ADR-2592 §6 との関係は次のとおり整理する。§6 が却下したのは「セッションを持つ面を別 origin に置き、その面から nest の API を叩く」形である。本設計の中継はセッションを持たず、公開投稿の本文を読むだけで、nest から見れば匿名の閲覧者が 1 人増えるのと同じである。§6 の決定は変えない。

### 実装の指針

1. **ルート（app の origin）**
   - 閲覧 URL: `/g/<id>`。nest の投稿 URL とパスを揃え、ホスト名だけ差し替えれば app で開ける形にする（bare permalink が GitHub の URL に対してしている事と同じ発想）
   - 本文 URL: `/g/<id>.krs`。Pages Function が中継する
   - `g` を `RESERVED_TOP_SEGMENTS` の `FUNCTION_ROUTE_SEGMENTS` に足す。`api` の下には置かない（`detectAppMode` が `/api/files` の応答で serve mode に切り替わるため、`/api/` の下に Function を増やすと判定を誤らせる余地が生まれる）
<!-- absent-path-next-line: file this design intends to create (#2993) -->
2. **中継 Function（`functions/g/[[path]].ts` + 単体テスト可能な `packages/app/src/render/nest-relay.ts`）**
   - 取得先は定数 `NEST_ORIGIN`。id は nest の submission id の文法（`<accountId>-<slug>`）で検証し、合わなければ nest に問い合わせず 404
   - 上流へは `GET <NEST_ORIGIN>/g/<id>?format=krs` を cookie・Authorization なしで投げる。`redirect: "error"`
   - 上流の 404 はそのまま 404。unlisted と未存在を区別しない（nest の `visibleSubmission` の方針を引き継ぐ）
   - 本文サイズは nest の `MAX_SUBMISSION_BYTES` を上限に読み、超えたら 502 で打ち切る
   - 応答は `text/plain; charset=utf-8`、`X-Content-Type-Options: nosniff`、`Cache-Control: public, max-age=600`（nest の公開投稿と同じ）。投稿は差し替え・unlisted 化・削除されうる可変の資源なので、長期キャッシュはしない
   - `/g/<id>`（`.krs` なし）は SPA の `index.html` を返す
3. **app の入口**
   - `/g/<id>` で起動したら `/g/<id>.krs` を fetch し、メモリ上のプロジェクトとして開く（`#s=` と同じ使い捨ての扱い）。`<AppShell hideEditor />` で読み取り専用にする
   - 取得失敗（404・502・ネットワーク）は、エラーバナーと nest の投稿ページへのリンクを出す。黙って空のエディタに化けない（TPL-2249 のチェックリスト最終項）
4. **nest のギャラリーページ**
   - 「Open in app」リンクを置く。app の origin は nest の env var（`KARASU_APP_ORIGIN`、`wrangler.toml` の `[vars]`）で持つ
   - 既定の表示を全ビュー SVG から system ビューだけに変える。全ビューは `?format=svg` などの明示指定でのみ描く。これで既定ページの CPU は約 30ms、SVG は数十 KB に戻る
5. **テスト**
   - `nest-relay.ts`: id の文法外は上流を呼ばない、cookie を送らない、上流 404 は 404、サイズ超過は 502、取得先が定数から動かない
   - `routes.ts` の予約語: `bare-route.test.ts` と `routes-config.test.ts` の既存 drift ガードに `g` が載る
   - nest: 既定ページが system ビューだけを描く、「Open in app」リンクの href
   - e2e: `/g/<id>` で app が読み取り専用で開き、ドリルダウンできる（上流はモック）
6. **AT**: `docs/acceptance/2993-open-submission-in-app.md`。手動項目は、実際の Dify 投稿を app で開いてドリルダウンできること、unlisted にした投稿が app でも 404 になること
7. **ADR 昇格**: 実装完了後に `docs/adr/2993-gallery-open-in-app.md` として昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: bare permalink で GitHub の owner `g` のリポジトリを開く URL（`/g/<repo>`）が使えなくなる。既存の予約語 `s` / `r` / `api` と同じ扱いである
- ドキュメント更新: `packages/nest/README.md`、`docs/tools/` の app の URL 入口（該当する節があれば）
- テスト・examples への影響: なし

## 未解決の問い / 決めないこと

- **案 A の実装後に nest の Worker を無料プラン（CPU 上限 10ms）へ戻せるか**は、実装後に測って決める。重い描画は無くなるが、投稿時の構文検査で大きな `.krs` を parse する時間が 10ms に収まるかは未計測である

- **案 D3（iframe 埋め込み）を A と同時に入れるか**は実装時に決める。入れる場合は、app の `/g/<id>` 応答に `Content-Security-Policy: frame-ancestors <nest origin>` を付け、nest のページは `sandbox` 付きの iframe で埋め込む。高さは preview が画面全体を使う前提の UI なので、固定高さ + 「全画面で開く」リンクで足りるかを試す

- **nest のページ自体をやめて app に寄せるか**は決めない。nest のページは OGP・コンソールへの導線・JS なしでの閲覧を担っている。本設計は「重い描画を app に移す」ところまでで、ページの役割分担の見直しは利用が増えてから判断する
- **所有者が unlisted を app で見る手段**は作らない。作るなら cookie を跨ぐ設計が要り、ADR-2592 §6 の論点に入る
- **app の閲覧 URL に OGP を付けるか**は決めない。共有に使う URL は引き続き nest の投稿ページである
- **`NEST_ORIGIN` の preview 環境での扱い**（preview の app が本番 nest を読むか）は実装時に決める。現状 nest は本番 1 環境だけなので、定数 1 つで足りる見込み
