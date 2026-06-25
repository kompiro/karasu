---
id: ADR-20260616-06
title: .krs / .krs.style を v1.0 として凍結する（ハイブリッド版管理）
status: accepted
date: 2026-06-16
topic: build
related_to:
  - ADR-20260616-04
  - ADR-20260616-05
  - ADR-20260615-01
  - ADR-20260615-02
  - ADR-20260615-04
  - ADR-20260615-05
  - ADR-20260614-01
scope:
  packages: [core]
assumptions:
  - "file: docs/roadmap.md"
  - "file: docs/spec/syntax.md"
  - "file: docs/spec/diagnostics.md"
  - "grep: README.md :: v1.0"
---

# ADR-20260616-06: .krs / .krs.style を v1.0 として凍結する（ハイブリッド版管理）

- **日付**: 2026-06-16
- **ステータス**: 決定済み・**発効済み**（v1.0 を公開ローンチ #1317 / #1764 で確定。下記チェックリスト参照）
- **関連**:
  - 引き金 Issue: [#1314](https://github.com/kompiro/karasu/issues/1314)（OSS launch Phase 2: v1.0 spec freeze の ADR）
  - 親 Issue: [#1302](https://github.com/kompiro/karasu/issues/1302)（OSS 化のブレスト — ハイブリッド版管理を決定）, [#1317](https://github.com/kompiro/karasu/issues/1317)（Phase 3: hard launch — v1.0 release / アナウンス）
  - 棚卸し / ロードマップ: [#1567](https://github.com/kompiro/karasu/issues/1567), `docs/roadmap.md`（Syntax v1.0 → 凍結スコープ）
  - pre-freeze ADR: [ADR-20260616-04](20260616-04-rule-diagnostic-separation-and-catalog.md)（規則↔診断の分離 + 診断カタログ）, [ADR-20260616-05](20260616-05-user-system-scoped.md)（user は system-scoped）, [ADR-20260615-01](20260615-01-ownership-during-migration.md) / [ADR-20260615-02](20260615-02-shared-infra-fan-in-diagnostic.md) / [ADR-20260615-05](20260615-05-team-annotations-owner-priority.md)（診断 register）, [ADR-20260615-04](20260615-04-migration-intent-fields.md)（lifecycle annotation のパラメータ構文）, [ADR-20260614-01](20260614-01-remove-team-property.md)（`team` property 削除）
  - 統治概念: `docs/concepts.md`「Goals and non-goals」（非ゴールの線）
  - README: 「Project status」節

## 背景

karasu の対象読者は **C4 の代替を評価するアーキテクト / テックリード**である。彼らが
気にするのは「自分の `.krs` ファイルが毎週壊れないか」であって、TS の interface が
変わるかどうかではない。#1302 のインタビュー議論で、この非対称に対応する
**ハイブリッド版管理**が決まった:

- `.krs` / `.krs.style` の**言語仕様 → v1.0（stable）**。後方互換を約束する。
- `packages/core` の **TS API → v0.x のまま**（安定性は約束しない）。

この約束を durable に記録し、レビュアー / コントリビューターに見えるようにするのが
本 ADR の目的である。notation の過不足棚卸し（#1567）とそれに続く pre-freeze 群
（#1623–#1626、規則↔診断カタログ、user scoping）により、凍結に足る面が揃った。

> **発効タイミング（重要）**: 本 ADR は**凍結方針を決定**するものであり、それ自体が
> v1.0 を「出荷」したわけではない。**本 ADR 決定時点では repo は private で、v1.0 の
> 確定アナウンスは出していなかった。** `.krs` / `.krs.style` を v1.0 と**公に確定したのは
> 公開ローンチ時**（#1317 / #1764）であり、本 ADR は方針と前提条件ゲートを定めた。
> v1.0 は #1764 で発効済み（README「Project status」/ `docs/roadmap.md` で v1.0 stable を宣言）。

## 決定

**`.krs` / `.krs.style` を v1.0（stable）として凍結する方針を採択する。後方非互換な
spec 変更は v1.x ではなく v2.0 を要する。追加的変更は v1.x で許可する。TS API は
v0.x のまま。** v1.0 の公開確定は launch（#1317 / #1764）で行った。

### 凍結する面（後方互換を約束する）

`docs/roadmap.md`「Syntax v1.0 → v1.0 freeze のスコープ」に準拠する:

- **構文**: system / service / domain / usecase / resource / user / edge（sync `->` /
  async `-->`）/ infra block（database / queue / storage / table …）/ deploy /
  organization / team / member / import（nested dotted path 含む）。配置規則
  （edge origin scope、top-level の `user` / edge 禁止）を含む。
- **タグ・注釈**: `docs/spec/tags-annotations.md` の builtin 集合と **open annotation
  set のセマンティクス**（未知の注釈は display-only で許容）。
- **診断 register**: 事実 vs 流派の二分（ADR-20260616-04 / TPL-20260514-08）と、
  ADR-20260615-01/02/05 で確定した register 割り当て。**warn-don't-error** 方針。
  診断コードは安定 API として扱う（ADR-20260616-04）。
- **lifecycle 注釈のパラメータ構文**（ADR-20260615-04、`@name(key: "value")` +
  precision による graceful degradation）。
- **CRUD verb-decoration**（1:N 含む。`docs/roadmap.md` 付録の維持判断に基づく）。

### 追加的変更（v1.x で許可）

既存ファイルの意味を変えない範囲: open set 配下の新タグ / 注釈、新しい構文で既存の
解釈を変えないもの、新しい診断コードの追加。

### 凍結しない（post-v1.0 watch — 明示的に約束しない）

- **C** translate のドメイン推論（adapter 側の課題）
- **D** edge の first-class な protocol / cardinality（当面は tag + 散文）

「観察してから決める」ものを早すぎる段階で硬直化させないため、これらは凍結面に
含めない。非ゴール（時間軸 / sequence #23・#28、code generation、ER modeling、
runtime metrics、infra topology、canvas editing）は `docs/concepts.md` で確定済みで、
本凍結はこの線を動かさない。

## 結果

**約束すること**:

- 既存の妥当な `.krs` / `.krs.style` ファイルは v1.x の間 parse し続ける。
- 凍結面の意味（構文・builtin タグ/注釈・診断 register・warn-don't-error）を破壊
  しない。破壊が必要なら v2.0 を切る。

**約束しないこと**:

- **TS API の安定性**（`packages/core` ほかは v0.x、minor で変わりうる）。
- **experimental / open-set タグの個別挙動**（builtin 扱いに昇格していないもの）。
- **レンダリングのピクセル安定性**（レイアウトは可読性優先で改善されうる）。
- メンテナンス応答（best-effort、SLA なし）。

## 前提条件チェックリスト（v1.0 確定の前提）

launch（#1317）で v1.0 を確定する前に満たすべき条件と、現時点の達成状況:

- [x] pre-freeze の明文化が完了している — edge origin scope（#1623）、top-level
      placement（#1624）、client の structure/implementation 境界（#1625）、
      infra keyword vs shape tag（#1626）。
- [x] 規則↔診断カタログ（ADR-20260616-04）と診断面が確定し、完全性が test で
      担保されている（`diagnostics-catalog.test.ts`）。
- [x] user scoping が決着している（ADR-20260616-05）。
- [x] spec と実装が同期している — reference-docs-check（`gen:reference --check`）、
      spec-structure-sync（en/ja 構造）、diagnostics-catalog 完全性 test。
- [x] 既知の保留破壊的変更が解消済み — `team` property 削除（ADR-20260614-01）は
      完了。post-v1.0 watch（C / D）は追加的 / 将来課題で破壊的ではなく、CRUD 1:N
      は維持。
- [x] AT suite green（CI）。
- [x] **公開ローンチ（#1317）で v1.0 を確定・アナウンスする** — repo は public 化済み。
      README「Project status」/ `docs/roadmap.md` で v1.0 stable を宣言（#1764）。本 ADR の発効点に到達。

## 却下した案

- **全面 v1.0（言語 + TS API 一括）**: TS API はまだ流動的で、アーキテクト読者の
  関心（ファイル互換）とずれる。安定を約束できない面まで凍結すると守れない約束に
  なる。ハイブリッドが対象読者の関心に正確に対応する。
- **v0.x のまま changelog 運用に依存**: 「壊れないか」をアーキテクトが changelog で
  毎回追う負担が残り、採用の心理的障壁を下げられない。明示的な v1.0 約束が要る。
- **BUSL + 安定性約束**: ライセンスは #1302 で Apache-2.0（明示的な特許付与で企業
  法務レビューを軽くする）に確定済み。版管理の約束はライセンスとは別軸であり、
  BUSL を持ち出す必要はない。
</content>
