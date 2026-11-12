# SPA の匿名の利用状況を OpenTelemetry の形式で受信用 Worker に送る

- **日付**: 2026-11-05
- **ステータス**: 検討中
- **PR**: #3619
- **関連**:
  - 引き金 Issue: [#3612](https://github.com/kompiro/karasu/issues/3612)（PRD [#3573](https://github.com/kompiro/karasu/issues/3573) の sub-issue）
  - 関連 ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（決定 5: state と secret を静的な Pages app に置かない。[ADR-2578](../adr/2578-nest-retires-server-side-reverse.md) が引き継ぐ）、[ADR-1996](../adr/1996-karasu-nest-data-trust.md)（集めるものの文書と実装を機械で突き合わせる）、[ADR-3020](../adr/3020-nest-custom-domain-karasu-nest-kompiro-dev.md)（nest の origin と `__Host-` cookie）、[ADR-2249](../adr/2249-permalink-generation-seam.md)（permalink 面にカウンタを置く案の却下）、[ADR-2262](../adr/2262-nest-intake-and-completion.md)（水増しされうる数を受け入れた理由）、[ADR-3381](../adr/3381-dependabot-triage-2026-10-26.md) と [ADR-3575](../adr/3575-dependabot-triage-2026-11-02.md)（`@anthropic-ai/sdk` の OTel 対応。後者が現行の 1.3.0）
  - 関連 TPL: [TPL-3612](../test-perspectives/TPL-3612-single-build-capability-checked-in-every-output.md)（本 PR で起こす）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)
  - コード: `packages/app/src/main.tsx`、`packages/app/src/components/first-run/`、`packages/app/src/hooks/useDebouncedCompile.ts` と図のビューの hook、`packages/core/src/compile/compile.ts` と各 renderer、新規 Worker（`packages/` 配下、名前は未定）

## 背景・課題

PRD #3573 §12 は first-run の成功指標を置いた（Welcome からデモを始める率、完了率、完了までの時間の中央値、2 種類以上の view を見る率、共有の操作をする率）。同じ節に「アプリにテレメトリが無いので今は測れない。入れるかは別途決める」とある。本 Design Doc はその決定を扱う。

今の Cloudflare のダッシュボードでは、この問いに答えられない。

- SPA は Pages が静的アセットとして配信している。`packages/app/public/_routes.json` が `/` と `/assets/*` を Functions から外している。`/s`・bare route・`/r` から入ったときに Function が 1 回動くだけで、アプリの中の操作では Worker は動かない
- Workers Observability（Logs と Traces）に出るのは Worker の実行の中で起きたことだけである
- Pages の Analytics と Web Analytics は PV までで、アプリの中の操作は見えない

目的は 3 つある。

1. **ブラウザ内の処理時間**: app・core・render の処理が、実際に開かれるモデルでどれだけかかっているか
2. **アクティブ利用者数**: どの国で、日次・週次・月次にどれだけ使われているか（週次・月次は、その期間に最初に使われた国で数える）
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
- **受信口は Pages app の外に置く。** ADR-1990 決定 5（ADR-2578 が引き継ぐ）は、state と secret を静的な Pages app に同居させないと決めている。Phase 2 を始めれば送信先の API キーを持つので、受信口は secret を持ちうる（Phase 2 は当面着手しないが、始めるときに受信口を移さずに済むよう、今から外に置く）
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

- ADR-1990 決定 5 の例外になる（Phase 2 を始めれば secret を持つ）。ADR-2249 も同じ理由で、permalink 面にカウンタを置く案を却下している
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
                          └─ Phase 2（当面着手しない）: 組み立て直した span を OTLP で送信先へ転送する
  └─ アクティブの判定（OTLP ではない。ブラウザごとに 1 日 1 回）──▶ 同じ Worker の別のパス
                          └─ 国と判定を Analytics Engine に 1 行書く（ログに書かず、転送しない）
