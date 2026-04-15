# 親サービスのアノテーションを子ノードの描画に継承する

- **日付**: 2026-04-13
- **ステータス**: ADR 化（[ADR-20260415-01](../adr/20260415-01-inherit-service-annotations.md)）
- **関連**:
  - Issue #517
  - ADR-20260411-02 (`docs/adr/20260411-02-deprecated-domain-migration-coexistence.md`) — `@deprecated` / `@migration_target` による重複ドメインID共存
  - `packages/core/src/resolver/style-resolver.ts`
  - `packages/core/src/renderer/layout.ts`
  - `examples/migration/system.krs`

## 背景・課題

サービスが `@deprecated` / `@migration_target` / `@experimental` などのライフサイクル系アノテーションを持つとき、そのサービス自身はビルトインスタイル（opacity 0.6、⚠バッジ 等）で正しく描画される。しかし、そのサービスを「ドリルダウン」して内部を表示したとき、子ドメインには何の視覚的マーキングも付かない。

`examples/migration/system.krs` を例にすると、

```krs
service LegacyMonolith @deprecated {
  domain Order {
    label "受注（旧）"
    ...
  }
}
```

`LegacyMonolith` のシステムレベルビューでは `@deprecated` の視覚処理が効いているのに、`LegacyMonolith` に入った内側のビューでは `Order` ドメインが通常の見た目になり、「旧側である」という情報が消失する。これは移行中アーキテクチャを読むユーザーにとって誤解を招くし、親レイヤーと子レイヤーで視覚的整合性が崩れる。

## 制約・前提

- 既存のアノテーション語彙（`@deprecated`、`@migration_target`、`@experimental` 等）をそのまま使いたい。新しい構文は追加しない。
- `nodeStyleKey(id, annotations)` による重複ドメインIDの共存（ADR-20260411-02）は壊さない。同 ID ドメインが異なるサービス配下で共存する migration コードはすでに存在する。
- 明示的な子アノテーションは最優先。親の継承はあくまでフォールバック。
- スタイル解決（`style-resolver.ts`）とレイアウト（`layout.ts`）は独立に動き、レンダラー (`svg-renderer.ts`) は `layoutNode.annotations` を使って `nodeStyleKey` を組み立ててスタイルマップから引く。つまり **保存側（resolver）と検索側（layout + renderer）で用いる annotations が一致していなければならない**。
- 対象はロジカル階層（system → service → domain → usecase → resource）。deploy / org 系は対象外。

## 検討した選択肢

### 案1: AST を事前変換して子ノードの `annotations` を書き換える

`parser` 後・`resolver` / `layout` 実行前に一度だけ走るパスを追加し、子ノードの `annotations` 配列を親から継承したものに差し替える（または新しい `effectiveAnnotations` フィールドに書き込む）。

- **メリット**:
  - 継承ロジックが1箇所に集約される。resolver と layout の両方で意識する必要がなくなる。
  - デバッガで AST を見たとき "どのノードが何を継承しているか" がそのまま見える。
- **デメリット**:
  - AST を変更することになり、`parser` の純粋性（ソース .krs そのままの構造）が失われる。
  - `formatter` / `linter` / LSP など AST を他にも触る全てのコードで「描画用」と「ソース由来」の区別が必要になる。
  - パッケージ境界を跨ぐ変更となり、影響範囲が大きい。

### 案2: resolver と layout にそれぞれ継承ロジックを書く（個別実装）

- `style-resolver.ts::processNodes` を `processNodes(nodes, parentAnnotations)` にして再帰的に継承を伝播。スタイルマッチングと `nodeStyleKey` の保存キーで `effectiveAnnotations` を使う。
- `layout.ts` は `viewSlice.childNodes` をフラットに走査しているため、親を知るための補助マップを作って `layoutNode.annotations` に effective 値を入れる。
- **メリット**:
  - 変更範囲が resolver / layout に閉じる。AST は不変。
  - 実装の独立性を保ちつつ、両者で同じ「effective 値」を出せる。
- **デメリット**:
  - 同じ継承ルールを2箇所で書くことになり、DRY 違反。ルール変更時に片方だけ直し忘れるとキーが食い違い、スタイルが外れる。
  - layout 側が `viewSlice.childNodes` のフラット配列から親を辿る仕組みが必要になる（補助マップの構築）。

### 案3: 共有ヘルパー `buildInheritedAnnotations(systems): Map<string, string[]>` を導入し、resolver と layout が同じマップを参照する

`systems` ツリーを一度だけ走査し、各ノード ID に対して「effective annotations」を計算したマップを返す関数を `packages/core/src/resolver/` 配下に置く。

- `resolveStyles` は内部でこのマップを構築し、`processNodes` で参照する。
- `layout()` にはオプショナル引数 `inheritedAnnotations?: Map<string, string[]>` を足し、呼び出し側（`drill-down-svg.ts` / `all-layers-svg.ts` / `svg-renderer.ts`）で `buildInheritedAnnotations(krsFile.systems)` を1回だけ組み立てて渡す。
- `layout.ts` は `layoutNodes.set(...)` のときに `inheritedAnnotations.get(nid) ?? krsNode.annotations` を使う。
- **メリット**:
  - 継承ルールが1箇所（`buildInheritedAnnotations`）に集約され、resolver と layout で完全に同じ結果になる。
  - AST は不変。
  - テストしやすい（純関数 1本）。
