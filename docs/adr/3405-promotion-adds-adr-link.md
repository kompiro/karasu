---
id: ADR-3405
title: ADR の昇格で、新しい ADR へのリンクを足すだけの差分も張り替えと同じく Low に数える
status: accepted
date: 2026-10-30
topic: adr-tooling
refines: [ADR-2331]
related_to: [ADR-2348, ADR-3286, ADR-3309]
assumptions:
  - "symbol: scripts/review/tier.ts :: isLinkInsert"
  - "symbol: scripts/review/tier.ts :: isLinkSwap"
  - "grep: .claude/rules/adr.md :: 新 ADR へのリンクを足すだけの差分"
  - "file: docs/test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md"
---

# ADR-3405: ADR の昇格で、新しい ADR へのリンクを足すだけの差分も張り替えと同じく Low に数える

- **日付**: 2026-10-30
- **ステータス**: 決定済み
- **関連**:
  - Issue #3405（起点。ADR-3309 の昇格 PR #3392 で見つかった）。Design Doc は書かず、合わせる側（分類器か AT の規約か）はユーザーが Issue の起票時に決めた
  - [ADR-2331](2331-adr-automerge-scope.md)（ADR PR の auto-merge 例外を差分の性質で判定する。本 ADR はその「張り替え」に「リンクの追加」を足す）、[ADR-2348](2348-at-records-point-at-issues.md)（AT は Design Doc ではなく Issue を指す）、[ADR-3286](3286-risk-based-review-tiers.md)（段階の分類器。ADR-2331 の条件はその規則になった）
  - TPL: [TPL-3286](../test-perspectives/TPL-3286-merge-eligibility-judged-on-final-diff.md)（本件の失敗モードを追記した）、[TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)
  - コード: `scripts/review/tier.ts`（`isLinkInsert`、`fileTier` の昇格の分岐）

## 背景

ADR-2331 は、ADR の昇格 PR を auto-merge の例外に入れる条件を、差分の性質で決めた。新しい ADR、生成物、Design Doc の削除、そして **Design Doc を指していた参照を新しい ADR に張り替える差分**である。当時の AT は Design Doc を指していたので、昇格 PR が AT に触れるのは張り替えのときだけだった。

その後 ADR-2348 で、AT は Design Doc ではなく Issue を指すことになった。`.claude/rules/acceptance.md` は、ADR ができたら昇格 PR で `- **設計 (ADR)**: …` を足すよう求めている。この AT には張り替える行が無く、ADR へのリンクを足す差分は張り替えではない。ADR-3286 の分類器はこの差分を AT のパスの段階（Medium）に数えるので、規約どおりに AT へリンクを足した昇格 PR は、必ず Medium になって例外から外れる。

ADR-3309 の昇格 PR #3392 では、Medium の理由は AT の 1 行（関連 ADR の並びへのリンクの追加）だけだった。2 つの規則は、それぞれ単独では正しい。

## 決定

**新しい ADR を足す PR では、Markdown の hunk が「新しい ADR へのリンクを足すだけ」なら、張り替えと同じくそのファイルを Low に数える。**

1. **判定**（`isLinkInsert`）: hunk の追加行から、新しい ADR へのリンクを消す。リンクを並びにつないでいた読点・カンマも一緒に消す。残りが削除行と完全に一致すれば「足すだけ」とする。リンクを消した結果、リスト項目のラベルだけ（`- **設計 (ADR)**:`）が残る行は、行ごと足されたものとして数えない。リンクを 1 本も足していない hunk は当たらない。
2. **リンクの形は張り替えと同じ規則に従う**: リンク先は新しい ADR のパス（相対パスと anchor を許す）に限る。URL の中に ADR のパスが現れるだけのものは当たらない。リンクの文字列は ADR のファイル名・パス・`ADR-<n>` のどれかに限る。
3. **ほかの変更が混ざれば外れる**: 同じ hunk に手動項目のチェックや文言の変更があれば、そのファイルはパスの段階のままになる。
4. **High のパスは High のまま**、Markdown 以外のファイルは対象外。張り替えと同じ扱いにする。
5. **Design Doc の削除は条件にしない**: 張り替えはリンク元（削除した Design Doc）が要るが、リンクの追加は新しい ADR があれば判定できる。新しい ADR を足す PR であることは張り替えと同じく条件にする。

## 理由

- **AT の規約が正しいほうに動いた結果だから、規約は戻さない。** Design Doc は昇格で削除されることが規約で決まっているので、AT から指すと必ず切れる（ADR-2348、TPL-2254）。分類器を張り替えに合わせて AT に Design Doc を指させると、この判断を覆すことになる。
- **足すだけの差分は、張り替えと同じく判断を含まない。** どちらも昇格に伴うリンクの整合で、変わるのは新しい ADR への導線だけである。ADR-2331 が除外したかった「受け入れ条件そのものの変更」は、同じ hunk に混ざれば判定から外れる。
- **場所ではなく差分の性質で判定する形を保つ。** `docs/acceptance/**` を昇格 PR でだけ Low にする形にすると、ADR-2331 が却下した「ディレクトリの数え上げ」に戻る。差分の形で書けば、spec の `> Related TPLs:` や TPL のように将来ほかの記録が ADR を指すようになっても、同じ規則で判定できる。
- **実例で確かめた。** この分類器で #3392 のブランチを判定すると Low になる（それまでは Medium）。

### 柵

- `scripts/review/tier.test.ts`「ADR promotion (ADR-2331)」: 関連 ADR の並びへの追加と `- **設計 (ADR)**:` 行の追加だけの AT が、Design Doc の削除の有無にかかわらず Low になること。手動項目のチェックが同じ hunk に混ざると Medium のままになること。`isLinkInsert` の呼び出しを外すと、Low になるテストが落ちる。
- `scripts/review/tier.test.ts`「isLinkInsert」: 並びの先頭・途中・末尾への挿入と、連続した 2 本の挿入を受け入れること。リンクの無い hunk、ほかの ADR へのリンク、名前でないリンク文字列、URL の中のパス、同じ行や hunk のほかの変更を拒むこと。

## 却下した案

### AT の規約を戻し、AT に Design Doc を指させる

昇格 PR は張り替えになり、分類器は変えずに済む。ただし Design Doc は昇格で削除されることが決まっているので、昇格までのあいだ AT は必ず切れるアドレスを持つ。ADR-2348 が直した問題を戻すことになる。

### 昇格 PR では `docs/acceptance/**` の変更を Low に数える

判定は単純になる。ただし AT の受け入れ条件そのものの変更（手動項目のチェックなど）まで人のレビューなしに通る。ADR-2331 がこの形を却下した理由がそのまま当てはまる。

### AT へのリンクの追加を、昇格とは別の PR にする

昇格 PR は Low のまま通る。ただしリンクを足す 1 行のために PR とレビューが 1 往復増え、その PR 自身も AT の変更として Medium になる。

## 影響

- AT に ADR へのリンクを足す昇格 PR は、ほかに変更が無ければ Low になり、auto-merge の例外に入る。
- 既存の張り替えの判定は変わらない（`isLinkSwap` は名前の判定を共有する関数に切り出しただけ）。
- `.claude/rules/adr.md` の適用条件は 5 種になった。`docs/process/review.md` の段階の表も合わせた。
