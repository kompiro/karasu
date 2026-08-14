# AT: プレビューの操作面を 2 つに分ける — 図を変える操作はキャンバスへ、持ち出す操作はツールバーへ

- **日付**: 2026-08-14
- **関連 Issue**: [#2317](https://github.com/kompiro/karasu/issues/2317)
- **Related TPLs**:
  [TPL-1399](../test-perspectives/TPL-1399-control-a11y-contract-survives-migration.md)、
  [TPL-1402](../test-perspectives/TPL-1402-involutive-toggle-renders-both-states.md)、
  [TPL-1468](../test-perspectives/TPL-1468-overlay-z-index-scale.md)、
  [TPL-948](../test-perspectives/TPL-948-event-handler-ui-restructure.md)
- **対象ファイル**:
  - `packages/app/src/components/PreviewToolbar.tsx`（出口系 + フォーカス）
  - `packages/app/src/components/PreviewCanvasControls.tsx`（図を変える操作）
  - `packages/app/src/components/preview-group-by.ts`（グループ化の軸テーブル）
  - `packages/app/src/styles/components/preview.css` / `packages/app/src/styles/tokens.css`

## 概要

プレビューのツールバーは通常のウィンドウ幅で 2 行に折り返していた（ja / en とも、
1680px でも）。コントロールを減らさずに 1 行へ戻すため、操作面を 2 つに分ける。

- **キャンバスバー**（図の上に浮かぶ）: アイコンモード / グループ化 / ファセット /
  すべて畳む / エンティティ / 全レイヤー表示（org view ではツリー表示）
- **ツールバー**: `[SVG をエクスポート ǀ ▾]`（▾ = ドリルダウン / 全図 / draw.io /
  全ビューを開く）、Share、Docs ▾、フォーカス

判断基準は 1 つ — **図を変えるならキャンバス、図を持ち出すならツールバー**。

## 受け入れ条件

### AC-1: どのコントロールがどちらの面に出るか

- [x] 図を変えるコントロールがキャンバスバーに出る（アイコンモード / エンティティ / 全レイヤー表示）
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `keeps the controls that change the diagram on the canvas bar`

- [x] 持ち出すコントロールはツールバーに残り、キャンバスバーには漏れない（エクスポート / Share / Docs / フォーカス）
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `keeps the controls that take the diagram elsewhere in the toolbar`

- [x] グループ化セレクタは、モデルが軸を持つときだけキャンバスバーに出る
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `renders the Group-by selector on the bar only when the model has an axis`

- [x] matrix view ではツールバーもキャンバスバーも描かれない
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `is absent on the matrix view, where the toolbar is absent too`

- [x] 「全ビューを開く」はエクスポートメニューの項目として到達でき、blob: の新規タブを開く
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `shows Open All Views in the export menu` / `calls window.open with a blob URL and noopener when clicked (#1529)`、`packages/e2e/tests/at-0043-all-views-preview.spec.ts` › `clicking the menu item opens a blob: popup carrying the bundled SVG`

### AC-2: 移設で落としてはいけない契約

- [x] 移設した toggle が `aria-pressed` を両状態で保つ（TPL-1399 / TPL-1402）
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `keeps aria-pressed on the toggles it carries, in both states (TPL-1399, TPL-1402)`

- [x] 移設したコントロールが従来と同じハンドラを呼ぶ
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `still calls the handler the toolbar used to call`

- [x] deploy view では全レイヤー表示が disabled のまま（移設前と同じ）
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `disables Show All Layers on the deploy view, as the toolbar did`

- [x] ja ロケールで、2 つの面のどちらにも英語のハードコードが出ない
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `system view with every conditional control present renders no English` / `org view Tree View toggle renders no English`

- [x] 「全ビューを開く」が disabled のとき、活性化しても `window.open` が呼ばれない
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `does not call window.open when allViewsSvg is undefined`

### AC-3: キャンバスバーの浮かせ方

- [x] ツールバーの**下端**（`--preview-toolbar-bottom`）を基準に配置する — 高さだけを見るとタブバーの分だけ上にずれる
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `anchors below the toolbar's bottom edge, not its height`

- [x] `z-index` は `tokens.css` の `--z-*` スケールから採る（TPL-1468）
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `takes its stacking order from the documented scale (TPL-1468)`

- [x] 狭い列でも列内に収まり、2 行に折り返す（`flex-wrap` + `max-width`）
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `wraps inside the column instead of spilling out of it on a narrow window`

- [x] 背景が不透明で、図がラベルに透けない
  > ✅ Automated — `packages/app/src/components/PreviewCanvasControls.test.tsx` › `is opaque, so the diagram cannot show through its labels`

## 手動確認

自動テストが原理的に届かない範囲（実寸の折り返しと、図とバーの重なり具合）だけを残す。
到達先は本番 app（`https://karasu.kompiro.dev/`）。ja ロケール・system view で、
グループ化の軸とファセットを持つモデルを開いて確認する。

- [ ] ウィンドウ幅 1280px / 1440px で、ツールバーが 1 行に収まっている
- [ ] キャンバスバーがパンくずを覆っておらず、ドリルダウンのパスが読める
- [ ] ウィンドウ幅 1024px まで狭めると、キャンバスバーが 2 行に折り返し、ラベルが 1 文字ずつ
      縦積みにならない
- [ ] キャンバスバーの上でクリックしても、背後の図のドリルダウンが誘発されない（TPL-948）
- [ ] エクスポートの ▾ とファセット一覧パネルが、キャンバスバーの上に描かれる

## 補足

- ファセット所属一覧パネルがツールバーに 食い込む既存のずれは本 AT の対象外。
  独立した bug として [#2492](https://github.com/kompiro/karasu/issues/2492) で追う。
- キャンバスバーに載るコントロールは最大 6 個（畳める要素があり、かつエンティティを持つ
  domain までドリルした状態）。これを超える追加が必要になったときは、置き場所ではなく
  コントロール自体の取捨を検討する。
