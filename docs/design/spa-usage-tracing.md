# SPA の匿名の利用状況を OpenTelemetry と受信用 Worker で取る

- **日付**: 2026-11-05
- **ステータス**: 検討中
- **PR**: #（作成後に記入）
- **関連**:
  - 引き金 Issue: [#3612](https://github.com/kompiro/karasu/issues/3612)（PRD [#3573](https://github.com/kompiro/karasu/issues/3573) の sub-issue）
  - 関連 ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md)（決定 5: state と secret を静的な Pages app に置かない。[ADR-2578](../adr/2578-nest-retires-server-side-reverse.md) が引き継ぐ）、[ADR-1996](../adr/1996-karasu-nest-data-trust.md)（集めるものの文書と実装を機械で突き合わせる）、[ADR-3020](../adr/3020-nest-custom-domain-karasu-nest-kompiro-dev.md)（nest の origin と `__Host-` cookie）、[ADR-2249](../adr/2249-permalink-generation-seam.md)（permalink 面にカウンタを置く案の却下）、[ADR-3381](../adr/3381-dependabot-triage-2026-10-26.md)（`@anthropic-ai/sdk` の OTel 対応）
  - 関連 TPL: [TPL-3612](../test-perspectives/TPL-3612-single-build-capability-checked-in-every-output.md)（本 PR で起こす）、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)、[TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)
  - コード: `packages/app/src/main.tsx`、`packages/app/src/components/first-run/`、新規 Worker（`packages/` 配下、名前は未定）

## 背景・課題

PRD #3573 §12 は first-run の成功指標を置いた（Welcome からデモを始める率、完了率、完了までの時間の中央値、2 種類以上の view を見る率、共有の操作をする率）。同じ節に「アプリにテレメトリが無いので今は測れない。入れるかは別途決める」とある。本 Design Doc はその決定を扱う。

今の Cloudflare のダッシュボードでは、この問いに答えられない。

- SPA は Pages が静的アセットとして配信している。`packages/app/public/_routes.json` が `/` と `/assets/*` を Functions から外しているので、アプリを使っているあいだ Worker は 1 度も動かない
- Workers Observability（Logs と Traces）に出るのは Worker の実行の中で起きたことだけである
- Pages の Analytics と Web Analytics は PV までで、アプリの中の操作は見えない

目的は 2 つある。

1. **利用状況**: Welcome、ツアーの各ステップ、view の切り替え、共有の操作がどれだけ起きているか
2. **ブラウザ内の処理時間**: parse・layout・render が、実際に開かれるモデルでどれだけかかっているか

どちらも **ユーザーを識別せずに** 取る。見たいのは使われ方であって、誰が使ったかではない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| SPA の配信 | `karasu.kompiro.dev`。`.github/workflows/deploy.yml` が `packages/app/dist` を Pages に deploy する |
| Pages Functions | `/s`（OGP の共有ページ）、`/render`（SVG / PNG）、bare route（`/<owner>/<repo>`）、`/r`（旧 prefix の redirect）。どれもクエリかパスにモデルか repo 名を持つ |
| nest | `karasu-nest.kompiro.dev` の別 Worker。`[observability] enabled = true`。Workers Paid プラン |
| `packages/app` から作るビルド | Pages の SPA（`index.html`）、serve（`vite.serve.config.ts`）、VS Code の webview（`vite.vscode-webview.config.ts`）、nest の viewer（`vite.viewer.config.ts`） |
| OTel の依存 | `@opentelemetry/api` 1.9.1 が `@anthropic-ai/sdk` 経由ですでに `packages/app` の依存木にある。SDK はアプリがグローバルな tracer provider を登録したときだけ span を作る（ADR-3381） |
| first-run の状態 | Welcome を閉じたこととツアーの進み具合を localStorage に持つ（`welcome-gate.ts`、`tour-progress.ts`）。テレメトリとは無関係 |
| 集めるものの文書 | nest には `docs/policy/nest-data-handling.md` と `nest-privacy.md`（草案）がある。後者は「アクセス解析・トラッキング目的の第三者スクリプトを持たない」と書いている。app にはまだ無い |

## 制約・前提

