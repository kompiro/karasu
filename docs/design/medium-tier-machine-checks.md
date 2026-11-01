# Medium の PR を機械の検査で支える：段階の規則の追加と、refactor・fix・描画の変化の判定

- **日付**: 2026-11-01
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3505](https://github.com/kompiro/karasu/issues/3505)
  - 関連 ADR: [ADR-3286](../adr/3286-risk-based-review-tiers.md)（リスク段階。本設計はその規則と Review tier の検査を足す）、[ADR-3359](../adr/3359-pr-before-after-screenshots.md)（`pnpm pr:shots`。描画の比較を流用する）、[ADR-3011](../adr/3011-skip-coderabbit-label.md)（判断を含む基準を Claude だけで適用しない）、[ADR-953](../adr/953-ci-docs-only-paired-stub-workflow.md)（paired stub）、[ADR-2643](../adr/2643-stacked-pr-workflow.md)（draft で分単位の job を走らせない）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本 PR で観点を足す）、[TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)、[TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)、[TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)、[TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)
  - コード: `scripts/review/tier.ts`、`scripts/review/local-review-record.ts`、`scripts/pr-shots/`、`.github/workflows/review-tier.yml`

## 背景・課題

ADR-3286 で、`risk: medium` の PR には CodeRabbit が回らなくなった。人間に届くまでに目を通すのは
`/engineering:code-review` と CodeRabbit CLI だけで、その記録は自己申告である。Review tier が検査するのは
記録の形式と鮮度だけになる。

2026-11-01 に Medium の PR で人間が何を見ているかを整理し、メンテナが次のように決めた（#3505）。

| 観点                                     | メンテナが見ているもの                                           | 本設計での扱い                                 |
| ---------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| refactor                                 | 既存のテストが落ちないこと、行数などが変わるだけで等価であること | 機械で判定する                                 |
| bug 修正                                 | バグが直ったことを確かめるテストが足されていること               | 機械で判定する                                 |
| 描画やレイアウトの挙動の変更             | 使い勝手に関わるので、必ずレビューして動作を確かめる             | 機械で見つけてラベルを付ける。確認は人間が行う |
| Summary と差分の一致、記録の対応の妥当性 | 見ていない（AI のレビューで直っているとみなす）                  | 何も足さない                                   |

あわせて、Medium の範囲に 2 つの穴があった。

- **セキュリティの境界に触れる変更が Medium になる。** #3419 と #3500（`karasu serve` のファイルアクセス、
  `/render?src=` の SSRF）はどれも Medium だった。段階とは別に `/security-review` を当てる対象は
  `packages/nest/**` と workflow だけである
- **言語の挙動を変える変更が、`docs/spec/**` を変えなければ Medium になる。** spec を変えると High になるので、
  spec の更新が要るはずの parser の変更ほど Medium で通りやすい

メンテナの決定は、セキュリティの境界と言語の挙動の変更を High にすること、それ以外は Medium のままにして、
機械で確かめられるものは機械で確かめることである。

## 現状（インベントリ）

| 観点                                               | 現状                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 段階の分類器（`tier.ts`）                          | パスで決める。High のパスを最初に照合し、Low のパターン（新しいテストファイルなど）より優先する。どの規則にも当たらないパスは Medium。作成者が信頼リストにいなければ High                                                                                                                |
| Review tier（`review-tier.yml`）                   | install なしの `node` で数秒。base 側の分類器を動かす。draft でも走る。`edited`（タイトルと本文の変更）・`labeled` などで走り直す。権限は `contents: read` と `pull-requests: read`                                                                                                      |
| ローカルレビューの記録（`local-review-record.ts`） | PR 本文の節を読み、形式・`head`・対応の有無を検査する                                                                                                                                                                                                                                    |
| `securityReview`                                   | `packages/nest/**`・`.github/workflows/**`・`.github/actions/**` のときに true。段階は変えない                                                                                                                                                                                           |
| `pnpm pr:shots`（ADR-3359）                        | merge-base を worktree に checkout し、両側の `packages/core` を 1 プロセスで描画して SVG の文字列を比べる。対象は examples のエントリと、変わった AT の `krs` fence で、各ビュー（system / deploy / org）の root だけ。ローカルでだけ動く。描画が決定的であることはテストで固定している |
| 描画の網羅的な比較                                 | 仕組みは無い。#3502 では subagent が手作業で 543 view（全 examples と renderer の fixture。root、各 system、1 段の drill-down。ungrouped と、team と boundary の group-by）を比べた                                                                                                      |
| path filter 付きの required check                  | E2E が `e2e.yml` と `e2e-skip.yml` の paired stub で、フィルタから外れた PR にも check を報告する（ADR-953、TPL-1480）                                                                                                                                                                   |

## 制約・前提

- **Review tier は install しない。** 描画の比較は base と head の両方で core を動かすので数分かかり、Review tier に入れると「draft でも走る、数秒の check」という性質が崩れる
- **判定に使うコードは base 側のものにする**（TPL-3286）。PR が書き換えた比較のスクリプトで、その PR 自身を判定しない
- **PR のコードを動かす job には書き込みのトークンを持たせない。** 描画の比較は head の core を実行する
- **想定する相手**：信頼リストにいない作成者の PR は、分類器が常に High にする。`refactor` の例外も `rendering-change` のラベルも、効くのは信頼リストの作成者（メンテナと Claude のセッション）の PR だけである。比較の偽装で守るべきなのは悪意ではなく事故（head のコードが比較を壊すこと）である。外部の PR は自分の artifact の中身を決められるが、ほかの PR のラベルを変えられないことは守る（3）
- **作成者が書く宣言（タイトルの型、本文の理由の行）で検査が軽くなる規則は、宣言が偽りでも厳しい側に倒れる形にする。** ADR-3011 は、判断を含む基準を Claude の判断だけで適用することを却下している。宣言で軽くなる場合は、機械の検査がその宣言を裏付けるときだけにする。例外は本文の理由の行（`No test:` / `Test change:`）で、裏付ける検査は無い。メンテナが理由の行で通すと決めたので受け入れ、check の summary に一覧を出して人間に見えるようにする
- **描画の比較は、パッケージに触れる PR だけで走らせる**（メンテナの決定）。required にするので paired stub を置き、フィルタの一覧を両側でそろえる
- **対象外**：PNG のピクセル比較（ADR-529 で見送り）、drill-down の 2 段目より深い view、VS Code の webview、本番でしか起きない描画の差

## 検討した選択肢

論点ごとに並べる。各論点の採用案は「現時点の方針」にまとめる。

### 論点 1：言語の挙動の変更をどう High にするか

- **案 1a：パスで常に High。** 単純で取りこぼしが無い。ただし parser の分割（#3441）のような挙動を変えない refactor も、すべて CodeRabbit のラウンドを通る
- **案 1b：パスで High。ただしタイトルが `refactor` の PR は Medium にし、等価の検査が落ちたら PR を落とす。** refactor の宣言が偽りなら等価の検査が落ちるので、宣言によって軽くなるのは機械が裏付けたときだけになる。取りこぼすのは、比較の範囲（examples と AT の fence）に現れない挙動の変化だけである
- **案 1c：描画の比較の結果そのもので段階を決める。** 比較の範囲の外の変化は「変化なし」と判定され、軽い側に倒れる（TPL-3286 に反する）

### 論点 2：refactor の等価をどこで検査するか

- **案 2a：Review tier に入れる。** install が要り、上の制約に反する
- **案 2b：別の required check（`Render equivalence`）にする。** 比較の結果は check の成否で表す。Review tier は差分だけで判定できる部分（既存テストを弱める変更）を受け持つ
- **案 2c：`pnpm pr:shots` をローカルで実行し、結果を記録に書く。** 自己申告になる

### 論点 3：描画の変化を見つけたらどうするか

- **案 3a：`rendering-change` ラベルを付けるだけで、マージは止めない**（メンテナの決定）
- **案 3b：Manual Verification Checklist に動作確認の項目がチェック済みで入るまで、Review tier を落とす。** 確認を忘れたままのマージは防げるが、運用が重くなる
- **案 3c：描画に効くパスで判定する。** ADR-3359 が却下している。一覧の更新漏れを検出できない（TPL-2446）

### 論点 4：bug 修正にテストを求める範囲

- **案 4a：タイトルが `fix` の PR。** 単純だが、`feat` や `chore` と書けば外れる
- **案 4b：`bug` ラベルの Issue を Closes で閉じる PR。** 作成者の宣言に依らないが、Issue の無い修正は外れる
- **案 4c：4a か 4b のどちらかに当たる PR**（メンテナの決定）

### 論点 5：既存のテストを弱める変更の扱い

- **案 5a：どの PR でも落とす。** bug 修正で期待値を変えるのは正当なことが多く、#3435 のように廃止した API のテストを消す PR もある
- **案 5b：refactor では落とし、それ以外の PR は本文に `Test change: <理由>` の行があれば通す**（メンテナの決定）。#3435 は `refactor` だが、廃止した API のテストを消して呼び出しを書き換えており、挙動を保つ変更ではない。この形の PR は型を `refactor` 以外（廃止なら `feat!` や `chore`）にして `Test change:` を書く
- **案 5c：refactor では落とし、それ以外は検査の summary に一覧を出すだけにする**

### 論点 6：ラベルをどの仕組みで付けるか

- **案 6a：比較の job に `pull-requests: write` を持たせる。** PR のコードを実行する job に書き込みのトークンが渡る
- **案 6b：比較の job は結果を artifact に残し、`workflow_run` で起動する別の workflow がラベルを付ける。** ラベルを付ける側は PR のコードを checkout せず、artifact は固定の schema の JSON として読む
- **案 6c：`review-request.yml`（`pull_request_target`）に足す。** 比較の完了を待つ手段が無い

## 比較

| 論点 | 採用 | 主な理由                                                                 |
| ---- | ---- | ------------------------------------------------------------------------ |
| 1    | 1b   | refactor で CodeRabbit の枠を使わず、宣言が偽りなら等価の検査が落とす    |
| 2    | 2b   | Review tier の性質を保つ。比較は base 側のスクリプトで行う               |
| 3    | 3a   | メンテナの決定。描画の変化は人間が必ず見るので、見つけることに機械を使う |
| 4    | 4c   | メンテナの決定。タイトルと Issue のどちらか一方を偽っても外れない        |
| 5    | 5b   | メンテナの決定。refactor の等価には既存テストを変えないことが含まれる    |
| 6    | 6b   | PR のコードを動かす job に書き込みの権限を渡さない                       |

## Related TPLs

- [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)：段階の判定は最終の差分で、規則に当たらない入力は厳しい側に倒す。本 PR で、作成者の宣言（タイトルの型・理由の行）で検査が軽くなる規則についての失敗モードとチェック項目を足す
- [TPL-1480](../test-perspectives/TPL-1480-consistency-check-triggers-on-both-sides.md)：`Render equivalence` と skip stub のフィルタを両側でそろえる。比較のスクリプト自身の変更でも起動させる
- [TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md) / [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)：比較の対象は列挙せず、全 examples と全 AT の fence を走査する
- [TPL-2643](../test-perspectives/TPL-2643-skip-reports-success-without-running.md)：draft で skip する job は、`ready_for_review` でも起動させる

## 現時点の方針

**段階の分類器に「セキュリティの境界」と「言語の挙動」の規則を足す。Review tier には、fix のテストと既存テストを弱める変更の検査を足す。描画の比較は新しい required check `Render equivalence` にまとめ、refactor の等価の判定と `rendering-change` ラベルの両方に使う。**

### 1. 段階の規則

分類器に下の表の規則を足す。テストファイル（`*.test.ts(x)`・`*.spec.ts`）は表のすべての規則から外し、
従来どおり新しいファイルなら Low、既存のファイルの変更なら Medium にする。テストを足すだけで High になる形を避けるためで、
既存のテストの変更は 4 で検査する。ただし、セキュリティの境界のテストファイル（下の一覧のディレクトリやファイル名に対応するテストファイル）で
既存の行を消す変更は High にする。SSRF や symlink の回帰のテストを、理由の行だけで消せないようにするため

| 規則               | パス                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 段階                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| セキュリティの境界 | `packages/nest/**`、`packages/cli/src/{serve,render-*,node-fs,path-arg,watcher}*`、`packages/core/src/fs/**`、`packages/vscode/src/{message-validation,webview-html,host-files}*`、`packages/vscode/src/preview-panel.ts`（`openExternal`）、`packages/core/src/renderer/svg-builder.ts`（SVG のテキストと属性のエスケープ。app は出力を `dangerouslySetInnerHTML` で差し込み、nest と webview は信頼できない `.krs` を描く）、`packages/app/src/utils/inline-share.ts`（URL の payload を復号する）、`packages/app/src/components/{ChatPane,NodeDetailPanel,EdgeDetailPanel}.tsx`（DOMPurify と `dangerouslySetInnerHTML`） | 常に High                                        |
| 言語の挙動         | `packages/core/src/{lexer,parser,resolver,spec,style,formatter,annotations}/**`、`packages/core/src/language-version.ts`、`packages/core/src/builtins/default-style.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                      | High。PR のタイトルの型が `refactor` なら Medium |
| 言語の挙動（LSP）  | `packages/lsp/src/diagnostics*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 常に High（比較が LSP の変換を見ないため）       |

- **`refactor` の例外は、そのパスのすべての出力を 2 の比較が見る場合に限る。** `style/` の `tidy-style` の出力と、`spec/operations.ts` が効く matrix view は、2 の比較に足す。比較が見ない出力を持つパスは例外から外す（LSP の行がその例）
- **パスの一覧に加えて、差分の中身でもセキュリティの境界を判定する。** 足した行か消した行に `dangerouslySetInnerHTML`、`innerHTML`、`DOMPurify`、`openExternal`、`eval(`、`new Function` を含む PR は High にする。一覧に無い新しいファイルに危ない出口を足しても、一覧の更新を待たずに拾える（TPL-2446）
- `securityReview` の対象にも、セキュリティの境界の一覧を足す
- タイトルは Review tier の `edited` で読み直すので、タイトルを `refactor` から変えれば段階も変わる
- 比較のスクリプト（`scripts/pr-shots/**` と新しい比較のディレクトリ）を、レビューの仕組みとして High の一覧に足す

### 2. `Render equivalence`（新しい required check）

base と head で、次の範囲を描画して比べる。

- **入力**：`examples/` の全エントリと、全 AT の `krs` fence（変わった fence だけではない）
- **view**：root（system / deploy / org）、各 system、system の下の 1 段の drill-down。それぞれを ungrouped と、team と boundary の group-by で描く（#3502 で手作業で比べた範囲）
- **比べるもの**：SVG の文字列、ファイルごとの診断（code・位置・メッセージ）の一覧、`karasu fmt` と同じ整形の出力。parser の refactor は描画を変えずに warning だけを変えうる。`formatter/` を `refactor` の例外に入れるので、整形の出力も比べる。`.krs.style` の入力には `tidy-style` の出力を、`usecase` を持つ入力には matrix view を足す
- **入力は merge-base と head の和集合**にし、各入力は両側とも同じ中身を使う（head にあれば head の中身、head で消えていれば merge-base の中身）。`pr:shots` は各側のファイルを読むが、ここで比べたいのはコードの差だけなので揃える。examples に触れる refactor でも落ちず、example を消した refactor でもその入力の比較は残る

判定は次のとおりとする。

| PR                        | 比較の結果 | check                                       |
| ------------------------- | ---------- | ------------------------------------------- |
| タイトルの型が `refactor` | 差が無い   | 成功                                        |
| タイトルの型が `refactor` | 差がある   | 失敗。差のある view の一覧を summary に出す |
| それ以外                  | どれでも   | 成功（描画の差は 3 のラベルで知らせる）     |

「差」は結果の違いで数える。両側が同じ SVG、または両側が同じ診断で描画に失敗したなら差は無い。片側だけ失敗した、失敗の診断が違う、SVG・診断・整形の出力のどれかが違う、のどれかなら差がある。AT の fence には、単独では解決できない `import` を持つもの（AT-0068、AT-0069、AT-1580）があり、両側で同じく失敗するのでこれで差にならない。ラベル（3）も同じ「差」で付ける

比較そのものが失敗したとき（install、worktree の用意、スクリプトのエラー）は、タイトルの型が `refactor` なら check を落とし、それ以外の PR では check を通して「比較できなかった」を artifact に書く。3 はこれを差があるものとして扱い、ラベルを付ける

- **比べる両側は、PR の head のコミットと、head と base の merge-base** にする（`pr:shots` と同じ）。base の先端と比べると、main が進んだだけで refactor の PR が落ちる
- **比較を動かすスクリプトは base 側のもの**にする。base を checkout して比較のスクリプトを取り、両側の core を**それぞれ別の子プロセス**で動かし、直列化した結果を base 側の親プロセスが比べる（`pr:shots` の `base-worktree.ts` / `render-side.ts` を流用する）。同じプロセスで head の core を import すると、head のコードがグローバルや `fs`・`process.exit` を書き換えて判定を変えられる。子プロセスには `GITHUB_ENV`・`GITHUB_OUTPUT`・`GITHUB_STEP_SUMMARY` などを渡さず、判定は親プロセスの終了コードで決める。base にまだスクリプトが無いあいだ（このスクリプトを足す PR）だけ head のものを使う（`review-tier.yml` と同じ扱い）
- **起動の条件**：`packages/**`、`pnpm-lock.yaml`、ルートの `package.json`、比較のスクリプト、この workflow 自身に触れる PR。外れた PR には skip stub（`render-equivalence-skip.yml`）が成功を報告する。フィルタの一覧は両方の workflow でそろえ、ずれをテストで検出する（TPL-1480）
- **draft では skip** し、`ready_for_review` で走らせる。`scripts/ci/workflow-draft-gate.test.ts` の `DRAFT_GATED_JOBS` と `docs/process/stacked-pr.md` の一覧を同じ PR で更新する。`.claude/rules/stacked-pr.md` は ADR-2643 の更新も求めるが、ADR の本文は書き換えない（ADR-2687）。job は ADR-3505 に記録し、ルールとの食い違いは [#3517](https://github.com/kompiro/karasu/issues/3517) で直す
- **タイトルの変更（`edited`）でも走らせる。** 判定がタイトルの型に依るので、`feat` で ready にして成功を得た後に `refactor` へ書き換えると、前の成功が残る（TPL-3286 に足した観点）。`edited` は本文の変更（記録の更新）でも起きるが、job-level の `if:` で本文だけの変更を skip しない。skip した run は同じ SHA の成功として前の失敗を上書きする（TPL-2643）。本文の変更のたびに数分の比較が走るのは受け入れ、`concurrency` で同じ PR の古い run を取り消す
- 権限は `contents: read` だけにする。checkout は `persist-credentials: false`、install は `--ignore-scripts` にする。結果（差のある view の数と一覧）を artifact に残す
- skip stub の workflow 名は `Render equivalence (skip)` にし、check の名前（job 名）だけを揃える。3 の `workflow_run` は workflow 名で起動するので、stub では起動しない

### 3. `rendering-change` ラベル

- `workflow_run`（`Render equivalence` の完了）で起動する workflow が、artifact の JSON を読む。差が 1 つ以上あれば `rendering-change` を付け、無ければ外す。PR のコードは checkout しない
- 権限は `actions: read`（artifact を読む）と `pull-requests: write`（ラベル）だけにする
- `workflow_run` は workflow の名前で起動するので、PR が同じ名前の workflow を足しても起動する。`workflow_run.path` が `.github/workflows/render-equivalence.yml` で、`workflow_run.event` が `pull_request` のときだけ動く
- artifact は起動した run（`workflow_run.id`）のものだけを読み、数値と固定の形の文字列だけを取り出して、ほかの値は捨てる。ラベル以外の操作はしない
- PR を引けない、いまの head と一致しない、run が skip された（draft）、のどれかなら、ラベルは変えない
- skip されずに終わった run で、artifact が無い・2 つ以上ある・形が崩れている、のどれかなら、比較できなかったものとしてラベルを付ける（軽い側に倒さない）
- **PR の番号は artifact から読まない。** artifact は PR のコード（head の core）を動かした job が書くので、作成者が中身を決められる。PR は `workflow_run.head_sha`（と head のリポジトリ・ブランチ）から引き、その PR のいまの head が `workflow_run.head_sha` と一致するときだけラベルを変える。fork の PR では `workflow_run.pull_requests` が空になるので、この引き方が要る。古いコミットの run が遅れて終わっても、ラベルを古い結果に戻さない
- マージは止めない。メンテナはこのラベルの PR を必ずレビューし、preview で動作を確かめる
- パッケージに触れない PR（examples や AT だけの変更）は比較が走らないのでラベルが付かない。この場合は従来どおり `pr:shots` のフックが before/after を促す

### 4. Review tier に足す検査

どちらも差分と PR の本文・タイトル・紐付いた Issue だけで判定でき、install は要らない。

**fix のテスト**：次のどちらかに当たる PR は、テストケースの追加を求める。

- タイトルの型が `fix`
- `closingIssuesReferences`（GraphQL）か、本文の `Closes #N` / `Fixes #N` に `bug` ラベルの Issue がある。base が `main` でない stacked PR では `closingIssuesReferences` が空になるので、本文も読む。読むために workflow の権限に `issues: read` を足す。Issue に後から `bug` を付けても Review tier は走り直さない。PR 側のイベント（push・本文の編集）で次に走ったときに効く

テストケースの追加とは、新しいテストファイル、既存のテストファイルに足した `it(` / `test(`（`.each` を含む）の行、既存の `.each([...])` の表に足した行、またはディレクトリを読むテストが拾う入力の追加（`examples/` の新しいエントリ、renderer の fixture、AT の新しい `krs` fence）を指す。
テストを書く面が無い修正（lint や CI の修正など）は、本文の `No test: <理由>` の行で通す。どの段階の PR にも適用する。

**既存のテストを変える変更**：base にあるテストファイルの変更を、assert のパターンを数えずに判定する。パターンの一覧では、整形で別の行に折り返した matcher（`).toBe(` だけの行）や、同じ内容で何度も現れる assert の移動を見分けられない（`tier.ts` も、既存のテストファイルへの追加だけを Low にする案を同じ理由で却下している）。

- **タイトルの型が `refactor` の PR**：既存のテストファイルで許す変更は、import の文（複数行にまたがる `import { … } from` を 1 つの文として読む）の追加・削除・書き換えと、消した行と足した行が同じ位置で対になり、コメントか、モジュールのパスやファイル名の文字列（import の specifier と、`.ts` / `.tsx` / `.js` で終わる文字列）だけが違うものに限る（#3451 はコメントの中のファイル名を張り替えた）。それ以外の変更と、テストファイルの削除は落とす。分割の refactor で起きるのは import とパスの張り替えで（#3462 の `baseline-portability.test.ts` など）、これは通る
- **それ以外の PR**：既存のテストファイルで import 以外の行を 1 行でも消した、テストファイルを削除した、または `.skip` / `.fixme` / `.todo` / `.only` / `skipIf` / `runIf` や単独の `return` の行を足したなら、本文の `Test change: <理由>` の行を求める。新しいテストケースを足すだけの変更は追加だけなので、理由は要らない

`No test:` と `Test change:` の行で通した PR は、check の summary に理由と一緒に一覧を出す。

### refactor の等価の定義

タイトルの型が `refactor` の PR は、次がすべて成り立つときに等価とみなす。

1. 既存のテストがすべて通る（CI の test job）
2. 既存のテストファイルを、import とパスの張り替えのほかに変えていない（4。Review tier）
3. 全 view の SVG・診断・整形の出力が base と同じ（2。`Render equivalence`）

行数・ファイルの分け方・import のパスの変更は、この 3 つを崩さないかぎり自由である。

### スライス（実装ステップ）

| スライス                                                                                                  | 前提 | 独立に出荷できる理由                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** 段階の規則（1）と Review tier の検査（4）（[#3508](https://github.com/kompiro/karasu/issues/3508)） | —    | 差分だけで判定でき、install も新しい workflow も要らない。言語のパスの `refactor` の例外は、B が入るまで「`refactor` でも High」として出す（厳しい側に倒しておく） |
| **B** `Render equivalence` と skip stub（2）（[#3509](https://github.com/kompiro/karasu/issues/3509)）    | —    | 新しい check を required にする前に、しばらく結果だけを見る（ADR-3286 の導入と同じ順序）。A の例外を有効にするのは B が required になってから                      |
| **C** `rendering-change` ラベル（3）（[#3510](https://github.com/kompiro/karasu/issues/3510)）            | B    | B の artifact を読むだけで、B の成否には影響しない                                                                                                                 |

A が先に入り、B が required になった時点で、言語のパスの `refactor` の例外を有効にする（分類器の 1 行の変更）。

> 各スライスで何ができるようになるか / その時点でまだできないことは
> 親 Issue [#3505](https://github.com/kompiro/karasu/issues/3505) の `## Slice status` を参照。

### 実装の指針

1. `scripts/review/tier.ts`：`SECURITY_TIER_GLOBS` と `LANGUAGE_TIER_GLOBS` を足す。PR のタイトルを入力に加え、言語の規則の例外に使う。`SECURITY_GLOBS`（`securityReview`）にセキュリティの境界の一覧を足す
2. `scripts/review/` に、既存のテストの変更の判定と、fix のテストの判定を足す（純粋関数。テキストを受け取る）。Review tier の CLI は `gh` でタイトルと `closingIssuesReferences` を読む
3. `scripts/` の下の新しいディレクトリ（`scripts/pr-shots/` と並べる。名前は #3509 で決める）：`pr:shots` の比較を、全 view と診断に広げた CLI。結果を JSON で出す
4. `.github/workflows/render-equivalence.yml`、`render-equivalence-skip.yml`、`rendering-change-label.yml`。どれも `/security-review` を当てる
5. テスト：分類器（新しい一覧のパス、テストファイルの除外、`refactor` の例外）、既存のテストの変更の判定（refactor で通る import とパスの張り替え、通らない matcher の書き換え・折り返した行・ファイルの削除、それ以外の PR で理由を求める行の削除・`.skip`・`return`）、セキュリティの境界のテストファイルの行の削除が High になること、fix の判定（タイトル・Issue・`No test:`）、比較の判定表（両側で同じく失敗する入力は差にならない、片側だけの失敗は差になる、整形の出力の差）、フィルタの一致、ラベルを付ける workflow が artifact の値で PR を選ばず、artifact が無い・崩れている・head と一致しないときにラベルを変えないこと
6. 文書：`docs/process/review.md`「リスク段階」に、Medium で人間が見るもの（描画の変化の動作確認）と、本文の `No test:` / `Test change:` の行を足す。PR テンプレートの `## Risk` の例を更新する
7. AT：分類器と検査はユニットテストで覆う。人間が確かめるのは「`rendering-change` が実際の PR で付き、外れること」だけで、PR の checklist で確かめる（ADR-3169）
8. ADR 昇格：実装の完了後、`docs/adr/3505-<name>.md` に昇格し、ADR-3286 との関係（規則を足すので `related_to`。supersede はしない）を書く。本 Design Doc は同じ PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響：なし（開発プロセスだけの変更）
- High の PR が増える：直近の Medium 40 本のうち、新しい規則で High になるのは #3500・#3419（セキュリティ）と、言語のパスに触れる `fix` の #3501・#3464 など。#3380（11-26 の計測）の比較の基準がずれるので、計測ではこの変更の前と後を分けて数える
- Medium の `fix` の PR で、テストの追加か `No test:` の行が要るようになる。期待値を変える PR では `Test change:` の行が要る
- CI の時間：パッケージに触れる ready の PR で、比較の job が数分増える

## 未解決の問い / 決めないこと

- 言語の挙動のパスに `style/` と `formatter/` を含めた。`.krs.style` の受け付ける値と、ユーザーのファイルを書き換える整形は言語の挙動に数える、という判断で、Issue の候補から広げている
- タイトルを `feat` や `chore` にして、fix のテストと言語の規則を外すことは防げない。言語のパスは `refactor` 以外の型ならすべて High なので軽くはならない。fix のテストは `bug` の Issue を閉じれば型に関係なくかかる。Issue の無い修正を `feat` と書くことは残る
- 比較の範囲の外（examples と AT の fence に現れない構文、drill-down の 2 段目より深い view）の挙動の変化は、`refactor` の等価の判定でも見逃す
