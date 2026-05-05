---
id: ADR-20260505-03
title: エディタ・プレビュー間のドラッグハンドル
status: accepted
date: 2026-05-05
topic: app-ui
related_to: [ADR-20260505-02]
assumptions:
  - "file: packages/app/src/hooks/useEditorWidth.ts"
  - "symbol: packages/app/src/hooks/useEditorWidth.ts :: useEditorWidth"
  - "file: packages/app/src/components/AppShell.tsx"
  - "grep: packages/app/src/styles/app.css :: \\.editor-preview-handle"
  - "grep: packages/app/src/styles/app.css :: \\.app-shell\\.has-editor-width"
---

# ADR-20260505-03: エディタ・プレビュー間のドラッグハンドル

- **日付**: 2026-05-05
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1122](https://github.com/kompiro/karasu/issues/1122)
  - PR [#1127](https://github.com/kompiro/karasu/pull/1127)
  - ADR-20260505-02（アクティビティバー + サイドバー構造の導入）— サイドバー側のリサイズと対をなす
  - `packages/app/src/hooks/useEditorWidth.ts`
  - `packages/app/src/components/AppShell.tsx`
  - `packages/app/src/styles/app.css`（`.editor-preview-handle`, `.app-shell.has-editor-width`）

## 背景

`AppShell` のレイアウトは長らく `grid-template-columns: 1fr 1fr` で
編集領域とプレビュー領域を等分していた。サイドバー幅は ADR-20260505-02 で
ドラッグ可能になったが、`.edit-area` と `.preview-column` の間の比率は
固定のままで、以下のユースケースに対応できなかった：

- 横長のダイアグラム（複数階層の deploy view など）をプレビューで広く見たい
- 長い `.krs` 行を横スクロールせずに編集したい

#1122 で 2 つの境界（サイドバー↔エディタ、エディタ↔プレビュー）の
リサイズが提案されたが、調査の結果サイドバー側は ADR-20260505-02 で
すでに実装済みだったため、本 ADR ではエディタ・プレビュー間のハンドル
追加のみを扱う。

## 決定

`AppShell` のグリッド境界に **エディタ・プレビュー間のドラッグハンドル**
を追加する。エディタ幅は **px 単位** で `localStorage` キー
`karasu:editor:width` に永続化し、エディタ・プレビュー双方に **320px の
最小幅** を強制する。ダブルクリックで既定の `1fr 1fr` に戻す。

```
┌────────┬────────────────┬──┬─────────────────┐
│ ActBar │  Sidebar       │▍│  Editor / Prev  │
│        │  (resizable)   │ │  (resizable)    │
│        │                │ │                 │
└────────┴────────────────┴──┴─────────────────┘
                                ▲
                                │
                       editor-preview-handle
                       (.app-shell, grid col 1
                        justify-self: end)
```

実装の要点：

- `useEditorWidth` フックが状態・永続化・リサイズハンドラ・viewport 縮小時の
  再 clamp をまとめて持つ。状態が `null` のときは既定の `1fr 1fr`、
  非 null のときは `grid-template-columns: var(--editor-w) minmax(320px, 1fr)`
  に切り替わる（CSS クラス `has-editor-width`）。
- ハンドルは `.app-shell` の grid column 1 に `justify-self: end` で配置し、
  `--editor-w` の有無に関わらず常に境界に張り付く。
- `preview-focused` と `serve-mode`（`hideEditor=true`）ではハンドルを
  描画しない。`preview-focused` の解除時に直前のエディタ幅が復元される
  ように、`hasExplicitEditorWidth` の className 適用を `previewFocused`
  でゲートする。

## 理由

- **左右どちらの最小幅もコードで担保される**: 実装上は drag 中・viewport
  resize 時に `clamp(320px, w, viewportWidth - 320px)` を適用する。
  CSS 側でも `minmax(320px, 1fr)` を併用してプレビューの floor を二重に
  保証する。
- **px 単位 + viewport-resize 再 clamp**: 比率（%）ではなく px を保持する
  ことで「ある程度の絶対幅でエディタを使いたい」というユースケースに
  自然に応える。viewport が縮んで `editor + 320 > window` になった場合は
  hook 側の resize listener が `window − 320` まで自動で詰める。
- **サイドバーのキー命名と整合**: `karasu:editor:width` は
  ADR-20260505-02 の `karasu:sidebar:width` と並列で、将来別パネルの幅も
  同じ `karasu:<area>:width` 形式で増やせる。
- **`AppShell` 側の所有が自然**: グリッドのコンテナは `AppShell`
  であり、ハンドルもそこに配置するのがレイアウトに対して責務が一致する。
  `EditArea` 内のサイドバーハンドル（ADR-20260505-02）が `EditArea`
  ローカルだったのと対称な所有関係になる。
- **ダブルクリックで既定値に戻せる**: 故意に極端な比率にしてしまったときの
  復旧手段として、サイドバーハンドル（ADR-20260505-02）と同じ操作モデルを
  踏襲する。学習コストを低く保つ。

## 却下した案

- **比率（%）で永続化する**: viewport が変わったときに「同じ感覚の
  レイアウト」を維持しやすい一方、`320px` 最小値の表現が CSS では
  `clamp(320px, var(--editor-pct), calc(100% − 320px))` のような
  複雑な式になり、JS 側の clamp と二重管理になりやすい。px のまま
  resize listener で再 clamp する方が読みやすい。
- **境界に絶対配置のハンドル**: `.app-shell { position: relative }` 上に
  `position: absolute; left: var(--editor-w)` で乗せる案。実装は単純だが、
  warning panel が下にあり、`grid-row` を意識せずに上から重ねるとハンドルが
  warning panel の上にも出てしまう。grid 配置にしておくほうが領域が自然に
  揃う。
- **ハンドル付きの 3 列レイアウト（`editor handle preview`）**: グリッドに
  6px 列を増やす案。きれいだが、`preview-focused` や `serve-mode` の
  override を 2 列・1 列のまま保ちたいので、列を増やすと既存の
  `grid-template-columns: 1fr` 等の上書きを毎回 3 列分書き直す必要が
  ある。`justify-self: end` で 2 列のまま済ませる方が既存 CSS との
  差分が小さい。

## 参考

- ADR-20260505-02（アクティビティバー + サイドバー構造） — サイドバー側の
  リサイズと永続化キー命名の前例
- AT-1122 (`docs/acceptance/1122-editor-preview-resize.md`) — 手動検証手順