- **ユーザーを識別しない。** ユーザー ID、永続的な ID、cookie、テレメトリのための localStorage を持たない。IP と User-Agent を記録しない
- **モデルの中身を送らない。** ノード名、`.krs` の本文、URL のクエリと fragment、repo 名を送らない。共有のペイロードは fragment（`#s=`）か `/s?s=` のクエリにあるので、URL をそのまま送る仕組みは使えない
- **受信口は Pages app の外に置く。** ADR-1990 決定 5（ADR-2578 が引き継ぐ）は、state と secret を静的な Pages app に同居させないと決めている。Phase 2 で送信先の API キーを持つので、受信口は secret を持つ
- **nest にも同居させない。** nest の origin は `__Host-` のセッション cookie を持つ（ADR-3020）。匿名の受信口を同じ origin に置くと、cookie が付いた要求を受け取る面が増える。デプロイとロールバックも nest と分けたい（ADR-2578 が nest を Pages から分けた理由と同じ）
- **送信は Pages の SPA だけ。** serve と VS Code はローカルのモデルを開く面で、外へ送らない。nest の viewer は、`nest-privacy.md` が持たないと書いている。TPL-3612 で全ビルドの成果物を検査する
- **送信先は今は決めない。** Phase 1 は Cloudflare の中で完結させ、送信先を後から選んでも SPA を変えずに済む形にする
- **Chat の span を拾わない。** Chat（`useChatSession`）はモデルをプロンプトに入れて `@anthropic-ai/sdk` を呼ぶ。グローバルな tracer provider を登録すると、SDK がその呼び出しの span を作る
- Out of scope: nest の Worker 自身の tracing（Cloudflare の Workers tracing の設定だけで済むので別 Issue）、core への span の埋め込み（後述のスライス C）、再訪の計測（識別しない以上、測れない）

## 検討した選択肢

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

- ingest キーをブラウザに置くことになる（書き込み専用でも、誰でも偽のデータを送れる）
- 送る属性を絞るのがブラウザ側だけになる。コードの変更 1 つでモデルの中身が送信先に届きうる
- CSP の `connect-src` に外部の host を足し、送信先を変えるたびに SPA を変える
- 送信先を今決める必要がある

### 案3: Pages Function を受信口にする

同じ origin の `/v1/traces` を Pages Function で受ける。

**メリット**

- CORS が要らない。CSP も変えなくてよい

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

### 案5: OTel Web SDK から自前の受信用 Worker へ送り、Worker が許可した属性だけを通す（採用案）

```
SPA（Pages の入口だけで tracer provider を作る）
  └─ OTLP/HTTP JSON ──▶ 受信用 Worker（新規、nest と別）
                          ├─ Origin・サイズ・span 名・属性を許可リストで検査し、外れたものを捨てる
                          ├─ Phase 1: span 1 つを構造化ログ 1 行にして Workers Logs に書く
                          └─ Phase 2: 検査を通った span を OTLP で送信先へ転送する
```

**メリット**

- 送信先を後から選べる。変えるのは Worker の転送先と secret だけ
- 送る属性を絞る検査がサーバー側にある。SPA の変更でモデルの中身が混ざっても、許可リストに無い属性は Worker で落ちる
- Phase 1 は外部のアカウントが要らない。Cloudflare のダッシュボードの Query Builder でイベントごとに数えられる
- 利用状況と処理時間を同じ OTel の span で扱える

**デメリット**

- 受信用 Worker という維持する面が 1 つ増える
- Workers Logs の保持期間は短い（7 日という記載を見た。現行の値はスライス A で確認する）。長期の推移は Phase 2 まで見られない
- OTel Web SDK の分だけバンドルが増える（遅延読み込みで初回表示から外す。上限は置かず、サイズを記録する）
- 別 origin なので CORS の preflight を受ける

## 比較

| 観点 | 案1 Web Analytics | 案2 直接 SaaS | 案3 Pages Function | 案4 Analytics Engine | 案5 OTel + 受信用 Worker |
| --- | --- | --- | --- | --- | --- |
| §12 の指標 | 測れない | 測れる | 測れる | 測れる | 測れる |
| 処理時間の trace | 無し | あり | あり | 作り直し | あり |
| 送る属性を絞る場所 | 無し（URL を記録） | ブラウザだけ | サーバー | サーバー | サーバー |
| 送信先を後で選ぶ | 不可 | 不可 | 可 | 不可（AE に固定） | 可 |
| ADR-1990 決定 5 | 抵触しない | 抵触しない | 例外が要る | 抵触しない | 抵触しない |
| 新しく維持する面 | 無し | 無し | Function 1 本 | Worker 1 つ | Worker 1 つ |

## Related TPLs

