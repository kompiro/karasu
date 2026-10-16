---
id: ADR-2632
title: エッジの hover affordance を identity から切り離し、描かれた全エッジに付ける
status: accepted
date: 2026-10-16
topic: renderer
related_to: [ADR-1096, ADR-1400, ADR-2209, ADR-2598, ADR-3022, ADR-3090]
scope:
  packages:
    - core
    - app
assumptions:
  - "grep: packages/core/src/renderer/edge-routing.ts :: krs-edge__hitline"
  - "grep: packages/app/src/styles/components/preview.css :: \\.krs-edge:hover"
  - "grep: packages/app/src/styles/components/preview.css :: \\.ghost-edges:has\\(\\.krs-edge:hover\\)"
  - "grep: packages/app/src/components/focus-canvas/node-focus.ts :: EDGE_HOVER_TRIGGER = \"\\.krs-edge\""
  - "file: packages/core/src/renderer/edge-affordance-parity.test.ts"
  - "file: packages/e2e/tests/at-2632-deploy-edge-hover.spec.ts"
  - "file: docs/acceptance/2632-edge-hover-affordance.md"
  - "file: docs/test-perspectives/TPL-2632-viewer-affordance-not-gated-on-author-identity.md"
---

# ADR-2632: エッジの hover affordance を identity から切り離し、描かれた全エッジに付ける

- **日付**: 2026-10-16
- **ステータス**: 決定済み
- **関連**:
  - Issue #2632（起点）、設計 PR #2798（本 ADR に集約し削除: `docs/design/edge-hover-affordance.md`）、実装 PR #3174
  - [ADR-1096](1096-edge-id-selector.md)（`edge#<id>` selector と canonical id）、[ADR-1400](1400-edge-context-menu-shadcn-menu.md)（edge context menu）、[ADR-2209](2209-edge-property-block.md)（property block と左クリック）、[ADR-2598](2598-edge-routing-channel-capacity.md)（deploy view を共有配線チェーンへ）、[ADR-3022](3022-edge-label-disclosure.md)（detail を持たないエッジのクリックで focus canvas を開く）、[ADR-3090](3090-crossing-marks-follow-edge-focus.md)（交差マークをエッジの hover に追従させる）
  - 受け入れテスト: [AT-2632](../acceptance/2632-edge-hover-affordance.md)、[AT-1186](../acceptance/1186-edge-hover-highlight-dim.md)（AT-A の対象を全エッジに改訂）、[AT-3090](../acceptance/3090-crossing-marks-follow-edge-focus.md)（AT-D を同じく改訂）
  - TPL: [TPL-2632](../test-perspectives/TPL-2632-viewer-affordance-not-gated-on-author-identity.md)（実装 PR で起こした retrospective TPL）、[TPL-1983](../test-perspectives/TPL-1983-view-state-gate-parity-across-surfaces.md)、[TPL-219](../test-perspectives/TPL-219-parallel-function-parity.md)、[TPL-3090](../test-perspectives/TPL-3090-edge-decoration-follows-edge-emphasis.md)
  - spike: `spike/2632-deploy-edge-hover`（`reports/2632-deploy-edge-hover/` に計測スクリプト・数値・スクリーンショット）
  - コード: `packages/core/src/renderer/edge-routing.ts`（`renderEdge` の hit-line）、`packages/app/src/styles/components/preview.css`（hover 規則）、`packages/app/src/components/focus-canvas/node-focus.ts`（`EDGE_HOVER_TRIGGER`）

## 背景

deploy view のエッジに hover しても何も起きなかった。stroke は太くならず、明るくもならず、他のエッジも dim されない。system view の同じ操作はエッジを強調する。

#2632 はこれを `renderEdge` の `const interactive = edge.canonicalId !== undefined;` に帰していた。`canonicalId` は `assignEdgeCanonicalIds` が system 経路でしか配らず、deploy エッジは id を持たない。spike で計測したところ、この診断は正しいが範囲が狭かった。

組み込み `ExampleProject` と reverse した dify モデルの 45 render surface・534 本のうち、132 本（24.7%）に hover affordance が無かった。deploy view はそのうち 20 本にすぎない。

