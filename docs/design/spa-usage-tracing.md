# SPA の匿名の利用状況を OpenTelemetry の形式で受信用 Worker に送る

- **日付**: 2026-11-05
- **ステータス**: 検討中
- **PR**: #3619
- **関連**:
  - 引き金 Issue: [#3612](https://github.com/kompiro/karasu/issues/3612)（PRD [#3573](https://github.com/kompiro/karasu/issues/3573) の sub-issue）
  - 関連 ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（決定 5: state と secret を静的な Pages app に置かない。[ADR-2578](../adr/2578-nest-retires-server-side-reverse.md) が引き継ぐ）、[ADR-1996](../adr/1996-karasu-nest-data-trust.md)（集めるものの文書と実装を機械で突き合わせる）、[ADR-3020](../adr/3020-nest-custom-domain-karasu-nest-kompiro-dev.md)（nest の origin と `__Host-` cookie）、[ADR-2249](../adr/2249-permalink-generation-seam.md)（permalink 面にカウンタを置く案の却下）、[ADR-2262](../adr/2262-nest-intake-and-completion.md)（水増しされうる数を受け入れた理由）、[ADR-3381](../adr/3381-dependabot-triage-2026-10-26.md) と [ADR-3575](../adr/3575-dependabot-triage-2026-11-02.md)（`@anthropic-ai/sdk` の OTel 対応。後者が現行の 1.3.0）
  - 関連 TPL: [TPL-3612](../test-perspectives/TPL-3612-single-build-capability-checked-in-every-output.md)（本 PR で起こす）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)
  - コード: `packages/app/src/main.tsx`、`packages/app/src/components/first-run/`、新規 Worker（`packages/` 配下、名前は未定）

## 背景・課題

PRD #3573 §12 は first-run の成功指標を置いた（Welcome からデモを始める率、完了率、完了までの時間の中央値、2 種類以上の view を見る率、共有の操作をする率）。同じ節に「アプリにテレメトリが無いので今は測れない。入れるかは別途決める」とある。本 Design Doc はその決定を扱う。

今の Cloudflare のダッシュボードでは、この問いに答えられない。

- SPA は Pages が静的アセットとして配信している。`packages/app/public/_routes.json` が `/` と `/assets/*` を Functions から外している。`/s`・bare route・`/r` から入ったときに Function が 1 回動くだけで、アプリの中の操作では Worker は動かない
- Workers Observability（Logs と Traces）に出るのは Worker の実行の中で起きたことだけである
- Pages の Analytics と Web Analytics は PV までで、アプリの中の操作は見えない

目的は 3 つある。

1. **ブラウザ内の処理時間**: app・core・render の処理が、実際に開かれるモデルでどれだけかかっているか
2. **アクティブ利用者数**: どの国で、日次・週次・月次にどれだけ使われているか
3. **first-run の利用状況**: Welcome、ツアーの各ステップ、view の切り替え、共有の操作がどれだけ起きているか

どれも **ユーザーを識別せずに** 取る。見たいのは使われ方であって、誰が使ったかではない。共有リンクなど、どの経路でアプリを開いたかは測らない（kompiro の判断）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| SPA の配信 | `karasu.kompiro.dev`。`.github/workflows/deploy.yml` が `packages/app/dist` を Pages に deploy する |
| Pages Functions | `/s`（OGP の共有ページ）、`/render`（SVG / PNG）、bare route（`/<owner>/<repo>`）、`/r`（旧 prefix の redirect）。どれもクエリかパスにモデルか repo 名を持つ |
| nest | `karasu-nest.kompiro.dev` の別 Worker。`[observability] enabled = true`。Workers Paid プラン |
| `packages/app` から作るビルド | Pages の SPA（`index.html`）、serve（`vite.serve.config.ts`）、VS Code の webview（`vite.vscode-webview.config.ts`）、nest の viewer（`vite.viewer.config.ts`） |
| 同じ入口が動く場所 | `packages/app/dist`（Pages の成果物）は、Pages のほかに monorepo の `karasu serve`（`packages/cli/src/serve.ts` の `findAppDistDir`）と、CI の Playwright の E2E（`vite build && vite preview`）でも動く。`vite dev`（手元の E2E もこれ）は `dist` ではなくソースを配信するが、入口は同じ `main.tsx` である |
| OTel の依存 | `@opentelemetry/api` 1.9.1 が `@anthropic-ai/sdk` 1.3.0 経由ですでに `packages/app` の依存木にある。SDK はクライアントに tracer provider を渡さないとき、グローバルの provider を使う。グローバルに何も登録されていなければ no-op で、クライアントの `openTelemetry: false` でも止められる（ADR-3381、ADR-3575） |
| first-run の状態 | Welcome を閉じたこととツアーの進み具合を localStorage に持つ（`welcome-gate.ts`、`tour-progress.ts`）。テレメトリとは無関係 |
| 集めるものの文書 | nest には `docs/policy/nest-data-handling.md` と `nest-privacy.md`（草案）がある。後者は「アクセス解析・トラッキング目的の第三者スクリプトを持たない」と書いている。app にはまだ無い |
| CSP | Pages の SPA には今 CSP が無い（`_headers` も meta も無い） |

