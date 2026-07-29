# AT: owns / realizes を解決した client がカード上に owner チップと deploy ボタンを持つ

- **日付**: 2026-07-29
- **関連 Issue**: [#2157](https://github.com/kompiro/karasu/issues/2157)
- **関連 AT**: [AT-1720](1720-client-realize-owns.md)（解決側。本 AT はその system view 提示側）
- **関連 TPL**: [TPL-20260729-01](../test-perspectives/TPL-20260729-01-resolved-relation-rendered-for-every-kind.md)
- **対象ファイル**: `packages/core/src/renderer/layout.ts`, `packages/core/src/renderer/svg-renderer.ts`, `packages/core/src/compile/compile.ts`, `packages/core/src/types/ast.ts`, `packages/app/src/components/NodeDetailPanel.tsx`, `packages/vscode/src/webview-content.ts`

## 受け入れ条件

### owner チップの kind 網羅

- [x] team が `owns` できる全 kind（`service` / `domain` / `client`）のカードに `👥` チップと `data-team-button` が描画される

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `renders the owner chip on an owned %s`

- [x] `OWNABLE_LOGICAL_KINDS` に kind を追加したらテストケース不足で落ちる（列挙のドリフトガード）

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `has a model for exactly the kinds in OWNABLE_LOGICAL_KINDS`

- [x] `owns` 対象外の kind（`user`）のカードにはチップが出ない

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `draws no chip for a kind outside the ownable set`

- [x] owned な client の `NodeMetadata.team` / `.teamLabel` が解決される（detail panel の team 行の前提）

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `renders the owner chip on an owned %s`（同ケースで metadata も assert）

### deploy ボタンの kind 網羅

- [x] deploy unit が `realizes` する `service` / `domain` / `client` のカードに `data-deploy-button` が描画され、`NodeMetadata.hasDeployContainer` が `true` になる

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `renders the deploy button on a realized %s`

- [x] infra ブロック（`database` 等）は `realizes` されても deploy ボタンを持たない（shape 都合による意図的な除外）

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `leaves an infra block without a deploy button even when a unit realizes it`

### チップの表示文字列（id と label の分離）

- [x] team が `label` を持つときチップは label を表示し、`data-team-button` は team id のまま

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `renders the owner chip on an owned %s` / `packages/core/src/integration/three-face-cross-binding.test.ts` › `resolves both cross-face relations and renders every face …`

- [x] team が `label` を持たないときはチップが team id にフォールバックする

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `falls back to the team id when the team declares no label`

- [x] 長い label は 15 文字で省略され、カード幅・高さがチップ分を予約する（未予約領域への描画防止）

  > ✅ Automated — `packages/core/src/renderer/owner-affordance-kinds.test.ts` › `elides a long label but keeps the full id on the button` / `reserves a meta row on the owned client's card` / `widens the card for a long team label the chip will draw`

- [x] app / VS Code の detail panel は label を表示し、org view への遷移は team id で行う

  > ✅ Automated — `packages/app/src/components/NodeDetailPanel.test.tsx` › `shows the team label but navigates by the team id (#2157)` / `packages/vscode/src/webview-content.test.ts` › `detail panel labels the org-jump button with teamLabel, keeping the id as the target`

### 手動確認

- [ ] app で `index.krs` に下記を書き、(1) `WebApp` カードに `👥Frontend Team` チップと `D` deploy ボタンが出る、(2) チップのクリックで org view の `Frontend` に遷移する、(3) `D` のクリックで deploy view に遷移する、(4) `Group by: team` に切り替えるとフレームのタイトルとカードのチップが同じ「Frontend Team」を名乗る、ことを目視確認する

  ```krs
  organization Corp {
    team Frontend { label "Frontend Team" owns WebApp }
  }
  system Shop {
    client WebApp [web] { label "Web App" }
    service Backend { label "Backend" }
    WebApp -> Backend "API"
  }
  deploy "prod" {
    assets WebBundle { realizes WebApp }
    oci ApiBox { realizes Backend }
  }
  ```

  > ⏳ Manual — チップ／ボタンのクリック遷移と、フレーム題字とチップの名乗り一致は目視確認する
