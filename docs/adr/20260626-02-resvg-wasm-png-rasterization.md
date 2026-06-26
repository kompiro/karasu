---
id: ADR-20260626-02
title: karasu-nest の PNG ラスタライズに resvg-wasm を採用する
status: accepted
date: 2026-06-26
topic: renderer
refines: [ADR-20260626-01]
related_to: [ADR-20260404-03]
scope:
  packages: [app]
  concerns: [dependencies, deployment, performance]
assumptions:
  - "file: functions/render.ts"
  - "grep: functions/render.ts :: @resvg/resvg-wasm"
  - "grep: package.json :: @resvg/resvg-wasm"
  - "file: packages/app/public/fonts/NotoEmoji.ttf"
  - "file: packages/app/src/render/png-font-coverage.test.ts"
---

# ADR-20260626-02: karasu-nest の PNG ラスタライズに resvg-wasm を採用する

- **日付**: 2026-06-26
- **ステータス**: 決定済み
- **関連**:
  - 詳細化元: [ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)（karasu-nest — `/render` で PNG を出すと決めた上位 ADR）
  - 参照: [ADR-20260404-03](20260404-03-png-export-not-adopted.md)（core/cli/app に PNG エクスポートは入れない）
  - 実装 PR: [#1796](https://github.com/kompiro/karasu/pull/1796)（PNG 出力）/ [#1802](https://github.com/kompiro/karasu/pull/1802)（フォントカバレッジ修正）
  - Issue: [#1783](https://github.com/kompiro/karasu/issues/1783)（karasu-nest 壁打ち）/ [#1799](https://github.com/kompiro/karasu/issues/1799)（絵文字マーカー豆腐化）

## 背景

karasu は [ADR-20260404-03](20260404-03-png-export-not-adopted.md) で **core/cli/app には PNG エクスポートを入れない**（SVG は普遍的にサポートされ、変換は外部ツールで足りる）と決めていた。ただし同 ADR は再評価トリガとして「**サーバサイドのレンダリング要素を持ったとき**」を挙げていた。

karasu-nest（[ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)）の `/render` エンドポイント（Cloudflare Pages Function）はまさにそのサーバサイド要素である。共有 `.krs` を **OGP 画像**や、**SVG を `<img>` として受け付けないメディア**（Zenn・X 等）へ埋め込めるよう、`?format=png` で画像を返す需要が生じた。SVG は `renderSharePayload` が core から生成済みなので、必要なのは **その SVG を Cloudflare Workers ランタイム上で PNG にラスタライズする手段**である。

Workers ランタイムには Node ネイティブ addon も DOM/Canvas も無いという強い制約があるため、ラスタライザの選定が論点になった。

## 決定

karasu-nest の `/render?format=png` のラスタライズに **[`@resvg/resvg-wasm`](https://github.com/yisibl/resvg-js)（WebAssembly 版 resvg, `^2.6.2`）を採用する**。PNG 生成は **Worker（`functions/render.ts`）の中だけ**で行い、core/cli/app は SVG-only のまま据え置く（ADR-20260404-03 を覆さない。PNG は Worker 限定の例外）。

## 理由

- **Workers ランタイムで動く数少ない選択肢**。resvg は Rust 製の SVG レンダラで、WebAssembly にコンパイル済み。Node ネイティブ addon やブラウザ API に依存せず、CF Pages Functions の isolate 内でそのまま動く。
- **in-isolate・同期的・軽量**。外部サービスや別バインディングを呼ばず、isolate 内で完結する。wasm の初期化とフォント読み込みは module scope で 1 回だけキャッシュし、リクエストごとのコストにしない。
- **用途に対して過不足がない**。必要なのは「既存の静的 SVG を PNG にする」ことだけで、ブラウザ忠実度（JS 実行・Web フォント・アニメーション）は要らない。resvg は純粋な SVG→PNG ラスタライザとしてこの要件にちょうど合う。
- **依存の素性**。単一目的の WebAssembly モジュールで、ネイティブビルドや外部ランタイム依存を持ち込まない。root の `package.json` に prod 依存として追加し、`knip` は root の `ignoreDependencies` で扱う（Function が repo root に置かれるため）。

## 却下した案

| 案 | 却下理由 |
| --- | --- |
| **Cloudflare Browser Rendering（Puppeteer/headless Chromium）** | 実ブラウザでスクショを撮る方式。忠実度は高いが、別バインディング・課金・非同期・起動コストが重く、静的 SVG → OGP 画像という軽量用途には過剰。 |
| **`sharp` / `node-canvas` などネイティブライブラリ** | ネイティブ addon は Workers ランタイムで動かない。CF Pages Functions では使用不可。 |
| **ブラウザ Canvas API でラスタライズ**（ADR-20260404-03 の元案） | Worker には DOM/Canvas が無い。クライアント側で焼く案も、OGP はサーバ生成が要るので満たせない。 |
| **`satori`** | JSX → SVG を生成するライブラリで、SVG → PNG ラスタライザではない。用途が異なる。 |
| **ビルド時に headless で事前生成**（docs-site の examples gallery 方式） | 共有ペイロードは任意の `.krs`（実行時に届く動的入力）なので、ビルド時の事前生成では賄えない。 |

## 影響

- **wasm バンドルサイズ**。resvg-wasm の wasm は ~2.4MB。Pages Functions のバンドル上限内に収まることを実デプロイで確認した（フォントは Function バンドルではなく静的アセット側に乗るため上限には効かない）。
- **システムフォントが無い**。Workers にはシステムフォントが無いため、フォントを **vendored 静的アセット**として配信し `env.ASSETS` 経由で `fontBuffers` に渡す（CDN fetch / Cloudflare Fonts は外部実行時依存になるため不採用 — [ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)）。
- **グリフカバレッジが供給フォント次第**（[#1799](https://github.com/kompiro/karasu/issues/1799)）。ブラウザの暗黙フォールバックが無いため、与えた buffer のカバレッジが全てになる。SVG レンダラーが絵文字/記号を inline マーカー（👥 / 📦 / 🔗 / 🔐 / ⚠ / ✦ / ⚗）に使うので、Latin/JP の 2 フォントだけだと PNG で豆腐（□）になる。**monochrome の Noto Emoji**（絵文字 + ⚠ / ⚗）と **Noto Sans Symbols 2**（✦ = U+2726, Dingbats 記号）を追加して解消した。**COLR/CBDT 系のカラー絵文字は resvg-wasm のサポートが限定的**なため、あえて monochrome の Noto Emoji を選んでいる。カバレッジは `packages/app/src/render/png-font-coverage.test.ts` が cmap で機械チェックする（観点は [TPL-20260626-01](../test-perspectives/TPL-20260626-01-raster-pipeline-glyph-coverage.md)）。
- **cold-start コスト**。isolate ごとに初回だけ wasm 初期化 + ~8MB のフォント fetch+decode を払う（以降はキャッシュ）。
- **SVG-only 方針は維持**。core/cli/app は引き続き SVG のみ。PNG は karasu-nest の Worker に閉じた例外であり、ADR-20260404-03 の本旨（ツール本体に PNG 機能を持たせない）は変わらない。

## 再評価トリガ

- 静的 SVG では表現できない要素（JS 実行・アニメーション等）を含む高忠実な画像が必要になったとき → Cloudflare Browser Rendering を再検討する。
- resvg-wasm がカラー絵文字（COLR/CBDT）を十分サポートするようになり、monochrome フォントを置き換えられるようになったとき。
