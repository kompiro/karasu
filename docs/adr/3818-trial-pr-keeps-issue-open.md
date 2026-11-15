---
id: ADR-3818
title: 試験導入の PR は Issue を閉じず、Design Doc は試験より前に置く
status: accepted
date: 2026-11-15
topic: build
authors: [kompiro]
refines: [ADR-3271]
assumptions:
  - "grep: docs/process.md :: Issue 本文の Plan に段があれば実装の段を終える最後の PR"
  - "grep: docs/process.md :: 試験の前に Design Doc を置き、結果を足す"
---

# ADR-3818: 試験導入の PR は Issue を閉じず、Design Doc は試験より前に置く

- **日付**: 2026-11-15
- **ステータス**: 決定済み
- **関連**:
  - Issue #3818（起点）
  - Issue #3684 / PR #3769（きっかけ。`branch-review` スキルの試験導入）
  - [ADR-3271](3271-close-issue-with-pr.md)（実装 PR は `Closes #N` で Issue と同時に閉じる。本 ADR はその「実装 PR」の範囲を絞る）
  - Issue #3819（`Refs #N` の PR を合意済みの Design Doc で裏付けられるようにする。下の「影響」）

## 背景

ADR-3271 と `docs/process.md` は、Issue に紐付く PR を 2 種類だけ知っていた。実装 PR（`Closes #N`）と Design Doc の PR（`Refs #N`）である。

#3684 の Plan は 4 段（試験用に main へ入れる、試験、Design Doc、手順 8 の切り替え）で、PR #3769 は最初の段だけを終える試験導入だった。実装セッションはこれを実装 PR として扱い、本文に `Closes #3684` と書いた。マージで #3684 が閉じ、残りの段を抱えたまま手で開き直すことになった。

同じ Plan は Design Doc を試験の後に置いていた。試験が何を測り、どうなれば採用するかが合意されないまま試験が始まる順番である。

kompiro の判断（2026-11-15）: 試験導入は実装の完了ではないので Issue を閉じない。Design Doc を書いたうえで試験する。この規約はメモリではなく `docs/process.md` に置く（メモリは環境ごとにしか残らず、ほかのマシンのセッションは `docs/process.md` を読む）。

## 決定

Issue 本文の Plan に段があれば、Issue を閉じるのは実装の最後の段を終える PR の `Closes #N` だけにする。Design Doc の PR と、途中の段だけを終える PR（試験導入など）は `Refs #N` にして Issue を残す。試験導入するときは、Design Doc を試験より前に置き、試験はその基準で行い、結果を Design Doc に足す。

1. **判断基準は 1 つ**: その PR のマージで、Issue 本文の Plan に残る実装の段が無くなるかどうか。無くなるなら `Closes #N`、残るなら `Refs #N`。
2. **段に数えるのは Issue 本文に書いた Plan だけ**: セッションの Plan モードの計画はほかのセッションから見えず、残りの段を確かめられない。Issue 本文に Plan の段が無ければ、従来どおり実装 PR が `Closes #N`。
3. **process が持つ後工程は段に数えない**: Design Doc の ADR への昇格、worktree の後片付けなど、ADR-3271 の決定 3 が書かないとした後工程が Plan に並んでいても、それだけが残るなら `Closes #N`。数えると Design Doc のある実装 PR がすべて `Refs #N` になり、ADR-3271 が止めた状態に戻る。
4. **ADR-3271 のほかの決定は変えない**: マージ後にしか確かめられない項目を別の Issue にすることはそのまま。

## 理由

- ADR-3271 が `Closes #N` にした理由は「Issue の open / closed がそのまま作業の残りを表す」ことだった。Plan の段が残るのに閉じれば、その性質が崩れる。途中の段の PR を `Refs #N` にするのは、ADR-3271 の理由をそのまま当てた結果である。
- 試験の基準が先に無いと、試験の結果を採否の根拠にできない。Design Doc を先に置けば、試験は合意した問いに答えるものになる。
- 規約を `docs/process.md` に置くのは、すべてのセッションが作業開始時に読む場所だからである。

## 影響

- Review tier は、合意済みの Design Doc を PR が閉じる Issue（`Closes #N`）からしか探さない（`docs/process/review.md`「High の PR で人間が読むもの」）。Design Doc を先に置いても、試験導入など `Refs #N` の PR は裏付けを持たず、kompiro は High の表をすべて読む。`Refs #N` を受け付けるかは #3819 で決める。
- hane の `ship` / `start-dev` は自分で `Closes #N` を書く。試験導入の PR でそれを `Refs #N` に直すのは、hane が対応するまでセッションの役目になる。

## 却下した案

- **Plan の残りの段を別の Issue に切り出し、元の Issue は試験導入の PR で閉じる**: ADR-3271 の「マージ後の項目は別の Issue」と同じ形だが、残りの段はマージ後の確認ではなく Issue の本体である。Issue を分けると、目的（手順 8 の差し替え）と経緯が別々の Issue に散る。
- **試験の結果を見てから Design Doc を書く（#3684 の元の Plan）**: 試験が何を測るかが決まらず、結果の解釈がその場の判断になる。
