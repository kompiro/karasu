---
type: product
---

# AT: team フレームの色を style シートから指定する（#2269）

- **日付**: 2026-08-31
- **関連 Issue**: [#2269](https://github.com/kompiro/karasu/issues/2269)（[#2234](https://github.com/kompiro/karasu/issues/2234) から分離）
- **設計 (ADR)**: [ADR-2269](../adr/2269-team-frame-style-selector.md)
- **Related TPLs**:
  - [TPL-2269](../test-perspectives/TPL-2269-shipped-defaults-must-not-leak-into-a-second-rendering.md)（本 PR の proactive — 出荷側の既定値を 2 つ目の描画面に漏らさない）
  - [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)（1 エンティティの見た目の決定は 1 関数に閉じる）
  - [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（`karasu fmt` の往復）
  - [TPL-1296](../test-perspectives/TPL-1296-spec-doc-reference-data-sync.md)（specificity 表は `reference-data.ts` から生成）
- **対象ファイル**:
  - `packages/core/src/parser/style-parser.ts`（`team#<id>`）
  - `packages/core/src/resolver/style-resolver.ts`（`resolveTeamFrames` と 3 つのノードマッチャ）
  - `packages/core/src/renderer/svg-renderer.ts`（`resolveTeamFramePaint` / `resolveFramePaint`）
  - `packages/core/src/style/serialize.ts`（`formatSelector`）
  - `packages/core/src/builtins/reference-data.ts`（specificity 行）

> team は 1 つのエンティティで、org tree view のカードと system view *Group by: team* の
> フレームはその 2 つの描画である。よって `team` / `#<id>` / `team#<id>` が両方に届く。
> ただし既定値は描画ごとに別で、builtin シートの `team { … }` はカードの既定値なので
> フレームには届かない。

## 受け入れ条件

### AC-1: 名指ししたチームのフレームだけ色が変わる

Issue の受け入れ条件「A style sheet can set a named team's frame colour in the system
view under *Group by: team*, and teams it does not name are unchanged」。

- [x] AT-A: `#<TeamId>` がそのチームのフレームを塗り、他のチームのフレームは変わらない

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `team frame colour from a style sheet (#2269)` › `paints the frame of the team a rule names, and leaves the others alone`

- [x] AT-B: 裸の `team` ルールがすべての team フレームに届く

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `team frame colour from a style sheet (#2269)` › `lets a bare `team` rule reach every frame`

- [x] AT-C: `team#<id>` が裸の `team` に勝つ（101 対 1）

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `team frame colour from a style sheet (#2269)` › `cascades `team#<id>` over `team` at 101 vs 1`

- [x] AT-D: 1 つの宣言がカードとフレームの両方に届く

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `team frame colour from a style sheet (#2269)` › `paints the card and the frame from one declaration (one entity, one appearance)`

### AC-2: 名指ししていないチームは不変

- [x] AT-E: どのシートも名指していない team フレームは控えめな破線の既定のままで、builtin のカード色（`#065F46` / `#D1FAE5` / `#047857` / `#6EE7B7`）が出ない

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `the frame's default is the renderer's, not the built-in sheet's (#2269)` › `leaves an unnamed team's frame in the muted dashed default`

- [x] AT-F: light / dark どちらのテーマでも builtin のカード色がフレームに漏れない

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `the frame's default is the renderer's, not the built-in sheet's (#2269)` › `keeps the built-in card colours out of the frame in both themes`

- [x] AT-G: boundary 軸と team 軸が互いのフレームを塗らない（同名の boundary と team が同居していても）

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `the two group axes do not paint each other's frames (#2269)`（2 ケース）

### AC-3: `#Platform` の既存の意味が変わらない

Issue の受け入れ条件「Whatever `#Platform` means in the org tree view today keeps
meaning it」。id セレクタの短絡撤去が退行を生んでいないことを押さえる。

- [x] AT-H: 裸の `#<id>` が system / deploy / org の 3 ビューに今までどおり届く

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `id selectors narrow rather than short-circuit (#2269)` › `keeps a bare `#<id>` reaching the system, deploy and org views`

- [x] AT-I: `team#<id>` は team で止まり、同名の service / deploy unit には届かない

  > ✅ Automated — `packages/core/src/resolver/style-resolver.test.ts` › `id selectors narrow rather than short-circuit (#2269)` › `stops `team#<id>` at the team, leaving a service and a deploy unit of that id alone`

- [x] AT-J: builtin シートは今までどおり team カードを styling する

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `the frame's default is the renderer's, not the built-in sheet's (#2269)` › `still styles the card from the built-in sheet`

- [x] AT-K: `team#<id>` が `karasu fmt` の往復で裸の `#<id>` に広がらない。あわせて `boundary#<id>` の同じ取りこぼしも直す

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `team#<id> selector (#2269)` › `round-trips through the formatter instead of widening to the bare id`; `packages/core/src/renderer/boundary-style-selector.test.ts` › `boundary#<id> survives the formatter` › `re-emits the id instead of widening to every frame`

### AC-4: どのプロパティがどちらの描画に効くか spec に載っている

Issue の受け入れ条件「`docs/spec/style.md` (+ja) states which properties apply to which
of the two renderings」。

- [x] AT-L: `docs/spec/style.md` と `.ja.md` に「Team frames (*Group by: team*)」節があり、カードとフレームの 2 列でプロパティ表を持つ

  > ✅ Automated — `packages/core/src/builtins/reference-data.test.ts` › `SELECTOR_SPECIFICITY` › `every row's score matches what the style parser computes for its example`（`team#Platform` = 101。表は `pnpm gen:reference` が en / ja に生成する）

- [x] AT-M: 各プロパティが「カード側で塗る部分に対応するフレーム側の部分」に届く

  > ✅ Automated — `packages/core/src/renderer/team-frame-style-selector.test.ts` › `each property lands on the part of the frame it paints on the card (#2269)`（4 ケース）

## 手動確認

前提: app を <https://karasu.kompiro.dev/> で開き、builtin の **Getting Started**
プロジェクト（`index.krs`）を開いて Group by: **Team** にしてある。`default.krs.style` に
次を書く。

```css
#commerce { border-color: #C0392B; }
```

- [ ] 🧑 Manual: `commerce`（コマースチーム）のフレームの輪郭とタイトルが赤系（`#C0392B`）に
      なり、`platform` / `notification` のフレームは控えめな破線グレーのまま変わらない
- [ ] 🧑 Manual: 同じシートのまま Org ビューへ切り替えると、コマースチームの**カード**の
      枠線も同じ赤系になっている（1 つの宣言が 2 つの描画に届いている）
- [ ] 🧑 Manual: `#commerce { background-color: #C0392B; }` に書き換えると、system view の
      フレーム内側が薄い赤に色付き、輪郭は既定のまま。Org ビューのカードは塗りつぶしで赤になる
- [ ] 🧑 Manual: light / dark 両テーマで、指定した色がそのまま出る。指定を消すと両テーマとも
      元の見た目に戻る
- [ ] 🧑 Manual: 色を指定したフレームでも、囲まれたカード・エッジ・タイトル位置が視覚的に
      破綻しない。畳む / 展開しても輪郭が途切れない
