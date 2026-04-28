# AT: Deploy Diagram DAG Layout

- **日付**: 2026-04-09
- **関連 Issue**: [#392](https://github.com/kompiro/karasu/issues/392)
- **対象ファイル**: `packages/core/src/renderer/deploy-layout.ts`

## 受け入れ条件

すべて `packages/core/src/renderer/deploy-layout.test.ts` でカバーされる。

- [x] 空スライスで空の `LayoutResult` を返す

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `returns empty result for empty slice`

- [x] 各サービスグループに対してコンテナが1つ生成される

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `creates a container for each service group`

- [x] deploy ユニットがレイアウトノードとして配置される

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `places units as layout nodes inside containers`

- [x] `realizes` なしのユニットが `__unclassified__` コンテナに入る

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `places unclassified units in an __unclassified__ container`

- [x] `realizes` ありのユニットのみの場合、`__unclassified__` コンテナが生成されない

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `does not create __unclassified__ container when all units have realizes`

- [x] ghost edge で接続された downstream コンテナが upstream より下のレイヤーに配置される

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `places downstream container in a lower layer than upstream when connected by a ghost edge`

- [x] A→B→C のチェーンで C が B より下、B が A より下に配置される

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `places multi-hop chain in correct layer order`

- [x] 同レイヤーのコンテナが横方向に重ならない

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `containers do not overlap horizontally when in the same layer`

- [x] ghost edge の `fromPoint` が上位コンテナの下辺中央、`toPoint` が下位コンテナの上辺中央になる

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `ghost edge fromPoint originates from bottom of from-container when from is above to`

- [x] ghost edge のない孤立コンテナ同士は同レイヤー（横並び）に配置される

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `containers do not overlap horizontally when in the same layer`

- [x] 循環 edge（A→B→A）があっても無限ループにならず正常終了する

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `handles cycles in ghost edges without infinite loop`

- [x] 未分類コンテナが全分類コンテナより下に配置される

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `places unclassified container below all classified containers`

- [x] ノードがコンテナ内に収まる（x/y/width/height の境界チェック）

  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `nodes are positioned inside their container`

- [x] 合計サイズが正の値を持つ
  > ✅ Automated — `packages/core/src/renderer/deploy-layout.test.ts` › `has positive total dimensions`

## 手動確認チェックリスト

`examples/deploy/system.krs` を Preview UI で開いて確認する。

### レイアウト構造

- [ ] Layer 0: `ストアフロントSPA`（Storefront）が最上段に1つ
- [ ] Layer 1: `注文APIコンテナ` + `注文イベントハンドラ`（OrderAPI）が2段目
- [ ] Layer 2: `決済サービスJAR` + `決済Webhookハンドラ`（PaymentService）、`在庫サービスWAR`（InventoryService）、`日次売上レポート` + `月次在庫スナップショット`（ReportingService）が3段目
- [ ] Layer 3: `レガシーERPコネクタ`（LegacyERP）が4段目
- [ ] 未分類行: `データバックフィルジョブ`（realizes なし）が最下段に独立して表示される

### エッジ表示

- [ ] 各 ghost エッジが上のコンテナ下辺中央から下のコンテナ上辺中央へ接続されている
- [ ] エッジが半透明・破線で表示される（ghost スタイル）
- [ ] コンテナを跨ぐエッジが他のコンテナと重なって見づらくなっていないこと

### 全体的な見やすさ

- [ ] 図全体が横方向に 1200px を大きく超えていない
- [ ] 各レイヤー間に十分な縦余白があり、エッジが読み取れる
- [ ] コンテナのラベル・ユニット名が切れずに表示されている
