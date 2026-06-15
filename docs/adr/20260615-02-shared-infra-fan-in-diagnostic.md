---
id: ADR-20260615-02
title: 共有 infra fan-in を info 診断として通知する
status: accepted
date: 2026-06-15
topic: resolver
related_to:
  - ADR-20260514-02
  - ADR-20260405-05
scope:
  packages: [core, i18n, lsp, app]
assumptions:
  - "symbol: packages/core/src/resolver/warnings.ts :: detectSharedInfraFanIn"
  - "grep: packages/core/src/types/warnings.ts :: shared-infra-fan-in"
  - "grep: docs/concepts.md :: shared-infra-fan-in"
  - "file: docs/test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md"
---

# ADR-20260615-02: 共有 infra fan-in を info 診断として通知する

- **日付**: 2026-06-15
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1570](https://github.com/kompiro/karasu/issues/1570)
  - 設計 PR: [#1588](https://github.com/kompiro/karasu/pull/1588)（旧 `docs/design/shared-infra-fan-in-diagnostic.md` — 本 ADR に集約して削除）
  - 実装 PR: [#1590](https://github.com/kompiro/karasu/pull/1590)
  - 統治 ADR: [ADR-20260514-02](20260514-02-style-prescription-stance.md)（流派が smell と呼ぶ構造は `info` で事実通知 — 本 ADR はその register を拡張する）
  - 前提 ADR: [ADR-20260405-05](20260405-05-database-as-first-class-node.md)（database を first-class に — 共有 store を表現可能にする前提）
  - 関連 TPL: [TPL-20260514-08](../test-perspectives/TPL-20260514-08-diagnostic-register-fact-vs-style.md)（新規 diagnostic の register は事実か流派判断かで決める）, [TPL-20260514-07](../test-perspectives/TPL-20260514-07-infra-redeclared-across-files.md), [TPL-20260612-01](../test-perspectives/TPL-20260612-01-style-coupled-diagnostics-sheetless-context.md)

## 背景

`docs/concepts.md`「What karasu visualizes vs. what it doesn't prescribe」節は、`infra-redeclared-across-files`（info）を microservices の Database-per-Service smell のシグナルとして一覧していた。しかしこの診断が実際に keying しているのは **宣言の冗長性**（同じ `database` / `queue` / `storage` id が複数ファイルで宣言される / S4.5）であって、**共有 / fan-in**（1 つの store を複数 service が参照する）ではない。

その結果、より一般的で意味のあるケース — **1 つの store が 1 回だけ宣言され、N 個の service から参照される** — は診断が一切出ず、偶発的な multi-file redeclaration という proxy だけがトリガーになっていた。「共有 DB smell が surface されるか」が *何ファイルで宣言したか* に依存し、*何 service が依存しているか* に依存しないのは違和感がある（#1570）。

ADR-20260514-02 は「流派が smell と呼ぶ構造は `info` で事実通知する」「register は事実 vs 流派判断で決める」を確定し、共有 DB をその典型例として名指ししたうえで「このリストは今後も伸びる」と明記していた。本 ADR はその register に、実際の共有を捉える診断を 1 つ追加する。

## 決定

**`domain-dispersal` と対称な新 Warning kind `shared-infra-fan-in`（`info` register）を追加し、同一 system scope で同じ `database` / `queue` / `storage` を 2 つ以上の service が参照したとき発火させる。**

個別の設計判断:

- **register は `info`** — ADR-20260514-02 / TPL-20260514-08 の判定樹に従う。共有 store は「ある流派が smell と呼ぶ構造的事実」であり、karasu が直すべきと規定する defect ではない。
- **params は `{ infraId, infraKind, services }`** — `database` 限定にせず `queue` / `storage` も横断する。
- **閾値は ≥2 service**。同一 service が複数 usecase から参照する場合は 1 とカウント（Set で dedup）。
- **`[external]` ストアは集計から除外** — Database-per-Service smell は「自システムが所有する store」に関する信号であり、境界外の managed 第三者 store を共有すること自体は同種の信号ではなくノイズになる。
- **scope は per-system + top-level（system なし）**。system 境界はまたがない（cross-system 共有は意図的）。トップレベル infra は `file.databases` / `queues` / `storages` に bucket されるため、トップレベル scope ではそれらも infra ソースとして供給する。
- **`infra-redeclared-across-files` は併存維持** — 観察する事実が別物（宣言の冗長性 vs 実際の共有）。concepts 表は両者を残し、説明を書き分ける。
- **検出は `analyze()`（merge 後 `KrsFile`）で行う** — view 非依存。ファイル数に依らず実共有で判定でき、App / CLI / LSP のいずれからも surface される。
- **LSP single-document では抑制しない**（TPL-20260612-01 の「判断を記録する」契約）— import-merge から利益を受けるが、単一ドキュメント文脈では *under-report* するだけで false-positive は出ない（store と ≥2 参照 service の両方が同一ドキュメントに揃ったときのみ発火）。`domain-dispersal` と同性質。

## 理由

- **共有判定を実態に合わせる**: 「共有 DB smell」は本来 service の依存数で決まる事実であり、宣言ファイル数という proxy より直接的で意味がある。
- **既存パターンとの対称性**: `domain-dispersal`（同一 id が ≥2 service 配下）と実装・register・文言の三点で対称にすることで、実装者・読者の認知コストを最小化し、`analyze()` の merge 後判定で「ファイル数非依存」が自然に出る。
- **ADR-20260514-02 の register をそのまま延長**: 新たな流派 prescription を持ち込むのではなく、既存の判定樹が想定した「次のエントリ」を追加するだけ。原理から再導出可能。
- **`[external]` 除外でノイズを抑える**: 境界外の共有まで smell 扱いすると、正当に共有される第三者 store で誤報が増える。

## 却下した案

- **案 A — `infra-redeclared-across-files` に fan-in 検出を相乗りさせる**: 観察する事実が異なり（宣言冗長 vs 実共有）、params 形も合わず、利用側が 2 ケースを判別できない。TPL-20260514-08 の「事実 1 行」原則に反する。
- **案 B — view 抽出（`deriveInfraEdges`）の synthetic edge から数える**: 診断は view 非依存であるべき（system view を開かなくても出てほしい）。view 経路に置くと LSP / CLI の warning 収集から漏れる。
- **`warning` register で出す**: 「直すべき」のニュアンスが強く、移行期・低トラフィック・レガシーなど意図的共有で誤報になる。ADR-20260514-02 の立場と矛盾する。
