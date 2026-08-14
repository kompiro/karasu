---
type: product
---

# AT: service ブロック内に宣言したエッジを描画する（#2223）

- **日付**: 2026-08-12
- **関連 Issue**: [#2223](https://github.com/kompiro/karasu/issues/2223)
- **Related TPLs**: [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)（parse を通った構造は描画されるか診断される）, [TPL-2184](../test-perspectives/TPL-2184-equivalent-placements-share-one-diagnostic.md)（同じ状態を表す配置は同じ扱いを受ける）
- **対象ファイル**:
  - `packages/core/src/view/view-extract.ts`（`collectAnchoredPeerEdges` / `withChildAnchoredEdges`）
  - `packages/core/src/resolver/warnings.ts`（`detectEdgeEndpointsNotAtScope` の `peersOf`）
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Edges inside a service block / §service ブロック内のエッジ）

> `service S1 { S1 -> S2 }` は起点スコープ規則が求める正準形なのに、どのビューにも描画されず診断も出なかった。エッジは**宣言元ブロックをノードとして描くビュー**に描画する — 判定式は `edge-endpoint-not-at-scope` の peer 集合と同一で、描画側と診断側は 1 つの規則の表と裏になる。

## 受け入れ条件

### AC-1: service-anchored edge が描画される

- [x] AT-A: `service S1 { S1 -> S2 }` がルートのシステムビューと system ドリルダウンの両方に描画される（ラベル・`-->` の非同期種別も保持される）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › renders on the root system view and on the system drill-down ／ renders an async edge to an external sibling service

- [x] AT-B: implicit な起点の綴り（`-> S2`）も同じ扱いになる

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › renders the implicit-source spelling (`-> S2`) the same way

- [x] AT-C: target が sibling service / `[external]` service / sibling client / 限定子付き cross-system（ghost system・caller ghost）/ user のいずれでも描画経路に乗る

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › feeds the ghost-system machinery for a qualified cross-system target ／ surfaces a ghost user for a service-anchored edge to a user ／ `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › an authored edge either renders or is reported (TPL-2075)

- [x] AT-D: system ブロックを持たないファイルでも、`__unassigned__` フレームに包まれた orphan service 間で描画される（drawio 経路の orphan 引き渡しでも同じ）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › renders between orphan services on the unassigned canvas

- [x] AT-D2: ルートの 3 形態（単一 system / 複数 system / `__unassigned__` のみ）すべてで、**layout を通した後**に矢印が残る（複数 system と `__unassigned__` のルートは `ViewSlice.childEdges` ではなく各 system の edge から描画するため、抽出だけを見ると落ちているのに気付けない）

  > ✅ Automated — `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › the root canvas draws a service-anchored edge in every root shape

### AC-2: 描画側と診断側が同じ規則を共有する

- [x] AT-E: 各配置について「どこかの view に描画される」か「`edge-endpoint-not-at-scope` で報告される」かのちょうど一方だけが成り立つ（silent drop も二重報告も無い）

  > ✅ Automated — `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › an authored edge either renders or is reported (TPL-2075)（10 配置）

- [x] AT-F: 新たに描画されるようになった配置では warning が消える（service の peer 宛て、orphan 同士）。peer でない配置（他 service の domain 宛て、`__unassigned__` に包まれない top-level client を端点に持つ両向き）は warning のまま描画されない

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › edge-endpoint-not-at-scope warning › does not warn for a service-anchored edge to a peer of the declaring service ／ does not warn for an anchored edge between two top-level orphan services ／ warns when an orphan service's anchored edge names a top-level client ／ warns when a top-level client anchors an edge to an orphan service ／ `packages/core/src/view/view-extract.test.ts` › does not render an endpoint that is not a peer at the declaring scope

### AC-3: 既存の描画を壊さない

- [x] AT-G: 明示的な service-anchored edge があるペアでは、cross-service ドメインエッジからの暗黙エッジ（`[implicit]`）が派生しない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › suppresses the implicit service edge derived for the same pair

- [x] AT-H: entity 関連が usecase（domain ドリルダウン）ビューに漏れない — entity は entity ビュー専用のまま

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › keeps entity relations out of the domain drill-down

- [x] AT-I2: 同じペアに sync と async の両方を書いたら 2 本とも描画される（描画の同一性は arrow kind を含めて数える）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › keeps a sync and an async edge between the same pair as two edges

- [x] AT-I: 既存の domain→domain エッジ（intra-service / cross-service）とシステムスコープのエッジの描画が変わらない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › domain-to-domain edges（既存スイート）／ `packages/core/src/examples.test.ts`

### 手動確認

- [ ] M-1: <https://karasu.kompiro.dev/> で `service S1 { S1 -> S2 ... }` を書くと、システムビューに矢印が描画され、警告パネルに `edge-endpoint-not-at-scope` が出ない
- [ ] M-2: 同じモデルで system をドリルダウンしても同じ矢印が描画され、二重に描かれていない
- [ ] M-3: 限定子付き target（`S1 -> Other.Svc`）を service ブロック内に書くと、S1 のサービスビューに相手 system が ghost として描画される