## 制約・前提

- **ユーザーを識別しない。** ユーザー ID、永続的な ID、cookie を持たない。テレメトリのために localStorage に置くのは、送信を止めたことを覚える真偽値と、最後に数えた日付の 2 つだけで、どちらも端末の外へ送らない（後述）。IP と User-Agent をログに書かない
- **モデルの中身を送らない。** ノード名、`.krs` の本文、URL のクエリと fragment、repo 名、例外のメッセージとスタックを送らない。共有のペイロードは fragment（`#s=`）か `/s?s=` のクエリにあるので、URL をそのまま送る仕組みは使えない
- **受信口は Pages app の外に置く。** ADR-1990 決定 5（ADR-2578 が引き継ぐ）は、state と secret を静的な Pages app に同居させないと決めている。Phase 2 で送信先の API キーを持つので、受信口は secret を持つ
- **nest にも同居させない。** nest の origin は `__Host-` のセッション cookie を持つ（ADR-3020）。匿名の受信口を同じ origin に置くと、cookie が付いた要求を受け取る面が増える。デプロイとロールバックも nest と分けたい（ADR-2578 が nest を Pages から分けた理由と同じ）
- **送るのは本番と preview の Pages の SPA だけ。** serve と VS Code はローカルのモデルを開く面で、外へ送らない。nest の viewer は、`nest-privacy.md` が持たないと書いている。monorepo の `karasu serve`・`vite dev`・E2E は Pages と同じ入口を動かすので、成果物の検査（TPL-3612）だけでは止まらない。実行時の判定も要る
- **送信先は今は決めない。** Phase 1 は Cloudflare の中で完結させ、送信先を後から選んでも SPA を変えずに済む形にする
- **Chat の span を拾わない。** Chat（`useChatSession`）はモデルをプロンプトに入れて `@anthropic-ai/sdk` を呼ぶ。グローバルな tracer provider を登録すると、SDK がその呼び出しの span を作る
- Out of scope: nest の Worker 自身の tracing（Cloudflare の Workers tracing の設定だけで済むので別 Issue）、同じ利用者の再訪や定着率の計測（アクティブの件数は数えるが、訪問どうしをつなぐものは送らない）、アプリを開いた経路（共有リンク、permalink など）

## 検討した選択肢

選択は 3 段ある。どこに送り、どこで絞るか（案1〜5）、SPA 側でどう送るか（案5 の中の 5a・5b）、アクティブ利用者をどう数えるか（数え方 A〜D）。

### 案1: Cloudflare Web Analytics だけを使う

Pages の設定で有効にする。cookie を使わず、PV・リファラ・国・Core Web Vitals が取れる。

**メリット**

- 設定だけで済み、すぐ戻せる

**デメリット**

- カスタムイベントを扱えない。§12 の指標はどれも測れない
- ページの URL を記録する。共有のクエリ（`/s?s=`）や bare route の repo 名が載りうる

### 案2: ブラウザから送信先の SaaS に直接 OTLP で送る

OTel Web SDK の exporter を、Honeycomb などの ingest エンドポイントに向ける。

**メリット**

- 受信口を作らなくてよい

**デメリット**

- ingest キーをブラウザに置くことになる。キーは誰でも読めるので、送信先の枠を他人に使われうる
- 送る属性を絞るのがブラウザ側だけになる。コードの変更 1 つでモデルの中身が送信先に届きうる
- CSP を足したときに `connect-src` に外部の host が要り、送信先を変えるたびに SPA を変える
- 送信先を今決める必要がある

### 案3: Pages Function を受信口にする

同じ origin の `/v1/traces` を Pages Function で受ける。

**メリット**

- CORS が要らない

**デメリット**

- ADR-1990 決定 5 の例外になる（Phase 2 で secret を持つ）。ADR-2249 も同じ理由で、permalink 面にカウンタを置く案を却下している
- Pages Functions のログが Workers Logs に残るかを確認できなかった。残らなければ Phase 1 の見る場所が無い

### 案4: Workers Analytics Engine に独自のイベントを書く

