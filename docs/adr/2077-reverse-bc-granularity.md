---
id: ADR-2077
title: reverse harness の分解粒度 — bounded-context 既定と構造 grounding の不採用
status: accepted
date: 2026-07-27
topic: chat-ai
authors: [kompiro]
related_to: [ADR-1895, ADR-1314, ADR-1820, ADR-2036]
scope:
  packages: [cli, core]
assumptions:
  - "file: .claude/skills/reverse-architecture/SKILL.md"
  - "grep: .claude/skills/reverse-architecture/SKILL.md :: bounded-context granularity"
  - "grep: .claude/skills/reverse-architecture/SKILL.md :: CODEOWNERS"
  - "grep: .claude/skills/reverse-architecture/SKILL.md :: Organizational overlay"
---

# ADR-2077: reverse harness の分解粒度 — bounded-context 既定と構造 grounding の不採用

- **日付**: 2026-07-27
- **ステータス**: 決定済み
- **Issue**: #2077（引き金）/ #1991（証拠元 spike）
- **関連**:
  - [ADR-1895](1895-reverse-architecture-harness.md) — reverse harness 本体（本 ADR が `related_to` で精緻化する。supersede しない）
  - [ADR-1314](1314-krs-spec-v1-freeze.md) — v1 syntax freeze（stable 面のみ凍結。experimental は対象外）
  - [ADR-1820](1820-notation-promotion-gate.md) — notation promotion gate（`boundary` は post-v1.0 watch 面）
  - Design: 昇格元 `docs/design/reverse-bc-granularity.md`（本 PR で削除）、[ADR-2036](2036-scoped-boundary-declaration.md)（scoped boundary — 案 B2 の前提を変える。design doc から昇格済み）
  - 隣接 Issue: [#638](https://github.com/kompiro/karasu/issues/638)（eval corpus / metric）、[#1990](https://github.com/kompiro/karasu/issues/1990)（nest pivot decision 4）、[#2036](https://github.com/kompiro/karasu/issues/2036)（scoped boundary — 案 B2 の再検討条件）
  - TPL: [TPL-999](../test-perspectives/TPL-999-implicit-data-filtering.md)（薄い domain を黙って落とさない）、[TPL-2167](../test-perspectives/TPL-2167-id-not-label-for-identity.md)（identity は `id`）

## 背景

ADR-1895 の reverse harness は「domain 単位で subagent を fan-out する」ことで
domain interior の**深さ**を均一化した。決定の 1 項目め（分解軸 = 論理 domain）は
「bounded-context を primary にする」と方針を書いたが、scout に渡す
**粒度の判定基準**（どこで割り、どこで畳むか）を置いていなかった。
無誘導の harness はこの空白を aggregate 粒度で埋め、gold より細かく過分割していた。

同時に、pivot #1990 decision 4 が差別化要因として名指す**構造シグナル grounding**
（CODEOWNERS + commit-coupling）が harness の品質を上げるのか、未検証だった。

spike #1991 が 4 repo（DDD サンプル `library` / 自社 `hato` / `eShop` / `Dify`）を
人手 gold と突き合わせて実測し、この 2 点に決着をつけた。主指標は V-measure
（homogeneity = 誤併合の少なさ / completeness = 過分割の少なさ）と pairwise F1
（どちらも粒度ミスマッチに頑健）。`domain-F1` は gold より細かく割ると脆いので参考値。

| run | repo | gold→pred | domain-F1 | pairwise-F1 | V-measure | homogeneity |
| --- | --- | --- | --- | --- | --- | --- |
| 無誘導 baseline | library | 3→7 | 0.40 | 0.36 | 0.48 | 0.82 |
| 無誘導 grounded | library | 3→7 | 0.40 | 0.36 | 0.48 | 0.82 |
| **BC baseline** | **library** | **3→3** | **1.00** | **1.00** | **1.00** | **1.00** |
| BC baseline | hato | 14→21 | 0.80 | 0.73 | 0.84 | 0.91 |
| BC baseline | eShop | 8→11 | 0.84 | 0.88 | 0.93 | 1.00 |
| BC baseline | Dify | 19→22 | 0.78 | 0.87 | 0.83 | 0.83 |
| BC **grounded** | Dify | 19→23 | 0.62 | 0.61 | 0.70 | 0.70 |

読み取れる事実は 3 つ。

1. **無誘導の過分割は clean refinement であって scramble ではない。** homogeneity 0.82 は
   「人手が分けたものを誤って併合することは稀」を意味する。推論は壊れておらず、粒度指示が欠けていただけ。
2. **一行の粒度指示で library は完全一致（全指標 1.000）**。実在の多 domain アプリ 3 本にも一般化し、
   homogeneity は全 repo で ≥0.83、gold domain は 4 repo 中 3 本で全数回収。しかも BC 粒度は**安い**
   （library: 5 agent / 318k token vs 9 agent / 489k token）。品質とコストが同じ方向を向く。
3. **構造 grounding は library で完全に無効（小数 3 桁まで baseline と同一）、Dify では悪化**
   （V 0.83→0.70）。CODEOWNERS が縦割り・オーナー単位のスライスを駆動した ＝ Conway 最適化であって
   ubiquitous language ではない。狙う対象が違う。

ADR-1895 の 4-phase pipeline・CLI primitive 2 つ（`coverage` / `subtree`）・意味/構造の責務分離・
Skill 梱包の 4 決定はいずれも本 ADR で無傷であり、それらの出典は引き続き ADR-1895 が正である。

## 決定

**reverse harness は bounded-context 粒度を既定とし、組織シグナルを論理 domain の seam 決定には使わない。
ただし組織構造そのものは karasu の組織軸（`organization` / `team` / `owns`）として別に構築し、
論理分解が済んだ後に `owns` で所有関係を結ぶ。**

変わるのは ADR-1895 の「分解軸 = 論理 domain」に**粒度の判定基準を足す**ことと、
「組織シグナルは seam を決めず組織軸に振り向ける」という**新規制約**の 2 点のみ。
覆しではなく精緻化のため、supersede せず `related_to: [ADR-1895]` を持つ
焦点を絞った追加 ADR として起こす（ADR-1895 は `accepted` のまま）。

**却下したのは「組織構造をそのまま論理構造として採用する」ことであって、組織情報を捨てることではない。**
karasu は論理/物理/組織の三面を別々に定義できる（`docs/concepts.md`）。CODEOWNERS が示すのは
「誰が持つか」= 組織構造であり、これを論理 domain の割り方に流し込むと Conway 方向に歪む
（下記 spike 実測）。正しい置き場は組織軸であり、`realizes`（物理→論理）と対称に
`owns`（組織→論理）で結ぶ。この振り分けは karasu の三面分離テーゼそのものである。

具体的な着地（実運用の単一情報源は ADR ではなく SKILL.md 側にある）:

1. **粒度指示** — `.claude/skills/reverse-architecture/SKILL.md` Phase 1 に、spike #1991 で
   実証された文言を置く（PR #2091 で着地済み）。実証された運用文言:

   > Decompose at **bounded-context granularity**, not per-aggregate. A bounded context
   > groups the aggregates that share a consistency boundary / ubiquitous language (e.g. all
   > of "Lending" — patron, book, hold, checkout, daily-sheet — is ONE domain, not five).
   > Model individual aggregates as **usecases + entities WITHIN** a domain, not as separate
   > domains. Only split when there is a genuine context seam (disjoint schema + weak coupling
   > + separate ubiquitous language).

   split 条件の 3 点（disjoint schema + weak coupling + separate ubiquitous language）が
   scout に「どこで割ってよいか」を与える中核。既存の「dir/module tree は seam ヒント」
   「ball-of-mud は低確信 seam を明示記録」は粒度指示に従属する形で残す（spike の refute 対象外）。

2. **aggregate は domain 内の `usecase` / `entity` として表現する**（案 B1）。両語彙は
   v1.0-stable 層であり後方互換が約束されている。ADR-1895 の Phase 2 が既に subagent に
   自 domain の usecase/entity/resource を書かせているため、追加機構は不要。

3. **組織シグナルの扱いを SKILL に明記する**（案 C1 を精緻化）。禁止だけを書くと
   代替行動を示さず情報を丸ごと捨てるため、「seam 決定に使うな」（negative）と
   「組織軸に振り向けよ」（redirect）を対で書く。「書かなかった」だけでは pivot
   decision 4 が生きている限り善意で seam 決定に再導入される。negative result は
   明示的に記録しないと失われる。

4. **組織構造を harness の出力に組織軸として構築する。** SKILL の Phase 3 に
   organizational overlay ステップを置き、CODEOWNERS / OWNERS 等の所有シグナルを
   `organization` / `team` / `member` として起こし、各 owner の担当パスが落ちる論理
   ノード（`domain` / `service`）に `owns <NodeId>` で結ぶ。**論理分解が済んだ後**に
   構築するため `owns` の対象は既に存在する。1 ノードの所有は 1 team（重複は
   `duplicate-owner-assignment` info が surface する）。`organization` / `team` /
   `owns` はいずれも v1 既存語彙であり、新規機構は不要 — spike の「効くレバーは
   プロンプトであって機構ではない」結論と整合する。

## 理由

- spike の中心的発見は「効くレバーは安価なプロンプト指示であって、新しい機構ではない」。
  したがって解も機構ではなくプロンプトに置く。
- 実証文言をそのまま運用に移す（案 A1）ことで、書き換えによる実証外への逸脱を避ける。
- aggregate を stable 語彙で domain 内に畳む（B1）ことで、harness の出力に experimental 依存の
  互換リスクを乗せない。gold（人手 domain 分解）と同じ粒度に揃う。
- grounding 不採用を測定結果ごと記録する（C1）ことは、「domain 分解 ≠ 組織分解」という
  karasu の論理/物理分離テーゼの言い直しでもあり、harness 固有ではなく製品原則と一貫する。

## 却下した案

- **組織シグナル（CODEOWNERS）を論理 domain の seam 決定に流し込む** — spike で
  library では完全に無効（baseline と小数 3 桁まで同一）、Dify では**悪化**（V 0.83→0.70、
  homogeneity 0.83→0.70、gold 回収 16→13）。オーナー縦割り＝Conway 方向に引っ張り、
  ubiquitous-language decomposition という製品の狙いと対象がずれる。weak な tie-breaker として
  残す案も、「拮抗時のみ参照」を LLM が判定するため常時参照と区別できず、Dify の悪化は
  分解そのものが変わった結果で弱く効かせる制御手段がないため不採用。
  **却下されたのは組織構造を*論理構造として*採ることに限る** — 組織情報そのものは
  捨てず、組織軸（`organization` / `team` / `owns`）に振り向ける（決定 4）。
- **commit-coupling を seam 決定に使う** — 組織所有と違い karasu に対応する軸がなく、
  spike でも grounding アームの一部として悪化に寄与した。振り向け先がないため不採用（discard）。
- **scout に目標 domain 数を渡す** — ADR-1895 が却下した「固定深さ（E1）」の再導入。
  任意 repo に gold 数は存在せず運用不能。採る指示は *seam の判定基準*でなければならない。
- **粒度指示を要約して短く書く** — split 条件の 3 点が落ち、無誘導状態に近づく。実証の外に出るため
  再測定コストを負う。
- **aggregate を nested domain / boundary（experimental）で構造表現する（案 B2）** — 却下ではなく
  **延期**。今日書ける top-level by-reference 形は #2079 が実測した摩擦（冗長な列挙・global id 圧力・
  1:1 membership）を踏む。scoped boundary（#2036）の実装着地でこの障害は解消される見込みだが未着地で、
  かつ spike の全 run が aggregate boundary なしで採点されたため B2 の質は未測定。粒度の決定は B2 採否と
  独立であり、後から加算できる。着地後に #638 の eval で B1 と B2 を比較して再検討する。
- **ADR-1895 を supersede する統合版 ADR にする** — 無傷の 4 決定を全文転記することになり、
  転記時の劣化リスクを負う。本件は覆しではなく精緻化 + 新規制約の追加であり、`.claude/rules/adr.md` の
  supersede 規定（既存 ADR を覆すとき）の想定と噛み合わない。焦点を絞った追加 ADR（`related_to`）とした。

## 派生

### eval metric（#638 への接続）

spike で使った採点方式を #638 の eval corpus / metric 候補として記す。

- **V-measure**（homogeneity / completeness）と **pairwise F1** を主指標にする。どちらも gold と
  予測の粒度がずれても壊れない。
- `domain-F1`（greedy Jaccard ≥0.3）は参考値。予測が gold より細かいと脆い。
- gold と予測が独自のクラスタ記法を使う大規模 repo では **file-level resolver** で
  ファイル単位に正規化してから採点する（prefix マッチが成立しないため）。
- **homogeneity を重視する**根拠: 過分割は人手ラチェット（畳む）で安全に精錬できるが、
  誤併合は復元できない。安全な方向と危険な方向が非対称である。

### 引き継ぐ TPL

TPL-999（薄い domain を黙って落とさない）と TPL-2167（identity は `id`）は
本 ADR が harness の分解を扱う以上、引き続き参照観点として有効。

### 未解決 / 別管轄

- **pivot #1990 decision 4 の再 scope**（構造 grounding を差別化要因から外す判断）は pivot design doc の
  管轄。本 ADR は測定結果を提供するのみ。
- **人手 PR 還元ラチェットの検証** — spike 未検証。decision 4 の有望な側だが本件スコープ外。
- **粒度指示の repo 特性依存** — 実測は 4 repo（85 ファイル〜7.8k ファイル）の範囲。monorepo /
  多言語 repo など未測定の形状はある。
