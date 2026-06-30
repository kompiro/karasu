---
id: ADR-20260630-01
title: Deep permalink — 構造要素 / view への深いパーマリンク
status: accepted
date: 2026-06-30
topic: navigation
related_to: [ADR-20260626-01, ADR-20260626-04]
scope:
  packages: [core, app]
assumptions:
  - "symbol: packages/core/src/share/synthesize.ts :: ShareTarget"
  - "symbol: packages/core/src/renderer/svg-renderer.ts :: anchorId"
  - "symbol: packages/app/src/hooks/useHistoryNavigation.ts :: shareTargetToHash"
  - "symbol: packages/app/src/utils/inline-share.ts :: SHARE_TARGET_VIEWS"
  - "file: docs/spec/permalink.md"
  - "file: docs/test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md"
---

# ADR-20260630-01: Deep permalink — 構造要素 / view への深いパーマリンク

- **日付**: 2026-06-30
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1827](https://github.com/kompiro/karasu/issues/1827)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826) の子）
  - 実装 PR: [#1841](https://github.com/kompiro/karasu/pull/1841)（Design Doc PR: [#1833](https://github.com/kompiro/karasu/pull/1833)）
  - PRD: `docs/prd/keystone-primary-path.md`（#1825）
  - 前提 ADR: [ADR-20260626-01](20260626-01-karasu-nest-hosted-preview.md)（karasu-nest hosted preview）、[ADR-20260626-04](20260626-04-karasu-nest-ogp-share-page.md)（OGP share page `/s?s=`）
  - アンカー contract: `docs/spec/permalink.md`（+ `.ja.md`）
  - 関連 TPL: [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md)（cross-surface parity）、[TPL-20260510-17](../test-perspectives/TPL-20260510-17-trust-boundary-input-validation.md)、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)、[TPL-20260510-11](../test-perspectives/TPL-20260510-11-parallel-function-parity.md)、[TPL-20260510-03](../test-perspectives/TPL-20260510-03-enum-member-addition.md)
  - 受け入れ条件: `docs/acceptance/permalink-deep-element.md`
  - フォローアップ: [#1842](https://github.com/kompiro/karasu/issues/1842)（共有リンクを開いたときの選択ノード highlight 復元）

## 背景

keystone PRD は「ADR が karasu 構造の *特定の部分*（あるサービス・ドメイン・ある view）にリンクし、読者がクリックすると**ちょうどその要素**に着地する」ことを要求する。一方、karasu-nest の inline 共有（`#s=<payload>` / `/s?s=<payload>`、ADR-20260626-01 / ADR-20260626-04）は**モデル全体**しか指せず、共有 URL は in-memory プロジェクトを root view で開くだけだった。

「要素アンカー」のスキーム自体は既に2つのサーフェスに存在していた:

1. **SPA の deep anchor** — `useHistoryNavigation` の `#krs-<view>-<node>:highlight?file=<path>`（mount / popstate で復元）。
2. **静的 SVG の `:target` ドリル** — `drill-down-svg.ts` が `id="krs-<view>-<sanitizeId(id)>"` を吐き、純 CSS `:target` で当該レベルに着地する。

両者は同じ `krs-<view>-<sanitizeId(id)>` 形を使うが、**share payload と結び付いていない**ことだけが欠けていた（fragment key `s` は drill-down の `#krs-` と衝突回避のため意図的に別名）。本 ADR は (A) share URL に deep target を載せる encoding と、(B) アンカー文法を安定 contract として spec 化する方針を確定する。

## 決定

deep permalink target を **`SharePayload` の中（optional `target`）に埋め込み**、開いたときに既存のアンカー文法 `#krs-<view>-<node>:highlight` へ正規化して SPA のドリル / フォーカス解決に相乗りさせる。アンカー文法は core の単一ヘルパ `anchorId` に集約し、静的 SVG と SPA hash（drillable な system/org）で共有する。

具体的な決定:

- **encoding は案B（payload 埋め込み）**。`SharePayload.target = { view, node?, highlight?, orgTree? }`（`ShareTargetView` は `system | deploy | org | matrix` の中立 union を core 側に定義し、app の `ActiveView` が `satisfies` で整合）。`node` はドリル先の **leaf id**（完全な path は app の `nodePathIndex` で再構成する。`#krs-<view>-<node>` ハッシュの解決と同じ）。1つの opaque トークンで fragment（`#s=`）/ server query（`/s?s=`）/ 将来の taka 短縮形（#1829）すべてに同一に効き、trust boundary の追加面（TPL-20260510-17）も増やさない。case A（fragment の sibling key `&t=`）は server `/s` に validate 面が増え2トークンになるため却下。
- **decode は前方後方互換**。`decodeShare` が `target` を `sanitizeTarget` で検証（未知 view / 空文字 / 不正型は破棄し、モデル全体へ degrade。throw しない）。`target` を知らない旧 app は無視してモデル全体を開き、新 app が `target` 無しの旧トークンを読めば従来挙動。payload version field は不要。
- **開く側は hash 正規化で既存配線を再利用**。`App.tsx` は `target` 付き共有を `shareTargetToHash`（→ `buildHash`）で `#krs-…` へ書き換えてから AppShell をマウントする。これは `useState` 初期化子内で行い、entry hash を module load 時に snapshot して **StrictMode の二重実行でも純粋・冪等**にする。以降は既存の `useHistoryNavigation`（mount parse + `nodePathIndex` 遅延解決 + popstate）がそのままドリルする。
- **アンカー文法は単一の `anchorId(viewPrefix, id)`（core）に集約**。`krs-<view>-<sanitizeId(id)>`。静的 SVG（`drill-down-svg.ts`）と、drillable な system/org の SPA hash（`buildHash`）が同経由で、cross-surface parity を test で固定する（TPL-20260630-01 / TPL-20260510-11）。identity は常に `id`（label 不使用、TPL-20260510-20）。
- **deploy/matrix / org Tree View は element アンカーの例外**。これらは単一階層の whole-view タブ（`#krs-deploy` / `#krs-matrix`）・モード（`#krs-org-tree`）で `<id>` セグメントを持たず、意図的に `anchorId` 文法の外。`target.node` は system/org でのみ意味を持つ（`docs/spec/permalink.md` に明記）。
- **rename 安定性は本 ADR の範囲外**。アンカーは `id` を pin するため rename で壊れる（stale は view root へフォールバック）。検証は `adr:check-assumptions` 拡張（#1830）に委ねる。

## 理由

- **既存資産の最大再利用**: アンカー文法・`buildHash`/`parseHash`・`nodePathIndex` 遅延解決・`/s?s=` unfurl をそのまま使い、新規ナビゲーション配線を足さずに深い着地を実現。
- **1トークンで全サーフェス同一**: ADR に貼る permalink は最終的に「1本の URL」（epic #1826 が *app/nest URL* と定義）。payload 埋め込みなら server unfurl・taka 短縮も自動で deep 化でき、OGP のフォーカス描画にも将来素直に拡張できる。
- **drift を型と test で封じる**: `anchorId` 単一化 + parity test（TPL-20260630-01）、`SHARE_TARGET_VIEWS` を `satisfies Record<ShareTargetView, true>` で union に縛る（新 view 追加が compile error、TPL-20260510-03）。
- **安全側に倒れる decode**: 不正・rename target は throw せずモデル全体 / 最近接へ degrade。

## 却下した案

- **案A（fragment の sibling key `#s=<payload>&t=<view>-<node>`）**: target が human-readable で `parseHash` を素直に再利用できる利点はあるが、(1) `readSharedProjectFromHash` と `parseHash` が互いのセグメントを許容する glue が要る、(2) server `/s?s=` を deep 化するには `&t=` を query にも載せ追加 validate（trust boundary 面 +1）が要る、(3) 1 URL に2トークンで taka 短縮単位が増える。permalink の用途（生成して貼る）では「手編集できる」優位が小さく却下。手編集可能な plaintext アンカーは静的 SVG サーフェス側（`#krs-…`）で温存される。
- **buildHash を deploy/matrix も含め全面的に `anchorId` へ寄せる**: `#krs-deploy` を `#krs-deploy-root` に変えると既存の履歴・ブックマーク・`parseHash`・多数のテストを壊す。deploy/matrix は非ドリルの単一階層タブで element アンカーではないため、例外として spec に明記する方を採った。

## 範囲外 / フォローアップ

- **共有リンクを開いたときの選択ノード highlight 復元**（#1842）: `target.highlight` のエンコードは本 ADR に含むが、開く際に MemoryMode の project seed が `VIEW_RESET` で highlight を消すため復元されない。エンコードは前方互換なので、#1842 で復元を直せば既存リンクも再共有なしで効く。
- **OGP の focused og:image**: `/render` 側に focus 引数が要るため未実装（人間 bounce 経由の deep-link は機能する）。
