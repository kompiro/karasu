---
id: ADR-20260616-11
title: "gallery の example は id 指定・固定 origin fetch で app に開く（任意 URL import は採らない）"
status: accepted
date: 2026-06-16
topic: app-ui
related_to:
  - ADR-20260616-08
scope:
  concerns:
    - security
    - i18n
assumptions:
  - "symbol: packages/core/src/builtins/openable-examples.ts :: findOpenableExample"
  - "file: packages/app/src/utils/fetch-example.ts"
  - "grep: packages/docs-site/scripts/lib/gallery-pages.ts :: openInAppLink"
---

# ADR-20260616-11: gallery の example は id 指定・固定 origin fetch で app に開く（任意 URL import は採らない）

- **日付**: 2026-06-16
- **ステータス**: 決定済み
- **Issue**: [#1646](https://github.com/kompiro/karasu/issues/1646)
- **関連**:
  - 設計 PR [#1660](https://github.com/kompiro/karasu/pull/1660)、実装 PR [#1665](https://github.com/kompiro/karasu/pull/1665)
  - [ADR-20260616-08](./20260616-08-en-ja-example-parity.md)（アプリは最小シード、網羅は gallery）
  - [TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)（信頼境界での入力検証）
  - コード: `packages/core/src/builtins/openable-examples.ts`, `packages/app/src/utils/fetch-example.ts`, `packages/docs-site/scripts/lib/gallery-pages.ts`

## 背景

ADR-20260616-08 で「アプリは最小シードに徹し、網羅 example カタログは docs gallery が担う」と決めた。残る導線は「gallery で見た example を app に取り込んで触る」（#1646）。当初案の「任意 URL からの import」は、ブラウザ内 fetch とはいえ未信頼コンテンツの読み込み（描画経路の XSS 余地）・ビーコン/フィッシングの踏み台になりうる。

## 決定

**example を id（`slug` + `lang`）で指定し、app が固定の karasu raw origin からパスを組み立てて fetch する**。ユーザーは URL を一切渡さない。deep-link `?example=<slug>&lang=<lang>` と gallery 各ページの「Open in the app」ボタンで起動し、取り込み先は ProjectMode（既存の `ADD_PROJECT` 経路）。

## 理由

- **攻撃面の最小化**: 任意 URL を受けないので allowlist バイパスも未信頼 origin への fetch も成立しない。入力は `slug`（`^[a-z0-9-]+$`）/ `lang`（`en`|`ja`）のみで、`findOpenableExample` が固定 manifest に対し厳格 validate する（TPL-20260510-17）。fetch は `redirect: "error"`、サイズ/件数 cap、`import` 追従は `resolvePath` で example 配下に confine。コンテンツは parse されるだけで実行されない。
- **正典の単一化**: openable example は `packages/core` の `OPENABLE_EXAMPLES` を app（fetch/検証）と docs-site（ボタン生成）が共有。
- **最小シードとの整合**: bundled seed（ADR-20260616-08）には触れず、純粋な上乗せ導線。multi-file は entry の `import` を辿って同 origin から再帰取得する（`main` を参照、drift は diagnostics で表面化）。

## 却下した案

- **任意 URL import**: 柔軟だが未信頼コンテンツ・ビーコンの踏み台リスク。用途（gallery→app）に対して過剰。
- **origin allowlist 付き URL import**: id 方式より緩く、allowlist 厳密化（ホスト完全一致・redirect 拒否・サブドメイン詐称対策）が必須で攻撃面が増える。

## 補足

`feature-samples`（独立サンプルの catalog）は openable から除外。`client-mcp` は英語のみ（en でのみボタン表示）。in-app の example 一覧 UI は持たず deep-link のみ。
