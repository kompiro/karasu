---
type: product
---

# AT: deploy コンテナの id は 2 つのコンテナに跨らない（#2714）

- **日付**: 2026-09-11
- **関連 Issue**: [#2714](https://github.com/kompiro/karasu/issues/2714)
- **Related TPLs**: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（識別に要る次元をキーに含める。本 Issue は「次元は揃っていたが畳み方が非可逆だった」側の consumer）
- **対象ファイル**:
  - `packages/core/src/view/deploy-view-extract.ts`（`extractDeployView` の `containerIdOf`）
  - `packages/core/src/parser/node-path.ts`（`nodePathRefId`）
  - `packages/core/src/formatter/quote-id.ts`（`quotedIdLiteral`）
  - `packages/core/src/compile/compile.ts`（`serviceIdsWithDeploy`）
  - `packages/core/src/exporter/drawio/build-drawio-project.ts`（deploy ページの metadata）

> deploy コンテナのグルーピングは injective な `nodePathIdentityKey` で行う一方、コンテナの id は `nodePathKey`（素の `join(".")`）で出していた。ドットを含む quoted id（`service "Shop.Api"`）は修飾パス `Shop.Api` と同じ文字列に畳まれるため、2 つのコンテナが 1 つの id を名乗る。id はコンテナの identity そのもの（`containerCenterX` / `containerById` / SVG の `data-container-id` / diff のコンテナキー）なので、後から置かれた方が前を上書きし、ghost edge は宛先と違う矩形に着いていた。畳み方を injective にする — セパレータ `.`（および quoted 形を構成する `"` / `\`）を含むセグメントを `.krs` の文字列リテラルとして書く。

## 受け入れ条件

### AC-1: path を id テキストへ畳む操作が injective

- [x] AT-A: セパレータを含まないセグメントは素の join と同じ出力で、`.krs` の bare 形が使えない id（kebab、予約語）も quote しない

  > ✅ Automated — `packages/core/src/parser/node-path.test.ts` › nodePathRefId (#2714) › joins segments that carry no separator exactly as a plain join does

- [x] AT-B: セパレータを含むセグメントは、単独でもパスの中でも quote される

  > ✅ Automated — `packages/core/src/parser/node-path.test.ts` › nodePathRefId (#2714) › quotes a segment that carries the separator, on its own and inside a path

- [x] AT-C: quoted 形を構成する文字（`"` / `\`）は escape され、空セグメント（`service ""` は parse する）も quote されて join から消えない

  > ✅ Automated — `packages/core/src/parser/node-path.test.ts` › nodePathRefId (#2714) › escapes the characters the quoted form is built from ／ … › quotes the empty segment, which would otherwise vanish from the join

- [x] AT-D: 素の join が畳んでしまう 2 つの path が別の文字列になり、alias しうる形を並べても全て相異なる

  > ✅ Automated — `packages/core/src/parser/node-path.test.ts` › nodePathRefId (#2714) › tells apart the paths a plain join collapses ／ … › keeps distinct paths distinct across the shapes that could alias

### AC-2: ドット入り id と修飾パスは別のコンテナ id を持つ

- [x] AT-E: Issue のモデル（`Shop.Api` / `Admin.Api` / `"Shop.Api"` + `Worker`）で 4 つのコンテナが相異なる id を持ち、各コンテナが自分の unit を持つ

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › a dotted id cannot claim a qualified container's id (#2714) › gives the qualified path and the dotted id two different container ids

- [x] AT-F: 修飾していないモデルのコンテナ id はこれまでどおり bare id のまま（#2549 の「修飾していないモデルは id を 1 つも変えない」を維持）

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › qualified realizes narrows the container (#2549, PR #2579 review) › leaves an unqualified model's container ids exactly as they were

- [x] AT-G: ドットを含む id は、他に衝突相手がいなくても quote される（規則は無条件 — id が他のコンテナの有無で変わらない）

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › a dotted id cannot claim a qualified container's id (#2714) › quotes a dotted id even when no other container claims it

### AC-3: ghost edge は宛先のコンテナに着く

- [x] AT-H: `Shop.Api` 宛の ghost edge が名指すコンテナは 1 つで、それは `realizes Shop.Api` の unit を持つ方

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › a dotted id cannot claim a qualified container's id (#2714) › routes the ghost edge to the container the qualified path built

- [x] AT-I: レイアウトで 4 つのコンテナ矩形が id を共有せず置かれ、ghost edge の始点が該当 unit を含む矩形の中心にある

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › a dotted id and a qualified path get their own rect (#2714) › places four containers, no two sharing an id ／ … › starts the ghost edge at the rect holding the unit its endpoint realizes

### AC-4: SVG の要素 identity が重複しない

- [x] AT-J: 2 つのコンテナが別々の `data-container-id` を持ち、quote 文字は XML escape された形で属性に載る（app の click delegation が両者を区別できる）

  > ✅ Automated — `packages/core/src/renderer/deploy-renderer.test.ts` › container ids in the SVG (#2714) › emits one element per container when a dotted id meets a qualified path

### AC-5: コンテナの identity と、ノード自身の id で突き合わせる経路を分ける

コンテナ id は identity なので、修飾（#2549）や quote（#2714）でノード自身の id 空間に無い綴りになりうる。ノードと突き合わせる consumer は id ではなく、コンテナが realize したノードの id（`DeployContainer.nodeId`）を見る。

- [x] AT-K: ドットを含む id のノードに deploy ジャンプボタン（`data-deploy-button`）が点く。通常の id でも点き、bare id を 2 つのコンテナが共有するときは（#2549 の決定どおり）どちらにも点かない

  > ✅ Automated — `packages/core/src/compile/deploy-affordance-node-id.test.ts` › deploy affordance matches the node, not the container id (#2714) › lights the button for a node whose own id contains a dot ／ … › still lights the button for an ordinary id ／ … › lights neither node when two containers share the bare id (#2549)

- [x] AT-L: draw.io の deploy ページで、ドットを含む id のコンテナがタグとアノテーションを保つ

  > ✅ Automated — `packages/core/src/exporter/drawio/build-drawio-project.test.ts` › buildDrawio — deploy container metadata (#2714) › keeps the annotations and tags of a node whose own id contains a dot ／ … › keeps them for an ordinary id too

## 手動確認

N/A — 自動テストですべて覆っている。判定はコンテナ id の集合・矩形の座標・SVG 属性で、いずれも実機を要しない。

## 参考: 対象のモデル

```krs
system Shop {
  service Api {}
  service Worker {}
  Api -> Worker "queues"
}

system Admin {
  service Api {}
}

system Weird {
  service "Shop.Api" {}
}

deploy prod {
  oci a { realizes Shop.Api }
  oci b { realizes Admin.Api }
  oci c { realizes "Shop.Api" }
  oci w { realizes Worker }
}
```
