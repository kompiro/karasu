# AT-2420: ノードの右上コーナーレーン（インセットチップ + ライブビューア限定ボタン）

- **日付**: 2026-08-11
- **Issue**: [#2420](https://github.com/kompiro/karasu/issues/2420)（親: [#2366](https://github.com/kompiro/karasu/issues/2366) スライス A）
- **設計**: [#2417](https://github.com/kompiro/karasu/pull/2417) の node chrome design（H-1 案A。ADR 昇格は 3 スライス完了後）
- **関連 ADR**: [ADR-1821](../adr/1821-layer-toggles.md)（対話クロームは `interactive` のときだけ描く）、[ADR-650](../adr/650-graphical-diff-viewer.md)（`data-node-badge` / `data-diff-state` の diff 契約）
- **Related TPLs**: [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（surface 間の一貫性。export SVG も静的レンダと一致させる）、[TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md)（バッジ色のコントラスト機械検証）、[TPL-2044](../test-perspectives/TPL-2044-svg-interactive-control-paints-last.md)
- **対象**: `packages/core/src/renderer/corner-lane.ts`、`packages/core/src/renderer/svg-renderer.ts`、`packages/app/src/utils/download-svg.ts`、`packages/vscode/src/preview-panel.ts`

## 概要

右上角を欲しがる 3 要素（info ボタン / deploy ボタン / アノテーションチップ）を
**1 本の右詰めレーンの住人**にした。各要素は自分より右の住人の占有幅ぶんオフセット
して置かれるため、重なりは描画順や z-order ではなく幾何として起こらない。

アノテーションバッジはカード外に浮く円から、カード内側のピル（インセットチップ）に
なった。i / D ボタンは押せる面（app のライブプレビューと VS Code webview）でのみ描く。

チップのラベル色は白と濃インクのうちピル色に対してコントラストが高い方を選ぶ。
badge-color は「テーマの canvas 上で読める色」として選ばれており、その**上に**白を
載せると dark テーマの 20 色すべてが 4.5:1 を割るため。

## 受け入れ条件

### AC-1: レーンの住人は重ならない

> ✅ Automated by `packages/core/src/renderer/corner-lane.test.ts` (suite-wide)

- [x] ボタン 0 / 1 / 2 個 × ラベル長（空・1 文字・短・長・日本語長文）の全組合せで、住人の矩形が重ならない
- [x] 住人はすべてカード矩形の内側に収まる（カード幅 120 / 160 / 200 / 320）
- [x] 右詰め順は `[i] [D] [chip]`、ギャップ 4px、上マージン 8px

### AC-2: チップは elide するが clip しない

> ✅ Automated by `packages/core/src/renderer/corner-lane.test.ts` (suite-wide)

- [x] ピル幅は描画するテキストの実測幅 + パディング以上（ラベルがピル縁で切れない）
- [x] ラベルはカード幅の 40% を超えると省略記号付きで elide される
- [x] 省略後に 2 文字も残らない狭さではラベルを落としてグリフだけにする（グリフの無いスタイルではラベルを残す）

### AC-3: i / D ボタンはライブビューア限定

> ✅ Automated by `packages/core/src/renderer/svg-renderer.test.ts` (suite-wide)

- [x] 静的レンダ（`nodeControls` 未指定）に `data-info-button` / `data-deploy-button` / `krs-node-controls` が出ない
- [x] `nodeControls: true` では両ボタンが出て、`class="krs-node-controls"` を持つ
- [x] 静的レンダでもアノテーションチップ（`data-node-badge`）は残る — チップは content であってクロームではない

### AC-3b: ボタンを扱う surface はすべて opt-in している

> ✅ Automated by `scripts/lint/node-controls-opt-in.test.ts` (suite-wide)

- [x] app（`useSystemView.ts`）と VS Code webview（`preview-panel.ts`）の双方が `nodeControls: true` を渡す
- [x] 各 surface が実際に処理する属性を個別に検査する（app は `data-info-button` / `data-deploy-button` の両方、VS Code webview は `data-info-button`。D のクリックは webview ではノード既定のハンドラに落ち、詳細パネルの「Open Deploy View」に繋がる — ゲート導入前からの挙動）

> `nodeControls` を `interactive` と分けているのは、VS Code webview が
> `data-info-button` は扱うがカテゴリ collapse は実装していないため。1 つの
> フラグに畳むと、webview から ⓘ を奪うか、押しても何も起きない ⊖ を与えるかの
> どちらかになる。

### AC-3c: レーンはシェイプの描画輪郭の内側に座る

> ✅ Automated by `packages/core/src/renderer/corner-lane.test.ts` (suite-wide)

- [x] シェイプの top inset が与えられたとき、レーンはその content 上端に**下端**を合わせて置かれる（輪郭からはみ出さず、かつ 1 行目のテキスト帯にも入らない）
- [x] right inset のぶんだけレーンが左に寄る
- [x] inset が既定マージン未満なら無視される（box カードの見え方は不変）
- [x] `user` カード（メダリオン帯のぶん描画上端が bbox より下）で ⓘ がカード上辺の外に出ない — `packages/core/src/renderer/svg-renderer.test.ts`

### AC-3d: deploy ビューにもボタンが出る

> ✅ Automated by `packages/core/src/renderer/owner-affordance-kinds.test.ts` (suite-wide)

- [x] `diagramType: "deploy"` + `nodeControls: true` で deploy unit カードに ⓘ が出る（deploy は別の render 呼び出しなので取りこぼしやすい）
- [x] `nodeControls` なしの deploy レンダにはボタンが出ない

### AC-4: Export SVG がライブのボタンを持ち出さない

> ✅ Automated by `packages/app/src/utils/download-svg.test.ts` (suite-wide)

- [x] `stripInteractiveChrome` が `krs-node-controls` を除去する
- [x] 同じ SVG のアノテーションチップとカード本体は残る

### AC-5: diff 意味論の維持

> ✅ Automated by `packages/core/src/renderer/svg-renderer.test.ts` (suite-wide)

- [x] アノテーション追加で `<g data-node-badge data-diff-state="added">`、入れ替えで `changed`
- [x] 最後のアノテーションが消えたノードの ghost チップは `data-diff-state="removed"` を保ち、旧来の浮いた位置ではなくレーン内（カード内側）に描かれる
- [x] diff の ring を描く CSS は app 側（`diff.css`）と単体 SVG 側（`diff-style.ts`）の双方でピル（`rect`）を対象にしている

### AC-6: チップのラベルが AA を満たす

> ✅ Automated by `packages/core/src/builtins/default-style-contrast.test.ts` (suite-wide)

- [x] builtin の badge-color 全件 + palette fallback について、選ばれたインクとピル色のコントラストが 4.5:1 以上（dark / light 両テーマ）
- [x] インク選択が成り立たない色（`badge-color: yellow` など 6 桁 hex 以外）ではピルを塗らず、輪郭 + badge-color の文字にフォールバックする — `packages/core/src/renderer/corner-lane.test.ts`

### AC-7: 手動確認（実機）

判定に実機が要るものだけを残す。重なり・clip・ボタンの有無・コントラスト比は
AC-1〜AC-6 の自動テストが判定済みなので、ここには書かない。実フォントの字幅
（自動テストは `estimateTextWidth` の推定値で判定する）と、拡張ホスト上の挙動が
残る。

- [ ] https://karasu.kompiro.dev/ でアノテーション付きカードを表示し、実フォントでもチップのラベルがピルからはみ出していない（推定字幅と実測字幅のずれ）
- [ ] app の「Export SVG」で保存したファイルを開き、i / D ボタンが無くチップが残っている
- [ ] VS Code 拡張のプレビューでカードの ⓘ を押すと従来どおり詳細パネルが開く
