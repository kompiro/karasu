---
id: TPL-2044
title: "SVG の interactive control（back button 等）は不透明背景より後に描いて hit-testable を保つこと"
status: active
date: 2026-07-17
applicable_to:
  - "不透明な背景/canvas rect を含む innerContent と、その上に重ねる clickable control（<a>/ボタン/タブ）を同じ <svg> に直列出力する箇所"
  - "z-index を持たず document order でしか重なり順を決められない inline SVG の合成"
known_consumers:
  - drill-down-svg
discovered_from:
  - issue: "#2044"
  - root_cause_file: "packages/core/src/renderer/drill-down-svg.ts:73"
related_to:
  - TPL-219
  - TPL-1790
topic: renderer
scope:
  packages:
    - core
---

# TPL-2044: SVG の interactive control は不透明背景より後に描いて hit-testable を保つこと

## 観点

SVG は **document order でペイントする**（CSS `z-index` は SVG のジオメトリには
効かない）。したがって、クリック可能な control（`← Back` ボタン・タブ・ツール
バー等）を **不透明な背景 `<rect>` を含む `innerContent` より前に**出力すると、
後から描かれる背景に**上書きされて見えなくなり、`elementFromPoint` が背景 rect を
返すため clickable でもなくなる**。見た目・ヒットテストの両方が死ぬ。

`${control}${innerContent}` は「control を先に描く」= 埋もれる。
`${innerContent}${control}` = control が最後に描かれ、最前面で hit-testable。

#2044 では drill-down の `← Back` が 3 箇所すべてで `${backButton}${innerContent}`
の順に出力されており、level canvas の不透明 rect に埋もれて **Back ナビゲーション
が無効**（AT-0041 / AT-0043 が shipped で false）になっていた。同一パターンが
3 関数（system 直列・bundled dimensions・entity level）に横並びで存在したのが
特徴（[[TPL-219]] 並行関数パリティ）。

## 想定される失敗モード

- 重ねたはずの control が**視覚的に一切見えない**（背景色で塗り潰される）。
- クリックしても何も起きない。Playwright の hit-target 検査で背景 `<rect>` が
  pointer event を intercept する。
- クリック前後のスクリーンショットが pixel-identical（fragment / view が変わら
  ない）＝ ナビゲーションが dead。
- unit で `id` や `href` の**存在**だけを見ると通ってしまい、**重なり順**を検証
  しないため CI をすり抜ける（本件は manual QA checklist に載っていて shipped）。

## チェックリスト

不透明背景を含む `innerContent` の上に control を重ねる `<svg>` を組み立てたら:

- [ ] control（`<a>`/ボタン/タブ群）を `innerContent` の**後**に連結したか
      （`${innerContent}${control}`、`${control}${innerContent}` になっていないか）
- [ ] 同じ control を出力する**並行関数すべて**（standalone / bundled / entity 等）で
      同じ順序不変条件を満たしたか
- [ ] control の位置（例: back button の `<g class="…">` index）が、level canvas の
      先頭 `<rect>` の index より**後**であることを unit で検証したか（存在確認だけで
      終えていないか）

## 既知の対処パターン

`innerSvg = <svg …>${innerContent}${backButton}</svg>` の順に出力する（#2044）。
control を最後に描くことで最前面に来て hit-testable を保つ。`id`/`href` の存在で
なく **canvas rect との document-order 位置関係**をアサートする unit を、control を
出力する各関数（drill-down 標準・bundled・entity）に横展開する。

## 関連テスト

- `packages/core/src/renderer/drill-down-svg.test.ts` — "two-level: back button paints on top of the level canvas rect"（`buildDrillDownSvg`）
- `packages/core/src/renderer/drill-down-svg.test.ts` — "drill-down back button paints on top of the level canvas rect"（`buildAllViewsSvg`）
- `packages/core/src/renderer/drill-down-svg.test.ts` — "entity view back button paints on top of the level canvas rect"（`buildAllViewsSvg` entity level）
- `packages/e2e` — #2049 M1/M2 popup suite（`xfail` → 通常 assertion に反転予定）