- [TPL-3612](../test-perspectives/TPL-3612-single-build-capability-checked-in-every-output.md)（本 PR で起こす proactive TPL）: 送信は Pages の SPA にだけ載せる。serve・VS Code の webview・nest の viewer の成果物に送信先の host と SDK が無いこと、Pages の成果物にあることを、両方向で検査する
- [TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md): 受信用 Worker はインターネットから任意の body を受け取る。Origin・サイズ・形を検査してから扱う。実装 PR で `known_consumers` に受信用 Worker を足す
- [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md): 集めるものを書いた文書と、Worker の許可リストを機械で突き合わせる（ADR-1996 の `nest-retention-policy-sync.test.ts` と同じ形）

## 現時点の方針

**案5 を採用する。** §12 の指標を測れて、処理時間の trace も同じ形で取れ、送信先を決めずに始められるのは案5 だけである。送る属性を絞る検査をサーバー側に置けるのも、モデルの中身を送らないという制約に対して重い。維持する面が 1 つ増えることは、nest と同じく別 Worker として織り込む。

### ユーザーを識別しないための決め事

| 扱い | 決め事 |
| --- | --- |
| 1 回の訪問の束ね方 | 訪問ごとに作る trace id をメモリにだけ持つ。localStorage にも cookie にも書かない。タブを閉じれば消える |
| ツアーが再読み込みをまたぐとき | 新しい訪問として数え、ツアーのステップの span に `resumed: true` を付ける。開始時刻を保存して訪問をつなぐことはしない |
| 数値の属性 | ノード数・エッジ数は 2 の累乗の幅（`1-2`、`3-4`、`5-8`…）に丸める。正確な数は特定の共有モデルの目印になりうる |
| Worker のログ | 構造化ログに IP と User-Agent を書かない。invocation log（リクエストのメタデータの自動記録）は設定で切る |
| 国 | 記録しない。`request.cf.country` は使えるが、§12 の指標に要らない |

### tracer provider をグローバルに登録しない

OTel の通常の使い方は、入口で `provider.register()` を呼んでグローバルに登録する形である。本設計ではこれをしない。グローバルに登録すると、`@anthropic-ai/sdk` が Chat の呼び出しの span を作る（ADR-3381）。Chat のプロンプトにはモデルが入る。

代わりに、Pages の入口（`src/main.tsx`）で provider を作り、app の中の小さなモジュール（例: `src/telemetry/usage.ts`）にだけ渡す。計測する側のコードはこのモジュールの関数を呼ぶ。provider が渡されていなければ何もしない。serve・VS Code・viewer の入口は provider を渡さないので、何も送らない。Chat のクライアントにも `openTelemetry: false` を渡し、二重に止める。

### イベントの許可リスト（初版）

span 名と属性は Worker の許可リストに載せたものだけを通す。属性の値は列挙値か、丸めた数値に限る。下は §12 から逆算した初版で、実際の値の集合はスライス B でコードから確定する。

| span 名 | 属性 | §12 の指標 |
| --- | --- | --- |
| `app.visit` | `entry`（`welcome` / `deep_link` / `share` / `permalink` / `direct`）、`locale`（`ja` / `en`） | 母数 |
| `welcome.choice` | `choice`（`understand` / `design` / `evolve` / `dismiss`） | Welcome からデモを始める率 |
| `tour.step` | `tour`（`service-split`）、`step`（数値）、`outcome`（`completed` / `skipped` / `left`）、`resumed`（真偽） | 完了率・完了までの時間 |
| `tour.end` | `tour`、`outcome`（`completed` / `abandoned`）、`steps_done`（数値） | 完了率 |
| `view.switch` | `view`（view の種類の列挙） | 2 種類以上の view を見る率 |
| `share.action` | `kind`（共有の操作の列挙） | 共有の操作をする率 |
| `model.render` | `phase`（`parse` / `resolve` / `layout` / `render`）、`nodes`・`edges`（丸めた幅） | 処理時間 |

span の時間はブラウザの時計で測る。完了までの時間は、`tour.step` の span の開始と終了から集計する。

### 受信用 Worker の検査

