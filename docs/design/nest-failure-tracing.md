# karasu-nest の失敗の扱い — 再実行せずに追跡し、途中から継続する

- **日付**: 2026-08-06
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2379](https://github.com/kompiro/karasu/issues/2379)（provider error detail + unread body）／親 [#1990](https://github.com/kompiro/karasu/issues/1990)
  - 関連 Issue: [#2374](https://github.com/kompiro/karasu/issues/2374)（ストリーミング化）、[#2226](https://github.com/kompiro/karasu/issues/2226)（計測）、[#1994](https://github.com/kompiro/karasu/issues/1994)（quota）
  - 関連 ADR: [ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6、[ADR-1996](../adr/1996-karasu-nest-data-trust.md)（保存してよいものの境界）、[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md)（失敗も枠を消費する）
  - コード: `packages/nest/src/generate/run.ts`, `packages/nest/src/reverse/pipeline.ts`, `packages/nest/src/meter/record.ts`, `packages/nest/src/log.ts`

## 背景・課題

1 回の生成は実測で **約 $3.2**（hato: 入力 465,627 / 出力 32,692 トークン）かかり、失敗しても [ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md) の枠を 1 消費する（返金は Workflow が起動しなかった場合のみ）。にもかかわらず、直近の失敗調査はこうなっている:

- `the model provider returned 400` — どのパスで、なぜ拒否されたかが記録に無い。どのパスで落ちたかは metrics レコードの `passes` を全体値から引き算して特定した
- `The Workers runtime canceled this request because it detected that your Worker's code had hung` — こちらの記録にはどこにも現れない
- 824 → 40 → 47 個のパースエラー — 原因の推定はプロンプトを読んで行い、検証は毎回 $3 の実行だった

**問題は「失敗すること」ではなく「失敗の原因を知る唯一の手段が、もう一度課金して回すこと」である。** 生成は非決定的なので、再実行は同じ失敗を再現するとも限らない。trial and error のループが、費用と時間の両方で成立していない。

本文書は 2 つの問いを扱う。

1. **追跡** — どの失敗クラスがどこまで記録から特定でき、どこで切れているか。「再実行せずに原因に到達する」ための選択肢
2. **継続** — 失敗した実行を、成功した部分をやり直さずに途中から続けられるか

この 2 つは同じコストの裏表である。追跡は「調査に $3.2 を払わない」、継続は「やり直しに $3.2 を払わない」。そして**同じ保存物が両方に効く** — 完了したパスの出力を残せば、それは再開の入力であると同時にローカル再現の入力でもある。

## 現状（インベントリ）

### 処理の流れ

`POST /:owner/:repo/generate` から生成完了までの経路。括弧内は失敗しうる点。

| # | 段階 | 実装 | 失敗の主な形 |
| --- | --- | --- | --- |
| 1 | quota 判定・枠取得・attempt 採番 | `quota/ledger.ts` | 枠切れ / 同時実行中（HTTP 応答で完結、課金なし） |
| 2 | Workflow インスタンス生成 | `generate/dispatch.ts` | `instance.invalid_id` / `already_exists`（refund あり） |
| 3 | `step.do("generate")` 開始（`retries: 0`） | `generate/workflow.ts` | ここから先はすべて 1 回限り |
| 4 | repo 情報取得・tarball 取得・展開 | `github/client.ts`, `github/tar.ts` | 404/403、アーカイブ超過、展開失敗 |
| 5 | redact | `redact/redact.ts` | （失敗しない。件数のみ記録） |
| 6 | reverse: survey → decompose → synthesise | `reverse/pipeline.ts` | provider エラー、出力上限到達、JSON 不正 |
| 7 | prune → compile → repair → prune → compile | 同上 | パース不能、repair でも解消せず |
| 8 | 生成物の structure-only 検査 | `redact/` | 資格情報が生成物に混入 |
| 9 | 公開・状態更新・PR 配送・計測 | `store/`, `deliver/`, `meter/` | KV 書き込み失敗、PR 権限不足 |

**段階 3 以降はすべて 1 つの Workflow step の中にある。** 分割していないのは、パスが個別に再開可能でないこと、および step の戻り値が checkpoint に永続化されてしまい生成物や中間状態が「文書化された保持期間の外」に置かれるためである（[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6）。

### 観測面（いま存在するもの）

| 面 | 何が読めるか | 保持 | 認証 |
| --- | --- | --- | --- |
| `GET /:owner/:repo/status` | `state` / `sha` / `startedAt` / `finishedAt` / `error` / `pullRequest` | 24 時間 | なし |
| KV `metrics/krs/v1/…` | パス別トークン、所要時間、ファイル数、バイト数、redaction 数、モデル名、パース失敗時の診断 | 400 日 | `wrangler` |
| `GET /admin/metrics` | 上記の**集計**（run 単位ではない） | — | `METRICS_TOKEN` |
| `GET /admin/failed/:owner/:repo` | 失敗した `.krs` 本文 | 24 時間 | `METRICS_TOKEN` |
| Workers Logs | `logInfo` のパス別トークン、`logError` の例外 | Cloudflare 設定に従う | dashboard |
| `wrangler workflows instances describe` | step の終了状態と例外 | Cloudflare 保持 | API token |

### 失敗クラスごとの追跡可能性

**これが本文書の中心。** ✓ = 記録から特定できる、△ = 部分的、✗ = 記録に残らない。

| 失敗 | `status.error` | metrics レコード | 失敗文書 | 判定 |
| --- | --- | --- | --- | --- |
| quota 切れ / 同時実行中 | （HTTP 応答で完結） | — | — | ✓ |
| dispatch 失敗 | HTTP 応答 + refund | — | — | ✓ |
| GitHub 404 / 403 | `GitHubApiError` の message | **書かれない** | — | △ |
| アーカイブ超過・展開失敗 | `GenerateFailed` の message | **書かれない** | — | △ |
| provider エラー（400 / 429 / 5xx） | `the model provider returned N` | 成功したパスまで | — | ✗ |
| 出力上限で切断 | `ReverseFailed` の message | あり | — | ✓ |
| 生成物がパース不能 | `ReverseFailed` + エラー件数 | 診断コードあり | あり | ✓ |
| 生成物に資格情報が混入 | `StructureOnlyViolation` | あり | — | ✓ |
| PR 配送失敗 | （生成自体は成功） | あり | — | ✓ |
| **platform による強制終了**（CPU 上限・hang 検出） | **`running` のまま残る** | **書かれない** | — | ✗ |
| SAFE_ERRORS 以外の例外 | `the generation failed` | 条件次第 | — | ✗ |

### 追跡が切れている 5 箇所

1. **provider エラーの理由が落ちている。** `llm.ts` は HTTP エラーの body を捨てる。捨てる判断自体は正しい（body はこちらが送ったプロンプト＝他人のコード由来を引用しうる）が、**固定語彙の `error.type` まで捨てているので全種類の拒否が同じ姿になる**。[#2379](https://github.com/kompiro/karasu/issues/2379) で修正中。

2. **モデル呼び出しの前に落ちると metrics レコードが 1 行も残らない。** `generate/run.ts` の失敗分岐が `if (spent.inputTokens > 0 || spent.outputTokens > 0)` で計測を条件付けており、GitHub 取得・展開・redact の失敗は 24 時間で消える run 状態とログにしか残らない。**400 日保持の記録に「その日 3 回失敗した」という事実自体が無い。**

3. **platform に打ち切られると `catch` に到達しない。** `finally` の枠返却も、`runs.put({state: "failed"})` も、計測も、すべて打ち切られた側にある。残るのは `running` のまま変わらないレコードで、これは [TPL-2288](../test-perspectives/TPL-2288-background-work-platform-ceiling.md) が「沈黙として落ちる」と名指ししている失敗そのもの。今回の hang エラーがこれに当たる。

4. **保持期間が非対称。** 数字は 400 日、理由（run 状態・失敗文書）は 24 時間。**1 週間後には「何トークン使ったか」は分かるが「なぜ失敗したか」は分からない。**

5. **面をまたぐ相関 id が無い。** metrics の鍵は `sha + finishedAt`、run 状態の鍵は `sha`、Workflow インスタンス id は `<installation>-<sha12>-<attempt>`、ログ行にはどれも入っていない。**1 回の失敗を 4 つの面で突き合わせる作業が毎回手作業になる。**

## 制約・前提

- **生ソースは保存しない**（[ADR-1990](../adr/1990-karasu-nest-pivot-server-reverse.md) 決定 6 / [ADR-1996](../adr/1996-karasu-nest-data-trust.md)）。したがって「失敗した入力をそのまま保存して後で再生する」という最も素朴な手段は**取れない**。この制約は本設計の最大の縛りであり、緩めない。
- **生成された `.krs` は保存してよい**（構造のみ。90 日キャッシュ、失敗文書は 24 時間）。**repair パスの入力は生成物から作られるので、この制約の内側にある。**
- ログにリポジトリ由来の文字列を出さない（`log.ts` の規約。型では守られていない）。
- Workflow の step 戻り値は checkpoint に永続化されるので、そこを記録場所に使わない。
- 失敗も課金され、枠を消費する（[ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md)）。**調査手段が「もう一度回す」である限り、調査コスト = 実行コスト。**
- 対象は当面**運用者自身の repo のみ**（ADR-1996 の成立条件）。他人の repo に向けた時点で、ここで足す記録も同じ審査を受ける。

## 検討した選択肢

### A. 記録を厚くする（#2380 の延長）

失敗時に残す情報を増やす。`error.type` の伝搬、失敗パス名、失敗ステージ名、モデル呼び出し前の失敗でも metrics を必ず書く、`running` のまま滞留したレコードの検出。

- 実装は各所に小さく分散。既存の面の形は変わらない
- **再実行を不要にはしない** — 次の失敗の説明は良くなるが、いま起きている失敗の原因は分からない
- 保持期間の非対称（切れ目 4）を直すなら、run 状態か失敗理由の TTL を延ばす判断が要る

### B. 相関 id を全面に通す

1 回の実行に `runId` を振り、run 状態・metrics・失敗文書・ログ行・Workflow インスタンス id のすべてに含める。

- 「4 つの面を突き合わせる」手作業が消える。ログの grep が 1 発になる
- 単独では情報量は増えない。A と組み合わせて初めて効く
- 既存の鍵設計（purge の契約 = 鍵の prefix）を壊さないように、鍵ではなく**値**に持たせる必要がある（[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）

### C. 決定論的なローカル再現ハーネス

失敗の再現に**モデル呼び出しを必要としない**経路を用意する。ローカルで同じ選択ロジック（survey の選択、`maxFilesRead` / `maxBytesRead` の詰め込み、redact、プロンプト組み立て）を回し、**リクエストの形**（サイズ・構造・文字種・max_tokens）を出力する。

- **いま追っている 400 はこれで $0 で切り分けられる可能性が高い。** リクエスト形状に起因する拒否は、モデルを呼ばずにプロンプトを組み立てるところまでで判定できる
- repair パスは特に相性が良い: **入力が生成物（保存してよい）だけから作られる**ので、失敗文書を取得すれば完全に同一のプロンプトをローカルで再構成できる
- 逆に survey / decompose / synthesise はソースが要る。運用者自身の repo なら手元にあるので実行可能だが、**他人の repo では原理的に使えない**
- 実装は `packages/cli` か `scripts/` に置く新しい面。pipeline のプロンプト組み立てを export する必要がある

### D. 失敗文書の対象を広げる

いまは `ReverseFailed`（パース失敗）で `document` を持つ場合だけ保存している。これを **provider エラーで落ちたときの「その時点の生成物」** にも広げる。

- C と組み合わせると repair 失敗の完全再現になる
- 保存するのは生成された `.krs`（構造のみ）なので ADR-1996 の内側。TTL 24 時間も既存どおり
- synthesise パスで落ちた場合はまだ生成物が無いので効かない

### E. Cloudflare AI Gateway のログ

provider とのやり取りを gateway 側で記録する。

- リトライとフォールバックが付随して手に入る
- **ログはデフォルトで request/response の body を保存する**ので、`cf-aig-collect-log-payload: false` が必須（メタデータのみ）。それだと得られるのは所要時間とトークン数で、**すでに自前の metrics が持っている情報**
- body を保存する設定にすればプロンプト（＝他人のコード由来）が Cloudflare に残る。ADR-1990 決定 6 と正面から衝突する
- subprocessor 開示の追記も要る

### F. 現状維持（毎回課金して試す）

- 追加実装ゼロ
- 1 回 $3.2、枠 1 消費。非決定なので同じ失敗が再現するとは限らない
- 他人の repo に開いた後はそもそも使えない（他人の repo で試行錯誤はできない）

## 比較

| 観点 | A 記録を厚く | B 相関 id | C ローカル再現 | D 失敗文書拡張 | E AI Gateway | F 現状 |
| --- | --- | --- | --- | --- | --- | --- |
| いま追っている 400 に効くか | 次回から | 次回から | **今すぐ** | C と組で今すぐ | 次回から | — |
| 調査 1 回のコスト | $3.2 → $3.2 | 変わらず | **$0** | $0（C と組） | $3.2 | $3.2 |
| 決定 6 との整合 | ✓ | ✓ | ✓ | ✓ | **✗**（payload on の場合） | ✓ |
| 他人の repo でも使えるか | ✓ | ✓ | **✗**（ソースが要る） | repair のみ ✓ | ✓ | ✗ |
| 実装量 | 小〜中 | 小 | 中 | 小 | 小（設定） | ゼロ |
| 既存の面を壊すか | 壊さない | 鍵は不変 | 新しい面 | 壊さない | — | — |

**A・B・D は互いに補完的で、C は性質が違う。** A/B/D は「次に失敗したとき記録が自分で説明する」を作り、C は「失敗の再現に課金しない」を作る。前者だけでは今回の 400 は解けず、後者だけでは他人の repo に開いたときに何も残らない。

## 途中から継続する（resume）

### 何を保存すれば再開できるか

各パス境界で「そこから続けるのに必要な状態」を洗い出す。節約量は hato の実測（入力 465,627 / 出力 32,692）に対する比。

| 再開点 | 続けるのに要る状態 | 保存してよいか | 節約される入力 |
| --- | --- | --- | --- |
| survey 後 | 選ばれたファイルパス一覧、提案された contexts | パス一覧は**「読むが保存しない」対象**（`docs/policy/nest-data-handling.md`）。contexts はモデル出力 | 4,345（1%） |
| decompose 後 | 確定した domains、および**同じファイル選択** | 同上。選択の再現にパス一覧が要る | 233,629（50%） |
| synthesise 後 | 生成された `.krs` **のみ** | **すでに保存している**（cache 90 日／失敗文書 24 時間） | 465,627（99.9%） |

**決定的な観察: ソース本文は保存しなくてよい。** 同じ SHA から再取得すれば同じ内容が得られ、再取得のコストはモデル呼び出しゼロ（subrequest 約 13 回）である。**保存が要るのはモデルの出力だけで、それは [ADR-1996](../adr/1996-karasu-nest-data-trust.md) が保存を許している側に寄っている。**

例外が 1 つある。**ファイル選択は survey のモデル出力に依存する**ので、decompose から再開するには「どの 60 ファイルを渡したか」を保存する必要がある。パス一覧は data-handling の表で「保存しない」に分類されており、ここが唯一の衝突点になる。

結論として、**repair からの再開は保存の制約に一切触れず、しかも節約が最大**（99.9%）で、実測上いま最も高頻度に落ちている地点でもある。decompose からの再開は data-handling の変更を伴う。

### 実装の選択肢

**R1. Workflow の step を分割し、platform の再開に任せる。** step 単位でリトライ・再開が効く。ただし step の戻り値は checkpoint に永続化されるので、survey / decompose の戻り値（パス一覧を含む）が Cloudflare 側の保持に乗る。**「消せる」の契約が我々の purge で完結しなくなる**ため、決定 6 と正面から衝突する。生成物（`.krs`）だけなら既に 90 日保存しているので二重にはならないが、そこだけ分けても上流の step が残る。

**R2. 完了したパスの出力を自前ストアに置き、再 POST が最遠の完了点から再開する。** 保存先・TTL・purge が既存の枠組みに乗る（[TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md)）。再 POST という復旧経路は `retries: 0` の設計が既に前提にしている。「どこまで進んだか」は run 状態に持てる。汎用だが、上の衝突点（パス一覧）を踏む。

**R3. 失敗した生成物からの repair だけを別経路にする。** `POST /:owner/:repo/repair` のような形で、失敗文書（24 時間保持）を入力に repair パスだけを回す。汎用の再開ではないが、**保存物が既に存在し、制約に触れず、実測で最頻の失敗点をカバーし、コストは約 $0.1**。第 2 段階のローカル再現（案 C/D）と入力が完全に同じなので、実装も共有できる。

### 波及する決定

1. **quota。** [ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md) は「生成 1 回 = 1 枠」。$0.1 の repair 再開に丸ごと 1 枠を課すのは水準の根拠（1 回 $3.60 の構造的上限）と釣り合わない。枠の単位を「生成」から「支出」に寄せるか、再開を無料扱いにするかの判断が要る
2. **`retries: 0`。** この設定の根拠は「リトライは請求済みパイプラインを丸ごと再実行する」だった。再開可能になれば前提が変わり、**リトライ方針を全部か無かから比例的なものに見直せる**
3. **汚染された中間状態。** decompose の出力自体が誤っている場合、再開はその誤りを毎回引き継ぐ。**full re-run を強制する経路**（`?fresh=true` 等）が必ず要る

## 現時点の方針

**段階を分ける。**

**第 1 段階 — 記録が自分で説明する（A の最小セット）。** [#2380](https://github.com/kompiro/karasu/pull/2380) が `error.type` の伝搬と `failedPass` の記録を入れている。これに続けて、**モデル呼び出し前の失敗でも metrics を書く**（切れ目 2）ことを足す。「その日 3 回失敗した」が 400 日側の記録に残らないのは、コスト記録としても穴になっている。

**第 2 段階 — 再現に課金しない経路（C + D）。** repair パスから着手する。理由は 3 つ:

1. 入力が生成物だけから作られるので、**保存の制約に一切触れない**
2. 失敗文書の仕組みが既にあり、対象を広げるだけで完全な再現入力になる（D）
3. いま追っている 400 が、まさに repair パスで起きている

survey / decompose / synthesise のローカル再現は、運用者自身の repo に限定した開発用ツールとして後続で検討する。

**第 2 段階（続き） — repair からの再開（R3）。** 案 C/D と**入力が同一**なので同じ実装で両方が手に入る。ローカル再現は「失敗文書を取ってきてプロンプトを組み立てる」、再開は「同じプロンプトをサービス側で実行する」で、違いは実行者だけである。99.9% を節約し、保存の制約に触れず、いま最も落ちている地点を直接カバーする。

**第 3 段階 — 相関 id（B）。** 面が増えてから入れるほうが、通すべき面が確定していて手戻りが少ない。

**第 4 段階（要判断） — decompose からの汎用再開（R2）。** 節約は 50% だが、ファイル選択の保存が data-handling の「パス一覧は保存しない」と衝突する。**先に第 2 段階まで入れて、repair 再開でどれだけ救えるかを実測してから**、この衝突を押す価値があるか判断する。

**採らないもの（追加）:**

- **R1（Workflow step の分割）** — step 戻り値の checkpoint 永続化により、保持と削除の契約が Cloudflare 側に分裂する。決定 6 の「uninstall = purge」が我々のストアだけで完結しなくなるのは、可用性の利便と引き換えにしてよい性質ではない

**採らないもの:**

- **E（AI Gateway のログ）** は、payload を保存しない設定では自前 metrics と情報が重複し、保存する設定では決定 6 と衝突する。リトライ・フォールバックの層としては別途価値があるが、**それは可観測性の解ではない**ので本文書の対象から外す
- **platform 強制終了（切れ目 3）の根本対処**は本文書の範囲外。`running` のまま滞留したレコードを検出する仕組みは第 1 段階に含めるが、打ち切られないようにするのは [TPL-2288](../test-perspectives/TPL-2288-background-work-platform-ceiling.md) の観点で別に扱う

## Related TPLs

- [TPL-2288](../test-perspectives/TPL-2288-background-work-platform-ceiling.md) — 非同期実行の器は、実測した所要時間に対して器の上限を先に確かめる。切れ目 3（`running` のまま滞留）はこの観点が予告した失敗そのもの
- [TPL-2374](../test-perspectives/TPL-2374-long-call-bounded-by-silence-not-duration.md) — 分単位の外部呼び出しは総所要時間ではなく無通信で打ち切る
- **TPL-2379**（[#2380](https://github.com/kompiro/karasu/pull/2380) で起票中） — 再現に実費がかかる処理の失敗記録は、再実行なしで原因が分かるだけの情報を持つ。本文書は、その観点をこのサービス全体に適用した結果である
- [TPL-2226](../test-perspectives/TPL-2226-every-key-prefix-must-be-purgeable.md) — 新しい prefix を足すなら purge に配線する。第 1・2 段階で記録を増やすとき必ず通る
- [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md) — 記録は記録より長生きするアドレスを指す。切れ目 4（保持期間の非対称）は同型の問題

## 決めたこと

未解決だった 7 点は解消した。以下が実装の前提になる。

| # | 論点 | 決定 | 理由 |
| --- | --- | --- | --- |
| 1 | 失敗理由の保持 | **`runs/` の TTL は 24 時間のまま。caller-safe な失敗理由を metrics レコード（400 日）に足す** | 恒久記録が 1 本にまとまり、`docs/policy/nest-data-handling.md` の保持期間表を書き換えずに済む。metrics は既に `failedPass` と `diagnostics` を持つので、置き場としても自然 |
| 2 | ローカル再現ハーネスの置き場 | **`scripts/` の開発用** | nest のプロンプト組み立てを公開 API にしない。ADR-1996 により当面の対象は運用者自身の repo だけで、配布価値がまだ無い。後から CLI に出すことはできるが逆は難しい |
| 3 | `running` 滞留の検出 | **status ルートが `startedAt` からの経過で判定し、超過していれば interrupted として返す** | 追加インフラゼロ。cron trigger という新しい実行面を増やさない |
| 4 | 失敗文書の保存対象 | **provider エラー時の生成物まで広げる** | repair 再開とローカル再現の両方の入力になる。保存するのは構造のみの `.krs` で決定 6 の内側 |
| 5 | 再開と quota | **本文書では決めない。[別 Issue](#別-issue-へ切り出したもの) へ** | 下記のとおり、論点が repair 再開ではなく quota の存在意義そのものだったため |
| 6 | 再開の入口 | **`METRICS_TOKEN` で守る admin 経路**（`POST /admin/repair/:owner/:repo`） | `GET /admin/failed` と同じ認証・同じ利用者。運用者専用のデバッグ経路になるので、quota 回避の抗弁が成立せず論点 5 に依存しない。将来 admin から公開へ降ろすことはできる |
| 7 | 失敗文書の TTL | **7 日に延ばす** | 再開の入力になる以上、失敗に気付いてから叩くまでの時間がそのまま制限になる。週末を挟んでも間に合う。生成物キャッシュ自体が 90 日なので保持の説明とも矛盾しない |

### 別 Issue へ切り出したもの

**quota は、いまの運用形態に対して過剰である。** [ADR-1994](../adr/1994-karasu-nest-free-tier-quota.md) の月 3 回という水準は「サービスが推論費を負担し、複数の installation が使う」前提で導かれている。しかし現在は**運用者と利用者が同一人物**で、支出を止める主体と支出する主体が同じである。この状態では quota は支出を守っておらず、開発の摩擦にしかなっていない（実際、本日 KV のカウンタを手で消して枠を戻す作業が発生している）。

karasu-nest を deepwiki のような公開サービスにする時点で、利用者からのリクエストを quota で縛る必然性は戻る。**したがって撤廃ではなく、「いまは効かせない」判断と、その復活条件を別途決める**。本文書の範囲外とし、Issue に切り出す。

論点 5（repair 再開が枠を消費するか）は、論点 6 で admin 経路に決めた時点で実務上は消えている — 叩けるのは運用者だけなので、枠を回避する抗弁が成立しない。
