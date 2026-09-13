---
id: ADR-2714
title: deploy コンテナの id を injective に畳み、ノードとの突き合わせは別の id で行う
status: accepted
date: 2026-09-13
topic: renderer
related_to:
  - ADR-2547
  - ADR-2552
  - ADR-2036
  - ADR-2088
  - ADR-927
  - ADR-1566
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/node-path.ts :: nodePathRefId"
  - "symbol: packages/core/src/formatter/quote-id.ts :: quotedIdLiteral"
  - "symbol: packages/core/src/view/deploy-view-extract.ts :: candidatesByBareId"
  - "grep: packages/core/src/view/deploy-view-extract.ts :: nodeId\\?: string"
  - "grep: packages/core/src/compile/compile.ts :: c\\.nodeId"
  - "symbol: packages/core/src/exporter/drawio/build-drawio-project.ts :: collectLogicalMetaByPath"
  - "file: docs/acceptance/2714-deploy-container-id-injective.md"
  - "file: docs/test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md"
---

# ADR-2714: deploy コンテナの id を injective に畳み、ノードとの突き合わせは別の id で行う

- **日付**: 2026-09-13
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2714](https://github.com/kompiro/karasu/issues/2714)（PR #2711 のコードレビューで発見）
  - PR: [#2796](https://github.com/kompiro/karasu/pull/2796)（実装。Design Doc は作らず、本 ADR に判断を記録する）
  - 後続 Issue: [#2817](https://github.com/kompiro/karasu/issues/2817)（別原因の ghost edge 脱落）, [#2818](https://github.com/kompiro/karasu/issues/2818)（cross-nav のハイライト）, [#2819](https://github.com/kompiro/karasu/issues/2819)（同型の区切り join が identity に使われている他の箇所）
  - 関連 ADR: [ADR-2547](2547-shared-node-path-machinery.md)（`nodePathKey` を含む node path の共有機構）, [ADR-2552](2552-duplicate-realizes-target.md)（同じ `extractDeployView` の membership 冪等化）, [ADR-2036](2036-scoped-boundary-declaration.md)（identity を担うキーを injective にした前例）, [ADR-2088](2088-node-reference-path-notation.md)（path 記法プログラム。修飾コンテナ id は slice C の #2549 で入った）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)（本 Issue で「エンコードの injectivity」を追記）

## 背景

`extractDeployView` はコンテナを 2 つの別々のキーで扱っていた。

| 用途 | キー | injective か |
| --- | --- | --- |
| グルーピング | `nodePathIdentityKey`（JSON） | はい |
| 出す id（`serviceId`） | 衝突時は `nodePathKey`（素の `join(".")`）、それ以外は bare id | いいえ |

quoted id が自分自身にドットを含むと、出す id が修飾パスと同じ文字列になる。

```krs
system Shop { service Api {} }
system Admin { service Api {} }
system Weird { service "Shop.Api" {} }
deploy prod {
  oci a { realizes Shop.Api }
  oci b { realizes Admin.Api }
  oci c { realizes "Shop.Api" }
}
```

main での実測は `[["Shop.Api", ["a"]], ["Admin.Api", ["b"]], ["Shop.Api", ["c"]]]` で、2 つのコンテナが `Shop.Api` を名乗った。コンテナ id はそのコンテナの identity そのもので、`containerById`・`containerCenterX`・SVG の `data-container-id`・diff のコンテナキーがこれを引く。後から置かれた方が前を上書きし、`Shop.Api` 宛ての ghost edge は別の矩形に着いた。

### 症状の読み替え

Issue は「permalink の anchor 一意性が壊れる」と書いているが、deploy ビューは `krs-deploy-root` の単一レベルしか出さず、コンテナごとの `#krs-…` anchor は存在しない。壊れていたのは SVG 要素の identity（`data-container-id` の重複）とレイアウトの last-write-wins であり、anchor ではない。

### id が 2 つの役割を兼ねていた

コンテナ id は identity であると同時に、system ビューの deploy ジャンプボタン（`serviceIdsWithDeploy`）と draw.io のメタデータ参照が **ノード自身の bare id** と突き合わせるキーでもあった。id の綴りを injective にすると、この突き合わせが dotted id で外れる。実装初版のレビューで両者の衝突が見つかり、判断を 2 つに分けることになった。

## 決定

コンテナの **identity** と、**ノードとの突き合わせ** を別の値で持つ。

1. **identity**: コンテナ id は bare と修飾のどちらの形も `nodePathRefId` で出す。セグメントが区切りの `.`、引用符付きの形を構成する `"` / `\`、または空文字列のときだけ、`.krs` の文字列リテラル形（`quotedIdLiteral`）にする。規則は無条件で、他のコンテナの有無によらない。
2. **突き合わせ**: `DeployContainer.nodeId` にノード自身の bare id を持たせ、ノードと突き合わせる消費側（`serviceIdsWithDeploy`、draw.io）はこれを引く。`nodeId` は bare id がこのコンテナのノードだけを指すときに限り設定し、次のどちらかなら設定しない。
   - 別のコンテナが同じ bare id を名乗る（#2549 が修飾した場合）
   - 参照が同名ノードの 1 つに絞り込んでいる（`realizes Shop.Api` と別に `Admin.Api` が存在する）。相手が未デプロイでも同じ

   bare 参照が同名ノード全部に解決する broadcast（ADR-927 / ADR-1566）は `nodeId` を保つ。コンテナが実際に全部を realize しているため。
3. **draw.io**: deploy ページのメタデータはノードの full path を同じ `nodePathRefId` で畳んだキーでも集める。修飾コンテナの id はそのキーと一致するので、alias なしで自分のノードを引ける。

## 理由

- **無条件に引用符で囲む規則だけが、反復なしに injective になる。** 引用符付きの形は区切りを取り戻すので、分解の仕方が 1 通りに決まる。衝突の有無で囲むかどうかを切り替える案は、囲んだ後の形がさらに別の id と衝突しうるため、不動点を取るまで確定しない
- **引用符で囲むのは join を曖昧にするセグメントだけにする。** ドットを含まない id はすべて以前と同じ綴りで出るので、dotted id を持たないモデルでは id が 1 つも変わらない
- **identity と突き合わせを分ければ、id の綴りを変えても突き合わせは失われない。** 突き合わせ側が identity を読むかぎり、injective にするたびに消費側が 1 つずつ外れる。`nodeId` を分けたことで、dotted id のノードは D ボタンと draw.io のタグを保つ
- **`nodeId` の条件はコンテナ数でなくノードの一意性で決める。** #2549 は「bare id では 2 つを区別できないので、両方点けるのは誤り」と判断した。その理由はコンテナ数ではなく、bare id が届くノード数についての話である。コンテナ数で判定すると、絞り込んだ参照が未デプロイの同名ノードにもボタンを点ける（main でも同じ挙動だった）
- **draw.io の bare id キーの map は既に衝突している。** `collectLogicalMeta` は同名ノードを後勝ちで 1 エントリにするので、そこへ alias しても別ノードのタグを渡すだけになる。path キーならコンテナ id と同じエンコードでそのまま引ける

## 却下した案

- **衝突が観測されたときだけ引用符で囲む**: 衝突しないモデルでは dotted id も含めて id が一切変わらない利点がある。しかし囲んだ後の形（`"Shop.Api"`）がさらに別ノードの id と一致しうるので、injective にするには再判定を繰り返す必要がある。id がモデル内容に 2 つ目の経路で依存することにもなる
- **formatter の `quoteId` をそのまま使う**: `quoteId` は「`.krs` の token として bare で書けるか」を判定するので、kebab id や予約語まで引用符で囲む。曖昧でなかったコンテナ id を大量に改名することになる。結果は再 parse する `.krs` 参照ではなく、区切りが曖昧でない id であればよい
- **JSON（`nodePathIdentityKey`）を id にする**: 常に injective だが、`data-container-id` がすべての場合で JSON になり、bare id との一致が全モデルで失われる
- **ドットを含む id を parser で拒否する**: 受理済みの構文を後から壊す。Issue の時点で除外していた
- **`nodeId` を「他のコンテナが同じ bare id を名乗らないとき」に設定する**（実装初版）: 絞り込んだ参照を見落とし、未デプロイの同名ノードにボタンを点ける。PR #2796 の CodeRabbit レビューで判明した
- **draw.io で bare id キーの map に alias する**: 上記のとおり、同名ノードは bare map の時点で衝突している

## 影響範囲

- dotted id を持たないモデル: コンテナ id は変わらない
- ノード id がドットを含むモデル: コンテナ id に引用符が付く（`"www.example.com"`）。D ボタン、詳細パネルの `hasDeployContainer`、draw.io のタグ／アノテーションは `nodeId` 経由で保たれる
- 絞り込んだ参照（`realizes Shop.Api` と未デプロイの `Admin.Api`）: 以前は両方のノードに点いていた D ボタンが、どちらにも点かなくなる
- 同名 service が 2 つあり id が修飾されるモデル: draw.io の各コンテナセルが自分のノードのタグを持つようになる（以前は後勝ちで混ざっていた）

## 残課題

- cross-nav のハイライトは、`PreviewPane` が 1 つの文字列を `data-node-id` と `data-container-id` の両方に当てるため、修飾された id や引用符付きの id では一致しない。#2549 の修飾 id と同じ穴で、SVG 属性の契約変更を伴うので #2818 に分けた
- `nodePathKey` の docstring は、`ownerIndex` を dotted join でキーにする理由を「JSON にすると dotted id を持つ既存消費側が壊れる」としている。`nodePathRefId` はドットを含まない path に対して素の join と同じ文字列を出すので、その前提はもう成り立たない。ただし本 ADR はその判断を覆さず、#2819 で扱う
- 同じ `extractDeployView` にある infra 依存 edge の脱落は区切り join ではなく system 文脈の欠落が原因なので、#2817 に分けた