- 受信口は別のサブドメイン（例: `karasu-telemetry.kompiro.dev`）に置く。nest と同じ custom domain の形にし、`karasu.kompiro.dev` のパスに Worker の route を当てる形は採らない（Pages の custom domain と同じ host でどちらが先に応答するかを確かめる手間に見合わない）。別 origin なので CORS の preflight に答える
- `Origin` が `https://karasu.kompiro.dev` か Pages の preview（`https://<名前>.karasu.pages.dev` の 1 段だけ）に一致しなければ 403。Worker が Origin から `deployment`（`production` / `preview`）を付け、SPA の申告は使わない。集計は `production` だけで行い、preview は送信の確認に使う
- body は上限（例: 64KB）を超えたら 413。OTLP/HTTP JSON 以外は 415
- 許可リストに無い span 名の span を捨て、許可リストに無い属性を落とす。捨てた件数だけを記録する（捨てた中身は記録しない）
- 検査で結論が出せない（JSON が壊れているなど）ときは、通すのではなく捨てる
- Phase 1 では span 1 つを `console.log({ span, attrs, duration_ms, trace })` の 1 行にする。Query Builder で `span` ごとに数え、`trace` で 1 回の訪問を束ねる

### 告知と opt-out

- `docs/policy/app-telemetry.md` に、集めるもの・集めないもの・保持期間・止め方を書く。許可リストと文書を突き合わせるテストを置く（TPL-1296、ADR-1996 の決定 6 と同じ形）
- この文書は `nest-data-handling.md` と同じ「事実の記述」として公開し、privacy policy とは呼ばない。個人データを集めないので、送信の開始を #2691 の法務レビューの完了待ちにしない
- ブラウザが `navigator.globalPrivacyControl === true` または Do Not Track を送っているときは送らない
- アプリの設定に送信を止めるスイッチを置く。この設定だけは localStorage に書く（止めたことを覚えるため。値は真偽だけで、識別子ではない）

### スライス（実装ステップ）

| スライス | 前提 | 独立に出荷できる理由 |
| --- | --- | --- |
| **A** 受信用 Worker と許可リスト | なし | SPA が送らなくても Worker 単体で検査とログの書き込みをテストできる。送る側が無いので、利用者には何も変わらない |
| **B** SPA の計測と告知（Pages の入口だけ） | A | §12 の指標がこの時点で Workers Logs で見える。TPL-3612 の成果物検査と、文書と許可リストの突き合わせはここで着地させる |
| **C** core の処理時間の span | B | `model.render` の段階ごとの時間を足す。core に OTel の依存を足すか、app 側で core の呼び出しを囲むかはこのスライスで決める |
| **D** 送信先への転送（Phase 2） | A | 送信先を選んだ時点で、Worker に転送と secret を足す。SPA は変わらない |

> 各スライスで何ができるようになるか / その時点でまだできないことは、スライスを Issue に起こすときに親 Issue #3612 の `## Slice status` に書く。

### 実装の指針

1. スライス A: 新しい Worker パッケージを作る（nest の `wrangler.toml` を手本に、`workers_dev = false`、custom domain、`[observability] enabled = true`、invocation log を切る）。許可リストは 1 つのモジュールに置き、Worker の検査と文書の突き合わせテストの両方がそこを読む。デプロイは nest と同じく専用の workflow にする
2. スライス B: `src/main.tsx` で provider を作り、OTel Web SDK と exporter は動的 import で遅延読み込みする。サイズの上限は置かず、遅延読み込みする chunk の gzip サイズを PR に記録する。`visibilitychange` で `hidden` になったときに flush する。Chat のクライアントに `openTelemetry: false` を渡す。CSP があれば `connect-src` に受信口を足す
3. スライス B のテスト: TPL-3612 のとおり、4 つのビルドの成果物を走査して、受信口の host と SDK の目印が Pages の成果物にだけあることを検査する。`docs/policy/app-telemetry.md` と許可リストの突き合わせテストを置く
4. AT: `docs/acceptance/` に新規ファイル。TC は:
   - Welcome からツアーを最後まで進めると、`welcome.choice`・`tour.step`・`tour.end` が受信口に届く（受信口をテスト用に差し替えた Playwright で確認する）
   - 共有リンク（`#s=…`）から開いても、送った body に fragment とノード名が含まれない
   - GPC を有効にしたブラウザでは何も送らない
   - `karasu serve` で開いたアプリは何も送らない
5. ADR 昇格: スライス B が終わった時点で `docs/adr/3612-spa-usage-tracing.md` に昇格し、本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: Pages の SPA だけ、遅延読み込みの分のリクエストと送信が増える。serve・VS Code・nest の viewer は変わらない
- ドキュメント更新: `docs/policy/app-telemetry.md`（新規）、README か docs-site の privacy の記述、PRD #3573 §12 の「測れない」の記述
- テスト・examples への影響: 成果物検査のテストが増える。examples は変わらない
