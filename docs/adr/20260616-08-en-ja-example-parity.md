---
id: ADR-20260616-08
title: "example を examples/<lang>/<name>/ に揃え、docs gallery を en/ja 完全対応にする（アプリは最小シード）"
status: accepted
date: 2026-06-16
topic: build
related_to:
  - ADR-20260616-03
  - ADR-20260616-02
  - ADR-20260425-01
scope:
  concerns:
    - i18n
    - ci
assumptions:
  - "file: examples/ja/payment-platform/system.krs"
  - "file: examples/en/payment-platform/system.krs"
  - "grep: packages/docs-site/scripts/lib/examples-manifest.ts :: localized"
---

# ADR-20260616-08: example を examples/<lang>/<name>/ に揃え、docs gallery を en/ja 完全対応にする（アプリは最小シード）

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **Issue**: [#1642](https://github.com/kompiro/karasu/issues/1642)
- **関連**:
  - 設計 PR [#1644](https://github.com/kompiro/karasu/pull/1644)、実装 PR [#1650](https://github.com/kompiro/karasu/pull/1650)（Phase A）/ [#1653](https://github.com/kompiro/karasu/pull/1653)（Phase B）
  - [ADR-20260616-03](./20260616-03-docs-site-ssg.md)（docs-site / gallery）、[ADR-20260616-02](./20260616-02-guide-embedded-diagrams.md)（guide diagrams）、[ADR-20260425-01](./20260425-01-i18n-default-policy.md)（i18n default policy）
  - フォローアップ: [#1646](https://github.com/kompiro/karasu/issues/1646)（gallery/URL からの import）
  - コード: `examples/<lang>/<name>/`, `packages/docs-site/scripts/lib/examples-manifest.ts`, `packages/core/src/builtins/examples.ts`, `.claude/rules/examples-sync.md`

## 背景

docs サイトの Examples gallery（#1640）とアプリの Reference → Samples タブは `examples/` の `.krs` をレンダリングして見せる。シナリオ系の example はラベルが日本語だったため、英語ロケールの面でも日本語の図が出ていた。`getting-started` だけ en/ja 対があった。en/ja のユーザーがそれぞれ自言語の図を見られるようにしたい。同時に、docs-site を公開するなら「アプリが example を網羅同梱する必要はあるか」も論点になった。

## 決定

例を **`examples/<lang>/<name>/`（ja / en 完全対称）** に再配置し、シナリオ example の英語版を用意して **docs gallery を en/ja 完全対応**にする。**アプリは最小シードに徹する**（網羅カタログは gallery が担い、アプリは getting-started の en/ja とビュー別 Samples のみ。新規ロケール同梱は足さない）。

## 理由

- **構造の対称性**: ja を `examples/ja/`、en を `examples/en/` に揃えると、locale ごとの追加・参照規則が一貫する。gallery manifest は per-locale の `entry`/`githubDir`（`localized()` / `single()`）で素直に表現でき、ja/en の図が drift しないよう構造を同一に保てる。
- **責務分離（gallery = 網羅カタログ / アプリ = 自己完結シード）**: アプリ同梱が docs-site で代替できない価値は「オフライン/自己完結な初回起動」「Samples のインライン参照」「core と同ビルドのバージョン整合」の 3 点に限られる。網羅は gallery に寄せ、アプリは最小に保つことで同梱物と保守ペアの増殖を避ける。
- **正典は `examples/`**: gallery は `examples/` を single source of truth にビルド時レンダリング（ADR-20260616-03）。`examples.ts` 同梱内容は移動後も on-disk と byte 一致を維持（`examples-sync` + `examples.test.ts` の drift ガード）。
- **ADR immutability の尊重**: 移行で旧 ADR 本文中のパス参照は stale になるが、決定本文は書き換えず（`.claude/rules/adr.md`）、`assumptions:` の live check のみ実在パスへ更新した。

## 却下した案

- **`<name>-en/` 兄弟ディレクトリ**: multi-file の import 配線が分かりづらく、`getting-started-en` の既存例外も解消できない。
- **アプリ同梱を en/ja 網羅**（`deploy-only`/`org-only`/seed まで `_EN` 化）: gallery と役割が重複し、同梱物・保守が倍増。docs-site 公開を前提にすると重複投資。gallery/URL import（#1646）として上乗せする方が筋。
- **ja を root 据え置き（非対称）**: 変更範囲は最小だが命名が混在する。完全対称を優先した。

## 補足

`feature-samples`（英語の構文デモ）・`client-mcp`（英語）は英語著者として `examples/en/` に、`github-actions`（CI 例・krs なし）は neutral として root に残す。Phase B の移行は ~90 箇所のパス参照（code / docs / manifest / examples-sync / tests）と 4 件の ADR `assumptions:` を更新し、`examples.ts` は byte 一致のため不変に保った。
