---
id: ADR-20260713-02
title: ADR→karasu permalink の検証は adr-tools の krs kind で行い karasu は config で adopt する
status: accepted
date: 2026-07-13
topic: adr-tooling
related_to: [ADR-20260702-01, ADR-20260630-01, ADR-20260626-04]
assumptions:
  - "file: adr.config.json"
  - "grep: package.json :: adr:check-permalinks"
  - "grep: .github/workflows/ci.yml :: adr:check-permalinks"
  - "file: docs/spec/permalink.md"
---

# ADR-20260713-02: ADR→karasu permalink の検証は adr-tools の krs kind で行い karasu は config で adopt する

- **日付**: 2026-07-13
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1830](https://github.com/kompiro/karasu/issues/1830)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
  - 実装 ADR（別 repo）: [kompiro/adr-tools ADR-17](https://github.com/kompiro/adr-tools/blob/main/docs/adr/17-permalink-krs-kind.md)（`permalink:` サポート + built-in `krs` kind、PR kompiro/adr-tools#18）
  - governing ADR: [ADR-20260702-01](20260702-01-adr-permalink-convention.md)（permalink 規約 — 本検証を #1830 に申し送り）
  - 前提 ADR: [ADR-20260630-01](20260630-01-permalink-deep-element.md)（deep permalink アンカー文法）
  - アンカー contract: `docs/spec/permalink.md`（+ `.ja.md`）／ L2 規約: `.claude/rules/adr.md`
  - 関連 TPL: [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（整合性チェックは両側で起動）、[TPL-20260630-03](../test-perspectives/TPL-20260630-03-adr-permalink-records-source.md)、[TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)
  - 受け入れ条件: `docs/acceptance/1830-adr-permalink-validation.md`
  - 経緯: 初版は karasu 側 validator（PR #1916、close）→ redirect design（#1922）→ 本 ADR で adr-tools 実装を adopt

## 背景

ADR-20260702-01 は `permalink:` frontmatter を定義しつつ、その検証を #1830 に申し送り、
karasu 自身の ADR への `permalink:` 適用も「検証が付く #1830 以降」と保留していた。

当初は karasu 側に validator script を実装した（PR #1916）。しかし **karasu 自身が ADR に
`.krs` permalink を書くことはほとんど無い** — 実受益者は karasu でモデリングし ADR から
それを参照する下流 repo であり、彼らが回すのは `@kompiro/adr-tools`。karasu 側 validator は
karasu 自身の `docs/adr/` しか守らず、実受益者に届かない。加えて `@karasu-tools/core` は
public npm のため、adr-tools からも `.krs` を解決できる。よって実装を adr-tools へ移した。

## 決定

**検証は `@kompiro/adr-tools`（`>=0.0.7`）の built-in `krs` kind が担い、karasu は
`adr.config.json` の `"permalink": { "kind": "krs" }` で adopt する**（実装の決定は
adr-tools ADR-17）。karasu 側の配線:

- `adr.config.json` に `permalink.kind: "krs"` を追加。
- `@kompiro/adr-tools` を `^0.0.7` に bump し、adr-tools の optional peer を満たすため
  `@karasu-tools/core` を root devDependency（`workspace:*`）に追加。
- `pnpm adr:check-permalinks`（`adr check-permalinks`）を ci.yml の Required `Check` job に
  **path filter 無し**で追加し、ADR 側・`.krs` 側の両変更で発火させる（TPL-20260520-02）。
- `krs` resolver は **built `@karasu-tools/core`** を lazy import するため、CI では
  **`Build (core)` の後**に実行する。
- 本 ADR で ADR-20260702-01 に最初の dogfood `permalink:` を追加（worked example）。

## 理由

- **実受益者に届く場所に置く** — adr-tools 採用 repo すべてが検証を得る。karasu 側 script は
  対象 repo を間違える。
- **optional peer で疎結合** — adr-tools は `@karasu-tools/core` を optional peer として
  lazy import。karasu は workspace の core で peer を満たす。
- **build 依存を CI 順序で解決** — resolver は built core dist を要するので `Build (core)` の
  後に実行。逆に bare な pre-push hook は core 未 build だと落ちるため、lefthook には
  **入れず CI のみ**とする（both-sides の要件は unfiltered な CI step で満たす）。

## 却下した案

- **karasu 側 validator script を維持**（PR #1916） — 守る repo を間違える・再利用できない。
- **adr-tools が `@karasu-tools/core` を hard-depend** — 汎用 ADR ツールに modeling 言語依存を
  強制する。optional peer に留めた（adr-tools ADR-17）。
- **lefthook pre-push にも check-permalinks を入れる** — resolver が built core を要するため
  core 未 build の push で落ちる。CI 専用にした。

## 申し送り

- 本文サマリ表の生成（`permalink:` → クリック用 markdown）は adr-tools 側の未実装 follow-up。
- adr-tools#18 の generic 部分（schema / source 実在）は `adr validate` にも載ったため、
  将来 `adr:validate` でも `permalink:` schema が検査される。
