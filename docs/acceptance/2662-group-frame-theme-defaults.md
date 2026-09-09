---
type: product
---

# AT: スタイル未指定のコンテナ枠がテーマの色で描かれる（#2662）

- **日付**: 2026-09-07
- **関連 Issue**: [#2662](https://github.com/kompiro/karasu/issues/2662)（[#2660](https://github.com/kompiro/karasu/pull/2660) / ADR-2269 のレビューで発見）
- **Related TPLs**: [TPL-2662](../test-perspectives/TPL-2662-themed-surface-fallback-comes-from-palette.md)（本 Issue から抽出）、[TPL-2366](../test-perspectives/TPL-2366-badge-color-canvas-contrast.md)（canvas 上の文字色をテーマごとに機械検証）、[TPL-1666](../test-perspectives/TPL-1666-style-lookup-matches-layout-id-form.md)（`?? default` の silent fallback）
- **対象ファイル**:
  - `packages/core/src/renderer/svg-renderer.ts`（`containerStyleOf`）
  - `packages/core/src/renderer/palette.ts`（`textPrimary` / `mutedBorder` の role 定義）

> どのルールも塗らなかったコンテナ枠は、カスケードのベース style（`DEFAULT_NODE_STYLE`）から色を取っていた。これは「暗い塗りの上の明るいラベル」というカード用の既定であり、dark palette 固定でもある。塗りの無いフレームにその前提は成立せず、light テーマでは白 canvas 上にほぼ白のタイトル（`#F9FAFB`、合成後 1.03:1）を描いていた。枠の色は chrome palette の role（`textPrimary` / `mutedBorder`）から取る。フレームは chrome であり、built-in シートは意図的にそこへ届かない（ADR-2269 / `docs/spec/style.md` § Team frames「各レンダリングは自分の既定を持つ」）ため、既定はノードのカスケードではなく chrome 側にある。同じ 2 つの role は `org-tree-renderer.ts` の `treeDefaults` が同じ用途に名指ししており、新しい組み合わせではない。

## 受け入れ条件

### AC-1: 未指定のコンテナ枠が両テーマで palette の色を描く

- [x] AT-A: *Group by: team* の team frame（合成 id `__group_payments__`）が、dark / light それぞれで `palette.mutedBorder` の outline を描く

  > ✅ Automated — `packages/core/src/renderer/container-frame-theme-defaults.test.ts` › unpainted container frames take the theme's chrome (dark|light, #2662) › the team frame outlines in the palette's muted border

- [x] AT-B: 同じ frame のタイトルが、dark / light それぞれで `palette.textPrimary` を描く

  > ✅ Automated — 同ファイル › the team frame titles in the palette's primary text

- [x] AT-C: ghost ancestor container（実 id `Shop`。どのルールも塗らない `system` kind）も同じく両テーマで palette の色を描く

  > ✅ Automated — 同ファイル › the ghost ancestor outlines in the palette's muted border / titles in the palette's primary text

- [x] AT-D: どちらの frame にも dark カード既定（`#F9FAFB` / `#4B5563`）が残らない

  > ✅ Automated — 同ファイル › the team frame|ghost ancestor carries none of the dark card default

- [x] AT-E: 減光は色ではなく opacity が担う。frame は従来どおり `opacity="0.7"` のまま

  > ✅ Automated — 同ファイル › the team frame|ghost ancestor stays muted rather than lifting to full strength

### AC-2: フォールバックであってオーバーライドではない

- [x] AT-F: `team#payments { border-color; color }` を書いた frame は、両テーマで作者の色を描く（palette の色は現れない）

  > ✅ Automated — `packages/core/src/renderer/container-frame-theme-defaults.test.ts` › the frame's theme colours are a fallback, not an override (#2662) › an author's frame colours still win in the dark|light theme

- [x] AT-G: built-in シートが塗る kind のコンテナ（`service Orders`）は、両テーマでそのルールの色のまま。フォールバックは届かない

  > ✅ Automated — 同 describe › a container a rule paints keeps that rule's colours in both themes

- [x] AT-H: ベース値と同じ色（`#F9FAFB` / `#4B5563`）を明示的に書いたルールも、両テーマでそのまま描かれる。判定は解決済みの値ではなくカスケードが適用したプロパティで行う

  > ✅ Automated — 同 describe › keeps a rule that names the base colours themselves (dark|light theme)

### AC-3: タイトルが合成後もコントラストを満たす

- [x] AT-I: frame タイトルを `MUTED_FRAME_TITLE_OPACITY` で合成した色が、両テーマで canvas に対し WCAG AA（4.5:1）以上

  > ✅ Automated — `packages/core/src/builtins/default-style-contrast.test.ts` › group frame title (dark|light theme) › stays AA-legible on the bare canvas

- [x] AT-J: boundary frame の tint が乗った canvas 上でも同じく 4.5:1 以上（team frame と boundary frame は同じセルを覆いうる）

  > ✅ Automated — 同 describe › stays AA-legible over the %s boundary tint

- [x] AT-K: 「muted な要素だから muted な色」を選ぶと AA を割ることが固定されている（後日の整理で `textMuted` に倒す変更はここで落ちる）

  > ✅ Automated — 同 describe › would not clear AA if the title took the muted text role instead

### AC-4: 実機での可読性

- [ ] AT-L: app を light テーマにして *Group by: team* を有効にすると、frame のタイトルと破線 outline が白い canvas 上で読める（枠が主張しすぎず、カードより後退して見える）

- [ ] AT-M: 同じモデルを dark テーマで開くと、frame の見え方が従来と変わらない（タイトルの明るさ・outline の弱さが以前と同等）
