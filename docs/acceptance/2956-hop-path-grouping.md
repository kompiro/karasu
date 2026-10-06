# AT: 交差ホップを同じ stroke の連続区間ごとに 1 本の `<path>` にまとめる

- **日付**: 2026-10-06
- **関連 Issue**: [#2956](https://github.com/kompiro/karasu/issues/2956)（[#2757](https://github.com/kompiro/karasu/issues/2757) から切り出し）
- **設計**: #2956 の Design Doc（案2「同じ stroke の連続区間ごとに 1 本」を採用。実装後に ADR-2956 へ昇格）
- **関連 ADR**: [ADR-1859](../adr/1859-system-view-p2c-grouped-edge-routing-and-marks.md)（交差マークの導入）
- **Related TPLs**: [TPL-2956](../test-perspectives/TPL-2956-regrouping-svg-elements-keeps-paint-order.md)（まとめ直しても描画順を保つ）、[TPL-2631](../test-perspectives/TPL-2631-decoration-must-not-hide-a-crossing-mark.md)
- **対象ファイル**:
  - `packages/core/src/renderer/svg-renderer.ts`（`renderCrossingMarks` / `hopRunKey`）

> ホップを 1 個ずつの `<path>` で出していたのを、元の順番のまま stroke（色と線幅）が同じホップが連続する区間ごとに 1 本の `<path>` にまとめ、各ホップをそのサブパスにする。ホップの幾何と描画順は変えない。

## 受け入れ条件

- [x] AT-A: 同じ stroke のホップが連続すると 1 本の `<path>` になり、サブパスの順は元の順と同じ

  > ✅ Automated — `packages/core/src/renderer/svg-renderer.test.ts` › `crossing hop paths (#2956)` › `draws consecutive hops of one stroke as one <path>, in their original order`

- [x] AT-B: stroke が A, B, A と並ぶと 3 本に分かれる（A を 1 本にまとめない = 描画順を保つ）。線幅だけが違っても分かれる

  > ✅ Automated — `svg-renderer.test.ts` › `crossing hop paths (#2956)` › `starts a new <path> whenever the stroke changes, so A, B, A stays three paths` / `splits on stroke width alone, since width is part of what a hop paints`

- [x] AT-C: まとめた各 `<path>` の `stroke` / `stroke-width` は、その区間のホップの host エッジの stroke と一致する

  > ✅ Automated — `svg-renderer.test.ts` › `crossing hop paths (#2956)` › `paints each path in the stroke of the edges whose hops it holds`

- [x] AT-D: サブパスを順に展開すると、1 個ずつ描いていたときの `d` の列と一致する（回転・`ry` 付きのホップを含む）

  > ✅ Automated — `svg-renderer.test.ts` › `crossing hop paths (#2956)` › `keeps every hop's geometry: the subpaths, in order, are the arcs drawn one by one`

- [x] AT-E: junction chip はホップの後に出る

  > ✅ Automated — `svg-renderer.test.ts` › `crossing hop paths (#2956)` › `still draws the merge marks after every hop`

## 計測（2026-10-06）

変更前の renderer は CI に無いので、変更前後の比較は一度きりの計測として記録する。回帰の柵は AT-D の手書きの `d` の列が担う。変更前は `main` の `dbfb3a52`、どちらも全ビュー bundle を描いた。

**ホップの列とレイヤ外の一致。** ホップのサブパスを展開し、幾何・stroke・順番を変更前と比べた。dify はホップ 38,572 個が順番どおり一致し、`crossing-marks` レイヤの外の SVG もバイト単位で一致した。examples 85 ファイルも全件一致した。

**出力（dify、全ビュー bundle）。**

| | 変更前 | 変更後 |
| --- | --- | --- |
| 出力 | 8.72MB | 6.48MB（−25.6%） |
| `<path>` 要素 | 43,079 | 5,401 |
| ホップの `<path>` 要素 | 38,572 | 894 |
| `crossing-marks` レイヤ | 3.74MB | 1.50MB |
| `DifyDB` 1 枚の表示（Chromium、20 ラウンドの中央値） | 50.5ms | 16.6ms |

**画素の差。** Playwright の Chromium で各ビューを viewBox の 1 単位 = 1 画素で canvas に描き、変更前後を比べた。差はすべてホップの縁のアンチエイリアスだった。

| | 差のあるビュー | 差のある画素 | 同色ホップの重なりの外での最大差 | 重なりの内側での最大差 |
| --- | --- | --- | --- | --- |
| examples 85 ファイル | 357 中 13 | 617 | 5/255 | 25/255 |
| dify | 435 中 34 | 459,424 | 9/255 | 64/255 |

差のある画素の 99.6% は 8/255 未満。設計は「差は同色ホップの重なりの内側に収まる」と見込んでいたが、重なりの外にも差が出た。Chromium は複数のサブパスを持つ 1 本の path を、別々の path とわずかに違うアンチエイリアスで塗る。幾何と順番が同じことは上で確かめてあるので、まとめ方の誤りではない。重なりの内側の大きい差は、設計が見込んでいた「重なった縁を 1 回だけ塗る」差である。色違いのホップの重なり（dify で 10,602 組）は、描画順が変わらないので上下が入れ替わらない。

## 手動確認

N/A — 見た目が変わらないことは上の画素比較で判定した。ホップの構造は自動テストで覆っている
