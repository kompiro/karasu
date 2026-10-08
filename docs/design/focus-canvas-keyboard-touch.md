# focus canvas をキーボードと touch から開く

- **日付**: 2026-10-06
- **ステータス**: 検討中
- **関連**:
  - Issue [#3057](https://github.com/kompiro/karasu/issues/3057)（親の経緯は [#3022](https://github.com/kompiro/karasu/issues/3022)）
  - 関連 ADR: [ADR-3022](../adr/3022-edge-label-disclosure.md)（edge ラベルの段階的開示と focus canvas。「残した問い」の 1 つ目が本件）, [ADR-1411](../adr/1411-app-keyboard-shortcuts.md)（コマンドレジストリ）, [ADR-1421](../adr/1421-app-command-palette.md)（コマンドパレット）, [ADR-1408](../adr/1408-app-outline-view.md)（Outline view）
  - 関連 TPL: [TPL-3022](../test-perspectives/TPL-3022-withheld-content-stays-reachable.md)（省略した全文に到達できる。失敗モード「hover にしか経路が無い」）, [TPL-1419](../test-perspectives/TPL-1419-global-shortcut-text-input-inhibition.md)（テキスト入力中のショートカット）, [TPL-1716](../test-perspectives/TPL-1716-user-facing-surface-docs-sync.md)（利用者向けの操作面と docs の同期）
  - コード: `packages/app/src/components/focus-canvas/`, `packages/app/src/components/NodeDetailPanel.tsx`, `packages/app/src/components/PreviewPane.tsx`

## 背景・課題

focus canvas（ADR-3022）には入口が 2 つあり、どちらもマウスを前提にしている。

- **node の canvas** は、card に hover すると出る `⇄ Relations N` から開く。キーボードには
  hover が無く、touch の端末では pill が出ない。
- **edge の canvas** は線のクリックで開く。touch の tap では開くが、線をクリックできる点が
  1 つも無い edge がある（密な fixture で 41 本中 1 本）。その edge に届くのは node の
  canvas だけで、その入口が hover にしか無い。

開いた後も、focus canvas の中の card や行は SVG の要素で、キーボードでは辿れない。

Issue は「ⓘ の詳細パネルに同じ入口を置く。パネルはキーボードと tap で開ける」としていたが、
調べると前提の半分が違った。**preview に描かれる card と ⓘ は、キーボードで focus できない**
（`tabindex` も `<a>` も持たない。`<a>` を持つのは静的なバンドルの「Back」と org の card の
リンクで、どちらも card の操作ではない）ので、ⓘ もキーボードでは押せない。パネルは touch の経路にはなるが、キーボードの
経路にはならない。

## 現状（インベントリ）

| 経路 | マウス | touch | キーボード |
| --- | --- | --- | --- |
| node を選ぶ | card をクリック | card を tap | Outline view の項目（focus できる。選ぶと preview でハイライトされる） |
| node の詳細パネル | ⓘ / 葉の card をクリック | ⓘ / 葉の card を tap | 無し |
| node の focus canvas | card に hover → `Relations` | 無し | 無し |
| edge の focus canvas | 線をクリック | 線を tap（届かない edge あり） | 無し |
| focus canvas の中の移動 | card / 行をクリック | tap | 無し |
| 閉じる | Close / 背景 / Esc | Close / 背景 | Esc |

キーボードの操作は、コマンドレジストリ（ADR-1411）に `Command` を登録し、コマンドパレット
（ADR-1421、`Ctrl/Cmd+Shift+P`）から一覧・実行できる。

## 制約・前提

- **hover の入口は残す。** マウスでは今の `Relations` が最短で、ユーザーの評価も高い。
  追加する入口は置き換えではなく並べる。
- **キーボードの操作はコマンドレジストリを通す**（ADR-1411）。個別の `keydown` リスナーを
  増やさない。focus canvas の Esc は既に個別リスナーだが、これは開いている間だけの
  overlay 内の操作なので、本件では触らない。
- **新しいキーバインドは docs/tools の英日両方に書く**（`app-shortcut-docs-sync`、
  TPL-1716）。キーバインドを持たないパレット専用のコマンドなら、この同期の対象外。
- **テキスト入力中は発火しない**（TPL-1419）。

## 検討した選択肢

### 案1: パネルと Outline とコマンドで、既存の経路に乗せる

- **touch**: ⓘ の詳細パネル（tap で開く）に `⇄ Relations N` ボタンを置く。押すとその node の
  focus canvas を開く。
- **キーボード**: パレット専用のコマンド「Show Relations of Highlighted Node」を足す。
  対象は preview でハイライトされている node（Outline で選ぶ、ビュー間ナビゲーションで
  移る、などで決まる）。Outline で node を選び、パレットからこのコマンドを実行する。
- **focus canvas の中**: card と、node の canvas の行を `tabindex="0"`・`role="button"`・
  `aria-label` 付きにして、Tab で辿り Enter / Space で押せるようにする。開いたら focus を
  panel に移し、閉じたら開く前の要素に戻す。

**メリット**

- 新しく focus できるようになるのは focus canvas の中だけで、preview 本体の Tab 順は
  変えない。
- どの入口も既存の操作（パネル、Outline、パレット）の延長にある。

**デメリット**

- キーボードでは 3 段（Outline で選ぶ → パレットを開く → コマンド）かかる。

### 案2: preview の card そのものを focus できるようにする

main canvas の全 card に `tabindex` を付け、Tab で card を巡り、Enter で今のクリックと
同じ動作、別のキーで `Relations` を開く。

**メリット**

- 図の上で直接操作でき、段が少ない。

**デメリット**

- 全ビュー（system / deploy / org / ER）の SVG と、その Tab 順に関わる変更になる。
  card が 100 を超える図では Tab で巡るのが現実的でなく、矢印キーでの移動など別の設計が
  要る。core の出力（属性）も変わる。本件の範囲を大きく超える。

### 案3: touch では長押しで pill を出す

**デメリット**

- 見つけにくい。長押しはスクロールや pan と衝突する。キーボードの答えにならない。

### 案4: 専用のキーバインド（例: `Ctrl/Cmd+Shift+R`）

**デメリット**

- 対象の node を決める手段が別に要る点は案1と同じで、得られるのは段を 1 つ減らすこと
  だけ。キーバインドは既存との衝突確認と docs の同期を伴う。まずパレット専用で出し、
  使われ方を見て足す。

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| キーボードで届く | 届く（3 段） | 届く（直接） | 届かない |
| touch で届く | 届く（パネル） | 届く | 届く（見つけにくい） |
| 変更の範囲 | app のみ。focus canvas とパネル | core の出力と全ビュー | app のみ |
| 既存の Tab 順 | 変えない | 変える | 変えない |

## 現時点の方針

**案1 を採る。** 案2 は preview 全体のキーボード操作の設計として別に扱う価値があり、
本件では行わない。

### 決めること

1. **パネルのボタン。** `NodeDetailPanel` に `⇄ Relations N` を置く。`N` は pill と同じ数え方
   （両端が card の edge、self-loop を除く）。0 のときは出さない。押すとパネルを閉じて
   focus canvas を開く。文言は pill と同じ i18n キーを使う。
2. **コマンド。** `view.showRelations`（「Show Relations of Highlighted Node」）をパレット専用で
   登録する。キーバインドは持たない。登録は `PreviewPane` で行う（同時に mount される
   `PreviewPane` は 1 つで、表示中の図と focus canvas の状態を持つのがここだから）。
   - 対象は、ハイライトされた node のうち**いま表示している階層に card があるもの**に限る。
     Outline は全階層の node を並べるので、Outline で深い階層の node を選ぶと、ハイライトは
     付くが canvas に card が無い。このときコマンドは何もしない。
   - キーボードには下の階層へ降りる手段が今は無い（Outline の drill-down はダブルクリック
     だけで、Enter は選択になる）。そのため、キーボードだけで開けるのは表示中の階層の node
     に限られる。この制限は本件では解かず、[#3082](https://github.com/kompiro/karasu/issues/3082)
     で扱う。
   - deploy / org ビューでは、ハイライトの属性が `data-node-id` でない（ADR-2818）ので、
     コマンドは何もしない。focus canvas は system ビュー（各階層）のものとして扱う。
3. **focus canvas の中のキーボード。**
   - 押すと移動する card と、node の canvas の行に `tabindex="0"`・`role="button"`・
     `aria-label` を付ける。card の label は node の名前、行の label は「from → to: ラベル全文」。
     node の canvas の中央の card（いま見ている node）と、edge の canvas の行は、押しても何も
     起きないのでボタンにしない。
   - focus の表示は、card は枠線、行は線とラベルを強調色にする。行の外接矩形は曲線を
     囲むので canvas の大半を覆うことがあり、枠線では何に focus があるか分からない。
   - Enter / Space でクリックと同じ動作（card ならその node へ、行ならその組へ）。
   - 開いたら focus を panel（`tabIndex=-1` の region）に移す。移動（card / 行 / Back）の後も
     panel に戻す。閉じたら、開く前に focus があった要素に戻す（あれば）。
   - Esc は今のまま（入力欄とエディタの中では閉じない）。
4. **touch の中の操作。** tap は今の click で動く。ドラッグの pan は mouse イベントで実装して
   いるが、touch では panel 自身のスクロール（`overflow: auto`）で動く。本件で追加はしない。

### テスト

- component: パネルのボタンで focus canvas が開き、行の数が `N` と一致する。edge が無い node
  ではボタンが出ない。
- component: ハイライトされた node があるときコマンドで開き、無いときは何も起きない。
- component: 開いたら focus が panel にあり、Tab で card と行に届き、Enter で移動し、閉じたら
  元の要素に focus が戻る。
- e2e: キーボードだけで、Outline で node を選ぶ → パレットでコマンド → 開いた canvas で Tab と
  Enter で辿る、を通す。マウスは使わない。ただし fixture の node は root の 1 つ下の階層に
  あり、キーボードで降りる手段は無い（#3082）ので、その 1 手だけは準備としてクリックする。
- e2e（touch）: Playwright の touch エミュレーション（`hasTouch` と `tap`）で、ⓘ を tap → パネルの
  `Relations` を tap → focus canvas が開く、を通す。
- 到達性（TPL-3022）: どの edge も両端の node の canvas に行として載ること（ADR-3022 の
  e2e）と、node の canvas がキーボードで開けること（上の e2e）の組み合わせで、線をクリック
  できない edge の全文にもキーボードで届く。

### AT

`docs/acceptance/edge-label-focus-canvas.md` に AC を足す（新規ファイルにしない。同じ機能の
受け入れ条件なので）。touch の経路は Playwright のエミュレーションで自動化できるので、手動
確認は足さない（`.claude/rules/acceptance.md`「自動テストで判定できる条件は手動項目に写さない」）。

### 影響範囲

- app のみ。core の出力は変えない。
- `docs/tools/app.md` / `app.ja.md` に、パネルのボタンとコマンドを書く（TPL-1716）。
- TPL-3022 のチェックリストに「入口がキーボードと touch からも届く」を足す。

## 未解決の問い / 決めないこと

- preview 本体のキーボード操作（案2）。card を focus できるようにするなら、矢印キーでの
  移動を含めて別 Issue で設計する。
- コマンドにキーバインドを付けるか（案4）。使われ方を見て決める。
- キーボードで下の階層へ降りる手段（Outline で Enter が選択にしかならない）。
  [#3082](https://github.com/kompiro/karasu/issues/3082) で扱う。
- キーボードで node の詳細パネルを開く手段。本件が前提にしかけた経路で、今は無い。
  [#3083](https://github.com/kompiro/karasu/issues/3083) で扱う。本件のコマンドと、対象の
  node の決め方を共有できる。
