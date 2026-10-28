---
id: ADR-3350
title: リリーストレインの PR の段階を、差分が changeset version の出力だけなら下げる規則は採用しない
status: not_adopted
date: 2026-10-28
topic: build
related_to:
  - ADR-3286
  - ADR-2922
  - ADR-1370
scope:
  packages: []
  concerns: [ci, deployment]
assumptions:
  - 'grep: scripts/review/tier.ts :: HIGH_GLOBS: readonly string\[\] = \[[^\]]*"\*\*/CHANGELOG\.md",'
  - 'grep: scripts/review/tier.ts :: HIGH_PACKAGE_FIELDS = \[[^\]]*"version",'
---

# ADR-3350: リリーストレインの PR の段階を、差分が changeset version の出力だけなら下げる規則は採用しない

- **日付**: 2026-10-28
- **ステータス**: 不採用
- **関連**:
  - Issue [#3350](https://github.com/kompiro/karasu/issues/3350)（リリーストレインの PR を CodeRabbit から外す提案）
  - PR [#3354](https://github.com/kompiro/karasu/pull/3354)（Medium にする Design Doc。マージせずに閉じた）
  - 観測した PR: [#3349](https://github.com/kompiro/karasu/pull/3349)（2026-10-25 のトレイン）
  - [ADR-3286](3286-risk-based-review-tiers.md)（リスク段階。release の変更を High にした。この ADR はその宿題だった #3350 の結論）
  - [ADR-2922](2922-monthly-release-train.md)（月次トレイン）、[ADR-1370](1370-release-flow-actions-driven.md)（リリース PR は人が開き、CHANGELOG を読んでマージする）
  - `docs/release.md`（マージで `release.yml` が publish する）

## 背景

月次トレインのリリース PR の差分は、`changeset version` が作った版の更新、`CHANGELOG.md` の追記、消費した `.changeset/*.md` の削除だけである。CHANGELOG の各項目は、changeset を足した PR ですでにレビューを通っている。

それでもリリース PR には CodeRabbit の自動レビューが回り、毎月枠を使う。#3349 ではレビューが rate limit に当たって走らなかったのに、`CodeRabbit` のステータスは pass になった。#3350 はリリース PR を CodeRabbit から外すことを提案した。

その後 ADR-3286 で、PR の段階を差分から決めるようになった。`CHANGELOG.md` と `package.json` の `version` は release の変更として High で、High は CodeRabbit のラウンドを回し、人間が差分を読む。#3354 はこの上で、差分が `changeset version` の出力だけだと分類器が確かめられるときに Medium と判定する規則を提案した。

## 決定

**リリース PR の段階を下げる規則は分類器に足さない。差分が `changeset version` の出力だけでも、リリース PR は ADR-3286 のとおり High にする。**

## 理由

- **マージの危険は差分の出どころでは変わらない。** リリース PR をマージすると `release.yml` が npm に publish し、取り消せない（`docs/release.md`）。差分が生成物だとわかって言えるのは「CodeRabbit が見るものが無い」ことで、マージの危険が下がることではない
- **Medium にする理由が、High の条件を指していた。** #3354 は Low ではなく Medium にする理由を「人が版と CHANGELOG を読んでマージする（ADR-1370）」とした。ADR-3286 で「人間が差分を読む」は High の通す条件で、Medium の条件は「サマリー・証拠・preview を見た人間の判断」である
- **CodeRabbit の枠の問題は ADR-3286 でほぼ解消した。** リリース PR はふつう月 1 本で、再レビューは Critical / Major を直したラウンドの後だけなので、生成物の差分ではふつうレビューは 1 回で終わる。分類器に規則を 1 つ足して保守する理由になるほどの量ではない

## 却下した案

- **生成物だけの差分を Medium と判定する（#3354）**: 上の理由のとおり。規則の 7 条件（ファイルの種類、changeset の削除、CHANGELOG の追記だけ、パッケージ集合の一致、`changeset version` の出力との一字一句の照合、モード・バイナリの変更なし、信頼された作成者）は、生成物かどうかを判定するには十分だったが、判定する必要が無かった
- **リリース PR を CodeRabbit から外す（#3350 の当初案）**: ADR-3286 で、CodeRabbit は `risk: high` / `risk: design` のラベルの PR だけをレビューするようになり、外す仕組み（ignore コマンド・除外ラベル）は役目を終えた。外すなら段階を下げることになり、上の案と同じ理由で採らない

## 再検討する条件

- 導入 1 か月後の計測（[#3380](https://github.com/kompiro/karasu/issues/3380)）などで、リリース PR が CodeRabbit の枠の目立つ割合を占めるとわかったとき
- リリース PR の High のラウンドが、レビュー 1 回で終わらないことが続くとき

## 残したこと

- rate limit に当たってレビューが走らなかったのに `CodeRabbit` のステータスが pass になる件は、段階の問題ではない。High の PR では `/coderabbit-converge` がレビューが届いたかを CodeRabbit のレビューとコメントから読むので、ステータスを読んでマージすることはない
