---
id: ADR-3416
title: ADR の生成物は PR に含めず、毎日の routine が出す再生成の PR でだけ更新する
status: accepted
date: 2026-11-01
topic: adr-tooling
authors: [kompiro]
related_to:
  - ADR-788
  - ADR-2331
  - ADR-3286
  - ADR-1370
  - ADR-3335
  - ADR-3314
scope:
  concerns:
    - ci
    - security
assumptions:
  - "symbol: scripts/adr/generated.ts :: classifyGeneratedDiff"
  - "symbol: scripts/adr/check-generated.ts :: checkGenerated"
  - "grep: .github/workflows/adr-validate.yml :: scripts/adr/check-generated\\.ts"
  - "grep: .github/workflows/adr-validate.yml :: pnpm-lock\\.yaml"
  - "grep: .github/workflows/adr-validate-skip.yml :: pnpm-lock\\.yaml"
  - "grep: lefthook.yml :: adr-generated-check"
  - "grep: package.json :: adr:regenerate-pr"
  - "symbol: scripts/adr/regenerate-pr-flow.ts :: regeneratePr"
  - "symbol: scripts/review/tier.ts :: regenerationWaivesRecord"
  - "grep: .github/workflows/review-request.yml :: chore/adr-regenerate"
  - "file: .github/workflows/adr-freshness.yml"
  - "grep: scripts/adr/check-freshness.ts :: WINDOW_HOURS = 50"
  - "A Claude routine runs pnpm adr:regenerate-pr once a day"
---

# ADR-3416: ADR の生成物は PR に含めず、毎日の routine が出す再生成の PR でだけ更新する

- **日付**: 2026-11-01
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3416](https://github.com/kompiro/karasu/issues/3416)、設計 PR [#3417](https://github.com/kompiro/karasu/pull/3417)、実装 PR [#3456](https://github.com/kompiro/karasu/pull/3456)・[#3458](https://github.com/kompiro/karasu/pull/3458)、マージ後の確認 [#3457](https://github.com/kompiro/karasu/issues/3457)
  - [ADR-788](788-adr-knowledge-graph.md)（frontmatter が正本、`effective.md` などは生成物）、[ADR-2331](2331-adr-automerge-scope.md)（ADR PR の auto-merge は差分の性質で判定する）、[ADR-3286](3286-risk-based-review-tiers.md)（リスク段階）、[ADR-1370](1370-release-flow-actions-driven.md)（Actions の PR 作成は OFF のまま）、[ADR-3335](3335-refuse-commits-on-main.md)（`main` にコミットしない）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)、[TPL-2658](../test-perspectives/TPL-2658-agent-write-scope-is-declared-not-prompted.md)、[TPL-2786](../test-perspectives/TPL-2786-guard-failure-must-fail-the-run.md)、[TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)
  - 受け入れテスト: [docs/acceptance/3416-regenerate-adr-index-daily-pr.md](../acceptance/3416-regenerate-adr-index-daily-pr.md)

## 背景

ADR の PR は、`pnpm adr:regenerate` が書く `docs/adr/effective.md`・`graph.md`・`graph/*.md` を ADR と一緒にコミットし、CI の `adr regenerate --check` と pre-push がその鮮度を検査していた。このため ADR の PR が同時に 2 本開いていると、ADR 同士が無関係でも生成物でほぼ必ず衝突した。2026-10-01〜10-30 にマージした `docs(adr):` の PR 37 本のうち 11 本に `main` を取り込む merge commit がある。Low の ADR PR は auto-merge で入るが、衝突した PR は誰かが手元で生成し直して push するまで止まった。

解きたいのは「PR が生成物を運ぶので、無関係な PR 同士が衝突する」ことである。条件は 3 つあった。`main` に直接 push しない（ADR-3335）。`effective.md` は AI の第一参照なので repo に置いたままにする（ADR-788）。人を通さないマージの可否は差分で機械的に判定する（ADR-2331、TPL-3286）。

## 決定

PR は生成物をコミットしない。1 日 1 回、Claude の routine が `pnpm adr:regenerate-pr` を実行し、`main` から生成し直した生成物だけを変える PR を作り、required check と Review tier が通るのを待ってユーザーの名義で REST でマージする。マージしてよいかは routine ではなく required check の `Validate` が差分で保証する。

## 仕組み

**生成物のパスの集合 G。** `adr.config.json` の `paths.outputs` を `paths.adrDir` に繋ぎ、ディレクトリの出力（`graph/`）はその下全体にする。PR の base と head の和集合をとる（`scripts/adr/generated.ts`）。

**`Validate`（`scripts/adr/check-generated.ts`）が通すのは 2 種類だけ。** 差分は merge base から head まで、rename の検出を切って取る。

- ふつうの PR: G のパスを 1 つも変えない。例外は、head の設定が名指ししなくなった古い出力の削除だけ。
- 再生成の PR: G の外を 1 つも変えず、base と head の `paths.outputs` が同じで、head の生成物の木が head の入力から生成し直した結果とちょうど一致する（欠け・余分・中身の違いのどれも無い）。

それ以外は落ちる。どちらの場合も生成器を実行するので、生成器の版上げ（`package.json` / `pnpm-lock.yaml` だけの PR）で生成器が壊れれば落ちる。そのために `Validate` の paths に両ファイルと `scripts/adr/**` を足した。生成は commit の入力（`git archive`）から一時ディレクトリで行うので、PR の後に `main` に入った ADR では落ちない。生成器は checkout（CI では merge ref）のものを使う。`main` への push では生成器の実行だけを行う。pre-push の `adr-generated-check` も同じ検査を `origin/main` との merge base で行う。