```

**メリット**

- 送信先を後から選べる。変えるのは Worker の転送先と secret だけ（アクティブ数は転送の対象にしない）
- 送る項目を絞る検査がサーバー側にある。SPA の変更でモデルの中身が混ざっても、許可していない項目は Worker で落ちる
- Phase 1 は外部のアカウントが要らない。Cloudflare のダッシュボードの Query Builder でイベントごとに数えられる
- 利用状況と処理時間を同じ OTLP の span で扱える

**デメリット**

- 受信用 Worker という維持する面が 1 つ増える
- Workers Logs の保持期間は短い（Workers Paid で 7 日、Free で 3 日。2026-11-07 に公式文書で確認）。処理時間と first-run の長期の推移は Phase 2 まで見られず（Phase 2 は当面着手しない。「現時点の方針」）、月次のアクティブ数は Workers Logs だけでは数えられない（下の数え方で Analytics Engine を併用する）
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
| **C** 端末が最後に数えた日付を持ち、その日に初めて使うときに 1 回だけ、週と月でも初めてかどうかを送る（採用） | 日付 | 真偽値 2 つ | 数えられる | 識別子が端末の外へ出ない。[Mozilla の Days Since Last Ping](https://blog.mozilla.org/metrics/?p=4868) と同じ考え方 |
| **D** 月替わりの乱数 ID を端末に持って送る | ID | ID の集合 | 数えられる | 期間内の訪問をつなぐ識別子になる。制約に反する |

**数え方 C を採る。** 数えるのは人ではなくブラウザである。次の場合は多めに数える: 複数の端末を使う人、private window と保存の消去のあと、同時に復元された複数のタブ、Safari がスクリプトの保存を消したあと（使わない日が 7 日続くと消える）、送信は届いたが応答の前にタブを閉じたとき。opt-out と GPC の利用者は数えない。絶対数ではなく、国ごとの比較と推移を見る数字として読む。推移を見られるのは Analytics Engine の保持の 3 か月までで、国を転送しないので Phase 2 でも延びない。

判定は span に載せず、専用の小さな要求にする。`app.visit` に載せると、バッチの中で失われたときにその期間の数が丸ごと消え、偽の body 1 つで何百行も書け、trace id と結びつき、Phase 2 で第三者に届く。専用の要求なら、どれも形の上で起きない。

## 比較

| 観点 | 案1 Web Analytics | 案2 直接 SaaS | 案3 Pages Function | 案4 Analytics Engine | 案5 OTLP + 受信用 Worker |
| --- | --- | --- | --- | --- | --- |
| §12 の指標 | 測れない | 測れる | 測れる | 測れる | 測れる |
| 処理時間の trace | 無し | あり | あり | 作り直し | あり |
| 国別の月次アクティブ | 訪問数まで | 送信先次第 | Workers Logs に残るか不明 | 数えられる | Workers Logs の 7 日では足りない。案4 を併用する（採用） |
| 送る項目を絞る場所 | 無し（URL を記録） | ブラウザだけ | サーバー | サーバー | サーバー |
| 送信先を後で選ぶ | 不可 | 不可 | 可 | 不可（AE に固定） | 可 |
| ADR-1990 決定 5 | 抵触しない | 抵触しない | 例外が要る | 抵触しない | 抵触しない |
| 新しく維持する面 | 無し | 無し | Function 1 本 | Worker 1 つ | Worker 1 つ |

## Related TPLs

- [TPL-3612](../test-perspectives/TPL-3612-single-build-capability-checked-in-every-output.md)（本 PR で起こす proactive TPL）: 送信は Pages の SPA にだけ載せる。serve・VS Code の webview・nest の viewer の成果物に送信モジュールと受信口の host が無いこと、Pages の成果物にあることを両方向で検査する。同じ成果物が Pages 以外でも動くので、実行時の判定も検査する
- [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md): 受信用 Worker はインターネットから任意の body を受け取る。Origin・サイズ・形を検査してから扱う。実装 PR で `known_consumers` に受信用 Worker を足す
- [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md): 集めるものを書いた文書と、Worker の許可リストを機械で突き合わせる（ADR-1996 の `nest-retention-policy-sync.test.ts` と同じ形）
- [TPL-1530](../test-perspectives/TPL-1530-persistent-store-init-and-mutation-resilience.md): localStorage の「値が無い」と「読めない」を分ける。アクティブの判定の手順がこれにあたる
- [TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md): 同じ options を共有する入口（`compile()` と `compileProject()`）で `onPhase` の働きを揃える

## 現時点の方針

**案5 を、SPA 側は 5b で採用する。** §12 の指標を測れて、処理時間の trace も同じ形で取れ、送信先を決めずに始められるのは案5 だけである。送る項目を絞る検査をサーバー側に置けるのも、モデルの中身を送らないという制約に対して重い。SPA 側を 5b にするのは、送る span が少なく決まっているうえ、tracer provider を持たないことで Chat の span を拾う経路そのものが無くなるからである。維持する面が 1 つ増えることは、nest と同じく別 Worker として織り込む。

**アクティブ数だけは案4 の Analytics Engine を併用する。** 月次を数えるには 30 日を超える保持が要り、Workers Logs の 7 日では足りない。Analytics Engine は 3 か月保持する（2026-11-07 に公式文書で確認）。案4 の「OTel ではない」というデメリットは、件数だけを書くこの用途では効かない。span は今までどおり案5 の経路を通り、アクティブの判定だけが専用の経路で Analytics Engine に届く。Analytics Engine にはダッシュボードが無いので、集計は SQL API で行い、そのための API トークンが要る。

**Phase 2（送信先への転送）は当面着手しない**（kompiro の判断、2026-11-12）。目標の 3 つは Phase 1 で見られる。処理時間と first-run は Workers Logs の Query Builder で 7 日分を絞り込み・集計でき、国別のアクティブ数は Analytics Engine の SQL API で 3 か月分を引ける。Phase 1 で見られないのは、処理時間と first-run を 7 日より前と比べること（リリースの前後の比較など）と、1 回の訪問の span を trace のウォーターフォール表示（親子の span の時間の重なり）で見ること（`trace` ごとに絞り込むことは Phase 1 でもできる）で、どちらも今は要らない。そのどちらかが要るようになったらスライス D を Issue に起こし、送信先を選ぶ。SPA は変わらないので、後から始めても失うものは、始める前の期間の span だけである。

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
| 国 | Worker が `request.cf.country` を読み、Analytics Engine の行にだけ書く。span と Workers Logs には入れず、Phase 2 の転送にも含めない。SPA の申告は使わない。region・city など国より細かい位置は読まない。日次・週次・月次のアクティブ数で、ブラウザはその期間で最初に使ったときの国に数える。期間の途中で別の国から使っても、その国には数えない。国ごとの数の合計が全体の数と一致し、端末の日付の記録が続いているかぎり同じブラウザを 2 つの国で数えないためである（記録が消えたときの数え直しは「数え方 C」の「多めに数える」場合と同じ）。旅行や出張の多い利用者の行き先の国が少なめに出ることは受け入れ、「その期間に使われた国」ではなく「その期間に最初に使われた国」として読む |
| アクティブの判定 | 端末に最後に数えた UTC の日付だけを持ち（例: `2026-11-07`）、今日と違うときに週と月でも初めてかどうかを真偽値 2 つで送る。日付そのものは送らない。下の「アクティブの判定の手順」に従う |
| 残るリスク | 数の少ない国の利用者は、Analytics Engine の行（ブラウザごとに 1 日 1 行、3 か月）が 1 人分の利用日の記録に近くなる。また、Workers Logs の 7 日のあいだは、`app.visit` のログと時刻で突き合わせて国と trace を結びつけられなくはない。どちらも見るのは kompiro だけとし、結びつける集計をせず、数の少ない国の数字を公開しない。行に trace id を入れないのは結びつきを難しくするためで、不可能にするものではない |

### アクティブの判定の手順

送信を有効にする条件を満たすときだけ、読み込み時と、`visibilitychange` で `visible` に戻ったときに、次を行う（開いたままのタブが何日も数えられないのを防ぐ）。

1. localStorage の日付を読み、UTC の今日と比べる。同じなら何もしない。読むときに例外が出たら、そのタブでは数えない
2. 値が無い、形が合わない、未来の日付のいずれかなら、記録なしとして扱い、週と月も初めてとする。そうでなければ、週は ISO 週の月曜日を、月は年と月を比べる（月初が週の途中なら、月だけ初めてになる。年をまたいでも同じ週のことがある）
3. `locale`・`first_in_week`・`first_in_month` を単独ですぐ送る。バッチに混ぜない。タブの中で送信中なら重ねて送らない
4. **2xx の応答を受けてから日付を書く。** 失敗（429 を含む）なら書かず、次の機会に数え直す。書くときに例外が出ても何もしない

送信の条件 3（GPC・DNT・opt-out）を満たさなくなったら、日付を消す。opt-out を解除すると同じ月にもう一度数えることがあるが、受け入れる。

### イベントの許可リスト（初版）

span 名と属性は Worker の許可リストに載せたものだけを通す。属性の値は列挙値か、丸めた数値か、小さな整数に限る。下は目的と §12 から逆算した初版である。`view` と `kind` の値の集合はスライス A でコード（view の種類と共有の操作の定義）から確定し、Worker を出す前に許可リストに入れる。

| span 名 | 属性 | 使い道 |
| --- | --- | --- |
| `app.visit` | `locale`（`ja` / `en`） | 母数 |
| `welcome.shown` | `trigger`（`first_visit` / `command`。後者はコマンドの `view.showWelcome`） | Welcome からデモを始める率の分母（`first_visit` だけ） |
| `welcome.choice` | `choice`（`understand` / `design` / `evolve` / `editor`。Esc と外側のクリックも `editor`、`WelcomeDialog.tsx` の `WelcomeChoice`） | Welcome からデモを始める率 |
| `tour.step` | `tour`（`service-split`）、`step`（整数）、`outcome`（`completed` / `skipped` / `left`）、`resumed`（真偽） | 完了率・完了までの時間 |
| `tour.end` | `tour`、`outcome`（`completed` / `abandoned`）、`steps_done`（整数）、`elapsed_s`（ツアーの開始からの秒数、整数）、`resumed`（真偽） | 完了率・完了までの時間 |
| `view.switch` | `view`（view の種類の列挙） | 2 種類以上の view を見る率 |
| `share.action` | `kind`（共有の操作の列挙） | 共有の操作をする率 |
| `model.render` | `diagram`（`system` / `deploy` / `org`）、`phase`（下の定義）、`nodes`・`edges`（丸めた幅）、`outcome`（`ok` / `error`） | 処理時間 |

`model.render` の `phase` は次のとおりで、スライス C の実装の指針に送る範囲を書く。

| phase | 範囲 | 読み方 |
| --- | --- | --- |
| `total` | app が compile を呼んでから resolve するまで。debounce の待ちは含めない | 実時間。同時に走る他のビューの compile と重なりうる |
| `parse` | import の解決と parse。ファイルの読み込みを含む | 実時間。同上 |
| `resolve` | parse の後から layout の前まで（view の抽出、スタイルの解決、検査） | 同期なので正確 |
| `layout` | 配置の計算。system と deploy だけで、org は描画に混ざっているので送らない | 同期なので正確 |
| `render` | layout の後から SVG の文字列ができるまで（`layout` を二重に数えない）。org は配置を含む | 同期なので正確 |
| `commit` | 結果を state に渡してから次の `requestAnimationFrame` まで。SVG の挿入を含む | app の処理 |

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
- **アクティブの判定は OTLP と別のパスで受ける。** Origin・`text/plain`・rate limit の検査は同じで、body は `locale` と真偽値 2 つだけの小さな JSON とし、値を検査する。1 要求で 1 行しか書けない。ログに書かず、転送しない
- **`deployment` が `production` のときだけ、Analytics Engine へ 1 行書く。** `writeDataPoint({ indexes: [country], blobs: [country, locale], doubles: [first_in_week, first_in_month] })` の形で、真偽は 0 と 1 にする。行の項目は許可リストと同じモジュールに置き、行を作るコードと文書の突き合わせテストの両方がそこを読む
- `country` が 2 文字の英字でないとき（`request.cf` が無いときを含む）と、Cloudflare が不明を表す `XX` のときは `unknown` にする（`XX` の扱いはスライス A で確認する）。`locale` が合わないときも `unknown` にする
- 1 行がブラウザの 1 日分なので、国ごとの日次は `SUM(_sample_interval)`、週次は `SUM(_sample_interval * double1)`、月次は `SUM(_sample_interval * double2)` で数える（`toStartOfWeek` は月曜始まり）。判定はブラウザの時計、行の時刻はサーバーの時計なので、期間の境目には少しずれがある

### 告知と opt-out

- `docs/policy/app-telemetry.md` に、集めるもの・集めないもの・保持期間・止め方を書く。許可リスト（span と Analytics Engine の行の両方）と文書を突き合わせるテストを置く（TPL-1296、ADR-1996 の決定 6 と同じ形）
- 同じ文書に、**Cloudflare が通信の途中で接続元の IP を扱うこと**、受信用 Worker が IP を rate limit の鍵としてだけ使い（Cloudflare の rate limit の仕組みが短い時間窓で数える）、記録しないことを書く。Phase 2 で第三者の送信先に転送するときは、その送信先を同じ文書に足してから始める
- 同じ文書に、国を接続元の IP から Cloudflare が判定した値として記録すること、端末に最後に数えた日付を置くこと、それがどう使われるかを書く
- 同じ文書に、「ユーザーを識別しないための決め事」の「残るリスク」を書く
- アプリの設定に送信を止めるスイッチを置く。止めたことを真偽値で localStorage に書き、最後に数えた日付は消す。どちらも識別子ではない
- この文書は `nest-data-handling.md` と同じ「事実の記述」として公開し、privacy policy とは呼ばない。送信の開始を #2691 の法務レビューの完了待ちにしない（kompiro の判断）。拠りどころは、ファーストパーティで、利用者を識別せず、集計の計測だけに使い、告知と止める手段がある計測であること。これは [CNIL が同意なしで認める計測](https://cnil.fr/en/node/677)を参考にした条件で、同じではない。CNIL は IP の末尾のオクテットを除くこと、トラッカーの寿命を 13 か月までにすること、他の処理と突き合わせないことも挙げている。本設計は rate limit と国の判定に IP を切り詰めずに使い（記録はしない）、localStorage の日付には期限が無く（次の数え直しか opt-out まで残る）、突き合わせは運用で避けるだけである。端末からの送信と保存そのものに及ぶ規制（ePrivacy 5(3) の読み方）があるので、拠りどころの条件のどれかを外す変更（識別子を足す、計測以外に使う、第三者に生のまま渡す、止める手段を外す）は #2691 のレビューに回す。これは法的助言ではない

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 受信用 Worker と許可リスト | なし | SPA が送らなくても Worker 単体で検査・組み立て直し・ログと Analytics Engine への書き込みをテストできる。送る側が無いので、利用者には何も変わらない |
| **B** SPA の送信モジュールと告知（本番と preview の Pages だけ） | A | §12 の指標が Workers Logs で、国別のアクティブ数が Analytics Engine で、この時点で見える。TPL-3612 の成果物検査と実行時の判定、文書と許可リストの突き合わせはここで着地させる |
| **C** 処理時間の span | B | `model.render` の段階ごとの時間を足す。core が計時の関数を引数で受け取る形にする（後述）。渡さなければ今と同じ動きなので、core の他の利用者の動きは変わらない。公開 API に任意の引数が増えるので changeset は要る |
| **D** 送信先への転送（Phase 2） | A | **当面は着手しない**（「現時点の方針」の「Phase 2（送信先への転送）は当面着手しない」）。始めるときも、Worker に転送と secret を足すだけで SPA は変わらない |

> 各スライスで何ができるようになるか / その時点でまだできないことは、スライスを Issue に起こすときに親 Issue #3612 の `## Slice status` に書く。Issue に起こすのは A〜C で、D は再開の条件を満たしたときに起こす。

