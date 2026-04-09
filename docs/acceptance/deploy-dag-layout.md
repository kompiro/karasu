# AT: Deploy Diagram DAG Layout

- **日付**: 2026-04-09
- **関連 Issue**: [#392](https://github.com/kompiro/karasu/issues/392)
- **対象ファイル**: `packages/core/src/renderer/deploy-layout.ts`

## 自動テスト（CI で検証済み）

- [x] 空スライスで空の `LayoutResult` を返す
- [x] 各サービスグループに対してコンテナが1つ生成される
- [x] deploy ユニットがレイアウトノードとして配置される
- [x] `realizes` なしのユニットが `__unclassified__` コンテナに入る
- [x] `realizes` ありのユニットのみの場合、`__unclassified__` コンテナが生成されない
- [x] ghost edge で接続された downstream コンテナが upstream より下のレイヤーに配置される
- [x] A→B→C のチェーンで C が B より下、B が A より下に配置される
- [x] 同レイヤーのコンテナが横方向に重ならない
- [x] ghost edge の `fromPoint` が上位コンテナの下辺中央、`toPoint` が下位コンテナの上辺中央になる
- [x] ghost edge のない孤立コンテナ同士は同レイヤー（横並び）に配置される
- [x] 循環 edge（A→B→A）があっても無限ループにならず正常終了する
- [x] 未分類コンテナが全分類コンテナより下に配置される
- [x] ノードがコンテナ内に収まる（x/y/width/height の境界チェック）
- [x] 合計サイズが正の値を持つ

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