**`pnpm adr:regenerate-pr`（`scripts/adr/regenerate-pr-flow.ts` / `regenerate-pr.ts`）。** 呼び出し元の作業ツリーには触れず、専用の worktree で生成する。GitHub の操作は REST だけにする（routine の proxy は GraphQL を拒否する）。

- 最初に、前日に待ちきれなかった再生成の PR を拾い、条件がそろっていればマージする。
- 再生成の PR は 4 つの印（本文の印、head のブランチ `chore/adr-regenerate`、head の repo、base `main`）で見分ける。
- push は直前に読んだブランチの SHA を lease にする。マージは確かめた head の SHA を固定し、その後に別の push があれば 409 で失敗する。
- ラベルはちょうど `risk: low` にする。
- 待つ check は、ruleset の required check と Review tier のうち GitHub Actions が出したもので、名前ごとの最新の run を見る。
- 開始から 25 分で待つのをやめ、PR を残して終了コード 3 で終える。

**Review tier。** 生成物だけを変える Low の PR は、ローカルレビューの記録を求めない（`regenerationWaivesRecord`）。判定は `Validate` と同じモジュールと同じ差分で行う。`review-request.yml` は同じ repo の `chore/adr-regenerate` から来た PR に `risk: high` を付けない。

**鮮度の見張り（`.github/workflows/adr-freshness.yml`、`scripts/adr/check-freshness.ts`）。** 毎日 1 回、読み取りだけで動く。`main` の生成物が、50 時間の境界より新しい `main` の first-parent commit（境界以前で最も新しい 1 つを含む）のどれかの入力から生成し直した結果と一致すれば通る。一致しなければ、反映されていない変更が 50 時間より古いので失敗する。50 時間は、ADR が routine の fetch の直後に入り、翌日が待ちきれず、翌々日に拾われてマージされるまでを許す値である。生成器の版が窓の中で変わったときは、古い入力を新しい生成器で作り直すと書式だけ違うので、判定を見送る。

## 理由

- 無関係な ADR の PR 同士が生成物で衝突しなくなる。再生成の PR も生成物しか触らず、ほかの PR は生成物に触れないので衝突しない。
- ruleset・repo の Actions 設定・secret を変えず、新しい鍵も bypass も足さない。
- 生成物は repo にあり続け、GitHub でも clone 直後でも読める（ADR-788 の読み方を保つ）。
- 人を通さないマージの安全を、routine の prompt ではなく required check が差分で保証する（TPL-2658、TPL-3286）。生成物以外の変更は、誰が作った PR でも「生成物の更新」として紛れ込めない。
- 生成器の版上げが翌日の再生成の PR で `main` に反映される。以前は次の ADR PR まで抜けていた。
- routine が止まっても何も壊れない。生成物が古くなるだけで、見張りが 2 日目に知らせ、同じスクリプトを手元で実行すれば同じ PR ができる。

### 代償

- `main` の生成物はふつう最大 1 日、待ちきれない日を挟むと最大 2 日古い。その日にマージした ADR は ADR 本体を読めば分かる。急ぐときはスクリプトを手元で実行する。
- 人ではない動き手が増える。routine はユーザーの名義で、人が見ていないときに PR を作ってマージする（commit の author は `Claude <noreply@anthropic.com>`）。
- routine は依存を install して生成器を動かす。依存が乗っ取られれば、そのコードは proxy を通して karasu にユーザーの名義で何でもできる。ruleset は approval を求めないので、任意のブランチを PR にして required check が通れば REST でマージできる。手元のセッションで `pnpm install` するのと同じ露出だが、無人で毎日走る。lockfile の固定と Dependabot の cooldown で減らすに留める。生成を GitHub に届かない環境に分けられる実行環境が使えるようになったら見直す。

## 却下した案

- **`main` への push ごとに、bypass の鍵で再生成を commit する。** 古さは 1〜2 分で済むが、ruleset に初めて bypass actor を足す。bypass はパスで絞れず PR 必須と required check をまとめて越えるので、鍵が漏れれば CI を通さずに `main` に何でも書ける。被害を絞る柵（鍵の隔離・artifact の検査・ruleset の分割）が多く、生成物だけの commit が `main` への push の workflow を余分に起動する。
- **手元の merge driver で衝突を自動で解く。** 衝突そのものは残り、GitHub が衝突を報告した Low の PR は止まったまま。merge driver は `.git/config` に入り commit できない。
- **生成物を repo から外す。** GitHub のファイル表示とクラウドのエージェントから第一参照が消え、ADR-788 の読み方が崩れる。
- **merge queue。** user 所有の repo では使えない。
- **GitHub Actions が再生成の PR を作る。** Actions の PR 作成は OFF で（ADR-1370）、ON に戻しても `GITHUB_TOKEN` で作った PR の run は承認待ちになり、無人では required check が通らない。
- **routine が作った PR の auto-merge を Actions が有効にする。** マージが `GITHUB_TOKEN` の名義になり、その `main` への push で workflow（deploy など）が起動しない。

## 確かめたこと

実装の前に、一度だけの routine で実行環境を確かめた（#3416 のコメント）。proxy を通した lease 付きの push が通り、古い lease は拒否された。REST の PR 作成・ラベル・`sha` 付きマージが通り、違う `sha` では 409 になった。`require_extra_approval_for_unattributed_changes` は approval を求めなかった。環境の setup script で版を固定した `gitleaks` を入れれば pre-push が通った。ブランチの削除は proxy が拒否するので、スクリプトはブランチを消さない（マージ時は `delete_branch_on_merge` が消す）。