### 実装の指針

1. スライス A: 新しい Worker パッケージを作る（nest の `wrangler.toml` を手本に、`workers_dev = false`、custom domain、`[observability] enabled = true`、invocation log を切る、rate limiting binding、Analytics Engine の binding）。Analytics Engine の行に trace id が無いこと、国を span とログに書かないこと、SPA が `country` を送っても落ちること、preview の origin では書かないこと、1 要求で 1 行しか書けないことをテストする。許可リストは 1 つのモジュールに置き、Worker の検査と文書の突き合わせテストの両方がそこを読む。組み立て直しのテストは、resource の属性・event・link・`status.message`・許可していない属性を入れた body から、それらが消えることを確かめる。許可した鍵（`view` など）にノード名を入れた body と、形の合わない id を持つ body から、その属性と span が消えることも確かめる。デプロイは nest と同じく専用の workflow にする。Workers Logs の保持期間に加え、invocation log を切ったときに `console.log` の記録へリクエストのメタデータ（IP・User-Agent・`cf` の国・URL）が付かないことを実際のログで確かめる。Worker のテストでは検出できないので、スライス A の出荷前の確認にする。この Worker では Workers Traces（`[observability.traces]`）を有効にしない
2. スライス B: 送信モジュール（例: `src/telemetry/sender.ts`）を `src/main.tsx` からだけ import し、上の「共有コードとの継ぎ目」のとおり `mountApp` に渡す。上の 3 つの条件を満たさないとき、または `?reference` のときは何もしない。アクティブの判定は送信モジュールの中で完結し、共有のコードは関わらない。たまった span は、一定の件数か一定の時間（例: 10 秒）で送り、`visibilitychange` で `hidden` になったときにも送る。送信には `fetch(..., { keepalive: true })` を使う。ページを離れた後も要求が続くが、keepalive の body は合計 64KB までなので、こまめに送って 1 回の body を小さく保つ。送れなかった span を localStorage に貯めて次の訪問で送ることはしない（識別子と同じく、端末に残る記録を増やさないため）。最後の span が落ちることは受け入れる。E2E は Chromium だけなので、ほかのブラウザでページを離れるときに落ちる分も受け入れる。Chat のクライアントにも `openTelemetry: false` を渡す（tracer provider は作らないが、将来 5a に移ったときの備え）。CSP を足すときは `connect-src` に受信口を入れる
3. スライス B のテスト:
   - TPL-3612 のとおり、4 つのビルドの成果物を両方向で検査する。目印は 2 つ:
     - 送信モジュールのモジュール id。serve・VS Code の webview・viewer のビルドは、`rejectMonaco`（`vite.serve.config.ts`）と同じく `generateBundle` で `getModuleIds()` を見て、送信モジュールを import しているだけで build を落とす（tree shaking でコードが消えても、共有のコードが import していること自体を止める）。Pages のビルドは、グラフにあるだけでは足りないので、出力の chunk の `modules` で送信モジュールの `renderedLength` が 0 より大きいこと（出力にコードが残っていること）をテストで確かめる。これは受信口の URL の有無に関係なく、ふつうの PR の CI で働く
     - 受信口の host の文字列。URL は `deploy.yml` と `preview.yml` でしか渡さないので、ふつうのビルドではどの成果物にも無い。テストで 4 つの設定をダミーの URL を渡してビルドし、host が `dist/` にだけ現れることを確かめる
     - serve・VS Code の webview・viewer は minify するので、パッケージ名の文字列では探さない（Pages のビルドは `minify: false`）。`@opentelemetry/api` は Chat 経由で各ビルドに入りうるので、目印に使わない
   - 送信を有効にする 3 つの条件の unit test（origin・ビルド時の URL・GPC と DNT と設定の組み合わせ）
   - アクティブの判定の unit test。境目は 2026-12-31 と 2027-01-01（年が違い同じ ISO 週）、2026-11-30 と 2026-12-01（週は同じで月だけ初めて）、2025-11 と 2026-11（月の数字が同じ）、UTC の日付の境目。値は、無い・形が合わない・未来の日付・読むときと書くときの例外。手順は、失敗や 429 では日付を書かないこと、`visible` に戻ると翌日分を数えること、条件を満たさないときに日付を書かないこと、GPC や opt-out で日付を消すこと
   - 受信口の URL を渡す環境変数の名前が `deploy.yml` と `preview.yml` にだけ現れることの検査。`spike-preview.yml` はビルドの手順を `preview.yml` に揃えると書いているので、写し間違いで spike にも URL が渡るのを止める
   - `docs/policy/app-telemetry.md` と許可リストの突き合わせテスト
