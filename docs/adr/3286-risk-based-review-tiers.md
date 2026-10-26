---
id: ADR-3286
title: PR のレビューの深さとマージの経路を、変更から決めたリスク段階で変える
status: accepted
date: 2026-10-27
topic: build
supersedes: [ADR-2716, ADR-3117]
related_to:
  - ADR-2640
  - ADR-2331
  - ADR-2643
  - ADR-2898
  - ADR-3052
  - ADR-3326
  - ADR-3333
  - ADR-3340
  - ADR-3342
  - ADR-128
  - ADR-953
scope:
  packages: []
  concerns: [ci, security]
assumptions:
  - "file: scripts/review/tier.ts"
  - "symbol: scripts/review/tier.ts :: classifyChange"
  - "symbol: scripts/review/tier.ts :: diffFingerprint"
  - "file: scripts/review/local-review-record.ts"
  - "symbol: scripts/review/local-review-record.ts :: verifyRecord"
  - "file: .github/workflows/review-tier.yml"
  - "file: .github/workflows/review-request.yml"
  - "grep: .coderabbit.yaml :: request_changes_workflow: false"
  - "grep: .coderabbit.yaml :: auto_incremental_review: false"
  - "grep: .coderabbit.yaml :: - \"risk: high\""
  - "grep: .coderabbit.yaml :: language: en-US"
  - "grep: docs/process.md :: ### リスク段階"
  - "grep: docs/process.md :: #### 指摘の重大度と対応"
---

# ADR-3286: PR のレビューの深さとマージの経路を、変更から決めたリスク段階で変える

