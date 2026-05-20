---
id: ADR-20260520-06
title: app.css をモジュール分割し、トークン層でライトテーマを提供する
status: accepted
date: 2026-05-20
topic: app-ui
related_to: [ADR-20260515-01]
scope:
  packages: [app, i18n]
  concerns: [i18n, accessibility]
assumptions:
  - "file: packages/app/src/styles/themes.css"
  - "file: packages/app/src/styles/tokens.css"
  - "file: packages/app/src/theme/theme-storage.ts"
  - "symbol: packages/app/src/theme/index.tsx :: ThemeProvider"
  - 'grep: packages/app/src/styles/themes.css :: data-theme="light"'
  - "file: packages/app/src/styles/styles-no-raw-color.test.ts"
---

# ADR-20260520-06: app.css をモジュール分割し、トークン層でライトテーマを提供する

- **日付**: 2026-05-20
- **ステータス**: 決定済み
- **関連**:
  - Issue #1470 — Refactor app.css into modular files and add light theme support
  - PR #1472（Design Doc）/ PR #1477（実装）
  - [ADR-20260515-01](20260515-01-adopt-shadcn-ui.md) — shadcn/ui 採用・`@theme inline` ブリッジ
  - [TPL-20260510-06](../test-perspectives/TPL-20260510-06-display-mode-cross-surface.md) — 表示モード / グローバル切替の全描画面点検
  - [TPL-20260518-01](../test-perspectives/TPL-20260518-01-involutive-toggle-renders-both-states.md) — 両結果状態の end-to-end 検証
  - [TPL-20260516-01](../test-perspectives/TPL-20260516-01-control-a11y-contract-survives-migration.md) — interactive control の a11y 契約

## 背景

`packages/app/src/styles/app.css` は単一ファイルで約 2900 行に肥大化していた。
すべてのデザイントークンが 1 つの `:root` ブロックに dark 専用の生値で定義され、
さらに `:root` の外（影・warning / diff のクローム・各種バナー・上端ハイライト）
にも生 hex / rgba が散在していた。このためファイルがナビゲートしづらく、
ライトテーマを提供する土台が無かった。

Issue #1470 で 2 案を検討した。

1. `app.css` を 1 ファイルのまま維持し、末尾に `[data-theme="light"]` の
   override を追記する
2. `app.css` を `styles/` ディレクトリへ分割し、色トークンを `themes.css` に
   集約して dark / light の 2 セットを定義する

設計の詳細検討は Design Doc（PR #1472）で行い、レビューで 4 つの未解決の問い
（Monaco エディタの連動・ライトパレットの確定・プレビューキャンバスの扱い・
切替 UI）を決着させた。

## 決定

案 2 を採用する。`app.css` を `styles/`（`index.css` / `tokens.css` /
`themes.css` / `base.css` / `layout.css` / `components/*.css`）へ分割し、
すべての色を `themes.css` のトークン経由にする。`themes.css` は dark を
既定の `:root`、light を `:root[data-theme="light"]` の override として
同一のトークン語彙で定義する。

- 実効テーマは初回ペイント前に `index.html` のインラインスクリプトが
  `localStorage` / `prefers-color-scheme` から解決して `<html data-theme>` に
  書き込む（FOUC 回避）。`theme/` モジュール（`theme-storage.ts` +
  `ThemeProvider` / `useTheme`、i18n の `LocaleProvider` を踏襲）が実行時の
  切替を担い、`"system"` のときは `prefers-color-scheme` をライブ追従する。
- ユーザーは Settings の System / Light / Dark セレクタで選択し、選択は
  `localStorage` に永続化されて OS 設定より優先される。
- Monaco エディタは `karasu-light` テーマを新設し、app の実効テーマで
  `karasu-dark` / `karasu-light` を切り替える。
- レンダリングされる SVG 図そのものの再テーマ化は対象外とする（`packages/core`
  のレンダラが色をハードコードしており、CLI / VS Code の export にも波及する
  ため別 Issue）。ライトテーマは app の chrome のみを再スキンし、プレビュー
  キャンバスはトークン経由でテーマに追従する。

## 理由

- 分割とライトテーマ対応は「全色をトークン経由に統一する」同一作業に依存する。
  別々に進めれば同じファイルを二度触ることになるため、1 つの実装で行った。
- 既存のトークン名（`--bg-base` / `--text-primary` / `--border-strong` 等）は
  すでに役割ベースで命名されており、リネーム不要で light 値を与えるだけで
  意味的トークン層として機能する。
- トークン定義（`themes.css`）と利用箇所（`components/*`）を分離することで、
  将来テーマを追加・調整するとき触る場所が `themes.css` に限定される。
- テーマは「描画全体に影響するグローバル切替」であり、CSS における描画面は
  各コンポーネント CSS である（TPL-20260510-06）。`styles-no-raw-color.test.ts`
  が `layout.css` / `base.css` / `components/*.css` に生の色リテラルが
  出現しないことを検証し、テーマ非対応の退行を code review で検出できる。
- shadcn/ui の `@theme inline` ブリッジ（ADR-20260515-01）は `var()` を inline
  参照しているため、ビルド時に dark 値で焼き付かず、テーマ切替と整合する。

## 却下した案

- **案 1（単一ファイル維持）**: 変更は局所的だがファイル肥大の問題が未解決の
  まま残り、トークン定義とコンポーネントスタイルが同居し続けてテーマ追加時の
  触る場所が不明瞭になる。Issue #1470 のスコープ（分割）も満たさないため
  却下した。
