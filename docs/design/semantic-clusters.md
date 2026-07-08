# system 内の semantic cluster 宣言と境界フレーム描画

- **日付**: 2026-06-30
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1822](https://github.com/kompiro/karasu/issues/1822)
  - 親 epic: [#1817](https://github.com/kompiro/karasu/issues/1817)（comprehension pillar — 横方向の密度制御）
  - 関連 TPL: [TPL-20260624-02](../test-perspectives/TPL-20260624-02-relayout-into-group-preserves-placement-and-edges.md)（要素を主構造から抜き出して別グループ＋境界フレームに再配置する際の不変条件）
  - 関連 concept: `docs/concepts.ja.md` 「ドメイン分散の検出」節（`#domain-dispersal-detection`）
  - コード: `packages/core/src/renderer/svg-renderer.ts`, `packages/core/src/renderer/layout.ts`, `packages/core/src/view/view-extract.ts`, `packages/core/src/fs/import-resolver.ts`

## 背景・課題

大きな `system` view は service / infra ノードが多く、横方向（breadth / density）で読みづらい。
comprehension pillar（#1817）が指摘するとおり、drill-down は**縦方向**（shallow ↔ deep）の壁しか解かない。
壁の本体は **ある階層における横の密度**で、特に大規模 system の **service 層**でノードが横並びになり、cross-boundary edge が絡まる。

ここで「1 つの system を複数のまとまりとして表現したい」という要求が出る。
最初の直感である「**source file 単位でグループ化**」は誤り — サンプルプロジェクトはファイルを *view 種別*（system / deploy / org）で分割するため、ファイル境界は意味的なまとまりではない（#1822）。

本当に欲しいのは、**system *内部* に semantic cluster を宣言**し、renderer がその周りに境界フレームを描くこと。
これにより cluster 内の関係が読みやすくなり、cluster を**またいで**通信するノードが特別なものとして際立つ。

## 現状（インベントリ）

| 観点 | 現状 | 位置 |
| --- | --- | --- |
| grouping 階層 | `system > service > domain > usecase/resource`。containment は parser が `parentId` を設定 | `parser.ts:890` |
| 複数 service を束ねる中間構文 | **存在しない**（これが #1822 の gap） | — |
| 境界フレーム描画 ① | `renderContainer()` — タイトル付きの `<rect>`（透明 fill / styled border / ghost 時 dashed `8 4` / rounded）。`ContainerRect` 駆動。system/service/domain drill container と deploy unit が使用 | `svg-renderer.ts:593-639`, type `layout-types.ts:80-94` |
| 境界フレーム描画 ②（最有力の再利用先） | `krs-cat-frame` — #1821 で導入。`clusterByXGap()` がカテゴリ（external / infra）のノードを連続 x クラスタに分割し、各クラスタを破線フレーム `<g class="krs-cat-group" data-category-group=...>` で囲む。hover で reveal | `svg-renderer.ts:472-590` |
| layout 入口 | `extractView()` → `ViewSlice` → `layout()` → `LayoutResult`（nodes / edges / containers / width / height） | `view-extract.ts:556`, `layout.ts:730` |
| node 型 | `LayoutNode`（`layout-types.ts:19-39`）。cluster 所属を持たせる先 | `layout-types.ts:19-39` |
| provenance | `resolveKrsFromMap` が全ファイルを 1 つの flat `KrsFile` に merge し file-of-origin を捨てる。AST ノードに origin フィールド自体が無い | `import-resolver.ts:212-222` |
| share 合成 | `synthesizeSharePayload` が node import を畳んで自己完結 `.krs` を作る（`nodeImports: []`）。origin はここでも残らない | `share/synthesize.ts:78-85` |

## 制約・前提

- **opt-in にする** — cluster 宣言が無い既存モデルの描画は一切変えない。
- **「file は単位ではない」を明示する** — file 境界を cluster と解釈しない（#1822 の核心）。
- **`.krs` / `.krs.style` 言語は v1.0 で凍結済み**（[ADR-20260616-06]）。文法の構造（containment 階層）に手を入れる変更は notation promotion gate（#1820）の「default: experimental」に逆行するため慎重に扱う。
- 描画は既存の境界フレーム機構（`renderContainer` / `krs-cat-frame`）を再利用し、新規描画経路を増やさない。
- cluster をまたぐ edge を特別描画するには、cluster 所属を **node → `LayoutNode` → renderer** まで通す必要がある（issue の言う「provenance threading」）。ここでの provenance は *file* ではなく ***cluster 所属***。
- **out of scope**: deploy / org view への cluster 適用、cluster の入れ子、cluster 単位の drill-down、cross-system cluster。本 Doc は system view の opt-in cluster と境界フレームに絞る。

## 検討した選択肢

核心の open question は「**grouping unit は何か**」。

### 案A: 既存の domain / service を再利用する

新しい構文を足さず、既存の `domain`（または `service`）grouping をそのまま cluster として扱う。

**メリット**

- 追加構文ゼロ。文法凍結に一切触れない。
- parser / model の変更不要。

**デメリット**

- `domain` は service の**内側**の grouping であり、「**複数 service を束ねる**」という要求（service 層の密度問題）に構造的に合わない。gap を埋めない。
- crowding が起きるのはまさに service 層であり、既存構文ではその上位のまとまりを表現できない。

### 案B: first-class な `subsystem` ブロックを新設する

`service` を入れ子にできる新しいトップレベル構文（`subsystem` / `boundedContext` 等）を導入する。

```krs
system ECPlatform {
  subsystem Payments {
    service Billing { ... }
    service Wallet { ... }
  }
  subsystem Catalog {
    service Inventory { ... }
  }
}
```

**メリット**

- 「複数 service を束ねる」を構造として正確に表現でき、container 階層に自然に乗る（`renderContainer` を素直に再利用できる）。
- model 上の一級概念になるので、将来 drill-down / 診断 / org 連携に展開しやすい。

**デメリット**

- v1.0 で凍結した containment 階層に新層を差し込む**破壊的な文法変更**。既存の `service` 直下配置との互換・移行が必要。
- notation promotion gate（#1820）の「default: keep experimental」に逆行。一級語彙の追加は karasu-nest corpus による evidence を経てからにすべき、という方針と衝突。
- 重い。issue が求める「lightweight / opt-in」と乖離。

### 案C: opt-in な renderer-level cluster アノテーション（推奨）

`service` に cluster id を与える **annotation**（`[external]` と同列のタグ拡張、例 `[cluster: payments]`）を導入する。
同じ cluster id を持つ service を renderer がまとめ、既存 `krs-cat-frame` 機構で境界フレームを描く。
containment 階層は変えない（service はあくまで system 直下のまま）。

```krs
system ECPlatform {
  service Billing   [cluster: payments] { ... }
  service Wallet    [cluster: payments] { ... }
  service Inventory [cluster: catalog]  { ... }
}
```

**メリット**

- issue 要件「opt-in / file は単位にしない / lightweight」に合致。アノテーションが無ければ描画は不変。
- 文法の**構造**（containment 階層）に手を入れない。タグの語彙追加に留まるため凍結リスクが最小で、#1820 gate を経て将来 first-class（案B）へ昇格する道を残せる（experimental として出す）。
- 描画は既存 `krs-cat-frame`（#1821）を再利用。`clusterByXGap` の「カテゴリ別フレーム」を「cluster id 別フレーム」へ一般化する延長で済む。
- cluster id がそのまま **cross-cluster edge 特別描画の provenance** になる。node に cluster id を載せ `LayoutNode` 経由で renderer に渡せば、両端点の cluster id が異なる edge を特別 class で描ける。

**デメリット**

- model 上は一級概念ではなく「タグ」なので、cluster 単位の診断・drill-down 等への展開は案B より遠回り（将来の昇格で吸収）。
- アノテーションが service に散らばるため、1 つの cluster の全貌をテキストで一覧しづらい（cluster ごとにまとめ宣言する糖衣は将来検討）。

## 比較

| 観点 | 案A 既存再利用 | 案B first-class subsystem | 案C cluster annotation |
| --- | --- | --- | --- |
| 要求（複数 service を束ねる）充足 | ✗ 構造的に不可 | ◎ | ○（描画レベルで充足） |
| 文法凍結リスク | なし | 高（containment 階層変更） | 低（タグ語彙のみ） |
| 変更量 | 小だが要求未達 | 大 | 中 |
| opt-in / file 非依存 | △ | ○ | ◎ |
| 既存描画の再利用 | — | `renderContainer` | `krs-cat-frame` |
| notation gate（#1820）整合 | — | 逆行 | 整合（experimental 出荷→evidence→昇格） |
| 将来の昇格余地 | — | 既に一級 | 案B へ昇格可能 |

## 現時点の方針

**案C（opt-in な cluster annotation）を採用する。**

理由:

- #1822 が明示する「opt-in / lightweight / file は単位にしない」を最も素直に満たす。
- v1.0 文法凍結（[ADR-20260616-06]）と notation promotion gate（#1820）に整合する。一級語彙化は karasu-nest corpus の evidence を得てから案B へ昇格すればよく、**experimental タグとして先に価値検証できる**。
- 既存の境界フレーム描画（`krs-cat-frame`, #1821）と cross-cluster edge styling の provenance を、最小の新規経路で供給できる。

> 案B（first-class subsystem）は中長期の到達点として保持する。本 Doc では案C を「今出す形」と位置づけ、案C 運用で得た corpus を #1820 gate の evidence として案B 昇格を判断する。

### 実装の指針

実装は本 Doc 合意後に別 issue（フォロー実装）で進める。骨子:

1. **構文**: `service` に `[cluster: <id>]` タグを許可する（experimental）。parser のタグ解釈に cluster id を追加し、`ServiceNode` に `cluster?: string` を持たせる。`docs/spec/tags-annotations.md` に experimental として追記。
2. **provenance threading**: `extractView` → `layout` で `ServiceNode.cluster` を `LayoutNode`（`layout-types.ts:19-39`）まで運ぶ。`import-resolver` の merge は file-of-origin を落とすが、cluster id は **node 自身のタグ**なので merge を跨いでも保持される（file provenance の復活は不要）。
3. **境界フレーム描画**: `krs-cat-frame`（`svg-renderer.ts:472-590`）の「カテゴリ別フレーム」を「cluster id 別フレーム」に一般化。同 cluster の service を 1 フレームで囲み、フレームにラベル（cluster id）を付す。`clusterByXGap` の連続性前提を cluster id grouping に置き換える。
4. **cross-cluster edge の特別描画**: 両端点の `LayoutNode.cluster` が異なる edge に特別 class（例 `krs-cross-cluster`）を付与し、style で際立たせる。
5. **TPL 遵守**: フレーム描画とノード再配置は [TPL-20260624-02] の不変条件（全 service ちょうど一度配置 / cross-cluster edge の端点保持 / 退化ケース）に従ってテストする。本 Doc の「関連」に back-ref 済み。spec（tags-annotations.md）へ experimental セクションを足すため、`docs/process.md`「spec / concepts 改訂時の proactive TPL 同梱」に従い、cluster タグ規定を裏付ける proactive TPL を実装 PR で起こす（または既存 TPL-20260624-02 に back-ref で紐付ける）。
6. **AT**: `docs/acceptance/` に新規ファイル。TC 観点:
   - cluster タグ付き service が同一フレームに収まる（opt-in；タグ無しは描画不変）。
   - cross-cluster edge が特別描画される。
   - 同 cluster service が x 軸で離れていても 1 フレームにまとまる（連続性に依存しない）。
   - 退化ケース（cluster が 1 service / 全 service が同一 cluster / cluster 未使用）。
7. **ADR 昇格**: 実装完了後、本 Doc を `docs/adr/YYYYMMDD-NN-semantic-clusters.md` に昇格し、同 PR で本 Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（opt-in。cluster タグが無いモデルの描画は不変）。
- ドキュメント更新: `docs/spec/tags-annotations.md`（experimental cluster タグ）、必要に応じて `docs/concepts.ja.md`（cluster ≒ bounded context と「ドメイン分散の検出」の関係を補足）。
- テスト・examples への影響: なし（既存 examples は cluster タグを使わない）。新規 example はフォロー実装 PR で追加検討。

## 未解決の問い / 決めないこと

- **cluster のまとめ宣言（糖衣）** — service 側にタグを散らす代わりに `cluster payments { service ... }` のようなブロックを許すか。案B（first-class）寄りになるため、本 Doc では決めず案C 運用後に再評価。
- **cluster と `domain` / 「ドメイン分散の検出」の関係** — cluster ≒ bounded context として、ドメイン分散の info 診断と連動させるか（cluster をまたぐ domain の検出など）は将来検討。
- **deploy / org view への展開** — 本 Doc は system view に限定。物理・組織面での cluster は別途。
- **#1820 promotion gate の発火条件** — 案C（experimental）→ 案B（first-class）昇格をどの corpus 量・どの signal で判断するかは gate 側の議論に委ねる。
