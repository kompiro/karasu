---
type: product
---

# AT: deploy ブロック内で id が重複したユニットを報告し、空きセルを残さない（#2713）

- **日付**: 2026-09-06
- **関連 Issue**: [#2713](https://github.com/kompiro/karasu/issues/2713)（[#2552](https://github.com/kompiro/karasu/issues/2552) のレビューで発見）
- **Related TPLs**: [TPL-2552](../test-perspectives/TPL-2552-repeated-relation-is-idempotent-across-counting-and-keyed-consumers.md)（件数を数える消費側と id で畳む消費側を一致させる — 本 Issue は同観点の 2 例目）
- **対象ファイル**:
  - `packages/core/src/parser/parser.ts`（`collectDeployNodeIds`）
  - `packages/core/src/fs/import-resolver.ts`（`pushDeployNode` — wildcard / named 両経路の共通ガード）
  - `packages/core/src/renderer/deploy-layout.ts`（`placeGroupBlock` の `nodeKeyOf`）

> 同じ deploy ブロックに同じ id のユニットが 2 つあると、`placeGroupBlock` が件数でセルを確保する一方 `layoutNodes` が `${containerId}::${unitId}` で後勝ちに畳むため、#2552 で潰した空きセルが別の producer から再現していた。加えて `duplicate-node-in-deploy` は wildcard import の merge 経路からしか出ておらず、`docs/spec/diagnostics.md` が経路を限定せずに書いている約束を満たしていなかった。id の一意性は既に決まっている規則なので、残る 3 経路をその 1 経路に合わせる。

## 受け入れ条件

### AC-1: 単一ファイル内の id 重複が報告される

- [x] AT-A: 1 つの deploy ブロックに `oci app` を 2 つ書くと `duplicate-node-in-deploy`（error, `{nodeId, deployId}`）が 1 件出る

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › duplicate deploy unit id within one file (#2713) › reports a unit id declared twice in one deploy block

- [x] AT-B: 診断は最初の宣言ではなく重複した側（後から出てきたユニット）を指す

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › duplicate deploy unit id within one file (#2713) › anchors the diagnostic on the repeat, not the first declaration

- [x] AT-C: AST は書かれたまま 2 件を保つ。parse は記録であって、畳むのはレイアウトの仕事

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › duplicate deploy unit id within one file (#2713) › keeps both units in the AST — the file is recorded as written

- [x] AT-D: id が異なれば何も出ない

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › duplicate deploy unit id within one file (#2713) › says nothing when the ids differ

- [x] AT-E: 判定は 1 ブロック内に閉じる。別の deploy ブロックが同じ id を持つのは正常

  > ✅ Automated — `packages/core/src/parser/parser.test.ts` › duplicate deploy unit id within one file (#2713) › scopes the verdict to one block — the same id in two deploy blocks is fine

### AC-2: named import 経路が wildcard 経路と同じ規則で動く

- [x] AT-F: 2 つのファイルから同じ id を named import すると診断が出て、ユニットは 1 つになる（従来は無音で 2 件入っていた）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › deploy unit id uniqueness on the named-import path (#2713) › reports the same unit id named from two files, keeping one unit

- [x] AT-G: `import { app, app }` は同一オブジェクトの再掲なので 1 件に畳まれ、診断は出ない（自分自身との衝突を報告しない）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › deploy unit id uniqueness on the named-import path (#2713) › takes one unit from an id listed twice in one import, without a diagnostic

- [x] AT-H: named import がブロックを新規に開く場合も同じガードを通る（import 元のファイル自身が 2 回宣言していた場合）

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › deploy unit id uniqueness on the named-import path (#2713) › still reports the collision when the named import opens the block

- [x] AT-J: id が異なる named import はこれまでどおり両方入る

  > ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › deploy unit id uniqueness on the named-import path (#2713) › leaves distinct unit ids alone

### AC-3: 空きセルが残らない

- [x] AT-K: 同 id ペアを持つコンテナが、単一ユニットのモデルと同じ寸法（コンテナ高さ・全体高さ）で配置され、配置ノードは 1 つ

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › units sharing an id reserve no empty cell (#2713) › is laid out exactly like a single unit

- [x] AT-L: 同 id ペアのコンテナは、id が異なる 2 ユニットのコンテナより厳密に低い。描かないセルの分を払わない（修正前は両者が同じ高さだった）

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › units sharing an id reserve no empty cell (#2713) › does not pay for the cell it will not draw

- [x] AT-M: id が異なる 2 ユニットは従来どおり 2 セルを得る。冪等化が隣の正常系を巻き添えにしない

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › units sharing an id reserve no empty cell (#2713) › still gives two distinct ids two cells

## 手動確認

N/A — 自動テストですべて覆っている。判定は診断の有無とレイアウトの寸法で、どちらも実機を要しない。

## 参考: 対象のモデル

```krs invalid
system EC {
  service OrderService {}
}

deploy prod {
  oci app { realizes OrderService }
  oci app { realizes OrderService }
}
```
