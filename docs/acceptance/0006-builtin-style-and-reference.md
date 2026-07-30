---
type: product
---

# AT-0006: Built-in Style & Reference Panel

- **日付**: 2026-03-23
- **関連 Issue**: #8
- **関連設計**: [ADR-8](../adr/8-builtin-style-and-reference.md)

## 検証コマンド

```bash
npm run build    # TypeScript + Vite ビルド成功
npx vitest run   # 230 テスト通過
npm run lint     # 新規の warning/error なし
npm run format:check  # フォーマット OK
```

## AC-1: ビルトインスタイルの適用（Phase 1）

### AC-1.1: ユーザースタイルなしでもデフォルト描画される

> ✅ Automated by `packages/e2e/tests/at-0006-builtin-style.spec.ts` (suite-wide)

- [x] Memory モードでアプリを開き、サンプル KRS が正しく描画されることを確認
- [x] user ノードが人型シェイプ（`shape: user`）で表示される
- [x] service ノードが青系ボックスで表示される
- [x] `[external]` タグ付きノードが破線枠・グレー系で表示される
- [x] async エッジ（`-->`）が破線矢印で表示される

> Tests: `kind shapes come from the built-in sheet with no user stylesheet` /
> `the kind palette makes services blue and keeps [external] grey and dashed` /
> `async edges are dashed and sync edges are solid`。
>
> 判定の作り: シェイプは `shapes.ts` が出す**ジオメトリの分類**で見る（cylinder と
> queue はどちらも `path` + `ellipse` で cap を伸ばす軸だけが違うため、「ellipse が
> ある」では queue が cylinder で描かれても通ってしまう）。色は hex 固定ではなく
> **関係と色相クラス**で見る（service は青優勢、`[external]` は service より彩度が
> 低く別色、かつ破線）。`default-style.ts` の色調整では落ちず、external が service
> パレットに埋没したり破線が消えたときに落ちる。async / sync は必ず**対で**比較する
> — 全部を破線にする回帰が「async は破線」だけの assert を満たしてしまうため。

### AC-1.2: リソースのシェイプ自動適用

> チェックリストの旧記述 `resource DB "DB" [table]` は現行文法ではパースエラー
> （インライン label 文字列は無く、`resource` は usecase の中に置く）。実装されて
> いる機構は 2 つある — **infra kind からのシェイプ推論**（`table` → cylinder、
> `queue` → queue、`bucket` → cloud）と、**手書きタグ**（推論より優先される。
> `[api]` → hexagon は対応する infra kind が無いのでこちらだけ）。どちらの経路でも
> 描画されるのは **解決済み（resolved）** の resource だけ — ドット記法で infra の
> sub-resource を指すか、同名の `entity` に解決する bare id であること。以下は現行
> 文法に合わせて書き直したもので、`Api → Core` までドリルダウンして確認する。

```krs
system Demo {
  database MainDB {
    table Orders { label "Orders" }
  }
  queue Bus {
    queue Created { label "Created" }
  }
  storage Media {
    bucket Images { label "Images" }
  }
  service Api {
    domain Core {
      entity PaymentGateway { label "決済ゲートウェイ" }
      usecase Handle {
        resource MainDB.Orders
        resource Bus.Created
        resource Media.Images
        resource PaymentGateway [api]
      }
    }
  }
}
```

- [x] usecase の `resource MainDB.Orders`（`table` 参照）が cylinder で表示される

> ✅ Automated — `packages/e2e/tests/at-0006-builtin-style.spec.ts` › `resource shapes are inferred from the infra kind (AC-1.2, AT-0049)`（app 実描画）／`packages/core/src/integration/resource-shape-tags.test.ts` › `MainDB.Orders → cylinder (inferred from the table sub-resource)`（スタイル解決）

- [x] `resource Bus.Created`（`queue` 参照）が queue シェイプで表示される