| 原因         | 本数 | 内容                                                                                                                                                                                   |
| ------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-id-pass` | 82   | multi-system / `__unassigned__` root のフレーム内エッジに id パスが届いていなかった                                                                                                    |
| `ghost`      | 50   | 縮約された ghost レンダリングは意図的に `canonicalId` を落とす。deploy エッジは配線後に `ghost` が立つので全部ここに入る（[AT-2609](../acceptance/2609-deploy-routing-chain.md) AT-D） |

hover を止めていた gate は 1 つではなく 3 つあった。

1. **グループの class**。hover 規則も #1186 の peer dim も `.krs-edge--interactive` に付いていた。これは id で決まる class である。
2. **shape tag**。stroke 規則は `line` と `polyline` しか名指ししていなかった。hop mark を持つエッジ（#1859 P2c-C）は `<path>` で描かれるので、canonical id を持っていても太くならない。dify の system view では 24 本中 18 本がこれだった。
3. **祖先グループの opacity**。deploy エッジは `<g class="ghost-edges" opacity="0.3">` の中にある。group opacity は乗算合成されるので、hover した子に `opacity: 1 !important` を当てても 0.3 のままになる。

2 と 3 は identity と関係が無い。canonical id を配っても直らない。

加えて、deploy view の context menu は空振りする。`deploy-layout.ts` は `direction:` を読まないので、deploy エッジに id を合成してメニューを出しても、書き戻し先は system 側のエッジで、読者が見ているキャンバスは変わらない。

## 決定

hover と hit は描かれた全エッジに付け、右クリックの direction menu だけを canonical id に結びつける。

- **hit-line**: `renderEdge` は全エッジの背後に透明な hit-line を 1 本描く。`krs-edge--interactive` の意味は変えず、「direction menu がこのエッジを指せる」ことだけを表す。
- **hover 表現**: `preview.css` の hover 強調と peer dim を `.krs-edge` に付け替える。stroke 規則に `path` を加える。hover を抱えている `.ghost-edges` は `opacity: 1` に持ち上げ、deploy view でも焦点のエッジが実効 opacity 1、peer が 0.25 になる（system view と同じ）。`cursor: context-menu` は `.krs-edge--interactive` に残す。
- **交差マーク**: `node-focus.ts` の `EDGE_HOVER_TRIGGER`（#3090）も `.krs-edge` に広げ、CSS と同じ発火条件にする。
- **canonical id を持たないエッジのイベント契約**:
  - 右クリックはメニューを開かず、`preventDefault` も呼ばない。ブラウザ既定のメニューが出る。
  - 移動なしのクリックは、両端のカードがあれば focus canvas を開き（ADR-3022、#3055）、無ければ開いている detail panel を閉じる。設計時の「detail panel を閉じる以外の action を起動しない」は #3055 で成り立たなくなったので、実装で書き直した。
  - property block を持つエッジは従来どおり detail panel を開く。
- **deploy エッジは addressable にしない。** canonical id を合成せず、context menu も出さない。出さないことをテストで固定する。
- **柵**: `edge-affordance-parity.test.ts` が `examples/en` の全 corpus を 5 つの surface（system / deploy / drill-down / all-layers / all-views project bundle）で描き、各 surface で「エッジごとに hit-line が 1 本」「`krs-edge--interactive` と `data-edge-canonical-id` が双方向に一致」を assert する（TPL-1983 / TPL-219）。e2e `at-2632-deploy-edge-hover.spec.ts` は祖先グループの合成を含めた実効 opacity を測る。

## 理由

- **gate が消える。**「描かれたエッジは追跡できる」は例外を持たない規則なので、同期を保つべき条件が残らない。id で gate したままだと、次に id を配らない描画経路が生えたとき同じバグが再発する（TPL-2632）。
- **3 つの gate を 1 回で直す。** `renderEdge` は system / drill-down / all-layers / deploy の唯一の共通経路なので、hit-line の parity が構造的に成立する。shape tag と祖先グループの 2 つは CSS 側で直す。id を配る案ではこの 2 つが残る。
- **hover affordance と addressability は違う能力である。** #2543 が hit-line を `needsHitArea` として `interactive` から分けたのと同じ論法を、hover 表現まで進めた。
- **計測で system view と揃う。** spike の実測で deploy view が `{focused: 1, peer: 0.25}` に到達した。dify の system view の `path` エッジ 18 本にも初めて太線化が効いた。
- **コストは既存コストの拡大にとどまる。** hit-line の無条件化で組み込みコーパスの静的 SVG は 3,186,533 → 3,207,123 バイト（+0.65%）。addressable なエッジはすでに hit-line を持っていた。

## 却下した案

- **deploy エッジに canonical id を合成する（#2632 direction 2）。** 差分は最小だが、132 本中 20 本しか直らない。`path` の太線化と ghost group の opacity は残り、id を得ても焦点のエッジは 0.3 のままになる。context menu は空振りするので、deploy でだけメニューを抑止する分岐が要り、gate が 1 つ増える。
- **全経路で canonical id を配る。** 132 本すべてが hover 規則にマッチし、`edge#<id>` selector も multi-system root で効くようになる。しかし hover できるかどうかが id で決まり続けるので再発耐性が無い。ghost 縮約が `canonicalId` を落とす設計判断の撤回になり、deploy エッジには書き戻し先の無い id を配ることになる。`path` の太線化と ghost group の opacity は直らない。
- **#1186 当時の「canonical id を持たないエッジは dim を起こさない」を維持する。** domain 的な意味を持たないエッジを除く意図だったが、id を持たないエッジには deploy view の全エッジが含まれていた。読者はそれを他のエッジと同じように追う。この判断は ADR になっておらず、AT-1186 と CSS コメントにだけ残っていたので、本 ADR で改訂した。

## 影響

- preview 上で hover に反応するエッジが増える。`.krs` の解釈は変わらない。
- エクスポートした SVG は hit-line の分だけ大きくなる（+0.65%）。見た目は同一。
- 実装時に確認したところ、multi-system root のエッジは今は canonical id を持つ。背景の表の `no-id-pass` 82 本は、affordance の問題としても addressability の問題としてもすでに解消している。
- 範囲外として残したもの:
  - VS Code webview（`packages/vscode/src/webview-content.ts`）は自前のインライン CSS を持ち、`.krs-edge` の hover 規則が無い。
  - app の all-layers は `srcDoc` の iframe で表示され、`preview.css` が届かない。SVG 構造の parity だけを柵で固定している。
- エッジの多い図でポインタを動かしたとき、hover 対象が増えて dim が明滅しないかは AT-2632 の手動項目 AT-G で確かめる。
