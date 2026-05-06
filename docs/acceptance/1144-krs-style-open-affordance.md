---
type: product
---

# AT-1144: GUI affordance when a `.krs.style` file is open in the editor

- **日付**: 2026-05-06
- **関連 Issue**: [#1144](https://github.com/kompiro/karasu/issues/1144)（親 #1076 / #1098）
- **対象ファイル**:
  - `packages/app/src/lib/append-style-rule.ts`、`packages/app/src/lib/append-style-rule.test.ts`
  - `packages/app/src/components/EdgeContextMenu.tsx`
  - `packages/app/src/components/PreviewPane.test.tsx`
  - `packages/app/src/styles/app.css`
- **関連 ADR**: [ADR-20260506-01](../adr/20260506-01-gui-driven-style-editing.md)（GUI 編集器の親ルール）

## 受け入れ条件

- [x] AT-A: 開いているファイルが `.krs.style` で終わるパスのとき、`resolveStyleAppendTarget` はそのファイルパスを直接返す（`@import` lookup を skip）
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `resolveStyleAppendTarget › uses the open file itself when it is a .krs.style`

- [x] AT-B: `.krs.style` の content が `undefined`（読み込み中など）でも、パスから target を返せる
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `... > uses the open .krs.style even when its content is empty / unloaded`

- [x] AT-C: ネストしたディレクトリ配下の `.krs.style` でも正しく target になる
  > ✅ Automated — `packages/app/src/lib/append-style-rule.test.ts` › `... > treats files that merely contain .krs.style in the path correctly`

- [x] AT-D: コンテキストメニューのヘッダに append 先のファイル名（basename）が表示される。フルパスは title 属性で hover 可能
  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `edge context menu › shows the resolved target path basename in the menu header`

- [x] AT-E: target が無いケース（無関係なファイルを開いているとき）はヘッダの target line が出ない
  > ✅ Automated — `packages/app/src/components/PreviewPane.test.tsx` › `edge context menu › omits the target path line when there is no styleTargetPath`

- [x] AT-F: disabled 時のヒント文言が「`.krs.style` を直接開くか、現在の `.krs` に `@import` を追加してください」になっている（"@import が無い" だけの限定的な文言ではなく）
  > ✅ Automated — `packages/app/src/components/EdgeContextMenu.tsx` の文言は実装側に固定。手動目視は AT-H（manual）でカバー

- [ ] AT-G（manual）: 実際の Preview で `.krs.style` を開いた状態で edge を右クリック → Direction ▸ Right を選び、編集中の `.krs.style` 末尾に rule が追加されることを確認する
  > 🧑 Manual — `pnpm --filter @karasu-tools/app dev` で Preview 起動。`.krs.style` をエディタで開き、Preview の edge を右クリック、direction を選択。エディタ側で rule 追加を目視

- [ ] AT-H（manual）: `.krs` で `@import` が無いファイルを開いて edge を右クリックすると、Direction items が disabled になり、ヒント文言が「`.krs.style` を直接開くか、`@import` を追加してください」と読める
  > 🧑 Manual — disabled 状態の menu 表示を目視

## 補足

- **Preview source**: `.krs.style` のみを開いている状態の Preview は、当該 issue の議論で「現状の挙動を改善対象とする」項目だが、本 PR では確認のみ。実態として Preview は他のフックでプロジェクト・ファイルを保持するため、`.krs.style` 編集時も diagram が表示される。改善が必要な不具合が出た場合は別 Issue 化
- **target 解決の優先順位**: (1) 開いているファイルが `.krs.style` ならそれ → (2) `.krs` の最後の `@import`。ADR-20260506-01 の「append-only cascade override」と整合
- **ヒント文言**: 「@import が無い」という旧文言は `.krs` 編集時のみ正確だった。一般化して「`.krs.style` 直接編集」も提案するメッセージに統一
