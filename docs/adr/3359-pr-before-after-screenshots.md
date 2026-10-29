---
id: ADR-3359
title: 描画が変わる PR に、merge-base と比べた before/after の画像を添付する
status: accepted
date: 2026-10-29
topic: build
authors: [kompiro]
related_to:
  - ADR-2419
  - ADR-529
  - ADR-3333
  - ADR-3342
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: scripts/pr-shots/shots.ts"
  - "file: scripts/pr-shots/reminder.sh"
  - "grep: package.json :: \"pr:shots\""
  - "grep: .claude/settings.json :: scripts/pr-shots/reminder.sh"
  - "grep: .github/PULL_REQUEST_TEMPLATE.md :: ## Before / after"
  - "symbol: scripts/pr-shots/compare.ts :: NO_CHANGE_MARKER"
---

# ADR-3359: 描画が変わる PR に、merge-base と比べた before/after の画像を添付する

- **日付**: 2026-10-29
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3359](https://github.com/kompiro/karasu/issues/3359)（設計 PR #3361、実装 PR #3393）
  - [ADR-2419](2419-poc-report-directory.md): 証拠は gitignore された `reports/` に置き、`scripts/report/` の `capture` を使う
  - [ADR-529](529-playwright-with-ai-visual-review.md): ピクセル単位の比較は見送った
  - [ADR-3333](3333-converge-after-ready-hook.md): コマンドの文字列でなく、ツールの出力を見る PostToolUse フック
  - [ADR-3342](3342-ready-gate-local-review.md): gh ラッパー（本 ADR では使わない）
  - 関連 TPL: [TPL-2446](../test-perspectives/TPL-2446-gate-side-check-runs-over-the-whole-set.md)、[TPL-2047](../test-perspectives/TPL-2047-doc-embedded-krs-is-parsed-not-prose.md)
  - `scripts/pr-shots/`、`.claude/settings.json`、`docs/process.md`、`.github/PULL_REQUEST_TEMPLATE.md`、`docs/acceptance/pr-before-after-screenshots.md`

## 背景

この repo の PR はほとんどをコーディングエージェントが `gh` で作る。図の描画やアプリの UI が変わる PR では、
差分のコードを読んでも見た目がどう変わったかは分からず、レビューする人は preview を開くかブランチを手元に
持ってくる必要があった。

`gh` 2.99 以降は `gh pr create` / `gh pr edit` に `--attach` があり、画像を GitHub の添付ストレージに
アップロードして、本文の `![alt](./before.png)` をその URL に書き換える。devcontainer の OAuth トークンで
添付できることは #3359 で確かめた。GitHub App のトークン（Actions の `GITHUB_TOKEN` を含む）で添付できるかは
確かめていない。

足りなかったのは、before を撮る手段（`scripts/report/` の `renderKrs` は今いるツリーでしか描画できない）と、
依頼されなくても撮るきっかけだった。

## 決定

描画が変わる PR は、本文の `## Before / after` 節に、merge-base と比べた before/after の画像をローカルで撮って
添付する。撮るのは `pnpm pr:shots`、きっかけは `gh pr create` の直後に促す PostToolUse フックで、止めはしない。

### `pnpm pr:shots`（`scripts/pr-shots/`）

- **before の描画**: `origin/main`（`--base` で変更可）との merge-base を、main checkout の
  `.claude/worktrees/pr-shots-base-<sha12>-<host>-<pid>` に detached で checkout し、その `packages/core` を
  HEAD 側のプロセスから動的に import する。両側を 1 プロセスで描画し、終了時（失敗・SIGINT・SIGTERM を含む）に
  checkout を消す
  - install は `pnpm install --frozen-lockfile --prefer-offline --ignore-scripts --filter "@karasu-tools/core..."`。
    core の実行時の依存は `smol-toml` と `yaml` だけで約 1 秒で済み、`--ignore-scripts` で lefthook パッケージの
    `postinstall` が一時の checkout を指して hook を張り替えるのを防ぐ
  - path にホスト名と pid を入れる。同じ main のコミットから分かれた並行セッションが同じ path を取り合って
    互いの checkout を消すのを防ぐため。起動時には、同じホストで pid が生きていない（または自分の pid と同じ）
    残骸だけを消し、別ホストのものには触れない（pid は別ホストからは確かめられない）
- **何を撮るか**: 候補を次の順で 1 本に並べ、system / deploy / org の 3 ビューで両側を描画して SVG の文字列を比べる。
  after は作業ツリー（未コミットの変更を含む）を描画する
  1. `--file` で指定した `.krs`（作業ツリーの内容を両側で使う）
  2. merge-base から作業ツリーまでの差分（未コミット・未追跡を含む）にある `docs/acceptance/*.md` の、info が
     `krs` と完全一致する fence（`fragment` / `invalid` は除く。TPL-2047）。作業ツリーの文字列を両側で使う
  3. `examples/` のエントリ（同じディレクトリのどの `.krs` からも import されていないファイル）。各側の
     ファイルを使う
- **比較の規則**: 両側の SVG が違う組を変わった組とする。base だけが描画に失敗した組は after だけにして理由を
  添える。両側とも描く中身の無いビュー（deploy / organization を持たないモデル）は比べない（base が描けて HEAD で
  空になったビューは変わった組とする）。HEAD で描画できなくなった
  組は別に一覧にして終了コード 1 にし、そのときは「No rendering change」を出さない
- **出力**: 候補の順で最初の 2 組だけを light テーマの PNG にし、残りは名前だけを一覧にする。
  `reports/pr-shots/<branch>/` に PNG と `body.md`（`## Before / after` 節）を書き、そのまま使える
  `gh pr edit <n> --body-file … --attach …` を出力する。変わった組が 0 なら
  `No rendering change (N acceptance-test fences, M example files)` の 1 行を書く（`--file` があればその件数も足す）
- **アプリの UI**: `--url <path>` で本番（`https://karasu.kompiro.dev<path>`）と手元の `pnpm dev` を同じ path で
  撮る（`--after-origin` で変更可）。dev server の管理はしない

### フック（`scripts/pr-shots/reminder.sh`）

`.claude/settings.json` の PostToolUse / PostToolUseFailure（Bash）に置く。`gh pr create` の出力にある PR の URL
から PR を特定し（ADR-3333 と同じく出力を見る）、次の 2 つがそろったときだけ `pnpm pr:shots` と
`gh pr edit --attach` を促す。

- PR の差分に、`packages/core/src/` か `packages/app/src/` のテスト以外のファイル、または `examples/` がある
  （GitHub が diff を返さない大きな PR では、ページングした `pulls/<n>/files` で読む）
- 本文の `## Before / after` 節（HTML コメントを除く）に、`user-attachments/assets/` の画像も
  「No rendering change」の行も無い

分からないときは何も出さず、Bash の呼び出しを壊さない。gh の呼び出しは 1 回 10 秒までで、フックの 30 秒に収める。

### 文書

`docs/process.md` の PR ワークフロー手順 10 に、描画や UI が変わる PR は本文の `## Before / after` 節に before/after を
添付し、フックが促すことを 1 文で足す。PR テンプレートに `## Before / after` 節を置き、描画のコードにも examples にも
触れない PR は `N/A` と書く。`reports/README.md` の「Capturing a real "before"」から `pnpm pr:shots` を案内する。

## 理由

- **before と after の差が、そのブランチの変更だけで決まる。** 公開済みの CLI で描画すると前回のリリース以降の
  未リリースの変更が混ざり、本番のアプリを撮ると図の描画とは関係の無いアプリの起動やビューの切り替えの分だけ
  不安定になる。merge-base の checkout は 1 秒強で用意でき、2026-10-29 の実測では、`examples/` の 65 エントリ × 3 ビューの
  描画を含めて 1 回 4〜5 秒で済んだ
- **撮るかどうかを観測できる事実（SVG が変わったか）で決める。** 「描画に効くパス」の一覧で決めると、一覧の更新を
  忘れても何も落ちない（TPL-2446）。パスの条件はフックが促すかどうかにだけ使い、広すぎても `pr:shots` が
  「No rendering change」と答えて終わる。描画が決定的であること（同じコードで 2 回描画すると全 examples で
  SVG が一致する）をテストで固定している
- **候補の順序で、変更を見せるために書かれたモデルを優先する。** エージェントが指定したモデル、PR が足した
  受け入れテストの fence は、その変更を見せるために書かれているので、examples の図より的が絞れる。画像を 2 組に
  絞るので本文が画像で埋まらず、ほかに変わった図があることは一覧で分かる
- **止めずに促す。** 描画が変わらない PR の方が多く、ready を拒否すると、そのたびに理由を付けて外す手間が増える。
  フックは `gh pr create` を実行した直後の判断に届くので、文書に手順を書くだけ（行動を変える力がいちばん弱い層。
  `.claude/rules/README.md`「どの層に書くか」）より撮られることが多い
- **画像を repo に入れない。** 証拠は `reports/` に置き、PR 本文の添付として残す（ADR-2419）。本文の編集は push
  ではないので、CodeRabbit のレビュー枠を使わない

## 却下した案

- **公開済みの `karasu` CLI で before を描画する**: 前回のリリース以降に main に入った未リリースの変更まで差に
  混ざる
- **before を CLI（`karasu render`）で描画する**: base 側の公開 API のシグネチャが変わっても描画できるが、
  ファイルとビューごとにプロセスを起こすので `examples/` 全体で数分かかる。採用した案では、PR が `compile` /
  `compileProject` のシグネチャを変えると base 側が失敗として報告されるので、黙って誤った画像は出ない
- **本番のアプリ（main のデプロイ）で図の before を撮る**: 図の描画にアプリは要らず、アプリの起動やビューの
  切り替えの分だけ不安定になる。アプリの UI そのものの変更に限り `--url` で使う
- **変更されたパスで撮るかどうかと何を撮るかを決める**: 一覧の更新漏れが検出されず、描画が変わらない
  リファクタでも撮ることになる
- **`docs/process.md` と PR テンプレートに書くだけにする**: 依頼されなかったセッションでは撮られない
- **`gh pr ready` を、添付が無いあいだ拒否する**: 描画が変わらない PR でも毎回理由を付けて外す運用になり、
  ラッパーが判定するには ready のたびに描画を回す必要がある
- **ピクセル単位の比較・動画・VS Code の webview・CI での撮影**: 対象外とした。ピクセル比較は ADR-529 が
  見送り、動画は #3355 のレコーダーで撮る。webview は ExTester が arm64 で動かない。CI での撮影は、App の
  トークンで添付できることが確かめられたら（cli/cli#14309 の解決後）改めて検討する

## 結果・影響

- 描画が変わる PR の本文に、merge-base と比べた before/after が載る。画像は repo にコミットされない
- light テーマで、各ビューのルートだけを撮る。テーマに関わる変更や drill-down の深い階層の変化は、`--file` と
  専用の `.krs` で撮る（必要になれば `--theme` を足す）
- 受け入れテストの fence にも `examples/` にも現れない描画の変化は拾えない。その場合も `--file` で撮る
- 受け入れテスト: `docs/acceptance/pr-before-after-screenshots.md`