- **デメリット**:
  - 呼び出し側の引数が1つ増える。既存の呼び出し箇所を全て更新する必要がある（ただし数カ所）。
  - マップを2回作らないよう、呼び出し側で共有する設計が必要。

## 比較

| 観点 | 案1 事前変換 | 案2 個別実装 | 案3 共有ヘルパー |
|---|---|---|---|
| 継承ルールの DRY | ◎ | ✗ | ◎ |
| AST 純粋性 | ✗ | ◎ | ◎ |
| 影響範囲 | 大 | 中 | 小〜中 |
| テスト容易性 | △（事前変換を全てのテストで考慮） | △（2箇所にテストが必要） | ◎（純関数1本） |
| キー不整合リスク | 低（AST が一次情報） | 高（2箇所で再計算） | 低（1箇所で計算） |

## 現時点の方針

**案3（共有ヘルパー）を採用する。**

### 継承ルール

ノード `N` の effective annotations は以下で定義する:

```
effective(N) =
  N.annotations が非空 なら N.annotations
  さもなくば effective(parent(N))（親が存在しない場合は []）
```

- 明示的なアノテーションがあればそれを最優先、かつ **マージせず置換**する。
- 親が注釈を持たない場合は祖先を遡り、最初に見つかった非空の annotations を採用する。これにより `service @deprecated { domain { usecase } }` の usecase も `@deprecated` を継承する。
- 子が自分で annotations を持っている場合はそこで継承チェーンが切れ、その子の子孫は（子が持っていない annotation を）親からは貰えない。
- **継承起点は `service`** とする。`system` レベルにアノテーションが付くユースケースは現状存在しないため、YAGNI として system → service の継承は実装しない。将来 system にアノテーションが必要になった時点で再検討する。
- **継承対象アノテーションは一律**（ライフサイクル系アノテーションを区別しない）。`@deprecated` / `@migration_target` / `@experimental` いずれも同じルールで継承する。`@experimental` は「API が不安定」の意味合いが強いが、例外を設けると仕様が膨らみ、親が experimental なのに子が通常表示されるほうがユーザーの直感に反する。一貫性を優先する。

### 実装範囲

1. **新規**: `packages/core/src/resolver/inherited-annotations.ts`
   - `buildInheritedAnnotations(systems: KrsNode[]): Map<string, string[]>`
   - 対象は `service` 配下の `domain` / `usecase` / `resource` 等ロジカル子孫。system 直下の service には継承しない（system にアノテーションが付くことは現状想定外）。
2. **更新**: `packages/core/src/resolver/style-resolver.ts`
   - `processNodes` を `processNodes(nodes, parentAnnotations)` に拡張し、effective annotations でマッチングと `nodeStyleKey` 保存を行う。
3. **更新**: `packages/core/src/renderer/layout.ts`
   - `layout()` に `inheritedAnnotations?: Map<string, string[]>` を追加し、`layoutNode.annotations` を effective 値で設定する。
4. **更新**: `drill-down-svg.ts` / `all-layers-svg.ts` / `svg-renderer.ts` の呼び出し側
   - `buildInheritedAnnotations(krsFile.systems)` を1度作り、`resolveStyles` と `layout` の両方に共有する。
5. **テスト**
   - `inherited-annotations.test.ts`: ルール単体の純関数テスト（親継承・子優先・多段継承・兄弟独立性・`examples/migration/system.krs` 相当のケース）。
   - `style-resolver.test.ts`: 継承された annotations によって `@deprecated` スタイルが適用されること、同 ID 重複ドメインが collision を起こさないこと。
   - `layout.test.ts`: ドリルダウン時の `layoutNode.annotations` が effective 値になること。
   - Acceptance Test (`docs/acceptance/`): `examples/migration/system.krs` の `LegacyMonolith` にドリルダウンしたとき、`Order` / `Catalog` が deprecated の視覚処理になっていることを手動で確認する項目を追加。

### 同 ID 重複ドメインへの影響

ADR-20260411-02 は「同一 system 内の重複ドメイン ID」を `@deprecated` / `@migration_target` のいずれかが付いていれば許容する、と定めている。継承導入後は:

- 旧: 重複する `domain Order` が明示的に `@deprecated` / `@migration_target` を持つ → OK
- 新: 子ドメインに注釈がなくても親サービスのアノテーションを継承 → `nodeStyleKey(id, effective)` で一意に分かれる

親サービスに注釈が付いていて子ドメインに付いていないケースは、**重複許容ルール（parser での可否判定）** の条件も緩めるべきかが論点になる。現状の parser は `node.annotations` のみを見ており、継承は考慮していない。

→ この判定は "ソース構文レベル" の健全性チェックなので、**継承は適用しない** 方針を取る。つまり ADR-20260411-02 のエラー条件は従来どおり（子ドメイン自身の annotation のみを見る）。子ドメインに annotation を書かない場合は ADR 対象外（そもそも同 ID 重複は従来どおりエラー）となる。継承はあくまで「描画時の見た目」限定の機能である。

この方針を明文化しておかないと、将来「親のアノテーションで重複も許されるべきでは？」という混乱が起きる可能性があるため、`docs/spec/tags-annotations.md` への追記が望ましい。

## 未解決の問い

なし（すべての論点は「現時点の方針」に反映済み）。
