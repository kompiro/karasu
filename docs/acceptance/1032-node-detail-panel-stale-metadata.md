# AT: NodeDetailPanel reflects metadata changes after edits

- **日付**: 2026-04-29
- **関連 Issue**: [#1032](https://github.com/kompiro/karasu/issues/1032)
- **対象ファイル**:
  - `packages/app/src/hooks/result-fingerprint.ts`
  - `packages/app/src/hooks/useSystemView.ts`
  - `packages/app/src/hooks/useDeployView.ts`
- **関連**: Issue #891 (warning fingerprint と同じパターンの bug)

## 受け入れ条件

- [x] `computeViewResultFingerprint` は `nodeMetadata` の中身が変わったとき、SVG / warnings / diagnostics が同一でも異なる fingerprint を返す
  > ✅ Automated — `packages/app/src/hooks/result-fingerprint.test.ts` › `changes when only nodeMetadata changes (Issue #1032 root cause)`

- [x] `computeViewResultFingerprint` は `nodeMetadata` の内容が同じであれば（参照が違っても）同一の fingerprint を返す
  > ✅ Automated — `packages/app/src/hooks/result-fingerprint.test.ts` › `returns the same fingerprint when nodeMetadata content is unchanged`

- [x] 既存の fingerprint 性質（SVG / warnings / diagnostics に対する感度、`nodeMetadata` を渡さなかった場合のセパレータ衝突回避）に regression が無い
  > ✅ Automated — `packages/app/src/hooks/result-fingerprint.test.ts` 全 7 件 green

- [ ] AT-Manual: `.krs` を編集して `client` の `description` または `capability { label "..." description "..." }` のような **SVG に出ない情報** を変更したあと、同じノードを再度クリックすると NodeDetailPanel に最新の内容が表示される（system 図 / deploy 図 双方）
  > 🧑 Manual — Preview URL で再現手順を実行して確認する

## 補足

- 根本原因: `computeViewResultFingerprint` が SVG / warnings / diagnostics のみを fold していたため、`nodeMetadata` のみが変わるケース（description 本文 / link URL / capability label・description）でフィンガープリントが同一になり、`useSystemView` / `useDeployView` が `setState` を skip → `PreviewPane` が古い `nodeMetadata` Map を保持 → NodeDetailPanel が古い内容を表示
- 修正: fingerprint に optional `nodeMetadata` を追加し、`useSystemView` / `useDeployView` 両方で渡す。`useOrgView` は `nodeMetadata` を扱わないので変更不要
