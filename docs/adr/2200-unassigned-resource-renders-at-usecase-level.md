---
id: ADR-2200
title: "未割当 `resource` の描画先は usecase ドリルダウンビューであり、domain ビューへの昇格は解決の対価とする"
status: accepted
date: 2026-08-12
topic: renderer
refines:
  - ADR-316
related_to:
  - ADR-351
  - ADR-1870
  - ADR-2184
scope:
  packages:
    - core
assumptions:
  - "grep: packages/core/src/view/view-extract.ts :: if \\(!resNode.ref && resolver.resolve\\(resNode\\).entityId === undefined\\) continue;"
  - "symbol: packages/core/src/view/view-extract.ts :: deriveUsecaseResourceNodes"
  - "symbol: packages/core/src/resolver/warnings.ts :: detectUnassignedResources"
---

# ADR-2200: 未割当 `resource` の描画先は usecase ドリルダウンビューであり、domain ビューへの昇格は解決の対価とする

- **日付**: 2026-08-12
- **ステータス**: 決定済み
- **関連**:
  - Issue #2200
  - [ADR-316](./316-database-as-first-class-node.md)（本 ADR が精緻化する対象）
  - [ADR-1870](./1870-domain-entity-modeling.md)（bare id → `entity` 解決）
  - [ADR-2184](./2184-unassigned-domain-placement-parity.md)（診断と framing は別の関心事）
  - [TPL-2200](../test-perspectives/TPL-2200-render-claim-names-its-view-level.md)

## 背景

ADR-316 はボトムアップ設計への配慮として「`database` 未宣言のまま `resource C` と書いた場合は警告のみ（エラーにしない、孤立ノードとして描画）」と決めた。この一文は **どの view で描画されるかを書いていない**。

`docs/spec/syntax.md` と 2 本の guide（および ja 版、計 6 ファイル）はこの省略ごと文言を引き継ぎ、「rendered as an orphan node」とだけ書いていた。#2200 の報告者は domain ビューでノードが出ないことを確認し、spec/impl 不一致として起票した。さらに issue のコメントでは「そもそも描画されない」と結論され、spec 側から当該句を削除する案が有力とされた。

実測すると、どちらの読みも誤りだった。#2200 の再現モデルを parse → `extractView` に通し、全 5 階層の path で抽出結果を取ると:

| view path | 描画されるノード |
|---|---|
| `[]` / `[Demo]`（system） | `MainDB`(database), `Api`(service) |
| `[Demo, Api]`（service） | `Core`(domain) |
| `[Demo, Api, Core]`（domain） | `Handle`(usecase), `MainDB.Orders`(resource) |
| `[Demo, Api, Core, Handle]`（usecase） | `MainDB.Orders`, `PaymentApi`, `LooseTable`（いずれも resource） |

未割当 `resource` は **描画されている**。ただし 1 階層深い、自身が属する usecase のドリルダウンビューでである。domain ビューで落ちるのは `deriveUsecaseResourceNodes` の昇格ゲート（解決済みのものだけを usecase の兄弟に昇格させる）であり、usecase ビューでは resource は container 自身の子なのでゲートを通らない。CRUD マトリクスにも列を持つ。

したがって「描画されない」と spec に書き直す案は、**新しい spec/impl 不一致を作る**ことになる。

## 決定

未割当 `resource`（ドット記法参照を持たず、一意な `entity` にも解決せず、`[external]` でもないもの）の描画契約を次のとおり確定し、ADR-316 の「孤立ノードとして描画」を view level まで特定した形に精緻化する:

1. `unassigned-resource` 警告を出す（resolver。ADR-1870 のゼロ編集昇格の対象）
2. **自身が属する usecase のドリルダウンビューには描画する**
3. **domain ビューの兄弟ノードには昇格させない**。昇格は参照が解決されて初めて得られる対価である

実装は既にこのとおりであり、変更するのは spec / guide / AT の文言と、片側しか固定していなかったテストである。

## 理由

- **ボトムアップなスケッチは実際に機能している。** ADR-316 がこの一文を置いた目的（書きながら resource を発見する）は満たされている。視覚的フィードバックは失われておらず、解決済み resource より 1 階層深いところに出るだけである。この事実を知らずに spec から句を削ると、動いている機能の記述を失う
- **昇格は解決の対価という一貫した意味づけになる。** ドット記法参照または `entity` 解決が「domain ビューで usecase の隣に並ぶ」という報酬を買う。未解決のものが同じ場所に出ると、この差が図から読み取れなくなる
- **診断と framing は別の関心事（ADR-2184）。** 未割当であるという事実は警告が伝える。ADR-2184 は未割当 domain について、描画までパリティを取る案 B を「`(Unassigned)` は描画先の無い orphan に枠を与える機構であり、描画先があるノードに適用するのは設計意図から外れる」として却下した。未割当 `resource` にも描画先（自身の usecase）は既にある
- **ADR-316 自身が案 A で自動昇格を却下している。** 「書けばすべて System 図に出る」方式は制御不能になるという理由で、usecase 内 resource の上位ビューへの自動昇格は当初から退けられていた
- **TPL-2075（silent drop を作らない）は充足している。** 同 TPL は「どこか 1 つでも描画先があるか」を見る観点で、単一 view の出す/出さないには明示的に発火しない。本件は描画先も診断もある

## 却下した案

### 案 A: domain ビューにも描画する（Issue #2200 の選択肢 1）

spec の字面（view level を書いていない「描画される」）に実装を寄せる案。却下理由は上の「理由」節の 2〜4 点そのままで、とくに ADR-2184 が同型の主張を既に却下している。加えて `packages/e2e/tests/at-0049-resource-nodes-usecase-diagram.spec.ts` が現行契約を意図的な決定として固定しており、これを反転させる変更になる。ボトムアップなスケッチのために必要でもない（既にフィードバックはある）。

### 案 B: spec から当該句を削除し「描画されない」と書く（Issue #2200 の選択肢 2、コメントでの推奨）

「未割当 resource は描かれない」を spec に書く案。**事実として誤り**なので却下した。usecase ドリルダウンビューでは描かれ、CRUD マトリクスにも列を持つ。この案は不一致の向きを変えるだけで、次に usecase ビューを見た読者が同じ issue を起票する。

推奨に至った経緯自体が本件の教訓である: 否定側（domain ビューで出ない）だけをテストで固定していたため、`an unresolved bare resource keeps its shape but never reaches the canvas` というテスト名が誤った前提の運搬役になっていた。両側を対で固定する観点を [TPL-2200](../test-perspectives/TPL-2200-render-claim-names-its-view-level.md) として起こした。

### 案 C: ADR-316 を書き換える

`.claude/rules/adr.md` のとおり、既存 ADR は書き換えず新 ADR で扱う。ADR-316 の決定（`database` / `queue` / `storage` の first-class 化）は有効なままで、覆っていない。精緻化なので `supersedes` ではなく `refines` で結ぶ。
