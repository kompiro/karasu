---
id: ADR-2716
title: CodeRabbit のレビューを request changes workflow に移す
status: accepted
date: 2026-09-05
topic: build
authors: [kompiro]
supersedes: [ADR-2640]
related_to:
  - ADR-128
  - ADR-903
  - ADR-953
  - ADR-2331
  - ADR-2643
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "file: .coderabbit.yaml"
  - "grep: .coderabbit.yaml :: language: en-US"
  - "grep: .coderabbit.yaml :: request_changes_workflow: true"
---

# ADR-2716: CodeRabbit のレビューを request changes workflow に移す

- **日付**: 2026-09-05
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2716](https://github.com/kompiro/karasu/issues/2716)
  - [ADR-2640](2640-coderabbit-pr-review.md) — **本 ADR が supersede する** CodeRabbit 導入（advisory 固定）。導入そのもの・設定の置き場・除外対象・運用ルールは下記「ADR-2640 から引き継ぐ決定」で引き継ぐ
  - [ADR-953](953-ci-docs-only-paired-stub-workflow.md) — Required Check の pending が PR を止める事故（required 化を却下する根拠）
  - [ADR-2643](2643-stacked-pr-workflow.md) — Stacked PR の運用（レビューは最下層 1 本だけで起きる）
  - `.coderabbit.yaml`, `docs/process.md`

## 背景

ADR-2640 は CodeRabbit を導入するにあたり、`request_changes_workflow: true`
（指摘の解決に応じて changes-requested と approve を出し分ける）を却下した。
理由は「approve が実質的なマージ許可として機能してしまい、人間がマージ判断を
持つという前提が崩れる」だった。

これは**導入時点の決定**であり、運用実績がない状態で最も保守的な形を選んだもの
である。1 週間動かして、判断の前提が 2 つとも動いた。

- **レビューの質は一次レビュアーとして頼れる水準だった。** 「読むに値するか」は
  もう論点ではない
- **足りないのは所見の状態だった。** 今の advisory 固定では、自動レビューが
  収束したかどうかが PR の状態に出ない。人間がレビューを始める前に、thread を
  全部読んで「未対応が残っていないか」を自分で組み立て直す必要がある。
  レビュアーが 1 人しかいないフローでは、ここが一番効く

却下理由そのものも、このリポジトリの構成では成立しないことが確認できた。
default branch の ruleset は `required_approving_review_count: 0` かつ
`required_review_thread_resolution: false` なので、CodeRabbit の
changes-requested はマージを止めず、approve はマージを許可しない。approve が
マージ許可として働くのは required review を置いた構成の話で、karasu はそうなって
いない。

## 決定

`.coderabbit.yaml` の `reviews.request_changes_workflow` を `true` にする。
CodeRabbit は actionable な指摘を出したときに changes-requested を出し、対応済みと
判断した thread を次のレビューで解決し、残りがなくなった時点で approve する。

**approve は「自動レビューが収束した」という印であって、マージ許可ではない。**
マージ判断は引き続き人間が持ち、それは ruleset が構造的に保証している。

### ADR-2640 から引き継ぐ決定

supersede するのは advisory 固定の一点だけで、次は変えない。

- CodeRabbit GitHub App を PR の一次レビュアーとして使い、設定は
  リポジトリ直下の `.coderabbit.yaml` でバージョン管理する
- **required status check にはしない。** 外部サービスの停止がマージ不能に
  直結する形は取らない（ADR-953）
- レビュー言語は英語（`language: en-US`）
- `dependabot[bot]` / `renovate[bot]` の PR と draft PR は対象外
  （依存更新は `/hane:dependabot` が個別にトリアージする — ADR-128）
- 規約は `path_instructions` と `knowledge_base.code_guidelines` に書き、
  ダッシュボード側には置かない

## 理由

- **人間がレビューを始める地点が上がる。** 収束済みの PR から読み始められる。
  これが今回欲しかったもので、advisory 固定では得られない
- **却下した指摘があっても approve に到達できる。** 理由を返信したうえで
  `@coderabbitai resolve` で閉じれば、指摘に従わずに thread を解決できる。
  ADR-2640 の運用ルール「所見は読んで判断する対象であって、全部潰す対象では
  ない」は、この逃げ道があるから request changes workflow の下でも維持できる。
  **approve を取ることを目的に指摘へ従うのは、この決定の誤用である**
- **フラグ 1 つで戻せる。** required check 化と違い、期待外れなら
  `false` に戻すだけで ADR-2640 の状態に復帰する。小さく始めた導入の次の一歩
  として、取り返しの付く粒度に収まっている
- **approve の条件に `pre_merge_checks` が入るが、現状すべて `warning` か
  `off` なので approve を止めない。** ゲートを増やしたくなったら、その時に
  mode を上げるかどうかを別途決める

## 却下した案

- **advisory 固定を続ける（ADR-2640 の維持）**: 却下理由の 2 本（レビュー品質が
  未知・approve がマージ許可になる）が、運用実績と ruleset の実際の設定で
  どちらも解消した。維持する根拠が残っていない
- **CodeRabbit のレビューを required status check にする**: ADR-2640 の却下理由が
  そのまま有効。外部サービスの停止がマージ不能に直結する。レビューの価値は
  「読まれること」であって「ゲートになること」ではない
- **ruleset の `required_review_thread_resolution: true` でゲート化する**:
  未解決 thread があるとマージできなくなる本物のゲートで、人間のコメントにも
  効き、ADR-only PR の auto-merge（ADR-2331）を止める。今回欲しいのは
  「収束したかどうかが見えること」であってゲートではない
- **approve だけ有効にし changes-requested を出さない**: CodeRabbit の設定は
  この 2 つを 1 つのフラグで扱うので、選べる形になっていない

## 有効化の確認

CodeRabbit のドキュメントはこの workflow を Essentials 以上の機能として挙げて
おり、karasu のプランで有効かは公開情報から判断できなかった。本 ADR を入れた
PR [#2717](https://github.com/kompiro/karasu/pull/2717) 自体が確認の場となり、
**CodeRabbit は plan を Team と報告したうえで changes-requested を返した。**
機能は有効である。

## 運用ルール

- **人間のレビューは approve が付いてから始める。** CodeRabbit のラウンドと並走
  させない。approve までのラウンドは PR を出した側が回しきる（`docs/process.md`）
- **記録済みの決定（Issue のスコープ・accepted な ADR・`docs/spec/`・
  `.claude/rules/`）を変える指摘は、自分で判断せず人間に確認する。** それ以外は
  自分で対応可否を決めて閉じる。判断基準はこの 1 つ
- **採用しない指摘は、理由を返信したうえで `@coderabbitai resolve` で閉じる。**
  approve を取るために指摘へ従わない
- CodeRabbit の approve をマージ許可として扱わない。マージ可否は人間が決める
- 繰り返し同じ規約違反を指摘されるなら、`path_instructions` ではなく
  drift ガード（lefthook + `scripts/lint/`）に落とす合図として扱う
- 繰り返し同じ誤検知を受けるなら、`path_instructions` の glob が規約の適用範囲
  より広い合図として扱い、glob を絞る
- 設定の変更は通常どおり PR で行う
