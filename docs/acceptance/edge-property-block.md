---
type: product
---

# AT: エッジのプロパティブロック（#2543）

- **日付**: 2026-08-27
- **関連 Issue**: [#2543](https://github.com/kompiro/karasu/issues/2543)
- **設計 (ADR)**: [ADR-2209](../adr/2209-edge-property-block.md)
- **対象ファイル**:
  - `packages/core/src/parser/parser.ts`（`parseEdge` / `parseEdgeBlock`）
  - `packages/core/src/formatter/formatter.ts`（`renderEdge`）
  - `packages/core/src/renderer/edge-routing.ts`（`data-edge-description` / `data-edge-links`）
  - `packages/app/src/components/PreviewPane.tsx` / `EdgeDetailPanel.tsx`
  - `docs/spec/syntax.md` / `syntax.ja.md`（§ Edge declaration › Property block）

> エッジが持てるのは 1 本の label だけで、配送保証や runbook の置き場所が無かった。`A -> B "calls"` を canonical な shorthand として残したまま、`label` 以外を書きたいときだけ開く `{ … }` ブロックを足す。畳み込みの判定条件は 1 つ、**ブロックが `label` 以外を持つか**。

## 受け入れ条件

### AC-1: 両方の綴りが 1 つのエッジに落ちる

- [x] AT-A: shorthand `A -> B "calls"` と label のみのブロック `A -> B { label "calls" }` が同一の AST を生む

  > ✅ Automated — `packages/core/src/parser/edge-property-block.test.ts` › edge property block (#2543) › lands the shorthand and a label-only block on the same AST

- [x] AT-B: ブロックが `label` / `description` / `link`（URL + 任意ラベル、複数可）を読む。ブロックを書かないエッジでは `description` / `links` が `undefined` のまま（空配列で実体化しない）

  > ✅ Automated — `packages/core/src/parser/edge-property-block.test.ts` › reads description and link, which the shorthand cannot express ／ leaves description and links undefined — not empty — when no block is written

- [x] AT-C: tags と `#<id>` はブロックの外側に置いて共存する（`A --> B [important] #orderPlaced { … }`）

  > ✅ Automated — `packages/core/src/parser/edge-property-block.test.ts` › keeps tags and #<id> outside the block

- [x] AT-D: 位置引数とブロックの双方に label を書くと `duplicate-edge-label`（error）になり、片方が黙って勝たない

  > ✅ Automated — `packages/core/src/parser/edge-property-block.test.ts` › raises duplicate-edge-label when the label is written both ways

- [x] AT-E: `label` / `description` / `link` 以外のキーワードはブロック内で `unexpected-token-in-block`（`blockKind: "edge"`）になり、後続の宣言を巻き込まない

  > ✅ Automated — `packages/core/src/parser/edge-property-block.test.ts` › rejects any other keyword inside the block ／ parses on both sides of an edge block, so a bad block does not swallow the rest

- [x] AT-E2: ブロックが `facets` を受理する。繰り返した行は累積し、重複 id は畳まれる（ノードのプロパティと同一の綴り・同一のマージ規則）。本スライス（#2543）時点では未受理だったが、[#2544](https://github.com/kompiro/karasu/issues/2544) が spec の 2 文と併せて受理側へ動かした。受け入れ条件の本体は [AT: エッジの facets](edge-facets.md) にある

  > ✅ Automated — `packages/core/src/parser/edge-property-block.test.ts` › accepts facets on an edge ／ accumulates repeated facets lines and collapses duplicate ids ／ leaves facets undefined — not empty — when no block is written

### AC-2: `karasu fmt` が 1 つの canonical 形に畳む

- [x] AT-F: label しか持たないブロックは shorthand に畳まれ、`description` / `link` / `facets` を持つブロックはブロックのまま保たれる（`label` もブロック内へ移る）

  > ✅ Automated — `packages/core/src/formatter/edge-property-block-round-trip.test.ts` › folds a label-only block back to the shorthand ／ keeps the block once it carries a description ／ moves a positional label into the block when the block earns one ／ keeps a link-only block as a block ／ keeps a facets-only block as a block

- [x] AT-G: ブロックを含む `.krs` が round-trip し（`parse(format(x)) ≡ parse(x)`）、fmt が冪等である

  > ✅ Automated — `packages/core/src/formatter/edge-property-block-round-trip.test.ts` › round-trips and is idempotent for the block form ／ round-trips the shorthand unchanged ／ preserves the implicit-source shorthand inside a service block

- [x] AT-G2: ブロック内に書いたコメントが、次の兄弟エッジの leading comment に付け替えられない（エッジが複数行にまたがる最初のケース）

  > ✅ Automated — `packages/core/src/formatter/edge-property-block-round-trip.test.ts` › does not hand a comment inside the block to the next sibling

- [x] AT-H: author 指定の `#<id>` が両方の形で保存される（本 Issue 以前は `renderEdge` が無条件に削っていた）

  > ✅ Automated — `packages/core/src/formatter/edge-property-block-round-trip.test.ts` › preserves an author-supplied #<id> in both forms

### AC-3: 受理した `description` / `link` が可視の効果を持つ

- [x] AT-I: ブロックの payload が SVG の `data-edge-description` / `data-edge-links` に出る。ブロックを書かないエッジには両属性とも出ない

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › emits the edge property block's payload as data attributes (#2543)

- [x] AT-J: base 衝突で canonical id が消えたエッジでも、ブロックを持つなら hit area が出る。ただし右クリックを予告する `krs-edge--interactive`（`cursor: context-menu`）は付かない — そのエッジに対して方向メニューは開けないため

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › gives an edge with a property block a hit area even without a canonical id (#2543)

- [x] AT-J2: cross-service のエッジが ghost として描かれるビュー（そのビューでの唯一の描画）でも payload が残る

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › keeps the property block's payload on a ghost rendering of the edge (#2543)

- [x] AT-K: `description` を持つ通常エッジを左クリックすると `EdgeDetailPanel` が開き、label・散文・リンクが読める。許可されないスキームのリンクは href 化されない

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › opens EdgeDetailPanel for a regular edge carrying a description ／ lists an edge's links and drops a disallowed scheme

### AC-4: ブロックを書かないファイルの挙動が変わらない

- [x] AT-L: ブロックを持たないエッジの左クリックではパネルが開かない

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › leaves an edge with no block alone: no panel opens

- [x] AT-M0: 集約 domain edge（`"N domain edges"`）が構成エッジの `description` / `link` を継承しない。1:1 passthrough（構成エッジが 1 本）は authored label と同じ扱いで散文も保つ

  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `domain-to-domain edges` › `does not attribute a constituent's prose to the aggregate (#2543)` / `keeps the prose when a single cross-service domain edge passes through (#2543)`

- [x] AT-M: 集約 domain edge（`"N domain edges"`）の左クリック挙動が従来のまま

  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › opens EdgeDetailPanel when a [data-domain-edges] element is clicked ／ closes EdgeDetailPanel when the × button is clicked ／ closes EdgeDetailPanel when clicking outside any node

- [x] AT-N: 既存 examples の `.krs` がすべて従来どおり parse する（ブロック形を足した `edges.krs` を含む）

  > ✅ Automated — `packages/core/src/examples.test.ts` › `feature-samples: all files parse without errors` › `edges.krs`

- [x] AT-O: ブロック形を足した `edges.krs` が `examples.ts` の bundled content と byte 一致する

  > ✅ Automated — `packages/core/src/examples.test.ts` › `feature-samples: bundled examples.ts content matches examples/en/feature-samples/` › `registers index.krs plus every .krs / .krs.style file in the directory, and nothing else`

- [x] AT-P: spec / guide に埋めた `.krs` fence が現行文法で通り、`krs invalid` と印を付けた二重 label の例が今も error を出す（parser が受理し始めたら落ちる）

  > ✅ Automated — `scripts/lint/krs-fences.test.ts` › `analyzeKrsFencesIn` › `accepts a ```krs block the parser understands` / `accepts a fence marked invalid while it still fails to parse` / `reports a fence marked invalid that the parser started accepting`

## 手動確認

- [ ] M-1: <https://karasu.kompiro.dev/> の Reference で Edge Syntax を開くと、shorthand とプロパティブロックの両方が載っている
- [ ] M-2: 同サイトで `A --> B [async] #orderPlaced { label … description … link … }` を書き、キャンバスのエッジを左クリックするとパネルが開いて散文とリンクが読める。リンクを押すと別タブで開く
- [ ] M-3: 同じモデルを右クリックすると従来どおり方向メニュー（`EdgeContextMenu`）が開き、詳細パネルは開かない
