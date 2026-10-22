---
id: ADR-3271
title: PR と Issue はマージで同時に閉じ、マージ後にしか確かめられない項目は別の Issue にする
status: accepted
date: 2026-10-17
topic: build
authors: [kompiro]
refines: [ADR-3169]
related_to: [ADR-3052]
assumptions:
  - "grep: .claude/rules/acceptance.md :: 別の Issue"
  - "grep: docs/process.md :: Closes #N"
---

# ADR-3271: PR と Issue はマージで同時に閉じ、マージ後にしか確かめられない項目は別の Issue にする

- **日付**: 2026-10-17
- **ステータス**: 決定済み
- **関連**:
  - Issue #3271（起点）
  - Issue #2957 / PR #2959（`Post-merge follow-ups` 節と、マージ時に Issue へ項目を写す workflow の提案。マージしない。本 ADR のマージ後に not planned で閉じる）
  - [ADR-3169](3169-at-manual-items-before-merge.md)（AT の手動項目はマージ前に確かめられるものに限る。本番にしか現れない項目の行き先を本 ADR で改める）
  - [ADR-3052](3052-review-branch-diff-before-draft-pr.md)（PR を作るまでの手順。同じく hane の `ship` / `start-dev` が実行する）
  - kompiro/hane#97 / kompiro/hane#98（`ship` / `start-dev` 側の変更。Issue と PR）

## 背景

#2957 は、マージ後にしか確かめられない項目（次のリリースで確認、マージ後のバックフィルなど）が Manual Verification Checklist に混ざり、マージ時点で未チェックのまま PR 本文に埋もれる問題を扱った。提案は、PR 本文に `Post-merge follow-ups` 節を足し、項目があれば Issue を `Refs #N` で紐付けて open に残し、マージ時に workflow が項目を Issue 本文へ写す、というものだった。

karasu 側の実装（PR #2959: テンプレート、workflow、process.md）はマージされなかった。一方で hane 0.19.0 の `ship` / `start-dev` はこの流れを先に取り込み、PR 本文に節を書き、項目があると `Refs #N` に切り替えるようになった。

その結果、次のことが起きた。

- 実装 PR のほとんどが、process がすでに持っている後工程（Design Doc の ADR への昇格）を follow-up として書き、`Refs #N` にした。PR がマージされても Issue が閉じず、手で閉じる必要があった。
- ADR-3169 は、本番にしか現れない項目の行き先を「PR の Post-merge follow-ups に置き、Issue へ載せる」とした。テンプレートにその節は無かった。

## 決定

実装 PR は `Closes #N` で Issue を紐付け、PR のマージで Issue も閉じる。マージ後にしか確かめられない項目、または実行できない項目は、PR を作る前に別の Issue に起こし、PR 本文から 1 行で番号を示す。PR 本文に `Post-merge follow-ups` の見出しは作らない。

1. **判断基準は ADR-3169 と同じ 1 つ**: その項目を、その PR の preview かローカルの checkout でマージ前に確かめられるかどうか。確かめられるなら Manual Verification Checklist（と AT の手動項目）に置く。確かめられないなら別の Issue にする。
2. **本番にしか現れないもの**（デプロイ設定、OAuth、カスタムドメインなど）は、AT にも PR の checklist にも書かず、別の Issue にする。ADR-3169 の決定 2 の行き先をこれに置き換える。
3. **process が定めている後工程は書かない**: Design Doc の ADR への昇格、worktree の後片付けなど `docs/process.md` と hane のスキルが手順として持つものは、PR 本文にも別の Issue にも書かない。
4. **Design Doc の PR は従来どおり `Refs #N`**: 実装がまだ残っているので Issue は閉じない。これは本 ADR の対象外。

## 理由

- PR と Issue が同時に閉じれば、Issue の open / closed がそのまま作業の残りを表す。`Refs #N` で残った Issue は、残っているのが本当の確認なのか後工程の書き写しなのかを開くまで区別できなかった。
- 別の Issue にすれば、マージ後の項目はそれ自体の open / close を持つ。元の Issue に追記する方式と違い、追記を担う workflow も、それを確かめる PR check も要らない。
- 後工程を書かないのは、process がすでに手順として持っているからである。書けば同じことが 2 か所に書かれ、PR ごとに follow-up が生まれる。

## 却下した案

- **#2957 の案（節を足し、`Refs #N` で Issue を残し、workflow が項目を Issue へ写す）**: 項目がある PR のたびに Issue が閉じなくなる。実際に起きたとおり、後工程を書き写すだけで項目は生まれる。workflow と PR check の保守も要る。
- **節は残し、`Closes #N` のまま項目を PR 本文に書く**: #2957 が解こうとした問題（マージ済み PR の本文は誰も読まないので項目が失われる）がそのまま残る。
- **元の Issue にコメントで書き、`Refs #N` で残す**: Issue が PR と同時に閉じない点が #2957 の案と同じ。
