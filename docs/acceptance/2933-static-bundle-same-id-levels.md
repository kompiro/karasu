---
type: product
---

# AT: 静的バンドルは同じ anchor id のレベルを 1 つだけ出し、その中身は SPA と同じノード（#2933）

- **日付**: 2026-10-11
- **関連 Issue**: [#2933](https://github.com/kompiro/karasu/issues/2933)
- **設計**: [#2933](https://github.com/kompiro/karasu/issues/2933) の Design Doc PR #3100（実装マージ後に ADR-2933 へ昇格する）
- **Related TPLs**: [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)（静的 SVG と SPA で同じ anchor が同じノードに着く。AC-2）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（勝者は `@migration_target` 優先。AC-3・AC-5）、[TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（同じ id のノードが 2 つある面の着地点。AC-4）、[TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（walk の path が system の次元を運ぶ。AC-3）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（`buildDrillDownSvg` と `buildAllViewsSvg` の両方で同じ検査）
- **対象ファイル**:
  - `packages/core/src/renderer/drill-down-svg.ts`（`collectDrillDownLevels`・`systemAnchorOwner`・`collectEntityLevels`）
  - `packages/core/src/renderer/all-layers-svg.ts`（`DrillChild`・`systemDrillChildren`・stacked の帯ラベル）
  - `packages/core/src/renderer/svg-renderer.ts`（`cardLinkKey`。カードのリンクを path で引く）
  - `packages/core/src/view/unassigned-system.ts`（`withoutUnassignedSegment`）

> 静的バンドルは同じ id のノードごとに `<g id="krs-system-<id>">` を出し、複数 system のルートでは子の path に system の段を持たないため、後の system の部分木が前の system の複製になっていた。anchor id ごとにレベルを 1 つだけ出し、その中身を SPA が同じ fragment を解決する `nodePathIndex` の勝者で決める。walk は full path で回すので、勝者でないノードの下の一意な id は自分のレベルを持つ。カードは自分のレベルがあるときだけリンクし、戻るボタンは自分のノードを出すレベルを持つ最も近い祖先へ向く。

## 受け入れ条件

### AC-1: anchor id ごとにレベルは 1 つ

- [x] AT-A: 同じ id のノードを持つモデル（2 system の `Api`、1 system の 2 service の `Core`、system の子とトップレベルの `Api`）で、`krs-system-*` / `krs-entity-*` の各 id が 1 回だけ出る

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildDrillDownSvg: one level per anchor id (#2933) › emits each anchor id once ／ buildAllViewsSvg: … › emits each anchor id once

### AC-2: 中身は SPA が同じ anchor で開くノード

- [x] AT-B: バンドルの各 `krs-system-<id>` のレベルのカードの `data-node-path` の集合が、`compile(..., { viewPath: nodePathIndex.get(id) })` の出力と一致する（全 anchor について）。トップレベルのノードと system の子が id を共有するモデルも比べる（SPA 側の抽出が system の段のない path をトップレベルとして解決するようになった #3113 から）

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildDrillDownSvg: one level per anchor id (#2933) › shows the node the SPA resolves the same anchor to, for every anchor ／ buildAllViewsSvg: … › shows the node the SPA resolves the same anchor to, for every anchor

### AC-3: 後の system の部分木は自分のノードで描かれる

- [x] AT-C: `Shop.Api { domain Orders }` と `Admin.Api { domain Users }` で、`krs-system-Api` は `Shop.Api.Orders`、`krs-system-Users` は `Admin.Api.Users` の中身を出す

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildDrillDownSvg: one level per anchor id (#2933) › draws the later system's subtree from its own nodes ／ buildAllViewsSvg: … › draws the later system's subtree from its own nodes

- [x] AT-D: `Admin.Api` が `@migration_target` のとき `krs-system-Api` は `Admin.Api` になり、`Shop.Api` の下の一意な `Orders` はレベルを持つ

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildDrillDownSvg: one level per anchor id (#2933) › follows @migration_target to the later system ／ buildAllViewsSvg: … › follows @migration_target to the later system

- [x] AT-E: 1 system の 2 service が `domain Core` を持つとき、`krs-system-Core` と `krs-entity-Core` は勝者の service の `Core` を出す

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildDrillDownSvg: one level per anchor id (#2933) › dedupes a domain id shared by two services of one system, and its entity view ／ buildAllViewsSvg: … › dedupes a domain id shared by two services of one system, and its entity view

- [x] AT-F: トップレベルの `service Api { domain Parked }` が `Shop.Api` と id を共有するとき、`krs-system-Parked` は Unassigned 枠の `Api` の下を出す

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildDrillDownSvg: one level per anchor id (#2933) › draws a top-level node's subtree under the Unassigned frame ／ buildAllViewsSvg: … › draws a top-level node's subtree under the Unassigned frame

### AC-4: リンクと戻るボタンは別のノードのレベルへ向かない

- [x] AT-G: ルートでは anchor のレベルを持つカードだけが `<a href="#krs-system-Api">` に包まれ、もう一方の `Api` カードはリンクを持たずに描かれる（勝者が `@migration_target` で入れ替わっても同じ）。トップレベルの `Api` カードも system の `Api` のリンクを拾わない

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › links and back buttons around a same-id node (#2933) › links only the card whose own level the anchor names ／ … › links a top-level card by its root path, not the system card that shares its id

- [x] AT-H: `Admin.Api.Users` と `Parked` のレベルの戻るボタンはルートへ向き、`Shop.Api.Orders` の戻るボタンは `krs-system-Api` へ向く

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › links and back buttons around a same-id node (#2933) › points a back button past an ancestor whose anchor names another node

- [x] AT-I: 同じ id を持たない複数 system のモデルでは、リンクと戻るボタンは今までどおり

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › links and back buttons around a same-id node (#2933) › keeps the links and back buttons of a model without shared ids

### AC-5: 同梱の example で移行先に着く

- [x] AT-J: `examples/en/migration/system.krs` のバンドルで、`krs-system-Order` は `OrderService` の `Order`、`krs-system-Catalog` は `CatalogService` の `Catalog` を出し、`@deprecated` の `LegacyMonolith` のノードを含まない（修正前は `LegacyMonolith` のレベルが DOM 順で先に出ていた）

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › examples/en/migration: the bundle opens the migration target (#2933) › buildDrillDownSvg: #krs-system-Order is OrderService's Order, not the deprecated one ／ … › buildAllViewsSvg: #krs-system-Order is OrderService's Order, not the deprecated one

### AC-6: stacked export は同じ id のノードを自分の path で描く

- [x] AT-K: `buildAllLayersSvg` で `Admin › Api` と `Admin › Api › Users` の帯が出て、`Admin.Api.Users.Invite` が描かれる

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildAllLayersSvg draws same-id nodes at their own paths (#2933) › labels each band from its own system and draws the later subtree

## 手動確認

N/A — 自動テストですべて覆っている。anchor がどのレベルを開くかは SVG の `<g id>` の一意性と各レベルの中身で決まり（CSS `:target` は id が一致する要素を出すだけ）、両方を AC-1〜AC-5 が SVG テキストで判定している。

## 参考: 対象のモデル

```krs
system Shop {
  service Api {
    domain Orders {
      usecase Place {}
    }
  }
  service Worker {}
}

system Admin {
  service Api {
    domain Users {
      usecase Invite {}
    }
  }
}
```