受信用 Worker が `writeDataPoint` でイベントを書き、SQL API で集計する。

**メリット**

- 件数や率の集計に強い。保持期間が Workers Logs より長い
- 書き込み量に無料枠がある（Workers Paid）

**デメリット**

- OTel ではない。処理時間の span を同じ形で扱えず、後で OTel の送信先に移すときに作り直しになる
- Cloudflare のダッシュボードに表示の画面が無く、SQL か Grafana が要る

### 案5: OTLP で自前の受信用 Worker へ送り、Worker が許可した項目だけで組み立て直す（採用案）

```
SPA（本番と preview の Pages でだけ送信を有効にする）
  └─ OTLP/HTTP JSON ──▶ 受信用 Worker（新規、nest と別）
                          ├─ Origin・サイズ・形・頻度を検査する
                          ├─ 許可した項目だけで span を組み立て直す（ほかは捨てる）
                          ├─ Phase 1: span 1 つを構造化ログ 1 行にして Workers Logs に書く
                          ├─ 訪問ごとに、国とアクティブの判定を Analytics Engine に 1 行書く（trace id なし）
                          └─ Phase 2: 組み立て直した span を OTLP で送信先へ転送する
```

**メリット**

- 送信先を後から選べる。変えるのは Worker の転送先と secret だけ
- 送る項目を絞る検査がサーバー側にある。SPA の変更でモデルの中身が混ざっても、許可していない項目は Worker で落ちる
- Phase 1 は外部のアカウントが要らない。Cloudflare のダッシュボードの Query Builder でイベントごとに数えられる
- 利用状況と処理時間を同じ OTLP の span で扱える

**デメリット**

- 受信用 Worker という維持する面が 1 つ増える
- Workers Logs の保持期間は短い（Workers Paid で 7 日、Free で 3 日。2026-11-07 に公式文書で確認）。処理時間と first-run の長期の推移は Phase 2 まで見られず、月次のアクティブ数は Workers Logs だけでは数えられない（下の数え方で Analytics Engine を併用する）
- 別 origin なので、preflight を避けるために body を `text/plain` で送るという制約がつく（後述）。Worker は CORS の応答ヘッダーを返す

#### 5a: SPA 側で OTel Web SDK を使う

`@opentelemetry/sdk-trace-web` と OTLP の exporter を遅延読み込みする。

- メリット: span の扱い（親子、バッチ、flush）を自分で書かなくてよい。fetch や document load の自動計装を後で足せる
- デメリット: SDK の chunk が増える。provider をグローバルに登録すると Chat の span まで拾う（`@anthropic-ai/sdk`）ので、登録しない使い方を守り続ける必要がある。成果物の検査で「SDK が無い」ことを確かめる対象のパッケージが多い

#### 5b: SPA 側で OTLP/JSON を組み立てる小さな送信モジュールを書く（採用）

span 名は 8 種類に決まっていて（後述の許可リスト）、親子も「1 回の訪問の下に並ぶ」だけである。OTLP/JSON の `resourceSpans` を組み立てて `fetch(..., { keepalive: true })` で送るモジュールを `packages/app` に置く。

- メリット: SDK の chunk が無い。tracer provider を作らないので、グローバル登録の事故が構造上起きない。成果物の検査が「このモジュールと受信口の host が、Pages の成果物にだけある」で済む。送る形式は OTLP なので、Phase 2 の送信先は 5a と同じに扱える
- デメリット: バッチと flush を自分で書く（数十行）。自動計装が欲しくなったら 5a に移る。そのときも受信用 Worker と送信先は変わらない

自動計装は、入れても今の目的には足りず、そのまま入れると制約を破る。処理時間で見たいのは core の中の段階で、これは計装では見えない。`@opentelemetry/instrumentation-document-load`（0.70.0 のソースで確認）は `location.href` を `url.full` に、`navigator.userAgent` を属性に記録するので、`#s=` の共有リンクを開くとモデルのペイロードが、bare route を開くと repo 名がブラウザの外へ出る。Worker で落とせるが、外へ出る前に止める。

### アクティブ利用者の数え方

「同じ人を 2 回数えない」には、普通は識別子が要る。識別しない制約の中で数える方法は 4 つある。

