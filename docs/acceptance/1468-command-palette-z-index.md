# AT: コマンドパレットが References パネルより前面に重なる

- **日付**: 2026-05-20
- **関連 Issue**: [#1468](https://github.com/kompiro/karasu/issues/1468)
- **対象ファイル**: `packages/app/src/styles/app.css` / `packages/app/src/components/ui/dialog.tsx` / `dropdown-menu.tsx` / `tooltip.tsx`
- **関連**: コマンドパレット [ADR-20260520-01](../adr/20260520-01-app-command-palette.md) / shadcn/ui 採用 [ADR-20260515-01](../adr/20260515-01-adopt-shadcn-ui.md) / テスト観点 [TPL-20260520-01](../test-perspectives/TPL-20260520-01-overlay-z-index-scale.md)

## 背景

shadcn の portal primitive（`Dialog` / `DropdownMenu` / `Tooltip`）が一律 `z-50` だったため、`z-index: 200` の `.reference-panel-overlay` を始めとする既存の手書き overlay の裏に潜り込んでいた。z-index を `app.css :root` の `--z-*` トークンスケールに集約して解消する。

> **更新（#1548）**: References はモーダル overlay から**別ウィンドウのポップアウト**に移行したため、「コマンドパレット vs References パネルの重なり順」という具体ケースは構造的に発生しなくなった（別ウィンドウなので重ならない）。専用 e2e（`at-1468-command-palette-z-index.spec.ts`）は削除。重なり順の一般則は引き続き `--z-*` トークンスケールで担保し、他の overlay（`Dialog` / `DropdownMenu` / `Tooltip` / context menu）で観測する。

## 受け入れ条件

> ~~References パネルを開いた状態でコマンドパレットを開くと、パレットがパネルより前面に描画される~~ — **Superseded（#1548）**: References が別ウィンドウになり overlay の重なりが発生しないため対象外（専用 e2e は削除）。

- [x] z-index は `app.css :root` の `--z-*` トークンを参照し、overlay ルールにマジックナンバーを残さない

  > ✅ Automated — `pnpm --filter @karasu-tools/app run build` が `z-[var(--z-dialog)]` 等の arbitrary value を `z-index: var(--z-dialog)` にコンパイルすることで担保（CI の `Build` ジョブ）

## 手動確認チェックリスト

`examples/ja/getting-started/index.krs` を Preview UI（Project モード）で開いて確認する。

- [ ] 開いている overlay（`Snapshot` / `Paste compare` ダイアログ等）の上に `Ctrl/Cmd+Shift+P` のコマンドパレットが完全に前面表示される
- [ ] ツールバーボタンの tooltip、エッジ右クリックの context menu が引き続き正しい重なり順で表示される