- **日付**: 2026-10-27
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3286](https://github.com/kompiro/karasu/issues/3286)
  - Design Doc PR: 初版 [#3287](https://github.com/kompiro/karasu/pull/3287)、改訂（案5）[#3358](https://github.com/kompiro/karasu/pull/3358)、実装 PR: [#3365](https://github.com/kompiro/karasu/pull/3365)
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md)（request changes workflow。**本 ADR が supersede する**。引き継ぐ決定は下の「ADR-2716 から引き継ぐ決定」）
  - [ADR-3117](3117-coderabbit-ignore-command-for-skip.md)（CodeRabbit から外す PR を ignore コマンドで外す。**本 ADR が supersede する**。外す仕組みそのものが要らなくなった）
  - [ADR-2331](2331-adr-automerge-scope.md)（ADR-only PR の auto-merge。適用条件は分類器の規則に移った）
  - [ADR-3326](3326-coderabbit-cli-once-before-ready.md)（ready の前に CLI を 1 回。「CLI は PR レビューの代わりではない」は Medium と Low について改める）
  - [ADR-3333](3333-converge-after-ready-hook.md) / [ADR-3342](3342-ready-gate-local-review.md)（ready の後のフックと ready のゲート。フックは High だけを converge に渡し、ゲートはどの段階でも CLI を求める）
  - 関連 TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（人間を通らないマージの判定は最終の差分で行い、規則に当たらない入力を厳しい側に倒す）、[TPL-1725](../test-perspectives/TPL-1725-gated-test-suite-detection-gap.md)（検査にパスフィルタを付けない）
  - 残した作業: [#3364](https://github.com/kompiro/karasu/issues/3364)（`Review tier` を required にする・後から付けたラベルでレビューが始まるかの確認）、[#3363](https://github.com/kompiro/karasu/issues/3363)（check を main に固定した required workflow にする）、[#3350](https://github.com/kompiro/karasu/issues/3350)（release train の PR の段階）

## 背景

CodeRabbit の rate limit が、PR が人間に届くまでの速さの上限になっていた。ADR-only の auto-merge と `skip-coderabbit` の PR を除くと、すべての PR が同じ流れを通った。CodeRabbit が approve するまでラウンドを回し（ADR-2716）、人間がレビューして手でマージする。変更がどこに触れているかは流れに影響しなかった。

直近 37 本の PR を数えると、CodeRabbit のレビューは 80 回走り、そのうち 43 回が再レビューだった。初回で拾えず再レビューで初めて出た指摘は 10 件で、**すべて Minor** だった。再レビューのラウンドを全 PR で回して得ていたのは Minor の指摘で、その代わりに rate limit で全 PR の待ち時間を延ばしていた。

一方で、ready の前のローカルレビューは機械の前提条件になっていた（`/engineering:code-review` は ADR-3052、CodeRabbit CLI は ADR-3326 と、それが済むまで `gh pr ready` を拒否する ADR-3342）。PR で CodeRabbit を回さなくても、Claude が ready にする PR は CLI を通っている。足りなかったのは、ローカルレビューで何を指摘されどう対応したかが残らないことだった。

初版の設計（#3287）は、どの段階でも approve までラウンドを回す案だった。改訂（#3358）で、段階が「PR で CodeRabbit を回すかどうか」も決める案に差し替えた。あわせてメンテナは、指摘への対応を重大度で分けること（Major 以上に必ず対応する）と、CodeRabbit を approve / changes-requested の関門として使うのをやめることを決めた。

## 決定

**PR の段階を変更から機械で決め、段階ごとに PR での CodeRabbit の扱いと通す条件を変える。CodeRabbit を回さない段階では、ローカルレビューの指摘と対応を PR 本文に記録し、required check「Review tier」がその記録を検査する。指摘は重大度で扱いを分け、CodeRabbit には approve も changes-requested も出させない。**

| 段階 | 主な変更 | PR での CodeRabbit | 通す条件 |
| --- | --- | --- | --- |
| Low | 新しいテストファイル、`docs/test-perspectives/**`、`docs/guide/**`、新しい ADR、ADR の昇格（Design Doc の削除とリンクの張り替え）、既存 ADR の frontmatter | 回さない | 記録と CI が通れば auto-merge |
| Design | `docs/design/**` | draft を外れたときに 1 回だけ。ゲートにしない | 記録と人間のレビュー |
| Medium | 上と下に当たらないもの（`packages/*`、`docs/acceptance/**`、`examples/**`、既存のテストファイルの変更、既存 ADR の本文など） | 回さない | 記録と、サマリー・証拠・preview を見た人間の判断 |
| High | workflow・actions、release、依存（`package.json` の依存・publish 関連のフィールド・lifecycle scripts、lockfile、`.npmrc`、`dependabot.yml`）、`docs/spec/**`、`docs/concepts*.md`、`docs/process.md`、`.claude/rules/**`、`.coderabbit.yaml`、`lefthook.yml`、`scripts/lint/**`、`scripts/ci/**`、レビューの仕組みそのもの（`scripts/review/**`、`scripts/coderabbit/**`、`scripts/bin/**`、`.claude/settings.json`、`.claude/skills/**`、`.claude/agents/**`、PR テンプレート） | Critical / Major の未対応が無くなるまで回す。再レビューは 3 回まで | 人間が差分を読む |

### 段階の決め方

- 分類器（`scripts/review/tier.ts`）が、PR の最終の差分（renames を切り、出力の形式を固定した `git diff`）からファイルごとの段階を出し、その最大値を PR の段階にする。どの規則にも当たらないパスは Medium、パスを読めない差分の節は High にする
- 作成者が信頼リスト（`kompiro`）にいなければ High。bot の PR（Dependabot など）もここで High になる
- ADR の昇格の規則（ADR-2331 の適用条件）は、同じ PR が新しい ADR を足しているときだけ効く。Design Doc の削除と、参照を新しい ADR に張り替えるだけの行（リンク先は正確に一致し、リンクの文字列はファイル名・パス・`ADR-<n>` の言い換えだけ）を Low に数える。**High のパスは、張り替えだけでも High のまま**にする
- 段階のラベル（`risk: low` / `risk: design` / `risk: medium` / `risk: high`）は、ラベルの無い PR を High として扱う。4 つ以外の `risk:` ラベルは check を落とす
- `packages/nest/**`・`.github/workflows/**`・`.github/actions/**` に触れる PR は、段階とは別に `/security-review` を当てる

### CodeRabbit の起動と state

- `.coderabbit.yaml` の `auto_review.labels` を `risk: high` と `risk: design` にし、`auto_incremental_review: false` にする。CodeRabbit が自分で走るのは、そのラベルの PR が draft を外れたときの 1 回だけになる。2 回目からは `@coderabbitai review` で頼む
- ラベルの無い PR（外部の作成者、GitHub の UI で開いた PR）には、workflow `Review request`（`pull_request_target`、PR のコードは checkout しない）が `risk: high` を付ける。draft には付けない（作成者が draft のうちに付けるラベルと競合するため）
- `request_changes_workflow: false` にする。どのレビューも COMMENTED になり、収束は未解決の thread と本文の指摘、PR 本文の記録で見る

### 指摘の重大度と対応

- 重大度はレビュアーが付けたものを使い、付け替えない。重大度の無い指摘は Major として扱う
- Critical / Major は必ず対応する（直す、理由を返して却下する、PR の差分の外なら Issue に回す）。Minor / Trivial は直すかどうかを決めてよい
- High のラウンドで再レビューを頼むのは、Critical / Major を直したラウンドだけ。3 回で止めて人間に渡す
- PR の差分の外への指摘は直さず Issue にする。判定は指摘された行が PR の差分の hunk に含まれるかで、CodeRabbit の「Outside diff range」は使わない

### ローカルレビューの記録と required check

- PR 本文に記録の節（`<!-- local-review:v1 base=… head=… -->`）を 1 つ置く。`/engineering:code-review`（実装の文脈を持たない subagent）と CLI の指摘を、重大度と対応（`fixed in <sha>` / `declined: <理由>` / `→ #<Issue>`）付きで並べる
- 「Review tier」は base 側の分類器で段階を出し、次のとき落ちる：ラベルが差分の段階より低い、Low でないのに auto-merge が有効、High 以外で記録が無い・HEAD を覆っていない（間が main の取り込みだけで PR の変更が同じなら覆うとみなす）・対応の無い指摘がある・`fixed in` のコミットが head に無いか base に既にある。Low では、Critical / Major の却下・CLI の省略・`Waived:` を通さない
- check は記録の形式と鮮度だけを見る。記録は自己申告で、レビューが実際に行われたことは確かめない

### ADR-2716 から引き継ぐ決定

ADR-2716 は決定の中心（`request_changes_workflow: true`）を本 ADR で覆されるので丸ごと supersede するが、次は変えずに引き継ぐ。

- CodeRabbit は required status check にしない。外部サービスの停止がマージ不能に直結する形は取らない（ADR-953）
- ruleset の `required_review_thread_resolution` は使わない。指摘への対応は記録と converge で求める
- ADR-2640 から引き継いだ決定：設定はリポジトリ直下の `.coderabbit.yaml` で管理する、レビュー言語は英語（`language: en-US`）、`dependabot[bot]` / `renovate[bot]` の PR と draft は対象外、規約は `path_instructions` に書く
- マージの判断は人間が持つ。例外は Low の auto-merge だけで、その条件は required check が検査する

## 理由

- **rate limit の主な原因だった全 PR の確認の再レビューが、High にだけ残る。** 再レビューで得ていたのは Minor の指摘で、Medium 以下ではローカルの確認（修正で触れたファイルへの `/engineering:code-review`）で一部を拾う
- **人間を通らないマージの条件が、手順で待つ approve から、required check が検査する記録に変わる。** auto-merge は GitHub が check を待つので、手順を飛ばしても通らない
- **重大度で分けると、ラウンドが重い指摘に集中する。** 初版の PR の改訂（#3358）でも、Major の 1 件は理由を返すと CodeRabbit が取り下げた。「必ず直す」ではなく「直すか理由を返す」にするのはこのため
- **approve を関門にしないと、Minor を残して収束した PR に changes-requested が残る食い違いが消える。** approve を取るために Minor を直す動機（ADR-2716 自身が誤用と書いた形）も戻らない
- **段階はパスという観測できる事実で決める。** ADR-3011 は判断を含む基準を Claude の判断だけで適用することを却下しており、段階を Claude の判断で下げることはしない
- **起動をラベルにしたのは、コメントで依頼できないと分かったからである。** 実装の前の確認（#3286 のコメント、2026-10-26）で、CodeRabbit は `github-actions[bot]` が投げたコマンドに応じなかった（同じ `@coderabbitai help` に、maintainer の投稿には 24 秒で返信し、bot の投稿には 7 分半返信しなかった）。ラベルで対象を含める方式は、除外のラベル（ADR-3117）と違い、ラベルを付ける前に開いた PR がレビューされる問題も起きない。実装 PR #3365 自身で、ラベルだけでレビューが始まり、head の設定が使われ、レビューが COMMENTED になることを確かめた

## 却下した案

- **どの段階も approve まで回し、再レビューを 3 回で打ち切る（初版の案1）**: rate limit の主な原因を残す。それで得ていたのは Minor の指摘だけだった
- **CodeRabbit の effort 見積もりで段階を決める**: 見積もりはレビューの手間でリスクではない。見積もり 1〜2 の PR に deps・CI・release の変更が含まれていた。Low を Medium に上げる補正としても使わない（Low では CodeRabbit が走らず、見積もりが無い）
- **段階を作らず、ラウンドの上限だけを下げる**: 人間の時間に届かない
- **CodeRabbit は全 PR で初回だけ回す（案4）**: ローカルの確認を記録せず、Low の auto-merge を CodeRabbit の初回 1 回と CI だけで決める。案5 はその 2 点を記録と required check で埋めた
- **workflow が `@coderabbitai full review` をコメントして依頼する**: CodeRabbit が bot のコマンドに応じない
- **既存のテストファイルへの「追加だけ」の変更を Low に数える**: 早期の return、テストを囲むコメント、`test.fixme` などで既存のテストを止められ、パターンの列挙では 2 回のレビューを経ても漏れが残った。新しいテストファイルだけを Low にした
- **段階の check を required にするのと同時に入れる**: 先に required にすると、この workflow を持たない PR が pending のまま止まる。導入の後、しばらく結果を見てから required にする（#3364）
