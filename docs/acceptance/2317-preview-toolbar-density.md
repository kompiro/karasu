# AT: プレビューの操作面を 2 つに分ける — 図を変える操作はパンくずの行へ、持ち出す操作はツールバーへ

- **日付**: 2026-08-14
- **関連 Issue**: [#2317](https://github.com/kompiro/karasu/issues/2317)
- **設計 (ADR)**: [ADR-2317](../adr/2317-preview-toolbar-density.md)
- **Related TPLs**:
  [TPL-1399](../test-perspectives/TPL-1399-control-a11y-contract-survives-migration.md)、
  [TPL-1402](../test-perspectives/TPL-1402-involutive-toggle-renders-both-states.md)、
  [TPL-1468](../test-perspectives/TPL-1468-overlay-z-index-scale.md)、
  [TPL-948](../test-perspectives/TPL-948-event-handler-ui-restructure.md)
- **対象ファイル**:
  - `packages/app/src/components/PreviewToolbar.tsx`（出口系 + フォーカス）
  - `packages/app/src/components/PreviewViewControls.tsx`（図を変える操作）
  - `packages/app/src/components/preview-group-by.ts`（グループ化の軸テーブル）
  - `packages/app/src/styles/components/preview.css`（`.preview-context-row` / `.preview-view-controls`）

## 概要

プレビューのツールバーは通常のウィンドウ幅で 2 行に折り返していた（ja / en とも、
1680px でも）。コントロールを減らさずに 1 行へ戻すため、操作面を 2 つに分ける。

- **ビュー操作行**（パンくずと同じ行、右寄せ）: アイコンモード / グループ化 / ファセット /
  すべて畳む / エンティティ / 全レイヤー表示（org view ではツリー表示）
- **ツールバー**: `[SVG をエクスポート ǀ ▾]`（▾ = ドリルダウン / 全図 / draw.io /
  全ビューを開く）、Share、Docs ▾、フォーカス

判断基準は 1 つ — **図を変えるならパンくずの行、図を持ち出すならツールバー**。

図の上に浮かせる案は実装して取り下げた。図の左上を覆い、その下のノードへのクリックを
奪ったため（AT-1513 の e2e が `ECommerce` ノードを押せなくなって検出した — TPL-948）。

## 受け入れ条件

### AC-1: どのコントロールがどちらの面に出るか

- [x] 図を変えるコントロールがビュー操作行に出る（アイコンモード / エンティティ / 全レイヤー表示）
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `keeps the controls that change the diagram in the drill-path row`

- [x] 持ち出すコントロールはツールバーに残り、ビュー操作行には漏れない（エクスポート / Share / Docs / フォーカス）
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `keeps the controls that take the diagram elsewhere in the toolbar`

- [x] グループ化セレクタは、モデルが軸を持つときだけビュー操作行に出る
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `renders the Group-by selector on the bar only when the model has an axis`

- [x] matrix view ではツールバーもビュー操作行も描かれない
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `is absent on the matrix view, where the toolbar is absent too`

- [x] 「全ビューを開く」はエクスポートメニューの項目として到達でき、blob: の新規タブを開く
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `shows Open All Views in the export menu` / `calls window.open with a blob URL and noopener when clicked (#1529)`、`packages/e2e/tests/at-0043-all-views-preview.spec.ts` › `clicking the menu item opens a blob: popup carrying the bundled SVG`

### AC-2: 移設で落としてはいけない契約

- [x] 移設した toggle が `aria-pressed` を両状態で保つ（TPL-1399 / TPL-1402）
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `keeps aria-pressed on the toggles it carries, in both states (TPL-1399, TPL-1402)`

- [x] 移設したコントロールが従来と同じハンドラを呼ぶ
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `still calls the handler the toolbar used to call`

- [x] deploy view では全レイヤー表示が disabled のまま（移設前と同じ）
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `disables Show All Layers on the deploy view, as the toolbar did`

- [x] ja ロケールで、2 つの面のどちらにも英語のハードコードが出ない
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `system view with every conditional control present renders no English` / `org view Tree View toggle renders no English`

- [x] 「全ビューを開く」が disabled のとき、活性化しても `window.open` が呼ばれない
  > ✅ Automated — `packages/app/src/components/PreviewColumn.test.tsx` › `does not call window.open when allViewsSvg is undefined`

### AC-3: ビュー操作行の置き方

- [x] コントロールは図の上に浮かず、パンくずと同じ行に入る（図を覆わない → クリックも奪わない）
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `shares the drill path's row instead of floating over the diagram`

- [x] 幅が足りないときは、パンくずを潰さずコントロールが行内で折り返す
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `wraps within the row rather than squeezing the drill path`

- [x] パンくずが無いビュー（deploy）でもコントロールの位置が右端で変わらない
  > ✅ Automated — `packages/app/src/components/PreviewViewControls.test.tsx` › `keeps the controls at the right edge with or without a breadcrumb`

- [x] 図のノードクリックがコントロールに奪われない（TPL-948）
  > ✅ Automated — `packages/e2e/tests/at-1513-legend-scope.spec.ts` › `the legend follows the drill-down level and returns on breadcrumb home (AC-4)`

## 手動確認

自動テストが原理的に届かない範囲（実寸の折り返しと、図とバーの重なり具合）だけを残す。
到達先は本番 app（`https://karasu.kompiro.dev/`）。ja ロケール・system view で、
グループ化の軸とファセットを持つモデルを開いて確認する。

- [ ] ウィンドウ幅 1280px / 1440px で、ツールバーが 1 行に収まっている
- [ ] ドリルダウンのパスが読める（コントロールに潰されていない）
- [ ] ウィンドウ幅 1024px まで狭めても、ラベルが 1 文字ずつ縦積みにならない
- [ ] 図の左上のノードがクリックできる（コントロールが覆っていない）

## 補足

- ファセット所属一覧パネルがツールバーに 食い込む既存のずれは本 AT の対象外。
  独立した bug として [#2492](https://github.com/kompiro/karasu/issues/2492) で追う。
- ビュー操作行に載るコントロールは最大 6 個（畳める要素があり、かつエンティティを持つ
  domain までドリルした状態）。これを超える追加が必要になったときは、置き場所ではなく
  コントロール自体の取捨を検討する。
- 実測（ja / 1280px / 50-50 分割）: ツールバー 34px + ビュー操作行 68px。従来は
  ツールバー 61px（2 行）+ パンくず 28px。**総量はほぼ変わらない** — 図の上に浮かせる案が
  示した節約は、その分だけ図を覆うことで得ていたものだった。得られたのは、ツールバーが
  折り返さなくなったことと、どちらに何が置かれるかの一貫した基準。
