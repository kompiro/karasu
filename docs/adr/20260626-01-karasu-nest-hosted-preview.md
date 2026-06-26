---
id: ADR-20260626-01
title: karasu-nest — URL で .krs を共有・プレビューするホスト型機能
status: accepted
date: 2026-06-26
topic: project
related_to: [ADR-20260404-03, ADR-20260616-03]
scope:
  packages: [app, core]
  concerns: [deployment]
assumptions:
  - "file: packages/app/src/utils/inline-share.ts"
  - "file: packages/app/src/components/ShareDialog.tsx"
  - "file: packages/core/src/share/synthesize.ts"
  - "symbol: packages/core/src/share/synthesize.ts :: synthesizeSharePayload"
  - "file: functions/render.ts"
  - "file: docs/guide/reverse-engineering-with-ai.md"
---

# ADR-20260626-01: karasu-nest — URL で .krs を共有・プレビューするホスト型機能

## 背景

いくつかの OSS（Dify / Kubernetes / n8n）を、`syntax.md` を読み込ませた Claude/ChatGPT に与えて `.krs` で表現させたところ、概要把握には十分な品質で生成できた。観測した傾向: `system` 図のトップ構成と `deploy` 図は**強い**（全体構成の把握に有用）、深い `domain` 分解と `org` 図は**弱い**。

この「LLM に `.krs` を作らせて概要をつかむ」体験を、**生成した `.krs` を貼ると preview でき、その URL を他者と共有できる**ホスト型機能 `karasu-nest` として届けたい。本 ADR はその v1（Phase 1）の設計決定を記録する。検討経緯は壁打ち Issue [#1783](https://github.com/kompiro/karasu/issues/1783)。

## 決定

karasu-nest v1 は、**新しいパッケージ・サービス・DB を作らず、既存の karasu app（`packages/app`）＋ core ＋ Cloudflare Pages（既存デプロイ）に内包する機能**として実装する。reverse（repo → `.krs`）はユーザー自身の LLM で行う（BYO、サービスに AI は載せない）。

具体的な決定:

- **共有はステートレス inline**。プロジェクトを `fflate` deflate → base64url で URL **fragment**（キー `#s=`）に格納する。fragment はサーバへ送られないため、DB・保存型 paste・モデレーション面を持たず、運用負荷ゼロ・プライバシー的にも素直。ペイロードは `{ krs, style }` バンドル（PR1 の生 `.krs` 形式も後方互換でデコード）。
- **multi-file は単一 `.krs` へ合成**してから載せる。`ImportResolver` で import を解決し、core の `serializeKrsFile` / `synthesizeSharePayload` で 1 ファイルへ畳む。`.krs.style` もマージしてバンドルする（`.krs` 単体ではスタイルが運べないため）。
- **復元は ephemeral**。共有 URL は `MemoryModeApp` に decode 結果を seed して開き（OPFS を汚さない）、復元不能なら警告して通常の ProjectMode へフォールバックする。
- **生成導線は Share ボタン**（Project ツールバー、shadcn `Button`／`Dialog`）。押下で現在のプロジェクトを合成・エンコードし、クリップボードへコピーしてダイアログを表示する。
- **静的 render エンドポイント `/render`**（Cloudflare Pages Function, `functions/render.ts`）。共有ペイロードを **query**（`?s=…`、サーバに届く）で受け取り SVG を返す。`view=system|deploy|org`（PNG では省略時 system にフォールバック）。**PNG は Worker でのみ** `@resvg/resvg-wasm` で生成し、core/cli/app は SVG のまま（[ADR-20260404-03](20260404-03-png-export-not-adopted.md) を尊重）。フォントは vendored 静的アセット（Noto Sans / Noto Sans JP / Noto Emoji / Noto Sans Symbols 2）を `env.ASSETS` で渡す — SVG レンダラーが絵文字/記号を inline マーカー（👥 / 📦 / 🔗 / 🔐 / ⚠ / ✦ / ⚗）に使うため Latin/JP だけでは PNG で豆腐化する（#1799）。カバレッジは `packages/app/src/render/png-font-coverage.test.ts` が cmap で機械チェックする。
- **reverse はドキュメントで案内**。`syntax.md` を LLM に渡す how-to ガイド（`docs/guide/reverse-engineering-with-ai.md`、bilingual）を公開し、強いビューへ誘導する。

実装 PR: [#1788](https://github.com/kompiro/karasu/pull/1788)（inline share）/ [#1791](https://github.com/kompiro/karasu/pull/1791)（multi-file + style バンドル）/ [#1795](https://github.com/kompiro/karasu/pull/1795)（`/render` SVG）/ [#1796](https://github.com/kompiro/karasu/pull/1796)（PNG）/ [#1798](https://github.com/kompiro/karasu/pull/1798)（reverse レシピ）。

## 理由

- **既存 app の再利用で drill-down を維持**しつつ、新規描画ロジックを書かずに最小実装で済む。分析価値は drill-down に依存するため、静的 1 枚では不十分。
- **ステートレス inline** は運用負荷ゼロ・プライバシー的に素直で、「ユーザー間で共有できる URL」という要件を満たすのに十分（実リバース `.krs` ≈12KB の実測で圧縮後 ~5k 文字、全モダンブラウザで余裕）。
- **app は既に Cloudflare Pages にデプロイ済み**で、Pages Function を足すだけで render エンドポイントを同一デプロイに載せられる（新インフラ不要）。
- **PNG を Worker 限定**にすることで OGP の実需要に応えつつ、core/cli/app の SVG-only 方針（ADR-20260404-03）を覆さない。

## 却下した案

- **専用の軽量ビューア（静的 SVG 中心）を新規構築**: drill-down が落ち、app と二重メンテ（描画面の挙動差リスク）になるため主 surface に不適。静的 SVG は副エンドポイントとして案1 に内包した。
- **保存型 paste（DB あり）**: ストレージ・ライフタイム・abuse/モデレーション面が発生する。「短く永続な URL」のニーズは将来の `/<owner>/<repo>` resolver（Phase 2）が別途満たす見込みで、v1 で DB を持つ動機が薄い。
- **サービス側での LLM reverse**: コスト・キャッシュ・推論メータリングを抱える。reverse は BYO とし v1 から外した。
- **PNG フォントの CDN fetch / Cloudflare Fonts**: 画像生成パイプラインに外部実行時依存を持ち込み、描画の決定性も損なうため不採用。vendored 静的アセットにした。

## 後続（本 ADR の範囲外）

- `/<owner>/<repo>` GitHub resolver（Phase 2）→ [Discussion #1786](https://github.com/kompiro/karasu/discussions/1786)
- in-site editor + repo への PR 還元ループ（Phase 3）→ [Discussion #1787](https://github.com/kompiro/karasu/discussions/1787)
- 共有リンクの OGP 画像（system 図の unfurl）→ [#1801](https://github.com/kompiro/karasu/issues/1801)