4. スライス C: app から呼べるのは `compileProject` などの全体で、段階は core の中に閉じている（`_compileProjectCore` が import を解決し、`_compileFromPreparedInput` が抽出・スタイルの解決・描画を呼ぶ。layout は system では `render`、deploy では `renderDeploy` の中にあり、org には独立した段階が無い）。app 側で囲むだけでは `total` しか取れないので、core に計時の関数を渡す:
   - `CompileOptions` に `onPhase?: (phase, edge: "start" | "end") => void` を足し、`RenderOptions` と deploy の描画の options にも通す。時刻は app が押す。core は時計も OTel も持たず、モデルの情報も渡さない。`compile()` も同じ options を共有するので `parse` を報告する（TPL-219）
   - 3 つの図のビューの hook が `compileProject` に `onPhase` を渡し、`total` は `useDebouncedCompile` で測る。段階は app でためて、compile が終わってから span にする。途中で例外が出た段階は `end` が来ないので送らない
   - `outcome` は、例外か error の診断があれば `error`、それ以外は `ok`。`nodes`・`edges` は `diagram` ごとに result から数える関数を app に置き、対象は今描いた slice とする
   - 3 つの hook は表示していないビューも編集のたびに compile するので、送るのは表示中のビューだけにする。送るのは compile ごとではなく、訪問の最初の 1 回と、その後は `diagram` ごとに 1 分に 1 回までとする（span が少ないという 5b の前提と Workers Logs の枠を守る）。キャンセルされた compile は送らない
   - 比較（diff）の表示中は送らない。書き出し用の `buildDrillDownSvg` と `renderEntityView` は測らない。遅さが問題になったら足す
   - `@karasu-tools/core` と `karasu` の changeset を足す（`.claude/rules/changesets.md`）
