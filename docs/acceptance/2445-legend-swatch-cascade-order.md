# AT: 凡例 swatch がシート横断の宣言順に従う

- **日付**: 2026-08-12
- **関連 Issue**: [#2445](https://github.com/kompiro/karasu/issues/2445)
- **対象ファイル**:
  - `packages/core/src/style/cascade.ts`（新規）
  - `packages/core/src/renderer/svg-builder.ts`
  - `packages/core/src/resolver/style-resolver.ts`
- **関連 AT**: [AT-0833](./0833-diagram-legend.md)（legend 構文の本体）, [AT-0999](./0999-legend-in-use-fallback.md)（in-use フォールバック）, [AT-1001](./1001-icon-mode-legend-color.md)（icon mode の per-property マージ）
- **関連 TPL**: [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)

## 受け入れ条件

- [x] builtin と同 specificity のユーザールール（`usecase { background-color: ... }`）が凡例 swatch でも勝ち、同じ図の中でカード本体と swatch が同色になる
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `lets a user rule outrank the builtin at equal specificity (Issue #2445)`

- [x] タグ ref（`ref [external]`）でも同じくユーザールールが builtin に勝つ
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `lets a user rule outrank the builtin for a tag ref (Issue #2445)`

- [x] アノテーション ref（`ref @deprecated`、builtin は `badge-color` で塗る）でもユーザールールが勝つ
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` › `lets a user rule outrank the builtin for an annotation ref (Issue #2445)`

- [x] シート横断で `sourceIndex` が振り直され、後のシートが同 specificity の tie を取る。builtin シート（キャッシュされた singleton）は mutate されない
  > ✅ Automated — `packages/core/src/style/cascade.test.ts` › `renumbers sourceIndex across sheets so a later sheet sorts last (Issue #2445)` / `does not mutate the input sheets`

- [x] 既存挙動に回帰が無い: icon mode の per-property マージ（#1001）、fill-less kind の border-color swatch（#2421）、in-use フォールバック（#999）、unresolved ref の drop
  > ✅ Automated — `packages/core/src/renderer/legend-footer.test.ts` 全 59 件および `packages/core` 全テストが green

- [ ] app で `.krs.style` の kind 色を編集したとき、カードと凡例 swatch が同時に追従する
  > 🧑 Manual — 本番 app（https://karasu.kompiro.dev/）で `legend service { ref usecase "..." }` を含む `.krs` を開き、`.krs.style` に `usecase { background-color: #123456 }` を書いて、カードと凡例の swatch が同じ色に変わることを確認する。

## 補足

- 根因は `sourceIndex` の採番スコープ。パーサーはシートごとに 0 起点で採番するため、生の値はシート間で衝突する。`resolveStyles` は ADR-8 の決定どおりシート横断で振り直してからソートしていたが、凡例 swatch はカスケードを書き写した際に振り直しを取り込まなかった。builtin シートが先・ユーザーシートが後に並ぶので、同 specificity のときユーザールール（index 0）が builtin（index N）より前に来て、**後勝ちの規則で builtin が勝つ**という逆転が凡例側にだけ発生していた。
- 修正は最小の振り直し追加ではなく、カスケード自体を `packages/core/src/style/cascade.ts` に 1 本化し、resolver と凡例の双方がそれを呼ぶ形にした（TPL-2234）。各面が決めるのは「どのルールが一致するか」だけで、マージ順は共有関数の責務になる。
- `resolveStyles` 内で 7 箇所に重複していた同一のソート + `Object.assign` も同じ関数に置換した（挙動不変）。
