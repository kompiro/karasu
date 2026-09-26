# クロスナビゲーションのハイライトは、受け手のビューが持つノード id で突き合わせる

- **日付**: 2026-09-26
- **ステータス**: 検討中
- **Issue**: [#2818](https://github.com/kompiro/karasu/issues/2818)
- **PR**: （作成後に記入）
- **関連**:
  - 引き金 Issue: [#2818](https://github.com/kompiro/karasu/issues/2818)（[#2714](https://github.com/kompiro/karasu/issues/2714) の PR #2796 から意図的に切り出した残課題。同じ穴は [#2549](https://github.com/kompiro/karasu/issues/2549) の修飾 id 以来ある）
  - 関連 ADR: [ADR-2714](../adr/2714-deploy-container-id-injective.md)（コンテナの identity とノードとの突き合わせを別の id で持つ。本 doc はその決定を SVG と app まで延長する）、[ADR-422](../adr/422-atomic-highlight-on-cross-navigation.md)（ビュー切替とハイライトを 1 dispatch で行う）、[ADR-425](../adr/425-hash-highlight-restoration.md)（ハイライトを hash の `:<highlight>` に載せる）、[ADR-2088](../adr/2088-node-reference-path-notation.md)（slice C = #2549 で修飾コンテナ id が入った）
  - 関連 TPL: [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md)、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)、[TPL-2789](../test-perspectives/TPL-2789-injected-dom-state-follows-reinjection.md)（詳細は「Related TPLs」節）
  - コード:
    - `packages/app/src/components/PreviewPane.tsx`（click delegation とハイライト適用）
    - `packages/app/src/hooks/useCrossNavigation.ts`（`handleContainerClick` / `handleDeployButtonClick`）
    - `packages/core/src/view/deploy-view-extract.ts`（`DeployContainer.serviceId` / `nodeId`）
    - `packages/core/src/renderer/deploy-layout.ts`（`Group` → `ContainerRect`）
    - `packages/core/src/renderer/svg-renderer.ts`（コンテナ `<g data-container-id>` の出力、`data-deploy-button` の出力）

## 背景・課題

deploy ビューと system ビューのあいだのクロスナビゲーションは、移動先のビューで相手を
ハイライトする（ADR-422）。この突き合わせが、コンテナの id とノードの id が同じ綴りの
ときにしか成立しない。

`PreviewPane` は 1 つの文字列 `highlightedNodeId` を 2 つの id 空間に順に当てている。

```ts
svgRef.current.querySelector(`[data-node-id="${CSS.escape(highlightedNodeId)}"]`) ??
  svgRef.current.querySelector(`[data-container-id="${CSS.escape(highlightedNodeId)}"]`);
```

- **deploy → system**: コンテナのクリックは `data-container-id`（コンテナの identity）を
  そのままハイライト id として渡す。system ビューのノードは bare id を持つので、
  修飾された `Shop.Api` や引用符付きの `"www.example.com"` はどちらの query にも当たらない。
- **system → deploy**: D ボタンはノードの bare id を渡す。deploy ビューのコンテナは
  修飾 / 引用符付きの id を持つので、fallback の `data-container-id` も外れる。

`main`（8633b017）で core を通して測った結果:

| モデル                                                                                   | system の `data-node-id` | deploy の `data-container-id`                                 | `DeployContainer.nodeId`           |
| ---------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------- | ---------------------------------- |
| `system Weird { service "www.example.com" {} }` + `oci w { realizes "www.example.com" }` | `www.example.com`        | `&quot;www.example.com&quot;`（DOM では `"www.example.com"`） | `www.example.com`                  |
| `Shop.Api` / `Admin.Api` / `Worker` を 3 unit が realize                                 | `Api`, `Worker`          | `Shop.Api`, `Admin.Api`, `Worker`                             | `undefined`, `undefined`, `Worker` |
| `Shop.Api` だけ realize（`Admin.Api` は未デプロイ）                                      | `Api`                    | `Api`                                                         | `undefined`（絞り込み参照）        |

1 行目は両方向とも突き合わせが外れる。2 行目の `Worker` は成立し、`Api` の 2 つは
ADR-2714 の決定どおり `nodeId` を持たない（bare id `Api` が 2 ノードに届く）。
3 行目はコンテナ id と bare id が一致するので今は成立するが、それは偶然の一致であって
ADR-2714 が「突き合わせてはいけない」と決めた形でもある（未デプロイの `Admin.Api` に
点いてしまう。D ボタンは既に点けていない）。

## 現状（インベントリ）

### `highlightedNodeId` に値を入れる経路と、その id 空間

| 経路                                                                        | 渡す値                                | id 空間                                                       |
| --------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| D ボタン（system → deploy）`handleDeployButtonClick`                        | `data-deploy-button` の値             | ノードの bare id（ADR-2714 で `DeployContainer.nodeId` 由来） |
| コンテナのクリック（deploy → system）`handleContainerClick`                 | `data-container-id` の値              | **コンテナの identity**（bare / 修飾 / 引用符付き）           |
| チームボタン（system → org）`handleTeamButtonClick`                         | team id                               | org ノードの id                                               |
| owned service（org → system）`handleOwnedServiceClick`                      | service id                            | ノードの bare id（`orgNodePathIndex` で path も解決）         |
| アウトラインの選択                                                          | ノード id                             | ノードの bare id                                              |
| URL hash の `:<highlight>`（ADR-425）と share payload の `target.highlight` | 上のいずれかが state に入った値の往復 | 上に同じ                                                      |

コンテナのクリックだけが、ノードの id 空間にない値を入れうる。他はすべて「ノードの id」。

### SVG 属性

| ビュー | 要素           | 属性                 | 値                                                    |
| ------ | -------------- | -------------------- | ----------------------------------------------------- |
| system | ノード `<g>`   | `data-node-id`       | bare id                                               |
| system | D ボタン       | `data-deploy-button` | `DeployContainer.nodeId`（bare id）                   |
| deploy | コンテナ `<g>` | `data-container-id`  | `DeployContainer.serviceId`（identity）               |
| deploy | unit `<g>`     | `data-node-id`       | `<container id>::<unit id>`（例 `ECommerce::worker`） |

`DeployContainer.nodeId` は core で計算されているが、SVG には一切載っていない。
deploy の unit は `::` で修飾されているので、deploy ビューで `[data-node-id="<bare id>"]` を
引いても unit には当たらない。

### `data-node-id` の他の消費側

- `PreviewPane` の click delegation: `target.closest("[data-node-id]")` でノードのクリック、
  info / link ボタンの所属ノードを決める
- VS Code 拡張の webview: カーソル追従ハイライトが `[data-node-id]` だけを引く
  （コンテナのクロスナビゲーションは持たない）
- org ビュー: member カードは `data-node-id` だけを持ち、node lookup に fall through する
  （`PreviewColumn.tsx` のコメント）

つまり `data-node-id` は「クリックできるノード」の印として消費されていて、コンテナに
付けると意味が変わる。

### 複数 system のルートビュー

`system Shop { service Api {} }` と `system Admin { service Api {} }` を持つモデルの
ルート system ビューは、`data-node-id="Api"` を **1 つしか**描かない（診断
`node-id-multiple-locations` は出る）。`viewPath: ["Shop"]` / `["Admin"]` にドリルすると
それぞれの `Api` が描かれる。ルートで `Api` をハイライトしても、どちらの `Api` かは
決められない。この描画の潰れ自体は本 doc の対象外（「未解決の問い」参照）。

## 制約・前提

- **ADR-2714 の決定は動かさない。** コンテナ id は identity で、`nodePathRefId` で
  injective に畳む。ノードとの突き合わせは `DeployContainer.nodeId` で行い、`nodeId` は
  bare id がそのコンテナのノードだけを指すときに限って設定する。本 doc は「`nodeId` が
  SVG まで届いていない」穴を塞ぐだけで、`nodeId` を設定する条件は変えない
- **hash の `:<highlight>` は「id」である**（`docs/spec/permalink.md`: identity は author-given
  `id`）。修飾パス `Shop.Api` や引用符付きの `"www.example.com"` は author-given id ではない。
  hash に載る値はノードの id に揃えたい
- **`data-node-id` はコンテナに付けない。** 上記のとおり「クリックできるノード」の印として
  複数の消費側が読む。コンテナに付けると、それらの消費側が同時に意味を変える
- **静的 SVG（CLI の `render`）はハイライトを持たない。** 属性を 1 つ足しても見た目は
  変わらないが、出力のバイト列は変わる（changeset は patch）
- **クリックしたときにビューが切り替わること自体は保つ**（AT-0014 AC-2.1 の契約）。
  ハイライトできないコンテナでも、切替まで止めない
- 対象外: VS Code webview（コンテナのクロスナビゲーションを持たない）、draw.io export
  （ADR-2714 で `nodeId` 経由に済んでいる）、複数 system ルートで同名ノードが潰れる描画

## 検討した選択肢

### 案1: コンテナ要素に realize したノードの id を別属性で載せ、両方向ともノード id で突き合わせる

core の deploy レンダラが、`DeployContainer.nodeId` を持つコンテナの `<g>` に
`data-realized-node-id="<nodeId>"` を出す（`nodeId` が無いコンテナには出さない）。
app 側は次のように変える。

- deploy → system: コンテナのクリックは `data-realized-node-id` の値をハイライト id として
  渡す。属性が無ければハイライト無しで system に切り替える
- system → deploy: D ボタンが渡す bare id を、deploy ビューでは `data-realized-node-id`
  で引く
- `PreviewPane` のハイライト適用は `[data-node-id=X] ?? [data-realized-node-id=X]` に
  なり、`data-container-id` の fallback は消える

これで `highlightedNodeId` は**常にノードの id** になる。hash の `:<highlight>` も両ビューで
同じ id 空間を指す。

**メリット**

- ADR-2714 が core に引いた「identity と突き合わせは別の id」の線を、SVG と app まで
  そのまま延長する。突き合わせの判断（`nodeId` を出すか）は引き続き core の 1 箇所
- SVG が自己記述的なまま。`PreviewPane` は DOM だけを見て突き合わせでき、モデル側の
  対応表を持たない
- `handleContainerClick` が渡す値がノード id になるので、hash・share payload・アウトライン
  など既存の消費側と id 空間が揃う
- 修飾も引用符も持たないモデルでは、`data-realized-node-id` の値が `data-container-id` と
  同じ綴りになるので、hash も挙動も変わらない

**デメリット**

- SVG の属性契約が 1 つ増える（コンテナ `<g>` の属性が 2 つになる）
- `nodeId` を持たないコンテナ（#2549 で修飾された 2 つ、絞り込み参照）は、クリックしても
  ハイライトされない。ただしこれは D ボタンが点かないのと同じ判断（ADR-2714: 間違った
  相手に点けるより点けない）で、今の挙動（切り替わるが何も光らない）からの後退でもない

### 案2: app 側でコンテナ id ↔ ノード id の対応表を持つ

compile 結果にコンテナ一覧（`serviceId` と `nodeId`）を露出し、app が
`data-container-id` → `nodeId`、`nodeId` → `serviceId` を引いてから query する。

**メリット**

- SVG の属性契約を変えない

**デメリット**

- 同じ突き合わせの知識が core（`nodeId` の算出）と app（対応表）の 2 箇所に分かれる。
  `PreviewPane` が DOM だけで完結しなくなり、対応表の鮮度（SVG と同じ compile 結果か）を
  管理する必要が出る（TPL-2789 が指摘する「流し込んだ DOM と後から当てる状態のずれ」を
  もう 1 段増やす）
- compile 結果の公開型（`DeployCompileResult`）が増える。`deployTree` は raw AST で、
  コンテナはそこにいない

### 案3: コンテナ要素にも `data-node-id` を付ける

属性を増やさず、既存の `[data-node-id=X]` query だけで両方向が成立する。

**デメリット**

- 「現状（インベントリ）」の消費側がすべて意味を変える。`closest("[data-node-id]")` が
  コンテナを「ノード」として返し、VS Code の webview ではカーソル追従がコンテナを光らせ
  うる。ノードでないものにノードの印を付ける
- コンテナと unit がどちらも `data-node-id` を持つ入れ子になり、`closest` の結果が
  クリック位置で変わる

### 案4: コンテナ id をハイライト id として持ち続け、system 側でコンテナ id を引けるようにする

system ビューのノードに `data-container-id` 相当を付ける、または system 側で
コンテナ id → bare id に逆変換する。

**デメリット**

- 逆変換は system 側にコンテナの知識（どの id が修飾されたか）を要求する。ADR-2714 が
  「突き合わせ側が identity を読むかぎり、injective にするたびに消費側が 1 つずつ外れる」
  と書いた構造をそのまま残す
- hash に author-given でない綴り（`"www.example.com"`）が載り続ける

### 副決定 A: `nodeId` を持たないコンテナのクリックで何をするか

- **A-1: system に切り替えるだけで、ハイライトしない。** D ボタンが点かないノードと
  同じ扱い。今の挙動からの後退はない
- A-2: 所属 system にドリルダウンして bare id をハイライトする（`viewPath: ["Shop"]` +
  `Api`）。`realizes Shop.Api` のコンテナは path を知っているので原理的には可能。ただし
  (1) SVG にコンテナの path を載せる別の契約が要る、(2) system → deploy 側は D ボタンが
  点かないままなので方向で非対称になる、(3) ルートで同名ノードが潰れる描画が先にある。
  A-1 で穴を塞いだ上で、必要になったら別 Issue で扱う

### 副決定 B: 属性名

| 候補                    | 評価                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `data-realized-node-id` | `DeployContainer.nodeId` の docstring（"the realized node's own id"）と同じ語。コンテナが realize したノードの id であることが名前から読める |
| `data-node-ref`         | 短いが「ref」が `.krs` の参照記法（ADR-2088）と紛れる。値は解決済みの bare id であって参照の綴りではない                                     |
| `data-service-id`       | `serviceId` は identity の方の名前として既に使われていて、逆の意味になる。realize の対象は service に限らない（system 直下の子）             |

`data-realized-node-id` を採る。

## 比較

| 観点                              | 案1                         | 案2                    | 案3                               | 案4                               |
| --------------------------------- | --------------------------- | ---------------------- | --------------------------------- | --------------------------------- |
| 突き合わせの知識の置き場          | core 1 箇所（SVG に載せる） | core + app の対応表    | core 1 箇所                       | system 側にコンテナの知識が増える |
| SVG 属性契約                      | コンテナに 1 属性追加       | 変更なし               | 既存属性の意味が変わる            | system ノードに属性追加 or 逆変換 |
| `data-node-id` の他消費側への影響 | なし                        | なし                   | あり（click delegation、VS Code） | なし                              |
| hash の `:<highlight>`            | 常にノード id               | 常にノード id にできる | 常にノード id                     | コンテナ id が載る                |
| 変更量                            | core 小 + app 小            | core 型追加 + app 中   | core 極小 + app 極小              | 中                                |

## Related TPLs

- [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md):
  #2714 で「エンコードの injectivity」を追記した観点。本 doc は、その injective な id
  （identity）を、別の id 空間の lookup key に流用していた consumer を直す
- [TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md):
  「同じ実体を複数の id 形で持つ」構造の renderer 側。TPL-1666 の対処は「lookup が
  すべての形を試す」だが、本 doc は逆に「手渡す側が受け手の id 空間の値を渡す」で解く。
  形が 2 つ（bare / 修飾）で済む renderer と違い、コンテナ id は引用符・修飾・bare の
  どれにもなり、system 側からは逆変換できないため
- [TPL-2789](../test-perspectives/TPL-2789-injected-dom-state-follows-reinjection.md):
  `PreviewPane` のハイライト適用は流し込んだ DOM に後から当てる状態。query を変えても、
  `svg` 再流し込み時に当て直す構造（依存配列の `svg`）は保つ
- 実装 PR で起こす予定の retrospective TPL（3-Yes: ビューをまたぐ id の手渡しは org ↔ system、
  アウトライン、hash と横展開しうる / id 空間を増やすたびに構造的に再発する / 既存 TPL は
  「lookup が全形を試す」「キーに次元を含める」で、手渡す側の責務を書いたものは無い）:
  **ビューをまたいで id を手渡すときは、受け手のビューが要素に載せている id 空間の値を
  手渡す。1 つの文字列を複数の id 空間に順に当てて「どれかに当たる」ことに頼らない。**
  `discovered_from` は #2818 / #2549 / #2714

## 現時点の方針

**案1 + 副決定 A-1 + 属性名 `data-realized-node-id` を採用する。** ADR-2714 が core に
引いた「identity と突き合わせは別の id」の線を、SVG と app まで延長するのが最も変更が
小さく、`highlightedNodeId` が常にノードの id になるので hash・share payload・アウトライン
と id 空間が揃う。`nodeId` を持たないコンテナをハイライトしないのは D ボタンと同じ判断で、
今の挙動からの後退はない。

### 実装の指針

1. **core**: `deploy-layout.ts` の `Group` と `ContainerRect` に `nodeId?: string` を通し、
   `svg-renderer.ts` のコンテナ `<g>` に `"data-realized-node-id": container.nodeId` を足す
   （`undefined` なら `el()` が属性を落とす）。テスト: `deploy-renderer.test.ts` に
   parse → extract → render の fence（#2714 の `container ids in the SVG` と同じ形）で、
   引用符付き id のコンテナが `data-realized-node-id="www.example.com"` を持ち、修飾された
   2 コンテナは属性を持たず、素の id は両属性が同じ綴りになることを見る
2. **app / click delegation**: `PreviewPane` のコンテナ分岐で `data-realized-node-id` を
   読み、`onContainerClick(realizedNodeId | null)` を呼ぶ。synthetic container
   （`__unclassified__` / `__job_band__`）の除外は `data-container-id` のまま
3. **app / dispatch**: `useCrossNavigation.handleContainerClick` の引数名と型を
   `realizedNodeId: string | null` にし、`SET_ACTIVE_VIEW` の `highlightNodeId` に渡す
   （`null` なら切替のみ、ADR-422 の 1 dispatch は保つ）。`preview-context.tsx` /
   `active-view-data.ts` の `onContainerClick` 型も追随
4. **app / ハイライト適用**: `PreviewPane` の effect を
   `[data-node-id=X] ?? [data-realized-node-id=X]` にし、`data-container-id` の fallback を
   外す。`svg` を依存に持つ構造（#2789）は変えない
5. **テスト（app）**: `PreviewPane.test.tsx` にコンテナのクリックが realized id を渡す /
   属性が無ければ `null` を渡す / `data-realized-node-id` にハイライトが当たる、
   `useCrossNavigation.test.ts` に `null` で highlight 無しの切替、を足す
   <!-- absent-path-next-line: the E2E spec the implementation PR is told to create (#2818) -->
6. **E2E**: `packages/e2e/tests/at-2818-cross-navigation-id-space.spec.ts` を新設。
   引用符付き id（`service "www.example.com"`）で deploy → system と system → deploy の
   両方向がハイライトされ hash が `:www.example.com` を持つこと、修飾コンテナ
   （`Shop.Api` / `Admin.Api`）のクリックが system に切り替わりハイライトが 0 件で hash に
   `:` が付かないこと。AT-0014 の spec が使う top-left click と hash assertion を踏襲する
7. **AT**: `docs/acceptance/2818-cross-navigation-highlight-id-space.md`。AC は
   (1) SVG 属性、(2) 引用符付き id の両方向、(3) 素の id の非退行（AT-0014 / AT-0029 で
   自動化済みのものを参照）、(4) `nodeId` 無しコンテナの切替のみ。手動項目は
   `N/A`（判定はすべて DOM 属性と hash）
8. **TPL**: 上記の retrospective TPL を `docs/test-perspectives/TPL-2818-*.md` として起こし、
   TPL-1666 / TPL-1352 と `related_to` で結ぶ
9. **changeset**: `@karasu-tools/core` と `karasu` に patch（deploy コンテナの `<g>` に
   `data-realized-node-id` が加わる）
10. **ADR 昇格**: 実装完了後 `docs/adr/2818-cross-navigation-highlight-id-space.md` に昇格し、
    本 doc は同 PR で削除する。ADR-2714 の `related_to` に本 ADR を足す

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 修飾も引用符も持たないモデルでは、hash・ハイライト・クリックの
  挙動は変わらない（`data-realized-node-id` と `data-container-id` が同じ綴りになる）。
  引用符付き id のモデルでは、これまで光らなかった両方向のハイライトが光るようになり、
  deploy → system の hash が `:"www.example.com"` から `:www.example.com` に変わる
- CLI `karasu render` の deploy SVG に属性が 1 つ増える。見た目は変わらない
- ドキュメント更新: `docs/spec/` に SVG 属性の契約は無い（anchor だけが
  `docs/spec/permalink.md`）ので、契約は ADR と `deploy-renderer.test.ts` の fence で持つ。
  `docs/tools/app*.md` のクロスナビゲーション記述は挙動が変わらないので更新しない
- テスト・examples への影響: `docs/guide/diagrams/` に deploy SVG は無く再生成不要。
  `examples/` の drift ガードは `.krs` 側で、SVG のスナップショットは持たない

## 未解決の問い / 決めないこと

- **決めないこと**: 複数 system のルートビューで同名ノード（`Shop.Api` と `Admin.Api`）が
  `data-node-id="Api"` 1 つに潰れる描画。本 doc の突き合わせとは独立した core の問題で、
  A-2 を将来やるなら先に要る。既存 Issue が無ければ別途起票する
- **決めないこと**: A-2（`nodeId` 無しコンテナから所属 system へドリルダウンする）。
  上の描画の問題が解けてから、必要性と合わせて別 Issue で判断する
- レビューで確認したいこと: 属性名 `data-realized-node-id` でよいか。`DeployContainer.nodeId`
  の語に合わせたが、より短い名を優先するなら `data-node-ref` 以外の候補を挙げてほしい
