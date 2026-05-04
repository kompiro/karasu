---
type: product
---

# AT-1094: Persist Matrix (CRUD) tab in URL hash

- **日付**: 2026-05-04
- **関連 Issue**: [#1094](https://github.com/kompiro/karasu/issues/1094)
- **対象ファイル**:
  - `packages/app/src/hooks/useHistoryNavigation.ts`
  - `packages/app/src/hooks/useHistoryNavigation.test.ts`
- **関連 ADR**: [ADR-20260502-01](../adr/20260502-01-crud-matrix-view.md)（CRUD マトリクスビュー — 本修正の対象タブ）

## 受け入れ条件

- [x] AT-A: `buildHash("matrix", [])` が `#krs-matrix` を返す
  > ✅ Automated — `useHistoryNavigation.test.ts` › `returns #krs-matrix for matrix view`

- [x] AT-B: `buildHash("matrix", ["ignored"])` も `#krs-matrix` を返す（matrix view は drill-down を持たない）
  > ✅ Automated — `useHistoryNavigation.test.ts` › `ignores viewPath for matrix view`

- [x] AT-C: `buildHash("matrix", [], false, "OrderTable")` が `#krs-matrix:OrderTable` を返す（highlight サフィックス対応）
  > ✅ Automated — `useHistoryNavigation.test.ts` › `appends :highlightNodeId to matrix hash`

- [x] AT-D: `parseHash("#krs-matrix")` が `{ activeView: "matrix", nodeId: null, isOrgTreeView: false, ... }` を返す
  > ✅ Automated — `useHistoryNavigation.test.ts` › `parses #krs-matrix as matrix view`

- [x] AT-E: `parseHash("#krs-matrix?file=...")` が `filePath` を正しく抽出する
  > ✅ Automated — `useHistoryNavigation.test.ts` › `parses #krs-matrix?file=... with file suffix`

- [x] AT-F: `buildHash → parseHash` が matrix で round-trip する
  > ✅ Automated — `useHistoryNavigation.test.ts` › `round-trips matrix view`

- [x] AT-G: 既存の挙動（potential bug）が解消される — `activeView === "matrix"` で `#krs-system-root` が emit されない
  > ✅ Automated — AT-A の `buildHash("matrix", [])` が `#krs-matrix` を返すことで担保

- [ ] AT-H（manual）: app preview で CRUD タブを選択 → URL hash が `#krs-matrix` に変わる → ブラウザの戻るで前タブに戻り、進むで CRUD タブに復帰することを目視確認する
  > 🧑 Manual — preview で確認

- [ ] AT-I（manual）: `#krs-matrix` を含む URL を直接開くと CRUD タブが選択された状態でロードされることを目視確認する
  > 🧑 Manual — preview で確認

## 補足

スコープは「タブ自体を URL に乗せる」最小修正のみ。Matrix タブ内のフィルタ状態（service / infra dropdown）の URL 化は別 Issue で扱う（必要が顕在化した時点で）。
