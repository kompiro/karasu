---
id: ADR-20260713-01
title: notation promotion gate — experimental notation を stable 層へ昇格させる規律
status: accepted
date: 2026-07-13
topic: build
depends_on:
  - ADR-20260616-06
related_to:
  - ADR-20260616-04
  - ADR-20260615-04
---

# ADR-20260713-01: notation promotion gate — experimental notation を stable 層へ昇格させる規律

- **日付**: 2026-07-13
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1820](https://github.com/kompiro/karasu/issues/1820)（parent: [#1816](https://github.com/kompiro/karasu/issues/1816) notation watch round 2, item 4）
  - [ADR-20260616-06](20260616-06-krs-spec-v1-freeze.md) — `.krs` / `.krs.style` v1.0 freeze（experimental / v1.0-stable の二層を導入した前提）
  - [ADR-20260616-04](20260616-04-rule-diagnostic-separation-and-catalog.md) — 規則 ↔ 診断の分離（v1.0-stable criteria 条件 (2) の拠り所）
  - [ADR-20260615-04](20260615-04-migration-intent-fields.md) — migration intent annotations（`@deprecated` graceful degradation。昇格せず deprecate する notation を畳むときの受け皿）
  - `docs/roadmap.md` § [promotion gate（notation 評価の規律）](../roadmap.md#promotion-gatenotation-評価の規律) — 本 ADR の生きた適用状態
  - 証拠源: [#1783](https://github.com/kompiro/karasu/issues/1783) karasu-nest（共有 corpus）

## 背景

[ADR-20260616-06](20260616-06-krs-spec-v1-freeze.md) で `.krs` / `.krs.style` を v1.0 として freeze した際、いくつかの notation は **v1.0-stable（後方互換を約束）** ではなく **experimental（post-v1.0 watch — 互換を明示的に約束しない）** として据え置いた（棚卸しの watch item C / D など）。experimental 層を設けた狙いは「観察してから決める」ものを早すぎる段階で stable に硬直化させないことにある。

しかし「experimental をいつ・どういう証拠で評価し、stable へ昇格させる（あるいは変更・deprecate する）か」の**トリガーが未定義**だった。後方互換ゆえに rename / 削除は高コストであり、この非対称性（据え置きは安価・除去は高コスト）は afterthought ではなく**意図した規律**として明文化する必要がある。#1567 の棚卸し以降に実 OSS を書いて出た round 2 の finding（#1816）でも、この欠落が item 4（#1820）として挙がった。

## 決定

experimental notation の評価は **promotion gate** を通す。**既定は experimental 据え置き**とし、証拠に基づくトリガーが引かれたときにのみ「freeze で定義した v1.0-stable 層（後方互換を約束する層）へ昇格するに足るか」を評価する。昇格すると決めた場合、**どのリリースに載せるか**も gate の判断に含める — v1.0 は既にリリース済みなので、昇格は既存 v1.0 への後付けではなく将来リリースへの搭載になる。既存構文への後方互換な追加なら **v1.x minor**、既存構文の変更・再設計を伴い破壊的になるなら **v2.0（major）** に載せ、「v2.0 とすべきか」を昇格判断とセットで問う。gate の**決定**は本 ADR（ガバナンス）に、**生きた適用状態**（watch item ごとの昇格トリガー）は `docs/roadmap.md` に置く。`docs/process.md`（日々の開発サイクル）には置かない。

## 理由

- **非対称なコストに合わせた既定**: 追加しない／据え置くコストは低く、後方互換を約束したあとの削除コストは高い。ゆえに昇格に渋く、open／既存構文での表現に寛容に、灰色は experimental に留める。審査の問いは「**stable へ昇格するに足る実利用証拠があるか**」であって「廃止すべきか」ではない。滅多に昇格しなければ、滅多に除去せずに済む。
- **証拠ベースのトリガー（カレンダーではない）**:
  - (i) その notation に触れるリリースの直前 — 互換約束を新たに背負う直前に一度立ち止まる。載せる版が v1.x minor（追加互換）か v2.0 major（破壊的変更を伴う昇格）かを選ぶタイミングでもある。
  - (ii) 実利用データが溜まった時 — earn-its-keep（使われているか・誤用が少ないか）を観測できるようになったタイミング。
  - (iii) その notation に対する混乱 / bug Issue が再発した時 — 痛みが surface したシグナル。
- **証拠源 = karasu-nest の共有 corpus**: 実 OSS を書いた `.krs` が、watch tier の必要とする「実利用 pain」の観測装置になる。ホスト型サービス（#1783）を notation 評価の計測器として位置づける。
- **昇格のリリース版も判断対象**: v1.0-stable は既にリリース済み（[#1317](https://github.com/kompiro/karasu/issues/1317) / [#1764](https://github.com/kompiro/karasu/issues/1764)）。ゆえに「stable 層へ昇格」は既存 v1.0 への後付けではなく、将来リリースへの搭載を意味する。gate は昇格の可否だけでなく **どの版で互換を約束するか**（後方互換な追加なら v1.x minor、既存構文の変更・再設計を伴うなら v2.0 major）も決める。この分岐を明示することで、破壊的な昇格が minor に紛れ込むのを防ぐ。
- **配置の分離**: 決定（gate のセマンティクス・既定 experimental・証拠源）は不変度が高いので ADR。watch item ごとの昇格判断は状態が動くので roadmap（living）。両者は altitude が異なるため混ぜない。`process.md` は開発サイクルであって notation ガバナンスではない。

## 却下した案

- **カレンダーベースの定期レビュー**（例: 四半期ごとに全 experimental を棚卸し）: 証拠が溜まっていない notation まで機械的に俎上に載せ、昇格圧を生む。既定「据え置き」の思想と噛み合わないため却下。トリガーは時間ではなく証拠（利用・痛み・互換約束の直前）に結ぶ。
- **既定で昇格（experimental を暫定とみなし積極的に stable 化）**: 削除コストの非対称性を無視する。stable 化＝後方互換の約束であり、証拠なき昇格は将来の major でしか外せない負債になる。既定は逆（据え置き）に置く。
- **gate を `docs/process.md` に書く**: process.md は日々の開発サイクル（PR フロー等）の altitude。notation ガバナンスは別 altitude であり、混在させると両方が読みにくくなる。決定は ADR、適用は roadmap に分けた。
