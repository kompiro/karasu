---
type: product
---

# AT: 複数 system のルートビューは同名ノードを両方描き、クリックはカードの path に着く（#2917）

- **日付**: 2026-09-28
- **関連 Issue**: [#2917](https://github.com/kompiro/karasu/issues/2917)
- **設計 (ADR)**: ADR-2917（[#2917](https://github.com/kompiro/karasu/issues/2917) の Design Doc PR #2920 から、実装マージ後に昇格する）
- **Related TPLs**: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（区別に要る次元を Map の key に含める。AC-1・AC-4・AC-5）、[TPL-2920](../test-perspectives/TPL-2920-duplicate-element-id-on-one-canvas-names-its-landing.md)（同じ要素 id が 2 つ描かれる面では着地点を決めて記録し、1 ノードを指す消費側には path を渡す。AC-2・AC-6・AC-7）、[TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（勝者規則は変えない。AC-7）、[TPL-2818](../test-perspectives/TPL-2818-cross-view-handover-carries-receiver-id-space.md)（`data-node-path` は全論理ビューで同じ形。AC-6）
- **対象ファイル**:
  - `packages/core/src/renderer/layout.ts`（`layoutMultipleSystems` の merge key・ループ内 lookup・束ね・cross-system 端点）
  - `packages/core/src/renderer/layout-types.ts`（`LayoutNode.path`・`LayoutResult.nodeIdentity`）
  - `packages/core/src/renderer/svg-renderer.ts`（要素 id の取り方と `data-node-path`）
  - `packages/core/src/parser/node-path.ts`（`parseNodePathRefId`）
  - `packages/core/src/compile/compile.ts`（`nodeMetadataByPath`）
  - `packages/app/src/components/PreviewPane.tsx`（click delegation が path で引く）
  - `packages/vscode/src/preview-panel.ts` / `packages/vscode/src/webview-content.ts` / `packages/vscode/src/drilldown-state.ts`（`drillDown` message の `nodePath`、詳細パネルと hover の path lookup）

> 2 つの system が同じ bare id の service を持つと、ルートビューは後の system のカードで前の system のカードを上書きし、枠が空になっていた。merge の key を (system, id) にして両方描く。要素の id（`data-node-id`）は bare id のまま、各カードに `data-node-path`（`Shop.Api`、ADR-2714 の `nodePathRefId` 形）を足し、app と VS Code のドリルと詳細パネルはそれで自分のノードに着く。bare id だけを運ぶ hand-over（ハイライト・アウトライン・permalink）の着地は変えず、仕様として書く（#2935 で path 化）。

## 受け入れ条件

### AC-1: 両方描かれる

- [x] AT-A: `Shop` と `Admin` が両方 `service Api` を持つモデルのルートビューで、`data-node-id="Api"` のカードが 2 つ描かれ、それぞれが自 system の枠の中にある。`Shop` の枠のカード数は `viewPath: ["Shop"]` のノード数と一致する

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › multi-system root draws both same-id nodes (#2917) › keeps one card per system for a shared bare id, each inside its own frame

- [x] AT-B: `Shop` の `Api -> Worker` は `Shop` の `Api` の矩形から出る

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › multi-system root draws both same-id nodes (#2917) › starts Shop's edge on Shop's Api, not on Admin's

### AC-2: 要素の id は bare id のまま

- [x] AT-C: SVG の `data-node-id="Api"` は 2 回出て、Map の scoped key は SVG に現れない

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › multi-system root draws both same-id nodes (#2917) › emits data-node-id twice and a distinct data-node-path per card ／ … › does not key the emitted id by the scoped Map key

- [x] AT-D: deploy ビューは今までどおり Map の key（`<container>::<unit>`）を `data-node-id` に使う

  > ✅ Automated — `packages/core/src/renderer/deploy-renderer.test.ts` › realized node ids in the SVG (#2818) › spells both attributes the same for a plain id

### AC-3: 衝突しないモデルのレイアウトは変わらない

- [x] AT-E: 同名 id を持たない multi-system モデルの配置・ルーティングは既存の fence のまま（変わるのは各ノードカードに `data-node-path` が 1 つ増えることだけ）

  > ✅ Automated — `packages/core/src/renderer/routing-parity.test.ts` › multi-system root view routes its edges (#2363) › keeps every system's routes inside its own strip, on either side (#2610) ／ `packages/core/src/renderer/layout.test.ts` › layout > multi-system root view › lays out all systems side by side

### AC-4: 束ねと側面配置は system 単位

- [x] AT-F: 2 system が同じ `Api -> Worker` を持つとき、2 本の edge は束ねられない。1 system 内の並行 edge は今までどおり束ねる

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-system lookups on the root (#2917) › does not bundle two systems' same-named parallel edges together ／ … › still bundles parallel edges declared within one system

- [x] AT-G: 2 system が同名の `[external]` service を持つとき、それぞれが自 system の枠の側面に置かれる

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-system lookups on the root (#2917) › places each system's same-named external on its own frame's side

### AC-5: cross-system edge の端点

- [x] AT-H: `Shop.Api -> Admin.Api` は `Shop` の `Api` の矩形から出て `Admin` の `Api` の矩形に着く

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-system lookups on the root (#2917) › anchors a cross-system edge on the right two cards

- [x] AT-I: compare mode で before slice にだけある cross-system edge は、source の bare id がルートで 1 つなら今までどおり描かれる

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › per-system lookups on the root (#2917) › keeps drawing a compare-mode removed cross-system edge whose bare source is unique

### AC-6: `data-node-path`

- [x] AT-J: 論理ビューの全ノードカードは `data-node-path` を `nodePathRefId` 形で持つ。引用符付き id（`service "www.example.com"`）は `Weird."www.example.com"` になり、`parseNodePathRefId` で round-trip する。単一 system のビューと drilled level でも canvas の scope 付きで出る

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › data-node-path carries the nodePathRefId form on every logical canvas (#2917) › quotes a segment that would make the join ambiguous, and round-trips ／ … › is present on a single-system view and on a drilled level, scoped by the canvas ／ `packages/core/src/parser/node-path.test.ts` › parseNodePathRefId (#2917) › round-trips every path nodePathRefId can produce

- [x] AT-K: `CompileResult.nodeMetadataByPath` は path をキーに、その path そのものを `viewPath` に持つ。bare id の `nodeMetadata` は変えない

  > ✅ Automated — `packages/core/src/renderer/multi-system-same-id.test.ts` › data-node-path carries the nodePathRefId form on every logical canvas (#2917) › is keyed into nodeMetadataByPath with the exact viewPath of that node

### AC-7: クリックは自分のノードに着く

- [x] AT-L: app で `Admin` の `Api` カードをクリックすると `Admin` に潜り（`Users` が見え `Orders` は見えない）、`Shop` のカードなら `Shop` に潜る。ルートには `data-node-id="Api"` が 2 つある

  > ✅ Automated — `packages/e2e/tests/at-2917-multi-system-root-same-id.spec.ts` › draws one Api card per system, each carrying its own path ／ … › clicking the Admin card drills into Admin, not into the Shop winner ／ … › clicking the Shop card drills into Shop

- [x] AT-M: `PreviewPane` の click delegation は `data-node-path` を decode してドリルし、詳細パネルは path で引いた metadata を出す。path の無いカードは bare id に fall back する

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › data-node-path resolves the clicked card (#2917) › drills into the clicked card's own path, not the bare-id index winner ／ … › decodes a quoted path segment before drilling ／ … › opens the detail panel with the clicked card's own metadata ／ … › falls back to the bare-id metadata for a card without a path

- [x] AT-N: VS Code webview は `drillDown` message に `nodePath` を載せ、host は decode した path で潜る。詳細パネルと hover は path map を先に引く

  > ✅ Automated — `packages/vscode/src/drilldown-state.test.ts` › drillDown with the card's own path (#2917) › drills to the decoded data-node-path over the metadata's index-resolved viewPath ／ `packages/vscode/src/webview-content.test.ts` › data-node-path in the webview (#2917) › posts the card's data-node-path with the drillDown message and reads the panel by it ／ `packages/vscode/src/message-validation.test.ts` › isOptionalNodePath (#2917) › accepts undefined and a non-empty string, rejects everything else

### AC-8: bare id だけを運ぶ hand-over の着地（仕様）

ハイライト・アウトライン・VS Code のカーソル追従は DOM 順で最初の `data-node-id` 要素に、permalink と hash は `nodePathIndex` の勝者に着く。`node-id-multiple-locations` がその状態を作者に伝える。path 化は [#2935](https://github.com/kompiro/karasu/issues/2935)。

- [x] AT-O: system ペインのハイライトは `data-node-id` を 1 属性で引く（最初の要素に着く）

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › highlightedNodeId › does not fall back to the container when matching data-node-id (#2818)

- [x] AT-P: 同名 id の hash（`#krs-system-Api`）は `nodePathIndex` の勝者に解決する

  > ✅ Automated — `packages/e2e/tests/at-2917-multi-system-root-same-id.spec.ts` › clicking the Admin card drills into Admin, not into the Shop winner

## 手動確認

N/A — 自動テストですべて覆っている。判定はすべて SVG 属性・レイアウト座標・DOM・URL hash で、実機を要しない。

## 参考: 対象のモデル

```krs
system Shop {
  service Api {
    domain Orders {}
  }
  service Worker {}
  Api -> Worker "queues"
}

system Admin {
  service Api {
    domain Users {}
  }
}
```
