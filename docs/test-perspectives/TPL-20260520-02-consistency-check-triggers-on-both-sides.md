---
id: TPL-20260520-02
title: "2 つの成果物の整合性を検証するチェックは、両方の変更で起動させる（片側にだけ path filter / hook glob を張らない）"
status: active
date: 2026-05-20
applicable_to:
  - "成果物 A の事実を成果物 B に対して検証する cross-cutting なチェック（ADR assumptions、生成物 drift guard、spec ↔ データ同期など）"
  - "`paths` / `paths-ignore` で発火条件を絞った GitHub Actions workflow"
  - "`glob` で実行対象を絞った lefthook / pre-commit などの VCS フック"
discovered_from:
  - issue: "#1480"
  - root_cause_file: ".github/workflows/adr-validate.yml"
related_to: []
topic: build
scope:
  packages: []
---

# TPL-20260520-02: 2 つの成果物の整合性を検証するチェックは、両方の変更で起動させる

## 観点

あるチェックが「成果物 A の事実」と「成果物 B の事実」の**整合性**を検証するなら、その発火条件は **A の変更と B の変更の両方**を含まなければならない。チェックが概念的に属する側（定義ファイルの置き場所）だけに `paths` filter や hook `glob` を張ると、もう一方の変更が無防備になる。

「どこにチェックが書いてあるか」と「何の変更がチェックを破りうるか」は別概念である。発火条件は前者ではなく**後者**で決める。

## 想定される失敗モード

- ADR の `assumptions:` はコード側の事実への契約だが、それを enforce する `adr check-assumptions` が `docs/adr/**` にだけ path filter された workflow で走る。コード変更が assumption を壊しても、その PR は `docs/adr/**` に触れないので実チェックが skip され、CI が green のままマージされる（PR #1477 が `app.css` を削除し 3 つの assumption を壊したが検出されず、無関係な後続 PR #1478 で初めて表面化した）。
- 同じ罠が VCS フック側にもある。lefthook の `glob` を定義ファイル側のパスに絞ると、もう一方を変更する push でフックが起動せず、ローカルでも素通りする。
- 一般化: 生成物 drift guard を「生成元のソース」だけに gate し「生成先ファイル」の手編集を見逃す、spec ↔ reference-data 同期チェックを片側だけに張る、なども同型。

## チェックリスト

cross-cutting なチェック（整合性チェック・drift guard）を CI workflow / VCS フックに追加・改修するとき:

- [ ] そのチェックが**破られる原因となりうる変更パス**を列挙し、`paths` / `glob` がそのすべてを含むか確認する（チェック定義の置き場所ではなく）
- [ ] paired-stub workflow パターン（ADR-20260428-08）を使う場合、Required check として「コード PR でも docs PR でも必ず実チェックが走る」経路があるか確認する。skip 側スタブで実チェックが skip される穴がないか
- [ ] path filter が広すぎて毎回フル実行になるのを避けたいだけなら、軽量チェック（grep ベース等）は filter せず常時実行する選択肢を検討する
- [ ] CI と VCS フックの両方に同じチェックがある場合、発火条件（`paths` と `glob`）が同じ集合を表すか確認する

## 既知の対処パターン

- 軽量な cross-cutting チェックは、概念的な所属に関係なく**コード PR で必ず Required になる job（karasu では `ci.yml` の `Check`）に step として相乗りさせる**。branch protection を触らず blocking gate を得られる（Issue #1480）。
- VCS フック側は、対象を絞る必要が薄い高速チェックなら `glob` を外して毎 push 実行にする（format / lint / typecheck と同列に扱う）。
- 定義ファイル側のチェック（ADR frontmatter validation など、本当にそのパスの変更時しか意味がないもの）は従来どおり path filter / glob で絞ってよい。絞ってよいのは「片側の変更でしか破れないチェック」だけ。

## 関連テスト

- `.github/workflows/ci.yml` の `Check ADR assumptions against the working tree` step（コード PR 側のゲート）
- `.github/workflows/adr-validate.yml` の同名 step（`docs/adr/**`-only PR 側のゲート）
- `lefthook.yml` の `adr-check-assumptions` フック（pre-push、glob なし）
