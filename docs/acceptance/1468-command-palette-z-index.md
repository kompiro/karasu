# AT: コマンドパレットが References パネルより前面に重なる

- **日付**: 2026-05-20
- **関連 Issue**: [#1468](https://github.com/kompiro/karasu/issues/1468)
- **対象ファイル**: `packages/app/src/styles/app.css` / `packages/app/src/components/ui/dialog.tsx` / `dropdown-menu.tsx` / `tooltip.tsx`
- **関連**: コマンドパレット [ADR-20260520-01](../adr/20260520-01-app-command-palette.md) / shadcn/ui 採用 [ADR-20260515-01](../adr/20260515-01-adopt-shadcn-ui.md) / テスト観点 [TPL-20260520-01](../test-perspectives/TPL-20260520-01-overlay-z-index-scale.md)

## 背景

shadcn の portal primitive（`Dialog` / `DropdownMenu` / `Tooltip`）が一律 `z-50` だったため、`z-index: 200` の `.reference-panel-overlay` を始めとする既存の手書き overlay の裏に潜り込んでいた。z-index を `app.css :root` の `--z-*` トークンスケールに集約して解消する。

## 受け入れ条件

- [x] References パネルを開いた状態でコマンドパレットを開くと、パレットがパネルより前面に描画される

  > ✅ Automated — `packages/e2e/tests/at-1468-command-palette-z-index.spec.ts` › `renders the command palette above the open References panel`

- [x] z-index は `app.css :root` の `--z-*` トークンを参照し、overlay ルールにマジックナンバーを残さない

  > ✅ Automated — `pnpm --filter @karasu-tools/app run build` が `z-[var(--z-dialog)]` 等の arbitrary value を `z-index: var(--z-dialog)` にコンパイルすることで担保（CI の `Build` ジョブ）

## 手動確認チェックリスト

`examples/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] `? Reference` でパネルを開き、`Ctrl/Cmd+Shift+P` でコマンドパレットを開くと、パレットがパネルの dimming/blur 層より手前に完全に表示される
- [ ] パレットの背後の dimming 層が References パネルを含む画面全体を覆っている（パネルだけ明るく浮いて見えない）
- [ ] パレットを Esc で閉じると References パネルが従来どおり操作できる
- [ ] ツールバーボタンの tooltip、エッジ右クリックの context menu が引き続き正しい重なり順で表示される
