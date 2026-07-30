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

- [ ] Memory モードでアプリを開き、サンプル KRS が正しく描画されることを確認
- [ ] user ノードが人型シェイプ（`shape: user`）で表示される
- [ ] service ノードが青系ボックスで表示される
- [ ] `[external]` タグ付きノードが破線枠・グレー系で表示される
- [ ] async エッジ（`-->`）が破線矢印で表示される

> manual / visual review — シェイプ・色・破線などの描画結果はブラウザ目視で判定する受入観点。

### AC-1.2: リソースタグによるシェイプ自動適用

`resource` のシェイプが画面に出るには **解決済み（resolved）** である必要がある。
ドット記法でインフラの sub-resource を指すか、同名の `entity` に解決する bare id
であること。どちらでもない bare な `resource` はスタイル上シェイプが決まっていても
usecase 図に昇格せず描画されない（[AT-0049](0049-resource-nodes-usecase-diagram.md)）。
以下のモデルを KRS エディタに貼り、`OrderService → Order` までドリルダウンする。

```krs
system ECPlatform {
  database OrderDB {
    table OrderTable { label "注文テーブル" }
  }
  queue EventBus {
    queue OrderCreated { label "注文作成イベント" }
  }
  storage MediaStorage {
    bucket ImageBucket { label "商品画像バケット" }
  }
  service OrderService {
    domain Order {
      entity PaymentGateway { label "決済ゲートウェイ" }
      usecase PlaceOrder {
        resource OrderDB.OrderTable
        resource EventBus.OrderCreated
        resource MediaStorage.ImageBucket
        resource PaymentGateway [api]
      }
    }
  }
}
```

- [x] `resource OrderDB.OrderTable` → `[table]` 推論 → cylinder シェイプ
> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `OrderDB.OrderTable → cylinder (inferred from the table sub-resource)`（描画プリミティブは同ファイルの `cylinder is a body path capped by a full-width ellipse on top`）

- [x] `resource EventBus.OrderCreated` → `[queue]` 推論 → queue シェイプ
> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `EventBus.OrderCreated → queue (inferred from the queue-item sub-resource)`（描画プリミティブは `queue is a body path capped by a narrow ellipse on its right edge`）

- [x] `resource MediaStorage.ImageBucket` → `[storage]` 推論 → cloud シェイプ
> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `MediaStorage.ImageBucket → cloud (inferred from the bucket sub-resource)`（描画プリミティブは `storage renders as a single cloud path`）

- [x] `resource PaymentGateway [api]`（手書きタグ・インフラ対応物なし） → hexagon シェイプ
> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `PaymentGateway → hexagon (hand-written [api], no infra counterpart)`（描画プリミティブは `api renders as a polygon (hexagon), not a rect`）

- [x] 4 ノードすべてが `PlaceOrder` の兄弟ノードとして usecase 図に昇格する
> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `promotes every resolved resource to a sibling node of its usecase in the domain view`

- [x] 未解決の bare `resource ScratchTable [table]` はシェイプが決まっても描画されない
> ✅ Automated — `packages/core/src/integration/resource-shape-tags.test.ts` › `an unresolved bare resource keeps its shape but never reaches the canvas`

- [ ] ブラウザ上で 4 ノードが円柱・パイプ・雲・六角形として描き分けられている

> manual / visual review — シェイプ名とプリミティブの対応は core テストで固定済み。ブラウザでの実描画（重なり・ラベル位置・見分けやすさ）だけが目視観点として残る。

### AC-1.3: ユーザースタイルによるオーバーライド

- [ ] Project モードで `.krs.style` ファイルを作成し、`resource { shape: hexagon; }` と記述
- [x] resource ノードが hexagon シェイプで表示される（ビルトインの box を上書き）
> ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `user stylesheet overrides builtin`（resource の shape がビルトイン box → hexagon に上書きされることを検証）

> manual / visual review — Project モードでの `.krs.style` 作成とブラウザ実描画での切り替わり確認は目視で行う。

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
