---
type: product
---

# AT: クロスナビゲーションのハイライトは、受け手のビューが持つノード id で突き合わせる（#2818）

- **日付**: 2026-09-26
- **関連 Issue**: [#2818](https://github.com/kompiro/karasu/issues/2818)
- **Related TPLs**: [TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md)（ビューをまたぐ id の手渡しは受け手の id 空間で。チェックリスト 2・3・5 を AC-1 / AC-2・AC-5 / AC-2・AC-4 に落とした）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（injective にした identity を別の空間の lookup key に流用していた consumer）
- **対象ファイル**:
  - `packages/core/src/renderer/layout-types.ts`（`ContainerRect.realizedNodeId`）
  - `packages/core/src/renderer/deploy-layout.ts`（`DeployContainer.nodeId` を通す）
  - `packages/core/src/renderer/svg-renderer.ts`（コンテナ `<g>` の `data-realized-node-id`）
  - `packages/app/src/components/PreviewPane.tsx`（click delegation と `highlightAttribute`）
  - `packages/app/src/components/PreviewColumn.tsx`（deploy ペインにだけ `data-realized-node-id` を渡す）
  - `packages/app/src/hooks/useCrossNavigation.ts`（`handleContainerClick(realizedNodeId | null)`）
  - `packages/vscode/src/preview-panel.ts` / `packages/vscode/src/webview-content.ts`（highlight message の属性）

> deploy ↔ system のクロスナビゲーションは、1 つの文字列を `data-node-id` と `data-container-id` に順に当てて突き合わせていた。コンテナの id は identity で、修飾（#2549）や引用符（#2714）でノードの id 空間に無い綴りになるため、そうしたコンテナは両方向ともビューが切り替わるだけで何も光らなかった。ADR-2714 が core に置いた `DeployContainer.nodeId` をコンテナ要素に `data-realized-node-id` として載せ、両方向ともノード id を手渡し、受け手はビューごとに 1 つの属性だけを引く。

## 受け入れ条件

### AC-1: SVG 属性

- [x] AT-A: 引用符付き id（`service "www.example.com"`）を realize するコンテナは、identity の `data-container-id` が引用符付きのまま、`data-realized-node-id="www.example.com"` を持つ

  > ✅ Automated — `packages/core/src/renderer/deploy-renderer.test.ts` › realized node ids in the SVG (#2818) › carries a quoted id's bare node id, which the container id cannot spell

- [x] AT-B: 素の id では両属性が同じ綴りになる（修飾も引用符も持たないモデルの挙動は変わらない）

  > ✅ Automated — `packages/core/src/renderer/deploy-renderer.test.ts` › realized node ids in the SVG (#2818) › spells both attributes the same for a plain id

- [x] AT-C: 修飾された 2 コンテナ（`Shop.Api` / `Admin.Api`）と絞り込み参照（`realizes Shop.Api` で `Admin.Api` が未デプロイ）のコンテナは属性を持たない。synthetic container（`__unclassified__` / `__job_band__`）にも付かない

  > ✅ Automated — `packages/core/src/renderer/deploy-renderer.test.ts` › realized node ids in the SVG (#2818) › omits it on qualified containers and on a narrowed ref ／ … › never marks the synthetic containers

### AC-2: 引用符付き id の両方向（app）

- [x] AT-D: deploy → system。引用符付き id のコンテナをクリックすると system に切り替わり、`data-node-id="www.example.com"` のノードが光り、hash は `#krs-system-root:www.example.com`

  > ✅ Automated — `packages/e2e/tests/at-2818-cross-navigation-id-space.spec.ts` › a quoted id lights the node on deploy → system and carries the bare id in the hash

- [x] AT-E: system → deploy。D ボタンで deploy に切り替わり、`data-realized-node-id="www.example.com"` のコンテナが光り、hash は `#krs-deploy:www.example.com`

  > ✅ Automated — `packages/e2e/tests/at-2818-cross-navigation-id-space.spec.ts` › a quoted id lights the container on system → deploy

- [x] AT-F: click delegation はコンテナの identity ではなく `data-realized-node-id` の値を手渡す

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › onContainerClick › hands over the realized node id, not the container id (#2818)

### AC-3: 素の id の非退行

- [x] AT-G: 素の id（`Web`）の deploy → system は従来どおり光り、hash に `:Web` が載る

  > ✅ Automated — `packages/e2e/tests/at-0014-memory-project-mode-unification.spec.ts` › Clicking a deploy container switches to System with the realizes target highlighted (AC-2.1, AC-2.2, AC-2.3)

- [x] AT-H: 素の id の D ボタンは従来どおり deploy に切り替わる

  > ✅ Automated — `packages/e2e/tests/at-0029-system-to-deploy-navigation.spec.ts` › clicking the deploy button switches to the Deploy tab (AT-0029-02)

### AC-4: `nodeId` を持たないコンテナは切り替えるだけ

修飾コンテナはこれまでも光らなかった。絞り込み参照（コンテナ id が bare の `Api` のまま）は偶然の一致で光っていたが、bare id `Api` は未デプロイの `Admin.Api` にも届くので、D ボタンと同じ判断（ADR-2714）で光らせない。**挙動変更として明示する。**

- [x] AT-I: 修飾コンテナ（`Shop.Api`）のクリックは system に切り替わり、ハイライトは 0 件、hash は `#krs-system-root`

  > ✅ Automated — `packages/e2e/tests/at-2818-cross-navigation-id-space.spec.ts` › a qualified container switches to System and lights nothing

- [x] AT-J: 絞り込み参照のコンテナ（id は `Api`）のクリックも同じく切り替わるだけ

  > ✅ Automated — `packages/e2e/tests/at-2818-cross-navigation-id-space.spec.ts` › a narrowed ref switches to System and lights nothing

- [x] AT-K: 属性が無いコンテナのクリックは `null` を手渡し、`SET_ACTIVE_VIEW` は highlight 無しで dispatch される（ADR-422 の 1 dispatch は保つ）

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › onContainerClick › hands over null when the container realizes no single node (#2818) ／ `packages/app/src/hooks/useCrossNavigation.test.ts` › handleContainerClick(null) switches to system with no highlight (#2818)

### AC-5: 受け手はビューごとに 1 属性を引く

- [x] AT-L: deploy ペインは `data-realized-node-id` だけを引く。同じ綴りの unclassified unit（`data-node-id="Api"`）があってもコンテナが光り、unit は光らない

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › highlightedNodeId › matches only data-realized-node-id when the pane is told to (#2818)

- [x] AT-M: system / org ペインは `data-node-id` だけを引き、`data-container-id` に fall back しない

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › highlightedNodeId › does not fall back to the container when matching data-node-id (#2818)

### AC-6: VS Code webview

- [x] AT-N: highlight message は属性名を運び、webview はその 1 属性で引く。既定は `data-node-id`（カーソル追従）、deploy への `switchViewAndHighlight` は `data-realized-node-id`

  > ✅ Automated — `packages/vscode/src/webview-content.test.ts` › buildPreviewHtml › lets a highlight message pick data-realized-node-id, defaulting to data-node-id

- [x] AT-O: 詳細パネルの「deploy ビューを開く」で、realize したコンテナが光る

  > ✅ Automated — `packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts` › AT-0042-2: clicking the deploy nav button switches the preview to the Deploy diagram

## Coverage policy

**Automated (AT-N, AT-O)** — AT-O is automated in
[`packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts`](../../packages/vscode-e2e/tests/webview/at-0039-detail-panel.test.ts)
under the WebView E2E harness (see [AT-0039](0039-vscode-detail-panel.md)).

The harness job is gated on the `vscode-webview-e2e` PR label and is **not**
a required check.

## 手動確認

N/A — 自動テストですべて覆っている。判定はすべて SVG 属性・DOM の class・URL hash で、実機を要しない。

## 参考: 対象のモデル

```krs
system Weird {
  service "www.example.com" {}
}

system Shop {
  service Api {}
  service Worker {}
}

system Admin {
  service Api {}
}

deploy prod {
  oci edge { realizes "www.example.com" }
  oci a { realizes Shop.Api }
  oci b { realizes Admin.Api }
  oci w { realizes Worker }
}
```
