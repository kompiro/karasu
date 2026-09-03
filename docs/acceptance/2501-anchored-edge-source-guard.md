---
type: product
---

# AT: 起点スコープに反するエッジはどのビューにも描画しない（#2501）

- **日付**: 2026-09-02
- **関連 Issue**: [#2501](https://github.com/kompiro/karasu/issues/2501)
- **設計 (ADR)**: [ADR-2501](../adr/2501-errored-edge-declaration-renders-nowhere.md)
- **Related TPLs**: [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)（parse を通った構造は描画されるか診断されるかのちょうど一方）
- **対象ファイル**:
  - `packages/core/src/view/view-extract.ts`（`isAnchoredAt` / `isLiftableToPeerCanvas` / `collectAnchoredPeerEdges` / `extractEntityView`）
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Edge declaration — Edge origin scope）

> `service S1 { S2 -> S3 }` は起点スコープ規則が禁じる綴りで、parser は `edge-source-mismatch`（error）で弾く。それでも error recovery で AST に残った宣言を描画側が拾い、診断されているのに矢印も描かれていた。[AT-2223](service-anchored-edge-render.md) が開いた描画経路は**宣言元ブロックを起点とするエッジだけ**に限る。判定は `isAnchoredAt` 1 つに集約し、描画経路 3 か所（親の canvas・system スコープ機構・entity ビュー）が共有する。

## 受け入れ条件

### AC-1: error で弾かれた宣言は描画されない

- [x] AT-A: `service S1 { S2 -> S3 }` がルートのシステムビューにも system ドリルダウンにも描画されない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › does not render an edge whose source is not the declaring service (#2501)

- [x] AT-B: 同じ規則の 1 段下 — `domain C { A -> B }`（A / B は sibling domain）がサービスビューに描画されない。#2223 以前から残っていた側も閉じる

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › does not render an edge whose source is not the declaring domain (#2501)

### AC-2: entity ビューでも描画されない

- [x] AT-C: `entity A { B -> A }` が entity ビューに描画されない。`entity` では起点スコープ規則が関係の向き（起点 = 参照を持つ側）を担うため、置き場所ではなく向きの誤りになる

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › cross-domain ghost entities (#1911) › does not draw a relation whose source is not the declaring entity (#2501)

- [x] AT-C2: 限定子付きの `entity A { Z -> D2.C }` で ghost 側が `A -> D2.C` と書き直さない（author が書いていない起点を捏造しない）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › cross-domain ghost entities (#1911) › does not fabricate a source for a mismatched cross-domain relation (#2501)

### AC-3: 起点スコープ規則を持たないブロックは巻き込まない

- [x] AT-D: `client W { S1 -> S2 }` と `database D { S1 -> S2 }` は親の canvas に描画されたままになる。どちらも parser が起点スコープを課さない kind で診断が出ないため、落とすと診断なしの silent drop になる（`client` と infra ブロックは parser の別経路なので両方を見る）

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › still renders a foreign-sourced edge from a block with no origin-scope rule (#2501) ／ `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › an authored edge either renders or is reported (TPL-2075)

- [x] AT-D2: ただし system スコープ機構（`withChildAnchoredEdges`）はこの緩和を受けない — multi-system ルートで平行な二重矢印を描かず、client ブロックの限定子付きエッジから caller ghost を作らない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › does not lift a foreign-sourced block edge into the system-scope machinery (#2501)

### AC-4: 描画側と診断側の「ちょうど一方」が parser の診断まで含めて成り立つ

- [x] AT-E: 配置表に「描画されるか報告されるかのちょうど一方」を課す判定が、resolver の warning だけでなく **parser の diagnostics** も数える。表の走査は entity ビューも駆動するので、`entity` の配置も表に載る

  > ✅ Automated — `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › an authored edge either renders or is reported (TPL-2075)

- [x] AT-F: 正準形の service-anchored edge（`service S1 { S1 -> S2 }`）は AT-2223 のまま描画される — ルート 3 形態すべてで layout 後に矢印が残る

  > ✅ Automated — `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › the root canvas draws a service-anchored edge in every root shape

### AC-5: 既存の描画を壊さない

- [x] AT-G: intra-service / cross-service の domain エッジ、システムスコープのエッジ、cross-system ghost・ghost user の描画が変わらない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › domain-to-domain edges（既存スイート）／ `packages/core/src/examples.test.ts`

## 手動確認

- [ ] M-1: <https://karasu.kompiro.dev/> で下の `.krs` を開くと、`S2 -> S3` の矢印がシステムビューに描かれず、エディタの該当行に `edge-source-mismatch` の赤い波線が出る

  ```krs invalid
  system T {
    service S1 {
      S2 -> S3 "leaked"
      domain A { usecase u {} }
    }
    service S2 { domain B { usecase v {} } }
    service S3 { domain C { usecase w {} } }
  }
  ```

- [ ] M-2: 同じモデルの `S2 -> S3` を `service S2` のブロックへ移すとエラーが消え、矢印が描画される
