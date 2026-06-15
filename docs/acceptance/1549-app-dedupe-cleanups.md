# AT: packages/app の小規模 dedupe クリーンアップ

- **日付**: 2026-06-15
- **関連 Issue**: [#1549](https://github.com/kompiro/karasu/issues/1549)
- **対象ファイル**: `packages/app/src/hooks/useChatSession.ts`,
  `packages/app/src/hooks/useChatSession/types.ts`,
  `packages/app/src/hooks/useAppViews.ts`,
  `packages/app/src/components/PreviewColumn.tsx`,
  `packages/app/src/styles/components/preview.css`

## 概要

automated refactoring analysis（2026-06-12）が指摘した 3 件の独立した重複除去:

1. `src/utils/krs-patch.ts` は `@karasu-tools/core` の `applyKrsPatch` /
   `PatchOperation` を再エクスポートするだけの薄いシム。importer を core 直参照に
   切り替え、シムとその（core の挙動を再テストするだけの）テストを削除。
2. `useAppViews.ts` の `teamPathIndex`（id → 祖先パス、自身除く）と
   `orgPathIndex`（id → 自身を含むパス）はほぼ同一の再帰走査。`orgPath =
   [...parentPath, id]` の関係を使い、1 回の走査で両 Map を構築する。
3. `PreviewColumn.tsx` の手書きエクスポートメニュー（`role="menu"` +
   `onMouseLeave`、キーボード操作なし）を shadcn `DropdownMenu` プリミティブへ移行。
   Radix のロービングフォーカス・型先頭一致・Esc / 外側クリックで閉じる挙動を得る。

機能的な振る舞いの変化は無い（リファクタ）。メニュー項目は
`div[role="menuitem"]` になり、disabled 状態は `aria-disabled` / `data-disabled`
で表現される。

## 受け入れ条件（自動）

- [x] `applyKrsPatch` 経由のチャット patch 適用が引き続き動作する（core 直参照後も）

  > ✅ Automated — `packages/app/src/hooks/useChatSession.test.ts`（既存スイート全通過）

- [x] `teamPathIndex` / `orgPathIndex` が単一走査でも従来どおりのパスを返す（横断ナビ）

  > ✅ Automated — `packages/app/src/hooks/{useCrossNavigation,useHistoryNavigation,useOutline}.test.ts`

- [x] エクスポートオプションメニューがトグルで開き、Drill-down 項目が表示される

  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `clicking toggle button opens export options menu with drill-down item`

- [x] Drill-down / All Diagrams / draw.io 各項目が正しいファイル名・ハンドラで起動する

  > ✅ Automated — `PreviewColumn.test.tsx` › `Export {Drill-down SVG,All Diagrams SVG,draw.io …}` 各 it

- [x] 利用不可の項目が `aria-disabled` / `data-disabled` で無効化される（deploy タブの Drill-down、`allViewsSvg` 未設定の All Diagrams、`onExportDrawio` 未配線の draw.io）

  > ✅ Automated — `PreviewColumn.test.tsx` › `… is disabled …` 各 it

- [x] draw.io エクスポート失敗時にインラインエラーバナーが表示され、Dismiss で消える

  > ✅ Automated — `PreviewColumn.test.tsx` › `surfaces draw.io export failures in an inline error banner`

## 受け入れ条件（手動）

- [ ] app でプロジェクトを開き、プレビューツールバーの Export SVG 右側の `▾`
      （Export options）を押すとメニューが開き、3 項目が表示される
- [ ] キーボードのみで操作できる: `▾` にフォーカスして Enter / Space で開き、
      ↑ / ↓ で項目を移動、Enter で実行、Esc で閉じる（手書き版には無かった挙動）
- [ ] メニュー外クリックで閉じる。利用不可の項目は淡色表示で実行できない
