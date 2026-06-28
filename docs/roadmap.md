# karasu ロードマップ

- **ステータス**: living（随時更新する。決定は ADR、実行・進捗は GitHub Issues で管理し、本書は**全体方針**を保持する）
- **現在のフォーカス**: `.krs` / `.krs.style` **v1.0 確定済み** — [ADR-20260616-06](adr/20260616-06-krs-spec-v1-freeze.md) の freeze 方針を公開ローンチ（[#1317](https://github.com/kompiro/karasu/issues/1317) / [#1764](https://github.com/kompiro/karasu/issues/1764)）で発効した。次の地平は [§post-v1.0 horizon（ロードマップ）](#post-v10-horizonロードマップ) に集約する（notation watch round 2 / comprehension / karasu-nest ほか）。
- **関連**:
  - [#1567](https://github.com/kompiro/karasu/issues/1567) — notation gap stocktaking（本ロードマップの起点）
  - [#1314](https://github.com/kompiro/karasu/issues/1314) — OSS launch Phase 2: `.krs` / `.krs.style` v1.0 spec freeze の ADR（本ロードマップが入力になる）
  - [#1317](https://github.com/kompiro/karasu/issues/1317) — OSS launch Phase 3: hard launch（v1.0 release）

## このドキュメントの位置づけ

本書は karasu の**方針レベルのロードマップ**を living doc として残すものである。
個々のタスクの実行・進捗は GitHub Issues で管理し、確定した設計判断は ADR に
記録する。本書はそれらを束ねる「どこへ向かっているか」の全体像を提供する。

> **process 注記（[#1567](https://github.com/kompiro/karasu/issues/1567) → [#1717](https://github.com/kompiro/karasu/issues/1717)）**:
> 理想は roadmap-first（公開ロードマップを先に置き、それに対して notation を
> 評価する）。#1567 の棚卸しは 5 本のガイド執筆（#1561）と spec 通読由来の
> hands-on な起点で、roadmap を欠いたまま走った **interim**（findings は結論では
> なく候補）だった。**#1717 でその loop を閉じ**、本書を notation を再評価するための
> **durable な driver** とする。以降の Syntax v1.0 セクションは、まず
> [§syntax v1.0 の定義（criteria）](#syntax-v10-の定義criteria) と
> [§guiding principle](#guiding-principle-structure-vs-implementation-境界) を
> 基準として置き、#1567 の findings をその基準に対して評価した結果として読む。

---

## Syntax v1.0

`.krs` / `.krs.style` の構文・タグ・アノテーション・診断 register を v1.0 として
freeze（後方互換を約束）するための readiness と計画。最終的な freeze 判断は
[#1314](https://github.com/kompiro/karasu/issues/1314) の ADR で行う。

### syntax v1.0 の定義（criteria）

「v1.0 として freeze する」とは、その notation feature の **後方互換を約束する**こと
である。何を freeze し、何を freeze しないかを ad-hoc に決めないために、feature を
次の 3 tier に分類する基準を置く。各 finding / 機能はこの基準に対して評価する
（[棚卸し finding の決着状況](#棚卸し-finding-の決着状況) の disposition 列はこの
分類の適用結果である）。

| tier | 意味（互換保証） | 入る条件（すべて満たす） |
| --- | --- | --- |
| **v1.0-stable** | 後方互換を約束する。破壊的変更は major でしか入れない | (1) [structure-vs-implementation 境界](#guiding-principle-structure-vs-implementation-境界) の構造側にある（実装詳細を持ち込まない）／(2) spec に明文化済みで、規則 ↔ 診断が対応づいている（[ADR-20260616-04](adr/20260616-04-rule-diagnostic-separation-and-catalog.md)）／(3) 既存の `.krs` を壊さずに freeze できる（実装と spec が一致している）／(4) 削るより残すほうが利用者の表現コストが低い |
| **experimental（post-v1.0 watch）** | in-core で使えるが互換は**明示的に約束しない**。実利用の pain を観察してから stable / 変更 / deprecate を決める | (1)〜(4) のいずれかが未充足だが、構文を変えずに当面運用できる。境界が灰色（構造か実装か判断保留）／実利用が不足し earn-its-keep が未確認、のいずれか |
| **deprecated** | 段階的に外す。`@deprecated(until: …)` の graceful-degradation で移行猶予を与える（[ADR-20260615-04](adr/20260615-04-migration-intent-fields.md)） | 構造側にない、または redundant と確定し、後継が用意できている |

補足:

- **warn-don't-error が stable 判定の前提**: 未完成・in-flight なモデルでも render
  できることが karasu の差別化要因であり、freeze する診断 register は fact vs style
  の二分（[TPL-20260514-08](test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)）に従う。
- **open annotation set は常に stable 側**: 未知の annotation は display-only で通る
  ため、新語彙の追加が後方互換を壊さない。features を experimental に置くより、
  open-set へ逃がせるものは逃がす（[ADR-20260615-04](adr/20260615-04-migration-intent-fields.md)）。
- **experimental を明示することが目的**: 「観察してから決める」ものを早すぎる段階で
  stable に硬直化させないため、freeze しないものを曖昧にせず experimental と名指す
  （`docs/concepts.md` の "these goals and non-goals are not fixed" の精神）。

### guiding principle: structure-vs-implementation 境界

v1.0 criteria 条件 (1) の拠り所であり、棚卸しの watch item **D / G / H / I** が共有する
緊張の正体でもある。karasu は **slowly-changing な構造的コンテキスト**（何が存在し、
どう関係し、誰が所有するか）を語り、実装詳細・runtime 状態はその外に置く
（`docs/concepts.md` [§Structure, not implementation](concepts.md#structure-not-implementation-client) / 同 §What karasu is not）。

この境界が v1.0 スコープを切り分ける判定軸になる:

- **構造側にある feature は v1.0-stable の候補**になりうる。
- **境界に接近する feature は experimental に置く**か、構造側に留まる根拠を spec /
  concepts に明文化してから stable に上げる。

watch item をこの軸で読むと:

| watch | 境界に対する位置 | criteria 上の扱い |
| --- | --- | --- |
| **G** `client` sub-language | 境界に**最も近い**が、各 feature が「アクセスパス構造」を名指し実装を名指さない test を通る | concepts に境界注記済み（[§Structure, not implementation](concepts.md#structure-not-implementation-client) / [TPL-20260616-03](test-perspectives/TPL-20260616-03-client-vocabulary-structure-not-implementation.md)）→ **stable** |
| **H** CRUD verb-decoration 1:N | usecase の振る舞い（実装寄り）に接近するが、実在のデータ作用の**構造**を簡潔に表す | spec/parser 実装済み・削る互換コストが大きい → **stable**（[付録](#付録-finding-hcrud-verb-decoration-1nを-v10-で残す判断) で earn-its-keep を watch） |
| **I** infra block keyword vs shape tag | どちらも構造側だが**語彙が二重化**（dual representation）し audience が混同しうる | spec に使い分け注記済み（#1626）→ **stable**（[TPL-20260519-02](test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) で観察） |
| **D** edge の protocol/cardinality | first-class 化は**実装詳細を edge に持ち込む**圧力になりうる（構造か実装か灰色） | 当面 tag + `description`/`link` の散文に逃がす → **experimental** |
| **C** `translate` の domain 推論 | core 構文の問題ではなく adapter 側（scaffold → readable の手作業） | core spec に gap なし → **experimental（adapter 課題）** |

### readiness サマリ

[#1567](https://github.com/kompiro/karasu/issues/1567) の棚卸しの結論は「言語は
アーキテクチャを語るのにほぼ *just enough*」であり、過不足の重心は**機能不足では
なく model redundancy と遷移状態の表現**にあった。棚卸しから派生した子 Issue
（#1564 / #1566 / #1568 / #1569 / #1570）は**すべて merge 済みで ADR 昇格済み**。

したがって**言語の中身は v1.0 候補として揃っている**。残るギャップは「言語の
不足」ではなく「**暗黙ルールが spec に書かれていない**」という公開品質の問題で
あり、これは言語を変えずに閉じられる。

### 棚卸し finding の決着状況

記号は [#1567](https://github.com/kompiro/karasu/issues/1567) 本文の見出しに対応。
disposition 列は [§criteria](#syntax-v10-の定義criteria) の 3 tier を各 finding に
適用した結果である（**確定** = v1.0-stable、**post-v1.0 watch** = experimental）。

| ID | finding | 現状 | v1.0 disposition |
| --- | --- | --- | --- |
| **F** | service/domain の `team` property（excess） | [ADR-20260614-01](adr/20260614-01-remove-team-property.md) で削除、`team-property-removed` error 化 | **確定**（freeze 対象） |
| **A** | ownership-during-migration の register 不整合 | [ADR-20260615-01](adr/20260615-01-ownership-during-migration.md) で `duplicate-owner-assignment` を error→info に降格 | **確定** |
| **B** | structured lifecycle-annotation fields | [ADR-20260615-04](adr/20260615-04-migration-intent-fields.md) で `@name(key: "value")` + `until`/`from` built-in（runtime 評価なし） | **確定** |
| (#1570) | shared-database fan-in に diagnostic 無し | [ADR-20260615-02](adr/20260615-02-shared-infra-fan-in-diagnostic.md) で `shared-infra-fan-in`（info）追加 | **確定** |
| (#1569) | `unresolved-edge-endpoint` warning が spec §S6 に約束されつつ未実装 | bug fix 済み | **確定** |
| (#1566+) | team block への annotation / owner priority | [ADR-20260615-05](adr/20260615-05-team-annotations-owner-priority.md) で `migrationPriority()` による primary owner 選定 | **確定** |
| **H** | CRUD verb-decoration 1:N（`replace:create,delete`） | spec + parser 実装済み | **v1.0 で残す**（freeze 対象。判断根拠は付録参照） |
| **G** | `client` sub-language の複雑さが実装詳細線に接近 | spec 上は文書化済み・gap なし | **freeze 前に concepts へ境界注記** |
| **I** | infra block keyword（`database`/`queue`/…）vs shape tag（`[table]`/`[queue]`/…）の vocabulary overlap | 衝突強制なし。semantic overlap | **freeze 前に audience guidance** |
| **C** | `translate` の抽象化が部分的（domain 推論なし） | core 構文に gap なし。translate adapter 側の課題 | **post-v1.0 watch**（experimental — adapter 課題） |
| **D** | edge semantics が sync/async + tag のみ（protocol/cardinality が first-class でない） | protocol/cardinality は `description`/`link` の散文に逃がす | **post-v1.0 watch**（experimental — 境界が灰色） |
| **E** | reading-confidence / uncertainty | onboarding guide §5.1（#1561）で open-set annotation（`@unverified`/`@assumed`）+ `.krs.style` により対応済み | **対応済み（docs）** |

### ergonomic friction（学習コスト — 暗黙ルールの明文化）

| friction | spec の現状 | v1.0 disposition |
| --- | --- | --- |
| edge は**所属ブロックの id を起点**にする（domain edge は source `domain` 内に書く） | 明文化されていない。例から暗黙的に読み取るのみ | **freeze 前に spec 明文化 + 名前付き診断を新設** |
| top-level の `user` / edge は invalid（`system` 内に置く） | 明文化されていない。診断名なし | **freeze 前に spec 明文化 + 名前付き診断を新設** |
| nested node の named import は dotted path（`import { Sys.Svc.Domain }`） | 明文化済み（[ADR-20260513-03](adr/20260513-03-import-system-nested.md)） | 済み |

### v1.0 freeze のスコープ

freeze する = 後方互換を約束する。

**freeze に含める:**

- **構文**: system / service / domain / usecase / resource / user / edge（sync `->` /
  async `-->`）/ infra block（database/queue/storage/table…）/ deploy / organization /
  team / member / import（nested dotted path 含む）。
- **タグ・アノテーション**: `docs/spec/tags-annotations.md` の builtin 集合と
  **open annotation set のセマンティクス**（未知 annotation は display-only で許容）。
- **診断 register**: fact vs style の二分（[TPL-20260514-08](test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)）と、
  ADR-20260615-01/02/05 で確定した register 割り当て。**warn-don't-error** 方針
  （未完成・in-flight なモデルでも render できる差別化要因）。
- **lifecycle annotation の parameter 構文**（[ADR-20260615-04](adr/20260615-04-migration-intent-fields.md)、
  `@name(key: "value")` + graceful degradation by precision）。
- **CRUD verb-decoration**（1:N 含む。付録の判断に基づく）。
- 配置 scope の診断 `edge-source-mismatch`（既存）/ `top-level-declaration`（新設、#1624）。

**freeze に含めない（post-v1.0 watch — 明示的に約束しない）:**

- **C** translate の domain 推論（adapter 側課題）
- **D** edge の first-class protocol/cardinality（当面 tag + 散文）

watch item を「freeze しない」と明示することで、「観察してから決める」ものを
早すぎる段階で硬直化させない（`docs/concepts.md` の "these goals and non-goals
are not fixed" の精神に沿う）。

**動かさない非ゴール:**

- 時間軸 / sequence（[#23](https://github.com/kompiro/karasu/issues/23),
  [#28](https://github.com/kompiro/karasu/issues/28)）・code generation・ER modeling・
  runtime metrics・infra topology・canvas editing は `docs/concepts.md` の
  "Goals and non-goals" で確定済み。v1.0 freeze はこの線を動かさない。

### 方針の根拠（なぜ段階 freeze か）

「v1.0 ready をどう定義し、freeze をいつ切るか」で 3 案を比較した。

| 観点 | 案1 即 freeze | **案2 段階 freeze（採用）** | 案3 roadmap-first 再評価まで保留 |
| --- | --- | --- | --- |
| #1314 着手までの距離 | 最短 | freeze 前タスクを挟む | 不定 |
| freeze する spec の完結度 | 暗黙ルール残置 | 暗黙ルール解消 | 最高 |
| 言語変更の有無 | なし | なし（明文化 + scope 診断のみ） | あり得る |
| OSS 公開面の学習コスト | 高いまま輸出 | 低減 | 低減 |
| 早すぎる硬直化リスク | 中（watch も曖昧に固定） | 低（watch を明示除外） | 低 |
| #1567 の deferred 方針との整合 | ○ | ○ | ×（roadmap 確立を deferred 済み） |

**案2 を採用**: 子 Issue の ADR 被覆により言語の中身は揃っている。残るギャップは
言語を変えずに閉じられる「暗黙ルールの未明文化」であり、freeze を遅らせる対価が
小さく完結度が大きく上がる。案3 は #1567 の deferred 方針と衝突し #1314 を無期限に
塞ぐ。本ロードマップ自体が roadmap-first の代替（interim roadmap）を務める。

### 実行計画（GitHub Issues で管理）— ✅ 完了

freeze 前タスクはすべて完了し、[#1314](https://github.com/kompiro/karasu/issues/1314) で
freeze ADR（[ADR-20260616-06](adr/20260616-06-krs-spec-v1-freeze.md)）を確定した。
**凍結方針は決定済み**で、v1.0 は公開ローンチ（[#1317](https://github.com/kompiro/karasu/issues/1317) /
[#1764](https://github.com/kompiro/karasu/issues/1764)）で**確定・発効した**。

| # | タスク | 種別 | Issue | 状態 |
| --- | --- | --- | --- | --- |
| 1 | edge 起点 scope の spec 明文化（規則名 = edge origin scope）。診断は既存の `edge-source-mismatch` を back-ref（rename しない） | spec + AT | [#1623](https://github.com/kompiro/karasu/issues/1623) | ✅ #1630 |
| 2 | top-level `user`/edge 禁止の spec 明文化 + 名前付き診断 `top-level-declaration` 新設 | core + spec + AT | [#1624](https://github.com/kompiro/karasu/issues/1624) | ✅ #1637（user scoping: [ADR-20260616-05](adr/20260616-05-user-system-scoped.md)） |
| 3 | **G** `client` sub-language の structure vs implementation 境界注記を `docs/concepts.md` に追加 | docs | [#1625](https://github.com/kompiro/karasu/issues/1625) | ✅ #1643 |
| 4 | **I** infra block keyword と shape tag の使い分け意図を spec に注記 | docs | [#1626](https://github.com/kompiro/karasu/issues/1626) | ✅ #1636 |
| 5 | v1.0 spec freeze ADR | adr | [#1314](https://github.com/kompiro/karasu/issues/1314) | ✅ [ADR-20260616-06](adr/20260616-06-krs-spec-v1-freeze.md)（#1647） |
| — | 規則↔診断の分離 + 診断カタログ | adr | — | ✅ [ADR-20260616-04](adr/20260616-04-rule-diagnostic-separation-and-catalog.md)（#1629/#1641） |

> **proactive TPL 同梱の義務**: タスク 1〜4 は `docs/spec/` / `docs/concepts*.md` への
> 新規セクション追加を含むため、CLAUDE.md / `docs/process.md`「spec / concepts 改訂時の
> proactive TPL 同梱」に従い、各 PR で proactive TPL を最低 1 件同梱する（または既存 TPL に
> back-ref を張る）。タスク 1/2 の診断新設は実装 + AT を伴う。

---

## 付録: finding H（CRUD verb-decoration 1:N）を v1.0 で残す判断

棚卸しでは `replace:create,delete` のような **CRUD verb-decoration の 1:N** を
excess 候補（finding H）として挙げた。検討の結果、**v1.0 で残す**（freeze 対象）。
判断の透明性のため、「削除したい背景」も以下に残す。

### 削除したい背景（excess として挙がった理由）

- **アーキテクチャツールにしては intricate**: 1 つの verb に複数 CRUD を結びつける
  記法（`<verb>:<crud>[,<crud>...]`）は、構造を語るツールの語彙としては細かすぎる
  懸念がある。CRUD matrix は「どの usecase が何を C/R/U/D するか」を示せれば足りる、
  という見方では 1:N の表現力は過剰になりうる。
- **学習コスト**: disambiguation ルール（verb 名と CRUD の対応）を覚える必要があり、
  open annotation のような「知らなくても display-only で通る」性質と異なり、誤用が
  意味のずれを生む。
- **実装詳細線への接近**: 1 操作が複数の永続化作用を持つ、という粒度は usecase の
  振る舞い（実装寄り）に近づき、karasu の「構造を語る」中心からやや外れる方向。

### 残す理由

- **すでに spec + parser に実装済み**で、CRUD matrix view が `decoratedAs` を読む
  形で機能している。v1.0 直前に削除すると後方互換を自ら破ることになる。
- 1:N は「1 つの usecase 操作が複数のデータ作用を持つ」という**実在のモデル**を
  簡潔に表せる。削るとユーザーは複数 edge / 複数 verb への分解を強いられ、かえって
  冗長になる。
- excess の懸念（intricate / 学習コスト）は **spec の説明改善**で緩和できる範囲で
  あり、構文削除という後方非互換の対価に見合わない。

### 残す前提での watch

- v1.0 後、実利用で 1:N が earn its keep しているか（実際に使われ、誤用が少ないか）を
  観察する。問題が出れば post-v1.0 で deprecation を別途検討する（ADR-20260615-04 の
  `@deprecated` graceful-degradation の枠組みが使える）。

---

## post-v1.0 horizon（ロードマップ）

- **ステータス**: living。v1.0（[ADR-20260616-06](adr/20260616-06-krs-spec-v1-freeze.md)）で構文を freeze した後の **rolling な次の地平**を束ねる。単一バージョンの release ではないので "v2.0" のような版では括らない。
- **管理モデル**: GitHub Milestone は 1 Issue 1 個のフラット1軸なので、2軸を分けて持つ — **時間軸（いつ着手）= 日付 Milestone**（`2026-07` / `2026-09` / `2026-12` / `Backlog`）、**テーマ軸（何を）= parent Epic Issue + `epic:` ラベル**。日付は keystone（下記）後に確定する intent バケツ。根拠は本書と各 ADR、詳細経緯は parent Epic Issue が持つ（[#1814](https://github.com/kompiro/karasu/issues/1814) が全体 planning の傘）。
- **後方互換**: notation watch（round 2）は**後方互換を保ったまま**実利用で評価する営みで、昇格は v1.x 内で [§promotion gate](#promotion-gate-notation-評価の規律) を通す（破壊的変更を前提にしない）。
- **動かさない非ゴール**: 時間軸 / sequence（[#23](https://github.com/kompiro/karasu/issues/23) / [#28](https://github.com/kompiro/karasu/issues/28)）・code generation・ER modeling・runtime metrics・infra topology・canvas editing は `docs/concepts.md` で確定済み。post-v1.0 horizon はこの線を動かさない。実利用で圧力が出たものは下記 [§非ゴール圧力 log](#非ゴール圧力-log) に記録のみする。

### keystone: primary path と主 surface（決定済み 2026-06-28）

post-v1.0 の優先度はこの決定に従属する。壁打ちの全容は PRD
[`docs/design/keystone-primary-path.md`](design/keystone-primary-path.md)（[#1825](https://github.com/kompiro/karasu/pull/1825)）、
要件は Epic [#1826](https://github.com/kompiro/karasu/issues/1826) に展開した（ADR ではなく PRD → Issue）。

**決定**:

- **目的関数 = adoption**。
- **read / record split**: **nest = 知らないシステムを*読む* funnel/utility**（再訪の主軸ではない）/
  **karasu 本体 = 自分のシステムを*残す* retained 製品**（living architecture record）。
- **return trigger = 設計判断のとき**。原則 **record-as-byproduct**（記録は判断の副産物。
  「システム変更→更新」を主軸にせず doc-rot を構造的に回避）。
- **「残す」射程 = 構造のみ**。link 方向は **ADR→karasu permalink**（karasu は decision metadata を持たない）。
- **surface = pipeline**（in-repo で書く → nest で描画/permalink → ADR が指す）。permalink 先は **app/nest URL**。
  leverage = nest の **deep/repo-backed/ref-pinned permalink**（near-term は inline `?s=` + taka）。
  これにより **nest Phase 2（[#1786](https://github.com/kompiro/karasu/discussions/1786)）が funnel→retained の背骨に格上げ**。

**含意**: notation/cookbook は「言語を伸ばす」のではなく retained record を支える従属（promotion gate 据え置きと整合）。
**surface portfolio** は1点集中でなく pipeline 維持なので、独立の縮退判断は不要になった。

### 実行中の柱（テーマ = Epic Issue + `epic:` ラベル）

着手タイミングは日付 Milestone（`2026-07` / `2026-09` / `2026-12` / `Backlog`）で別管理する。Epic 親 Issue 自体は複数 Milestone にまたがるため日付を持たせない。

| 柱 | Epic parent / label | 中身 | 着手 intent |
| --- | --- | --- | --- |
| **Notation watch (round 2)** | [#1816](https://github.com/kompiro/karasu/issues/1816) ・`epic: notation-watch-r2` | 実 OSS を書いて出た notation finding。[#1567](https://github.com/kompiro/karasu/issues/1567) の続編。既定 = experimental 据え置き | cheap な [#1818](https://github.com/kompiro/karasu/issues/1818)/[#1820](https://github.com/kompiro/karasu/issues/1820) を 2026-09、残りは Backlog |
| **Comprehension / explorable viewer** | [#1817](https://github.com/kompiro/karasu/issues/1817) ・`epic: comprehension` | 大規模（AI 生成）図を認識可能にする。壁は**横の密度**（縦の深さは drill-down で足りる） | 第一手 [#1821](https://github.com/kompiro/karasu/issues/1821) を 2026-09、残りは Backlog |
| **karasu-nest** | [#1783](https://github.com/kompiro/karasu/issues/1783) ・`epic: karasu-nest` | ホスト型の code+preview。share/render/OGP は出荷済み、Phase 2 catalog は [#1786](https://github.com/kompiro/karasu/discussions/1786)、URL 短縮 taka は [#1786 コメント](https://github.com/kompiro/karasu/discussions/1786) の統合 contract | Phase 2 は Backlog（keystone 後） |
| **OSS launch (Phase 3)** | `epic: oss-launch`（[#1317](https://github.com/kompiro/karasu/issues/1317) / [#1767](https://github.com/kompiro/karasu/issues/1767)） | hard launch（v1.0 release / announcement / Pages 再開 / Discussions 判断） | **2026-07**（近接） |

#### Notation watch (round 2) の finding

| # | finding | disposition | Issue |
| --- | --- | --- | --- |
| 1 | authoring AI に渡すのが `syntax.md`（文法）のみで **idiom/pattern** 資料が無い。KV store は **leaf-less `database`** + node 粒度参照 + physical layer の engine で**表現済み**（`@kv` は却下: annotation は lifecycle 標識） | **cookbook 新設**（KV を entry #1、LLM に同梱）。`[kv]` badge は watch | [#1818](https://github.com/kompiro/karasu/issues/1818) |
| 2 | table を **domain** でまとめ、**cross-domain な store アクセス**を診断したい | logical=domain でグルーピング + 診断（`shared-infra-fan-in` 系）。physical=schema は 1:1 でなく**未決**（[#1632](https://github.com/kompiro/karasu/issues/1632) の infra realizes と地続き） | [#1819](https://github.com/kompiro/karasu/issues/1819) |
| 3 | 大規模 multi-file 図の混雑。**file は grouping 単位として誤り**（サンプルは view 種別で分割）。本当の need = system 内の**意味的クラスタ宣言** | **comprehension 柱へ移設**（描画/密度の問題） | [#1822](https://github.com/kompiro/karasu/issues/1822) |
| 4 | 残した experimental notation を**いつ評価するか**が未定義。後方互換ゆえ rename/廃止は高コスト | **promotion gate**（下記）を ADR + 本書に記録 | [#1820](https://github.com/kompiro/karasu/issues/1820) |

#### Comprehension の構図

縦（深さ）は drill-down（[#21](https://github.com/kompiro/karasu/issues/21)、replace-context）が既にカバー。壁は**ある階層での横の密度**（service/infra ノード数 + 越境 edge の混雑）。投資は横の密度制御に向ける。

| 手 | コスト | Issue |
| --- | --- | --- |
| external/infra の**レイヤートグル**（第一手） | 低 | [#1821](https://github.com/kompiro/karasu/issues/1821) |
| 意味的クラスタ + 枠線 | 中 | [#1822](https://github.com/kompiro/karasu/issues/1822) |
| provenance / `[external]` スタブ・focus（[#1186](https://github.com/kompiro/karasu/issues/1186) 出荷済み）・progressive edges | 中 | （follow-up） |
| **縦の残課題**: in-place 部分展開（兄弟と越境 edge を見せたまま1つ展開、mixed-LOD）。重く ROI 要検証 | 高 | [#1815](https://github.com/kompiro/karasu/issues/1815) |

### promotion gate（notation 評価の規律）

experimental notation を v1.0-stable へ昇格させる判断の規律（ADR 化は [#1820](https://github.com/kompiro/karasu/issues/1820)）:

- **既定 = experimental 据え置き**。追加しない/据え置くコストは低く、削除コストは高い。昇格に渋く、open/既存構文での表現に寛容に、灰色は experimental に留める。問いは「**stable へ昇格するに足る実利用証拠があるか**」であって「廃止すべきか」ではない。
- **トリガー**: (i) その notation に触れる v1.x minor の直前、(ii) 実利用データが溜まった時、(iii) 混乱/bug Issue の再発時。
- **証拠源 = karasu-nest の共有 corpus**。実 OSS を書いた `.krs` が watch tier の必要とする「実利用 pain」の観測装置になる。
- 配置は **ADR（決定）+ 本書（生きた適用状態）**。`docs/process.md`（日々の開発サイクル）には置かない。

### 独立 candidate（未 Issue 化 — issue が生えたら Milestone 化）

| candidate | 状態 | 依存 |
| --- | --- | --- |
| **surface portfolio** | 未着手。keystone が主 surface を示した後の独立判断 | keystone |
| **interop**（draw.io / mermaid / C4 への入出力） | 未着手の戦略テーマ。physical realize（[#1632](https://github.com/kompiro/karasu/issues/1632)）とは切り離して単独管理 | keystone（B/C なら価値増） |
| **AI authoring 深度 / Chat 去就** | **評価待ち**。Chat が出荷面か実験かは [#638](https://github.com/kompiro/karasu/issues/638) の user testing データで決める | keystone + #638 |

### 既存に集約（新規スレッド不要）

- **feedback loop 設計**（OSS 後に何を作るかをどう学ぶか）は新規に立てない。Discussions 判断は [#1317](https://github.com/kompiro/karasu/issues/1317)、nest corpus を証拠源にする件は promotion gate（[#1820](https://github.com/kompiro/karasu/issues/1820)）、定量検証は [#638](https://github.com/kompiro/karasu/issues/638) に既にある。

### 非ゴール圧力 log

非ゴールは動かさないが、実利用で圧力が出たものをここに**記録のみ**する（対応はしない）。Discussions 有効化（[#1317](https://github.com/kompiro/karasu/issues/1317)）時には「ゴールにしていないこと」の seed としても使える。

| 非ゴール | 圧力の観測 | 備考 |
| --- | --- | --- |
| （現時点で記録なし） | — | — |

### sequencing

1. ~~keystone~~ → **決定済み（2026-06-28、PRD [#1825](https://github.com/kompiro/karasu/pull/1825) / Epic [#1826](https://github.com/kompiro/karasu/issues/1826)）**。permalink layer が retained の背骨。
2. 実行中の2柱（notation watch r2 / comprehension）は permalink layer と並行で進む。comprehension の第一手は external/infra トグル（[#1821](https://github.com/kompiro/karasu/issues/1821)）。
3. **AI authoring** は [#638](https://github.com/kompiro/karasu/issues/638) のデータ待ち、**interop** は keystone 決定済みなので評価可能（B/C 寄りで価値増）。
4. **非ゴール圧力 log** は随時追記（安価）。

日付 Milestone の現況（keystone 後に確定する intent）: **2026-07** = OSS launch（[#1317](https://github.com/kompiro/karasu/issues/1317) / [#1767](https://github.com/kompiro/karasu/issues/1767)）/ **2026-09** = keystone 非依存の安価なもの（cookbook [#1818](https://github.com/kompiro/karasu/issues/1818) / promotion gate [#1820](https://github.com/kompiro/karasu/issues/1820) / layer toggle [#1821](https://github.com/kompiro/karasu/issues/1821)）/ **Backlog** = keystone 依存（[#1819](https://github.com/kompiro/karasu/issues/1819) / [#1822](https://github.com/kompiro/karasu/issues/1822) / [#1815](https://github.com/kompiro/karasu/issues/1815) / nest Phase 2 [#1783](https://github.com/kompiro/karasu/issues/1783)）。

---

## Related TPLs

- [TPL-20260514-08](test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md) — 診断 register の fact vs style 二分。v1.0 で freeze する register 割り当ての拠り所。
- [TPL-20260511-02](test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) — spec doc と source-of-truth の同期。freeze 前タスクで spec ↔ 実装の整合を担保。
- [TPL-20260519-02](test-perspectives/TPL-20260519-02-shared-vocabulary-dual-representation.md) — 共有語彙の dual representation。finding I（infra keyword と shape tag の overlap）の audience guidance の拠り所。
</content>
