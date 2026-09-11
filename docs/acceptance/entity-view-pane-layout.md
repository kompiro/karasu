---
type: product
---

# AT: entity ビューを共有プレビューペインに載せる（#2800）

- **日付**: 2026-09-11
- **関連 Issue**: [#2800](https://github.com/kompiro/karasu/issues/2800)（本 PR）, [#2799](https://github.com/kompiro/karasu/issues/2799)（ズーム欠落の調査 — org タブ側の 2 ペインが残る）
- **Related TPLs**: [TPL-2800](../test-perspectives/TPL-2800-diagram-pane-shared-viewer-affordances.md)（図を描くペインは共有ビューアコンポーネントを通す）, [TPL-1537](../test-perspectives/TPL-1537-react-passive-event-preventdefault-noop.md)（ズームの wheel リスナが非 passive である必要）
- **先行 AT**: [AT-1907](1907-entity-view-app.md)（entity view のトグル・パーマリンク）
- **対象ファイル**:
  - `packages/app/src/components/PreviewColumn.tsx`（entity サブモードの描画分岐）
  - `packages/app/src/components/PreviewPane.tsx`（ペイン修飾クラスを受ける `className`）
  - `packages/app/src/hooks/useViewSvg.ts`（`entityViewDiagnostics` の返却）
  - `packages/app/src/hooks/usePreviewContextValue.ts` / `packages/app/src/state/preview-context.tsx`（配線）

> entity サブモードだけが `.preview-container` の外に素の `<div>` で描かれており、フィットもズームもパンも効かなかった。Dify モデルの `IdentityAccess` の ER 図は 36,053px 幅で、スクロールだけのペインでは全体を一度も見られない。他の図と同じ `PreviewPane` を通す。

## 受け入れ条件

### AC-1: entity ビューが共有プレビューペインを通る

- [x] TC-1: entity ペインの SVG が `.preview-container` の中にあり、`preview-pane--entity` マーカーが残っている

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `Entity view sub-mode (#1907)` › `renders the entity SVG inside the shared preview container, keeping the pane marker` / `packages/e2e/tests/at-2800-entity-view-pane-layout.spec.ts` › `the entity SVG sits in .preview-container and is scaled to fit the pane`

- [x] TC-2: ペインより広い ER 図が、はみ出さずペイン幅に収まって描かれる

  > ✅ Automated — `packages/e2e/tests/at-2800-entity-view-pane-layout.spec.ts` › `the entity SVG sits in .preview-container and is scaled to fit the pane`（intrinsic 幅 > ペイン幅、かつ描画幅 ≤ ペイン幅）

- [x] TC-3: entity ビュー上でのホイール操作でズーム transform が変わる（#2799 の観測分の解消）

  > ✅ Automated — `packages/e2e/tests/at-2800-entity-view-pane-layout.spec.ts` › `wheel over the entity view zooms it (#2799)`

- [x] TC-4: サブモードを戻した usecase ビューのズームは従来どおり効く（非退行）

  > ✅ Automated — `packages/e2e/tests/at-2800-entity-view-pane-layout.spec.ts` › `the usecase view keeps its own zoom when the sub-mode is toggled off`

### AC-2: entity ビュー自身の診断が出る

- [x] TC-5: `renderEntityView` が返した診断（#2179 の `boundary-membership-not-drawn`）が entity ペインのバナーに出る

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `Entity view sub-mode (#1907)` › `shows the entity view's own diagnostics in the pane's banner`

### AC-3: AT-1907 の既存の振る舞いを壊さない

- [x] TC-6: トグルの出現条件・hash・`-entity.svg` エクスポート・boundary グループ枠が従来どおり

  > ✅ Automated — `packages/e2e/tests/at-1907-entity-view-toggle.spec.ts`（全 5 ケース）, `packages/e2e/tests/at-1907-entity-deeplink.spec.ts`

### 手動確認

- [ ] Dify のような大きなモデル（`domain IdentityAccess` など）で entity ビューを開き、ドメイン全体の形が一度に読めること。ホイールで拡大したときに文字が潰れないこと
- [ ] ズーム倍率が usecase ↔ entity の切り替えでリセットされる挙動が、実際の読み方の邪魔になっていないか（気になるなら #2799 の論点 2 で扱う）
