# AT: deploy view に service→infra 依存エッジを描く

- **日付**: 2026-06-16
- **関連 Issue**: [#1658](https://github.com/kompiro/karasu/issues/1658)
- **関連 ADR**: [ADR-20260616-11](../adr/20260616-11-deploy-infra-dependency-edges.md)
- **対象ファイル**: `packages/core/src/view/deploy-view-extract.ts`, `packages/core/src/view/view-extract.ts`

## 受け入れ条件

- [x] usecase が `resource <Infra>.<Sub>` で infra を参照する service と、その infra の両方が realize されているとき、deploy view に service コンテナ→infra コンテナの ghost edge が描かれる

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › `emits a service→infra ghost edge when both the service and the store are realized (#1658)`

- [x] 依存元 service が realize されていないとき、その infra への ghost edge は描かれない（両端 realize 必須）

  > ✅ Automated — `packages/core/src/view/deploy-view-extract.test.ts` › `does not emit the service→infra edge when the depending service is not realized`

- [x] service→infra 依存の導出は system view と deploy view で同一のヘルパー（`deriveInfraEdges`）を使い、依存集合が一致する（drift しない）

  > ✅ Automated（構造的保証）— 両 view が `packages/core/src/view/view-extract.ts` の export された `deriveInfraEdges` を呼ぶ単一情報源。別実装が無いため drift は構造的に発生しない（[TPL-20260519-02]）。

- [x] infra を realize しない既存ファイルの deploy view 描画は不変（前方互換）

  > ✅ Automated — 既存 `deploy-view-extract.test.ts` の service→service ghost edge / コンテナ生成テスト群が引き続き通過する

## 手動確認

- [ ] app で `index.krs` に「`service ECommerce`（usecase が `resource OrderDB.OrderTable` を参照）/ `database OrderDB { table OrderTable }` / `deploy { oci realizes ECommerce; store realizes OrderDB }`」を書き、deploy view で `ECommerce` コンテナから `OrderDB` コンテナへの ghost edge が下方向に描かれることを目視確認する

  > ⏳ Manual — ghost edge の SVG 描画位置（下層配置・線の接続点）はレイアウトの結合結果のため目視で確認する
