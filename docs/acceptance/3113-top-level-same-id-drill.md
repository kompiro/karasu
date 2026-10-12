---
type: product
---

# AT: system の子と id を共有するトップレベルのノードに、click と permalink で入れる（#3113）

- **日付**: 2026-10-12
- **関連 Issue**: [#3113](https://github.com/kompiro/karasu/issues/3113)
- **設計 (ADR)**: [ADR-3113](../adr/3113-top-level-same-id-drill.md)
- **Related TPLs**: [TPL-3113](../test-perspectives/TPL-3113-written-path-resolves-to-its-node.md)（書いた path が同じノードに戻る。AC-1〜AC-4）、[TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)（静的 SVG と SPA で同じ anchor が同じノードに着く。AC-2）、[TPL-1160](../test-perspectives/TPL-1160-top-level-orphans.md)（トップレベルの宣言を全消費側で扱う。AC-3）、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)（並行する読み手を 1 つにする。AC-3）
- **対象ファイル**:
  - `packages/core/src/view/view-extract.ts`（`resolveContainerChain`）
  - `packages/core/src/view/unassigned-system.ts`（`isUnassignedSystem`）
  - `packages/app/src/hooks/useBreadcrumbs.ts`
  - `packages/app/src/hooks/useChatSession/prompt.ts`（`detectDrillDownLevel`）

> トップレベルの `service Api { domain Parked }` が `Shop.Api` と id を共有すると、system の段のない path（`["Api"]`、`["Api", "Parked"]`）が `Shop` で解決されていた。ルートの Unassigned 枠の `Api` を click すると `Shop.Api` の中身が開き、`#krs-system-Parked` は空のビューになった。system の段のない path はまずトップレベルとして歩き、歩けなければ実 system で歩く。app のパンくずと chat の drill レベルも同じ解決を使う。

## 受け入れ条件

### AC-1: click と permalink が書いたノードに着く

- [x] AT-A: `nodePathIndex.get("Parked")`（`["Api", "Parked"]`）で compile すると `P` が描かれる

  > ✅ Automated — `packages/core/src/compile/top-level-same-id-drill.test.ts` › a top-level node sharing its id with a system's child (#3113) › opens the node's children from its permalink path

- [x] AT-B: ルートと drill 先の各カード（`Api`、`Shop.Api`、`__unassigned__.Api.Parked`、`Shop.Api.Orders`）について、`data-node-path` を split した path と `nodeMetadataByPath` の `viewPath` のどちらで compile しても、そのカードのノードの子が描かれる

  > ✅ Automated — `packages/core/src/compile/top-level-same-id-drill.test.ts` › a top-level node sharing its id with a system's child (#3113) › opens $card's children from its card on [$canvas]

- [x] AT-C: app でルートの Unassigned 枠の `Api` カードを click すると `Parked` が見え `Orders` は見えず、パンくずは `Unassigned > Api`。`#krs-system-Parked` を開くと `P` が見え、パンくずは `Unassigned > Api > Parked`

  > ✅ Automated — `packages/e2e/tests/at-3113-top-level-same-id-drill.spec.ts` › clicking the Unassigned Api card drills into the top-level Api ／ … › opening #krs-system-Parked lands on the top-level domain

### AC-2: 解決の順と、変わらないもの

- [x] AT-D: system の段のない path はトップレベル → 別引数のトップレベルの service / domain → 先頭の id を子に持つ実 system の順で歩き、最後まで歩けた最初の候補に着く。`["Api", "Orders"]` は今までどおり `Shop.Api.Orders`、system id で始まる path は変わらない。entity ビューも同じ解決を使う

  > ✅ Automated — `packages/core/src/view/top-level-same-id-path.test.ts` › resolveContainerChain: a path with no system segment (#3113)

- [x] AT-E: 静的バンドルの各 `krs-system-<id>` のレベルと、SPA が同じ anchor で開くビューが、トップレベルのノードと system の子が id を共有するモデルでも一致する

  > ✅ Automated — `packages/core/src/renderer/static-bundle-same-id.test.ts` › buildDrillDownSvg: one level per anchor id (#2933) › shows the node the SPA resolves the same anchor to, for every anchor ／ buildAllViewsSvg: … › shows the node the SPA resolves the same anchor to, for every anchor

### AC-3: app の読み手も同じノードを語る

- [x] AT-F: パンくずは `["Api", "Parked"]` と `["__unassigned__", "Api", "Parked"]` で同じラベル列（`Unassigned > Api > Parked`）になり、各項目の `navigatePath` は入力 path の接頭辞。`["Shop", "Api"]` は `Shop > Api` のまま。モデルから消えた段を含む path は生きている部分までを出す

  > ✅ Automated — `packages/app/src/hooks/useBreadcrumbs.test.ts` › useBreadcrumbs › a top-level node sharing its id with a system's child (#3113)

- [x] AT-G: chat に渡す drill レベルは `["Api"]` で `service`、`["Api", "Parked"]` で `domain`、`["Shop", "Api", "Orders"]` で `domain`

  > ✅ Automated — `packages/app/src/hooks/useChatSession.test.ts` › detectDrillDownLevel on a path with no system segment (#3113)

## 手動確認

N/A — 自動テストですべて覆っている。判定は SVG 属性・パンくずの DOM・URL hash で、実機を要しない。

## 参考: 対象のモデル

```krs
system Shop {
  service Api { domain Orders { usecase Place {} } }
}
service Api { domain Parked { usecase P {} } }
```
