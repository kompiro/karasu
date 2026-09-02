---
type: product
---

# AT: 起点スコープに反するエッジはどのビューにも描画しない（#2501）

- **日付**: 2026-09-02
- **関連 Issue**: [#2501](https://github.com/kompiro/karasu/issues/2501)
- **Related TPLs**: [TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md)（parse を通った構造は描画されるか診断されるかのちょうど一方）
- **対象ファイル**:
  - `packages/core/src/view/view-extract.ts`（`isAnchoredAt` / `collectAnchoredPeerEdges` / `withChildAnchoredEdges`）
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Edge declaration — Edge origin scope）

> `service S1 { S2 -> S3 }` は起点スコープ規則が禁じる綴りで、parser は `edge-source-mismatch`（error）で弾く。それでも error recovery で AST に残った宣言を描画側が拾い、診断されているのに矢印も描かれていた。[AT-2223](service-anchored-edge-render.md) が開いた描画経路は**宣言元ブロックを起点とするエッジだけ**に限る — 判定は描画側 2 helper が共有する 1 つの述語で行う。

## 受け入れ条件

### AC-1: error で弾かれた宣言は描画されない

- [x] AT-A: `service S1 { S2 -> S3 }` がルートのシステムビューにも system ドリルダウンにも描画されない

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › does not render an edge whose source is not the declaring service (#2501)

- [x] AT-B: 同じ規則の 1 段下 — `domain C { A -> B }`（A / B は sibling domain）がサービスビューに描画されない。#2223 以前から残っていた側も閉じる

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › does not render an edge whose source is not the declaring domain (#2501)

### AC-2: 起点スコープ規則を持たないブロックは巻き込まない

- [x] AT-C: `client W { S1 -> S2 }` は描画されたままになる。`client` は parser が起点スコープを課さない kind で診断が出ないため、落とすと診断なしの silent drop になる

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › service-anchored edges (#2223) › still renders a foreign-sourced edge from a block with no origin-scope rule (#2501)

### AC-3: 描画側と診断側の「ちょうど一方」が parser の診断まで含めて成り立つ

- [x] AT-D: 配置表に「描画されるか報告されるかのちょうど一方」を課す判定が、resolver の warning だけでなく **parser の diagnostics** も数える。source mismatch の 2 配置は `reported`、`client` ブロックの配置は `renders` として表に載る

  > ✅ Automated — `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › an authored edge either renders or is reported (TPL-2075)

- [x] AT-E: 正準形の service-anchored edge（`service S1 { S1 -> S2 }`）は AT-2223 のまま描画される — ルート 3 形態すべてで layout 後に矢印が残る

  > ✅ Automated — `packages/core/src/view/anchored-edge-render-or-warn.test.ts` › the root canvas draws a service-anchored edge in every root shape

### AC-4: 既存の描画を壊さない

- [x] AT-F: intra-service / cross-service の domain エッジ、システムスコープのエッジ、cross-system ghost・ghost user の描画が変わらない

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