> ✅ Automated — `packages/e2e/tests/at-0006-builtin-style.spec.ts` › `resource shapes are inferred from the infra kind (AC-1.2, AT-0049)` — cylinder と queue は cap の向き（`rx` vs `ry`）で判別するので、取り違えも検出する。／`packages/core/src/integration/resource-shape-tags.test.ts` › `Bus.Created → queue (inferred from the queue-item sub-resource)`

- [x] `resource Media.Images`（`bucket` 参照）が cloud シェイプで表示される

> ✅ Automated — `packages/e2e/tests/at-0006-builtin-style.spec.ts` › `resource shapes are inferred from the infra kind (AC-1.2, AT-0049)`／`packages/core/src/integration/resource-shape-tags.test.ts` › `Media.Images → cloud (inferred from the bucket sub-resource)`

- [x] `resource PaymentGateway [api]`（手書きタグ）が hexagon で表示される

> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `PaymentGateway → hexagon (hand-written [api], no infra counterpart)`
>
> この行は一時「実行不能」と記録されていたが、それは **未割当** resource しか経路が
> 無いという前提が誤っていたため。手書きタグは推論より優先される（[ADR-351](../adr/351-resource-shape-and-infra-icon-mode.md)）ので、
> **解決済み** の resource — ここでは `entity PaymentGateway` に解決する bare id、
> ドット記法の `resource MainDB.Orders [api]` でも同じ — に `[api]` を書けば hexagon
> で描かれる。[#2200](https://github.com/kompiro/karasu/issues/2200)（未割当 resource が
> spec の言うとおりに描かれない）は spec/impl 不一致として依然有効だが、この行の
> 前提条件ではない。

- [x] 4 ノードすべてが `Handle` の兄弟ノードとして usecase 図に昇格する

> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `promotes every resolved resource to a sibling node of its usecase in the domain view`

- [x] 未解決の bare `resource ScratchTable [table]` はシェイプが決まっても描画されない

> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `an unresolved bare resource keeps its shape but never reaches the canvas`（スタイル層は cylinder を返すのに view 層が落とす、という silent drop の形。[TPL-2075](../test-perspectives/TPL-2075-parsed-construct-renders-or-warns.md) / [#2200](https://github.com/kompiro/karasu/issues/2200) の対象）

- [ ] ブラウザ上で 4 ノードが円柱・パイプ・雲・六角形として描き分けられている

> manual / visual review — シェイプ名とプリミティブの対応は e2e / core テストで固定済み。残るのは実描画の見分けやすさ（重なり・ラベル位置）だけ。

### AC-1.3: ユーザースタイルによるオーバーライド

- [x] Project モードで `.krs.style` を作成し、ビルトインを上書きできる
> ✅ Automated — `packages/e2e/tests/at-0006-builtin-style.spec.ts` › `a user stylesheet overrides an inferred resource shape at equal specificity (AC-1.3)`（`.krs.style` を含む project を実際に開き、推論された cylinder が hexagon に変わること、および同じ user シートの別ルールが適用されることを確認）

- [x] resource ノードが hexagon シェイプで表示される（ビルトインの box を上書き）
> ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `user stylesheet overrides builtin`（無印 resource の shape がビルトイン box → hexagon に上書きされることを検証）

- [x] 詳細度がビルトインより低いユーザールールは**上書きしない**
> ✅ Automated — `packages/e2e/tests/at-0006-builtin-style.spec.ts` › `a lower-specificity user rule does not override a tag-scoped built-in rule` — cascade は `docs/spec/style.md` どおり詳細度優先・同点なら後勝ちで、**user origin による優遇は無い**。よって無印 `resource`（score 1）はビルトインの `resource[table]`（score 11）に勝てない。上の AC の例（`resource { shape: hexagon; }`）が上書きできるのは**タグの付かない** resource だけ。


### AC-1.4: 存在しないスタイルファイルのインポート

- [ ] `.krs` ファイルに `@import "nonexistent.krs.style"` を記述
- [x] 警告パネルに warning（error ではない）が表示される
> ✅ Automated — `packages/core/src/fs/import-resolver.test.ts` › `returns warning diagnostic for missing style file`（severity `warning` / code `style-file-not-found` の診断発行を検証）

- [ ] 描画はビルトインスタイルで正常に行われる

> manual / visual review — 警告パネルへの表示と描画継続の同時確認はライブセッションで行う。

## AC-2: 冗長なデフォルトの削除（Phase 2）

### AC-2.1: 新規プロジェクトにスタイルファイルが作成されない

- [ ] Project モードで新規プロジェクトを作成
- [ ] ファイルツリーに `default.krs.style` が存在しないことを確認
- [ ] `index.krs` に `@import` 行が含まれていないことを確認
- [ ] 描画が正常に行われることを確認

> manual / visual review — 新規プロジェクト作成時のファイルツリー状態と描画結果はブラウザ操作で確認する。

## AC-3: リファレンスパネル（Phase 4）

### AC-3.1: パネルの開閉

- [ ] ブレッドクラム右端の "?" ボタンをクリック → リファレンスパネルがスライドイン
- [ ] パネルの "×" ボタンまたはオーバーレイ部分をクリック → パネルが閉じる

> manual / visual review — リファレンスパネルのスライドイン・閉じる挙動はブラウザ操作で確認する。

### AC-3.2: Syntax タブ

- [x] ノード種別一覧テーブルが表示される（system, service, domain, usecase, resource, user）
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `shows the Syntax tab with system node kinds by default`

- [ ] 各種別の含有関係と使用可能プロパティが表示される
- [x] エッジ構文の例が表示される
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Syntax tab documents resource operations (CRUD) and the optional edge id`（Edge Syntax セクションの `#criticalWrite` 例を検証）

> manual / visual review — 含有関係・プロパティ列の表示と例の可読性はパネルを開いて目視確認する。

### AC-3.3: Styles タブ

- [x] セレクタ構文と詳細度スコアの一覧が表示される
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Styles tab includes the edge#<id> selector (specificity 101) and a direction example`

- [x] スタイルプロパティ一覧が表示される（background-color, shape 等）
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Styles tab lists the edge / layout style properties from the spec`

- [ ] シェイプキーワード一覧が表示される

> manual / visual review — シェイプキーワード一覧はブラウザでパネルを開いて確認する。

### AC-3.4: Tags & Annotations タブ

- [x] タグ一覧テーブルが表示される（external, async, sync, human, ai, table, queue, api, storage）
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Tags tab shows tags list for system view`

- [x] アノテーション一覧テーブルが表示される（deprecated, new, experimental, migration_target）
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Tags tab shows tags list for system view`（annotations テーブルの `deprecated` 表示も同テストで検証）

- [ ] 各アノテーションにバッジプレビューが表示される

> manual / visual review — バッジプレビュー描画はパネル UI を目視確認する。

### AC-3.5: Built-in Theme タブ

- [ ] ビルトインスタイルシートのソースコードが表示される
- [x] "Copy" ボタンでクリップボードにコピーされる
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Copy button shows 'Copied!' after click and reverts after 2 seconds`（`navigator.clipboard.writeText` 成功後にのみ "Copied!" になる実装のため、コピー実行も同テストで担保）

- [x] コピー後 "Copied!" と一時的に表示される
> ✅ Automated — `packages/app/src/components/ReferenceContent.test.tsx` › `Copy button shows 'Copied!' after click and reverts after 2 seconds`

> manual / visual review — ビルトインスタイルシートのソースコード表示はブラウザ操作で確認する。

### AC-3.6: 両モード対応

- [ ] Memory モードでリファレンスパネルが動作する
- [ ] Project モードでリファレンスパネルが動作する

> manual / visual review — Memory / Project 両モードでパネルを開く動作はブラウザでモードを切替えて目視確認する。