5. AT: `docs/acceptance/` に新規ファイル。TC は:
   - Welcome からツアーを最後まで進めると、`welcome.choice`・`tour.step`・`tour.end` が受信口に届く（受信口と許可 origin をテスト用に差し替えた Playwright で確認する）
   - 時計を固定したブラウザで同じ日に 2 回開くと、アクティブの判定は 1 回だけ届き、telemetry の localStorage の鍵には日付だけが残り、送った body に日付も trace id も含まれない。受信口が失敗を返すと日付は書かれず、次に開いたときにもう一度届く
   - モデルを開くと表示中のビューの `model.render` が届き、送った body にノード名が含まれない（スライス C）
   - 共有リンク（`#s=…`）から開いても、送った body に fragment とノード名が含まれない
   - ツアーの途中で別のページへ移っても、移る直前の `tour.step` が受信口に届く
   - GPC を有効にしたブラウザでは何も送らない
   - `karasu serve` で開いたアプリは何も送らない。npm の serve ビルドに加え、受信口の URL を渡してビルドした `packages/app/dist` を monorepo の `karasu serve` で開いても送らないことを確かめる（URL の無い `dist` では origin の判定を確かめられないため）
   - reference の pop-out を開いても `app.visit` が増えない
6. ADR 昇格: スライス C が終わった時点で（D は当面着手しないので待たない） `docs/adr/3612-spa-usage-tracing.md` に昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 本番と preview の Pages の SPA だけ、受信口への送信と localStorage の日付が増える。serve・VS Code・nest の viewer・手元のビルドは変わらない
- インフラ: Analytics Engine の dataset と、集計の SQL API に使う API トークンが増える
- core: `CompileOptions` と描画の options に任意の `onPhase` が増える（スライス C）
- ドキュメント更新: `docs/policy/app-telemetry.md`（新規）、README か docs-site の privacy の記述、PRD #3573 §12 の「測れない」の記述
- テスト・examples への影響: 成果物検査と実行時の判定のテストが増える。examples は変わらない
