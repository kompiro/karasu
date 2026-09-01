# AT: アイコン表示モードを de-emphasize する — パンくず行から Settings の「表示」へ

- **日付**: 2026-09-01
- **関連 Issue**: [#2376](https://github.com/kompiro/karasu/issues/2376)
- **Related TPLs**:
  [TPL-1399](../test-perspectives/TPL-1399-control-a11y-contract-survives-migration.md)、
  [TPL-1402](../test-perspectives/TPL-1402-involutive-toggle-renders-both-states.md)、
  [TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md)
- **対象ファイル**:
  - `packages/app/src/components/SettingsPane.tsx`（新しい「表示」セクション）
  - `packages/app/src/components/PreviewViewControls.tsx`（トグルの撤去）
  - `packages/app/src/components/EditPane.tsx` / `AppShell.tsx`（`displayMode` の受け渡し）
  - `packages/i18n/src/{en,ja,types}.ts`（`settings.displayMode.*`）
  - `docs/tools/app.md` / `docs/tools/app.ja.md`

## 概要

アイコンモードは [ADR-30](../adr/30-icon-mode.md) で導入されたが、その動機のうち
「`user` シェイプが調整しにくい」はノード描画リデザイン
（[#2366](https://github.com/kompiro/karasu/issues/2366) / [ADR-2366](../adr/2366-node-chrome-and-ports.md)）で解消され、
「アイコンで識別しやすい」も外部 SVG アイコン（`shape: url()`）がシェイプモードで
効くためアイコンモード固有の価値ではなくなった。

そこで Phase 1 として **de-emphasize** する。パンくず行にあった `◇ アイコンモード`
トグルを撤去し、Settings タブの「表示」セクションに**レガシーな表示モード**として
移す。core の `displayMode` API は変更しない（deprecation の可否は Phase 2 で判断する）。

配置は [ADR-2317](../adr/2317-preview-toolbar-density.md) の基準（図を変える操作は
パンくず行）への**意図的な例外**であり、de-emphasize が理由である。その代償として、
編集ペインを描画しない `karasu serve` ではアイコンモードに到達できなくなる
（言語・テーマも同じ理由で既に到達できない）。

## 受け入れ条件

### AC-1: アイコンモードがプレビューの操作面から消えている

- [x] パンくず行にアイコンモードのコントロールが無い
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `no longer carries the icon-mode toggle`

- [x] system / deploy / org のどのビューでもアイコンモードのボタンが出ない
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `offers no icon-mode control on any active view`

### AC-2: Settings の「表示」から切り替えられる

- [x] 「ノードの表示」がシェイプとアイコンの 2 つを選択肢に持つ
  > ✅ Automated — `packages/app/src/components/SettingsPane.test.tsx` › `offers shape and icon as the two node display options`

- [x] 現在の表示モードがセレクタの値に反映される
  > ✅ Automated — `packages/app/src/components/SettingsPane.test.tsx` › `reflects the active display mode in the select value`

- [x] 選んだモードでハンドラが呼ばれる
  > ✅ Automated — `packages/app/src/components/SettingsPane.test.tsx` › `calls onDisplayModeChange with the mode that was picked`

- [x] Settings 経由の切り替えで system view の図がアイコンカードに再描画され、シェイプへ戻せる（TPL-1402）
  > ✅ Automated — `packages/e2e/tests/at-0048-resource-shape-icon-mode.spec.ts` › `Icon Mode toggle changes active state and embeds icon-card markup for infra nodes (TC-3)`

- [x] deploy view でも同じく再描画される（#1669 の silent no-op 回帰の番人）
  > ✅ Automated — `packages/e2e/tests/at-1666-deploy-icon-mode.spec.ts` › `toggling Icon Mode re-renders deploy unit nodes with icon markup`

- [x] アイコンモードでも infra 宣言由来のラベルが解決される
  > ✅ Automated — `packages/e2e/tests/at-0048-resource-shape-icon-mode.spec.ts` › `resource labels resolve from infra declarations in both display modes (TC-5)`

### AC-3: レガシーであることが両ロケールで伝わる

- [x] アイコン側の選択肢が en / ja の双方でレガシーと表示される
  > ✅ Automated — `packages/app/src/components/SettingsPane.test.tsx` › `marks icon cards as the legacy option in both locales`

- [x] ja ロケールで「表示」セクションに英語のハードコードが出ない
  > ✅ Automated — `packages/app/src/components/SettingsPane.test.tsx` › `renders no English hardcode in the section under locale=ja`

## 手動確認

自動テストが原理的に届かない範囲だけを残す。到達先は本番 app
（`https://karasu.kompiro.dev/`）。

- [ ] Settings の「表示」セクションが言語・テーマと同じ体裁で並び、レガシーの注記が読める（ja / en）
- [ ] アイコンカードに切り替えたとき、図が実寸で崩れずに描画される（ライト / ダーク両テーマ）
- [ ] `karasu serve` で起動したとき Settings タブが無く、アイコンモードに到達できない（意図した代償）

## 補足

- Phase 2（deprecation の可否を ADR で決める）は本 AT の対象外。判断には Phase 1
  出荷後の利用シグナルが要るため。
- VS Code 拡張のトグル（[ADR-299](../adr/299-vscode-icon-mode-toggle.md)）は据え置き。
  もともと低トラフィックな設定であり、Issue でも対象外とされている。
- `shape: url()` による外部 SVG アイコン（[ADR-9005](../adr/9005-svg-icon-file-import.md) /
  [ADR-1415](../adr/1415-outline-icon-variants.md)）はアイコンモードとは独立で、
  本変更の影響を受けない。