| 数え方 | 端末に残すもの | サーバーが扱うもの | 月次のアクティブ | 評価 |
| --- | --- | --- | --- | --- |
| **A** 訪問数だけを数える | なし | なし | 数えられない（訪問数になる） | 最も単純だが、よく使う人が多く見える。利用者数ではない |
| **B** IP と User-Agent のハッシュを日替わりのソルトで数える（Plausible などの方式） | なし | IP・User-Agent、ソルト、当日のハッシュの集合 | 数えられない。ソルトを 1 か月持つと、1 か月つなげる識別子になる | 「IP は rate limit の鍵にだけ使う」が崩れ、Worker に状態と secret が増える |
| **C** 端末が最後に数えた日付を持ち、その期間で初めての訪問かどうかだけを送る（採用） | 日付 | 真偽値 3 つ | 数えられる | 識別子が端末の外へ出ない。[Mozilla の Days Since Last Ping](https://blog.mozilla.org/metrics/?p=4868) と同じ考え方 |
| **D** 月替わりの乱数 ID を端末に持って送る | ID | ID の集合 | 数えられる | 期間内の訪問をつなぐ識別子になる。制約に反する |

**数え方 C を採る。** 数えるのは人ではなくブラウザである。複数の端末を使う人や、private window と保存の消去のあとは多めに数え、opt-out と GPC の利用者は数えない。絶対数ではなく、国ごとの比較と推移を見る数字として読む。

## 比較

| 観点 | 案1 Web Analytics | 案2 直接 SaaS | 案3 Pages Function | 案4 Analytics Engine | 案5 OTLP + 受信用 Worker |
| --- | --- | --- | --- | --- | --- |
| §12 の指標 | 測れない | 測れる | 測れる | 測れる | 測れる |
| 処理時間の trace | 無し | あり | あり | 作り直し | あり |
| 送る項目を絞る場所 | 無し（URL を記録） | ブラウザだけ | サーバー | サーバー | サーバー |
| 送信先を後で選ぶ | 不可 | 不可 | 可 | 不可（AE に固定） | 可 |
| ADR-1990 決定 5 | 抵触しない | 抵触しない | 例外が要る | 抵触しない | 抵触しない |
| 新しく維持する面 | 無し | 無し | Function 1 本 | Worker 1 つ | Worker 1 つ |

## Related TPLs

- [TPL-3612](../test-perspectives/TPL-3612-single-build-capability-checked-in-every-output.md)（本 PR で起こす proactive TPL）: 送信は Pages の SPA にだけ載せる。serve・VS Code の webview・nest の viewer の成果物に送信モジュールと受信口の host が無いこと、Pages の成果物にあることを両方向で検査する。同じ成果物が Pages 以外でも動くので、実行時の判定も検査する
- [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md): 受信用 Worker はインターネットから任意の body を受け取る。Origin・サイズ・形を検査してから扱う。実装 PR で `known_consumers` に受信用 Worker を足す
- [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md): 集めるものを書いた文書と、Worker の許可リストを機械で突き合わせる（ADR-1996 の `nest-retention-policy-sync.test.ts` と同じ形）

## 現時点の方針

**案5 を、SPA 側は 5b で採用する。** §12 の指標を測れて、処理時間の trace も同じ形で取れ、送信先を決めずに始められるのは案5 だけである。送る項目を絞る検査をサーバー側に置けるのも、モデルの中身を送らないという制約に対して重い。SPA 側を 5b にするのは、送る span が少なく決まっているうえ、tracer provider を持たないことで Chat の span を拾う経路そのものが無くなるからである。維持する面が 1 つ増えることは、nest と同じく別 Worker として織り込む。

**アクティブ数だけは案4 の Analytics Engine を併用する。** 月次を数えるには 30 日を超える保持が要り、Workers Logs の 7 日では足りない。Analytics Engine は 3 か月保持する（2026-11-07 に公式文書で確認）。案4 の「OTel ではない」というデメリットは、件数だけを書くこの用途では効かない。span は今までどおり案5 の経路を通る。Analytics Engine にはダッシュボードが無いので、集計は SQL API で行う。

### 送信を有効にする条件

次の 3 つがすべて成り立つときだけ送る。どれかが欠ければ送信モジュールは何もしない。

1. **ビルド時**: `deploy.yml` と `preview.yml` だけが、受信口の URL を `import.meta.env` で渡す。`spike-preview.yml`（同じ Pages project に PR なしで deploy する）には渡さない。手元の `pnpm build` の `dist`（monorepo の `karasu serve` が使う）と `vite dev` も URL を持たない
2. **実行時**: `location.origin` が `https://karasu.kompiro.dev` か Pages の preview（`https://<名前>.karasu.pages.dev` の 1 段だけ）に一致する。誤って URL 付きの `dist` を手元で配信しても送らない
3. **利用者**: GPC（`navigator.globalPrivacyControl === true`）も Do Not Track も無く、アプリの設定で送信を止めていない

加えて、reference の pop-out（`?reference`。`mount-app.tsx` が同じ入口で描く別ウィンドウ）では送らない。送ると 1 回の利用が 2 回の訪問に数えられる。

E2E で送信を確かめるときだけ、テスト用のビルド設定が受信口の URL をスタブに、許可する origin を E2E の host に差し替える。

### 共有コードとの継ぎ目

イベントを出すのは共有のコードである（`FirstRunExperience` は `ProjectModeApp` が描き、view の切り替え・共有・描画も serve と共有する `App` のコードにある）。共有のコードは送信モジュールを import せず、何もしない既定の実装を持つ継ぎ目（例: `TelemetrySink` の型と no-op）だけを使う。

- Pages の入口 `main.tsx` だけが送信モジュールを import し、`mountApp({ telemetry })` で本物の実装を渡す
- `serve-main.tsx`・VS Code の webview・viewer の入口は何も渡さない。継ぎ目は no-op のまま
- 成果物の検査（TPL-3612）が目印にするのは送信モジュールで、継ぎ目ではない。継ぎ目はどのビルドにも入ってよい

### ユーザーを識別しないための決め事

| 扱い | 決め事 |
| --- | --- |
| 1 回の訪問の束ね方 | 読み込み時に trace id と訪問の span id を乱数で作り、メモリにだけ持つ。`app.visit` の span は読み込み時にすぐ閉じ、最初の送信に含める。以降の span はすべて同じ trace id で、親をこの訪問の span id にする。タブを閉じれば消える |
| ツアーが再読み込みをまたぐとき | 新しい訪問として数え、ツアーのステップの span に `resumed: true` を付ける。開始時刻を保存して訪問をつなぐことはしない |
| 数値の属性 | ノード数・エッジ数は 2 の累乗の幅（`1-2`、`3-4`、`5-8`…）に丸める。正確な数は特定の共有モデルの目印になりうる |
| 例外 | span に例外を記録しない（メッセージとスタックにノード名や `.krs` が入りうる）。失敗は `outcome: error` の列挙値だけで表す |
| Worker のログ | 構造化ログに IP と User-Agent を書かない。invocation log（リクエストのメタデータの自動記録）は設定で切る |
| 国 | Worker が `request.cf.country` を読み、Analytics Engine の行にだけ書く。span と Workers Logs には入れず、Phase 2 の転送にも含めない。SPA の申告は使わない。region・city など国より細かい位置は読まない |
| アクティブの判定 | 端末に最後に数えた UTC の日付だけを持ち（例: `2026-11-07`）、今日と比べた結果を真偽値 3 つで送る。日付そのものは送らない。送信を有効にする条件を満たさない面と利用者には、日付を書かない。読めない、または書けないときは 3 つとも `false` で送る（多く数えるより少なく数える） |

### イベントの許可リスト（初版）

span 名と属性は Worker の許可リストに載せたものだけを通す。属性の値は列挙値か、丸めた数値か、小さな整数に限る。下は目的と §12 から逆算した初版である。`view` と `kind` の値の集合はスライス A でコード（view の種類と共有の操作の定義）から確定し、Worker を出す前に許可リストに入れる。

| span 名 | 属性 | 使い道 |
| --- | --- | --- |
| `app.visit` | `locale`（`ja` / `en`）、`first_in_day`・`first_in_week`・`first_in_month`（真偽。その UTC の日・ISO 週・月で、このブラウザから初めての訪問か） | 母数、アクティブ数 |
| `welcome.shown` | `trigger`（`first_visit` / `command`。後者はコマンドの `view.showWelcome`） | Welcome からデモを始める率の分母（`first_visit` だけ） |
| `welcome.choice` | `choice`（`understand` / `design` / `evolve` / `editor`。Esc と外側のクリックも `editor`、`WelcomeDialog.tsx` の `WelcomeChoice`） | Welcome からデモを始める率 |
| `tour.step` | `tour`（`service-split`）、`step`（整数）、`outcome`（`completed` / `skipped` / `left`）、`resumed`（真偽） | 完了率・完了までの時間 |
| `tour.end` | `tour`、`outcome`（`completed` / `abandoned`）、`steps_done`（整数）、`elapsed_s`（ツアーの開始からの秒数、整数）、`resumed`（真偽） | 完了率・完了までの時間 |
| `view.switch` | `view`（view の種類の列挙） | 2 種類以上の view を見る率 |
| `share.action` | `kind`（共有の操作の列挙） | 共有の操作をする率 |
| `model.render` | `phase`（`total`: app から見た compile の全体、`parse`: import の解決と parse でファイルの読み込みを含む、`resolve`、`layout`、`render`）、`nodes`・`edges`（丸めた幅）、`outcome`（`ok` / `error`） | 処理時間 |

span の時間はブラウザの時計で測る。完了までの時間は、`outcome: completed` の `tour.end` が持つ `elapsed_s`（同じ訪問の中でツアーを始めてから終えるまで）で集計する。再読み込みをまたいだツアー（`resumed: true`）は開始が前の訪問にあるので、中央値から外す。`tour.step` の時間は、どのステップで時間がかかるかを見るために使う。`abandoned` はツアーのパネルを閉じたときにだけ出る。タブを閉じたツアーは `tour.end` が無いことで分かる。

### 受信用 Worker の検査と組み立て直し

- 受信口は別のサブドメイン（例: `karasu-telemetry.kompiro.dev`）に置く。nest と同じ custom domain の形にし、`karasu.kompiro.dev` のパスに Worker の route を当てる形は採らない（Pages の custom domain と同じ host でどちらが先に応答するかを確かめる手間に見合わない）
- **SPA は body を `Content-Type: text/plain` で送る。** 中身は OTLP/JSON だが、`text/plain` の POST は CORS の preflight を伴わない単純な要求なので、ページを離れる瞬間の keepalive の送信が preflight の往復で落ちることがない。Worker は `text/plain` だけを受け、ほかは 415 で返す。OPTIONS（preflight）には答えないので、ブラウザから `application/json` で送る変更は送信そのものが失敗し、E2E で気づける。Phase 2 で送信先へ転送するときは `application/json` を付け直す
- `Origin` が本番か preview の origin（上の条件 2 と同じ集合）に一致しなければ 403。Worker が Origin から `deployment`（`production` / `preview`）を付け、SPA の申告は使わない。集計は `production` だけで行い、preview（spike の origin も同じ形に見える）の span は送信の確認にだけ使って、集計には入れない
- **Origin の検査は絞り込みであって認証ではない。** ブラウザの外からは Origin を偽れるので、偽の span を `production` として送れる。数値が汚されうることは受け入れる。指標は判断の材料で、ADR-2262 のカウンタと違って人の判断を通さずに数字として読まれるので、数字の急な変化は偽の span を疑ってから読む。費用が膨らむのは、Workers の rate limiting binding で止める。rate limit の鍵には接続元の IP を使い、Cloudflare の rate limit の仕組みが短い時間窓の計数にだけ使う。Worker はそれをログにも保存先にも書かない
- body は上限（例: 64KB）を超えたら 413
- **受け取った body をそのまま通さず、許可した項目だけで span を組み立て直す。** 残すのは span 名・trace id・span id・親の span id・開始と終了の時刻・許可リストの属性だけである。resource の属性（`service.*`、`telemetry.sdk.*`、ブラウザの検出器が足すもの）、scope、span の event（例外の記録を含む）、link、`status.message` は捨てる。resource は Worker が固定の値（`service.name` と `deployment`）で付け直す。Phase 2 の転送も、この組み立て直した span だけを送る
- **鍵だけでなく値も検査する。** 列挙の属性は値が集合に入っているか、整数は型と範囲、丸めた幅は決めた幅の集合、真偽は型、trace id と span id は 32 桁と 16 桁の 16 進、時刻は数値であるかを見る。合わない属性は落とし、id か時刻が合わない span は捨てる。許可した鍵にモデルの文字列を入れても、ここで落ちる
- 許可リストに無い span 名の span と、許可リストに無い属性は捨てる。捨てた件数だけを記録する（捨てた中身は記録しない）
- 検査で結論が出せない（JSON が壊れているなど）ときは、通すのではなく捨てる
- Phase 1 では span 1 つを `console.log({ span, attrs, duration_ms, trace, deployment })` の 1 行にする。Query Builder で `span` ごとに数え、`trace` で 1 回の訪問を束ねる
- **`deployment` が `production` の `app.visit` ごとに、Analytics Engine へ 1 行書く。** `writeDataPoint({ blobs: [country, locale], doubles: [first_in_day, first_in_week, first_in_month] })` の形で、trace id と span id は入れない。国の行動を訪問の trace と結びつけないためである。ただし Analytics Engine の行は書いた時刻を持つので、訪問が少ないうちは時刻で突き合わせられなくはない。どちらも見るのは kompiro だけとし、数の少ない国を他の属性と掛け合わせて公開しない
- `country` が 2 文字の英字でないとき（`request.cf` が無いときを含む）は `unknown` にする
- 月次のアクティブ数は、その月の行を国ごとに `first_in_month` の合計で数える（サンプリングがあるので `SUM(_sample_interval * double3)`）。日次は `double1`、週次は `double2`、訪問数は `SUM(_sample_interval)` である

### 告知と opt-out

- `docs/policy/app-telemetry.md` に、集めるもの・集めないもの・保持期間・止め方を書く。許可リストと文書を突き合わせるテストを置く（TPL-1296、ADR-1996 の決定 6 と同じ形）
- 同じ文書に、**Cloudflare が通信の途中で接続元の IP を扱うこと**、受信用 Worker が IP を rate limit の鍵としてだけ使い（Cloudflare の rate limit の仕組みが短い時間窓で数える）、記録しないことを書く。Phase 2 で第三者の送信先に転送するときは、その送信先を同じ文書に足してから始める
- 同じ文書に、国を接続元の IP から Cloudflare が判定した値として記録すること、端末に最後に数えた日付を置くこと、それがどう使われるかを書く
- アプリの設定に送信を止めるスイッチを置く。止めたことを真偽値で localStorage に書き、最後に数えた日付は消す。どちらも識別子ではない
- この文書は `nest-data-handling.md` と同じ「事実の記述」として公開し、privacy policy とは呼ばない。送信の開始を #2691 の法務レビューの完了待ちにしない（kompiro の判断）。拠りどころは、ファーストパーティで、利用者を識別せず、集計の計測だけに使い、告知と止める手段がある計測であること。これは [CNIL が同意なしで認める計測](https://cnil.fr/en/node/677)を参考にした条件で、同じではない。CNIL は IP の末尾のオクテットを除くことと、トラッカーの寿命を 13 か月までにすることも挙げている。本設計は rate limit と国の判定に IP を切り詰めずに使い（記録はしない）、localStorage の日付には期限が無い（次の訪問か opt-out まで残る）。端末からの送信と保存そのものに及ぶ規制（ePrivacy 5(3) の読み方）があるので、拠りどころの条件のどれかを外す変更（識別子を足す、計測以外に使う、第三者に生のまま渡す、止める手段を外す）は #2691 のレビューに回す。これは法的助言ではない

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 受信用 Worker と許可リスト | なし | SPA が送らなくても Worker 単体で検査・組み立て直し・ログと Analytics Engine への書き込みをテストできる。送る側が無いので、利用者には何も変わらない |
| **B** SPA の送信モジュールと告知（本番と preview の Pages だけ） | A | §12 の指標が Workers Logs で、国別のアクティブ数が Analytics Engine で、この時点で見える。TPL-3612 の成果物検査と実行時の判定、文書と許可リストの突き合わせはここで着地させる |
| **C** 処理時間の span | B | `model.render` の段階ごとの時間を足す。core が計時の関数を引数で受け取る形にする（後述）。渡さなければ今と同じ動きなので、core の他の利用者は変わらない |
| **D** 送信先への転送（Phase 2） | A | 送信先を選んだ時点で、Worker に転送と secret を足す。SPA は変わらない |

> 各スライスで何ができるようになるか / その時点でまだできないことは、スライスを Issue に起こすときに親 Issue #3612 の `## Slice status` に書く。

### 実装の指針

1. スライス A: 新しい Worker パッケージを作る（nest の `wrangler.toml` を手本に、`workers_dev = false`、custom domain、`[observability] enabled = true`、invocation log を切る、rate limiting binding、Analytics Engine の binding）。Analytics Engine の行に trace id が無いこと、国を span とログに書かないこと、SPA が `country` を送っても落ちること、preview の origin では書かないことをテストする。許可リストは 1 つのモジュールに置き、Worker の検査と文書の突き合わせテストの両方がそこを読む。組み立て直しのテストは、resource の属性・event・link・`status.message`・許可していない属性を入れた body から、それらが消えることを確かめる。許可した鍵（`view` など）にノード名を入れた body と、形の合わない id を持つ body から、その属性と span が消えることも確かめる。デプロイは nest と同じく専用の workflow にする。Workers Logs の保持期間に加え、invocation log を切ったときに `console.log` の記録へリクエストのメタデータ（IP・User-Agent）が付かないことを確かめる。この Worker では Workers Traces（`[observability.traces]`）を有効にしない
2. スライス B: 送信モジュール（例: `src/telemetry/sender.ts`）を `src/main.tsx` からだけ import し、上の「共有コードとの継ぎ目」のとおり `mountApp` に渡す。上の 3 つの条件を満たさないとき、または `?reference` のときは何もしない。たまった span は、一定の件数か一定の時間（例: 10 秒）で送り、`visibilitychange` で `hidden` になったときにも送る。送信には `fetch(..., { keepalive: true })` を使う。ページを離れた後も要求が続くが、keepalive の body は合計 64KB までなので、こまめに送って 1 回の body を小さく保つ。送れなかった span を localStorage に貯めて次の訪問で送ることはしない（識別子と同じく、端末に残る記録を増やさないため）。最後の span が落ちることは受け入れる。E2E は Chromium だけなので、ほかのブラウザでページを離れるときに落ちる分も受け入れる。Chat のクライアントにも `openTelemetry: false` を渡す（tracer provider は作らないが、将来 5a に移ったときの備え）。CSP を足すときは `connect-src` に受信口を入れる
3. スライス B のテスト:
   - TPL-3612 のとおり、4 つのビルドの成果物を両方向で検査する。目印は 2 つ:
     - 送信モジュールのモジュール id。`rejectMonaco`（`vite.serve.config.ts`）と同じく `generateBundle` で `getModuleIds()` を見て、serve・VS Code の webview・viewer のビルドに入っていたら build を落とす。Pages のビルドには入っていることをテストで確かめる。これは受信口の URL の有無に関係なく、ふつうの PR の CI で働く
     - 受信口の host の文字列。URL は `deploy.yml` と `preview.yml` でしか渡さないので、ふつうのビルドではどの成果物にも無い。テストで 4 つの設定をダミーの URL を渡してビルドし、host が `dist/` にだけ現れることを確かめる
     - serve・VS Code の webview・viewer は minify するので、パッケージ名の文字列では探さない（Pages のビルドは `minify: false`）。`@opentelemetry/api` は Chat 経由で各ビルドに入りうるので、目印に使わない
   - 送信を有効にする 3 つの条件の unit test（origin・ビルド時の URL・GPC と DNT と設定の組み合わせ）
   - アクティブの判定の unit test（同じ日・週をまたぐ・月をまたぐ・UTC の境界・読めない値・未来の日付・localStorage が例外を投げるとき。条件を満たさないときに日付を書かないこと。opt-out で日付を消すこと）
   - 受信口の URL を渡す環境変数の名前が `deploy.yml` と `preview.yml` にだけ現れることの検査。`spike-preview.yml` はビルドの手順を `preview.yml` に揃えると書いているので、写し間違いで spike にも URL が渡るのを止める
   - `docs/policy/app-telemetry.md` と許可リストの突き合わせテスト
4. スライス C: app から呼べるのは `compileProject` などの全体で、段階は core の中に閉じている（`_compileProjectCore` が import を解決し、`_compileFromPreparedInput` が `resolveStyles` と `render` を呼び、layout は `render` の中にある）。app 側で囲むだけでは `total` しか取れないので、`CompileOptions` に `onPhase?: (phase, startMs, endMs) => void` を足す。core は OTel に依存せず、モデルの情報も渡さない。app は図のビューが共有する `useDebouncedCompile` で `total` を測り（debounce の待ち時間は含めない）、`onPhase` を `TelemetrySink` につなぐ。ビューの compile だけを測り、書き出し用の `buildDrillDownSvg` や diff の compile は遅さが問題になったら足す
5. AT: `docs/acceptance/` に新規ファイル。TC は:
   - Welcome からツアーを最後まで進めると、`welcome.choice`・`tour.step`・`tour.end` が受信口に届く（受信口と許可 origin をテスト用に差し替えた Playwright で確認する）
   - 同じ日に 2 回開くと、1 回目の `app.visit` は `first_in_day: true`、2 回目は `false` になり、localStorage には日付だけが残り、送った body に日付が含まれない
   - モデルを開くと `model.render` が届き、送った body にノード名が含まれない（スライス C）
   - 共有リンク（`#s=…`）から開いても、送った body に fragment とノード名が含まれない
   - ツアーの途中で別のページへ移っても、移る直前の `tour.step` が受信口に届く
   - GPC を有効にしたブラウザでは何も送らない
   - `karasu serve` で開いたアプリは何も送らない。npm の serve ビルドに加え、受信口の URL を渡してビルドした `packages/app/dist` を monorepo の `karasu serve` で開いても送らないことを確かめる（URL の無い `dist` では origin の判定を確かめられないため）
   - reference の pop-out を開いても `app.visit` が増えない
6. ADR 昇格: スライス B が終わった時点で `docs/adr/3612-spa-usage-tracing.md` に昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 本番と preview の Pages の SPA だけ、受信口への送信が増える。serve・VS Code・nest の viewer・手元のビルドは変わらない
- ドキュメント更新: `docs/policy/app-telemetry.md`（新規）、README か docs-site の privacy の記述、PRD #3573 §12 の「測れない」の記述
- テスト・examples への影響: 成果物検査と実行時の判定のテストが増える。examples は変わらない
