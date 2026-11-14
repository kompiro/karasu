# 複数の variant タグを持つノードは、最初のタグの組み込みルールだけで描く

- **日付**: 2026-11-14
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3775](https://github.com/kompiro/karasu/issues/3775)（multi-variant の resource が Outline と違うアイコンを描く）, [#3776](https://github.com/kompiro/karasu/issues/3776)（first-match の段階が author の明示した variant アイコンを上書きする）
  - 関連 ADR: [ADR-1415](../adr/1415-outline-icon-variants.md)（Outline は `iconNameForNode` で variant を解決し、client は `tags` 順の first-match にする）, [ADR-351](../adr/351-resource-shape-and-infra-icon-mode.md)（resource のタグ → shape）, [ADR-8](../adr/8-builtin-style-and-reference.md)（組み込みシートが先、author のシートが後）
  - 関連 TPL: [TPL-1415](../test-perspectives/TPL-1415-shared-vocabulary-dual-representation.md)（解決順序が表現間で一致するか。項目 6 のガードが resource を例外にしている）, [TPL-1001](../test-perspectives/TPL-1001-display-mode-cross-surface.md)（表示モードの precedence）, [TPL-2234](../test-perspectives/TPL-2234-one-entity-one-appearance-resolver.md)（1 つのエンティティの見た目は 1 つの関数で決める）
  - コード: `packages/core/src/builtins/icon-theme.ts`, `packages/core/src/resolver/style-resolver.ts`, `packages/core/src/builtins/default-style.ts`

## 背景・課題

`resource` と `client` は、タグで variant を選ぶ kind である（resource は `table` / `queue` / `api` / `storage`、client は form-factor の 7 つ）。1 つのノードに variant タグを 2 つ以上書いたとき、どの variant で描くかが表示面ごとに違う。

main（28f790cb）で `resource Orders [table, api]` を描いた結果:

| 表示面     | 解決の仕方                                                                                                                   | 描かれるもの     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| shape mode | カスケード。`resource[table]` と `resource[api]` は同じ詳細度（11）なので、組み込みシートで後に書いた `resource[api]` が勝つ | hexagon（api）   |
| icon mode  | カスケード。icon theme で後に書いた `resource[api]` が勝つ                                                                   | `api` アイコン   |
| Outline    | `iconNameForNode`。`tags` 順で最初の variant                                                                                 | `table` アイコン |

client だけは icon mode と Outline が一致している。style resolver がカスケードの後に `applyVariantFirstMatch` を走らせ、解決した `shape` が variant のアイコンなら、最初のタグのアイコンに書き換えるからである。この段階を resource に広げる試みは、shape mode が後に書いた variant のまま残り、icon mode と shape mode が食い違うので取り下げた（#3775 の本文）。

この後段の書き換えは #3776 も生む。書き換えの条件は「解決した値が variant のアイコンの URL かどうか」で、値がどのルールから来たかを見ない。author が `#App { shape: url("client-desktop"); }`（詳細度 101）で `client App [mobile, desktop]` に desktop のアイコンを指定すると、カスケードは author の値を選ぶが、後段がそれを mobile に書き戻す。

## 現状（インベントリ）

| 観点                 | 現状                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| variant の語彙       | `ICON_RULES`（`icon-theme.ts`）の `resource-variant` と `client-variant`。`VARIANT_ICONS_BY_KIND` が kind ごとの `tag → icon` に畳む                                         |
| icon mode のルール   | `ICON_RULES` から生成した icon theme（`ICON_THEME_SHEET_ID`）。表示モードのシートとして author のシートの後に積む（`withDisplayModeSheet`）                                  |
| shape mode のルール  | 組み込みシート（`BUILTIN_SHEET_ID`、dark と light の 2 本）の `resource[table] { shape: cylinder; }` など 4 行。client の variant ルールは無い                               |
| 後段                 | `applyVariantFirstMatch`。client だけを書き換える（`FIRST_MATCH_VARIANT_KINDS`）                                                                                             |
| Outline              | `iconNameForNode`。`tags` 順の first-match（ADR-1415）                                                                                                                       |
| ガード               | `icon-theme.test.ts` が、variant の全組み合わせでカスケードと `iconNameForNode` が一致するかを見る。resource は `CASCADE_ORDER_KINDS` で例外にし、一致したら落ちる検査を持つ |
| 組み込みシートの区別 | `NON_AUTHOR_SHEET_IDS`（組み込みシートと icon theme の `sheetId`）                                                                                                           |

`examples/` と docs の `.krs` には、variant タグを 2 つ以上持つ resource も client も無い。

## 制約・前提

- icon mode・shape mode・Outline が、同じノードに同じ variant を選ぶ（TPL-1415、TPL-1001）。
- author のルールは、組み込みのルールに対して今と同じ強さを保つ。単一の variant タグのノードで author が勝つ場面では、複数の variant タグのノードでも勝つ（#3776）。
- variant の語彙は `ICON_RULES` の 1 か所から導く。shape mode の 4 行を別の表に写さない。
- `iconNameForNode` の規則（最初のタグ）は ADR-1415 の決定で、変えない。
- out of scope: 1 つのノードに variant タグを 2 つ書くことへの診断。syntax.md は「form-factor タグは 1 つに留める」を推奨するだけで、書くこと自体は許している。

## 検討した選択肢

### 案1: カスケードの同点を、ノードのタグの順で決める

詳細度が同じルールの勝ち負けを、宣言順ではなく「ノードの `tags` で先に書いたタグを名指すルールが勝つ」で決める。

**メリット**

- 後段が要らない。shape mode と icon mode が同じ規則に乗る。

**デメリット**

- author のルールにも効く。`resource[api] { color: red; }` と `resource[table] { color: blue; }` を書いた author にとって、今は後に書いた方が勝つ（CSS と同じ。style.md「When scores are equal, the later declaration wins」）。それが `[table, api]` のノードでだけ逆になる。仕様に例外を 1 つ足すことになる。
- 同点の規則はカスケードの中心にあり、node・edge・deploy・org のどれにも効く。variant の問題は node の 2 つの kind にしか無いのに、変更の範囲がカスケード全体に広がる。

### 案2: 後段を resource に広げ、shape mode の variant も書き換える

`applyVariantFirstMatch` に、各 variant タグの組み込みの shape（`table` → cylinder など）を持たせ、shape mode でも書き換える。

**メリット**

- 変更が後段に閉じる。

**デメリット**

- shape mode の 4 行を、後段の中にもう 1 つ写すことになる（TPL-1415 の二重表現）。
- 「解決した値が variant の値なら書き換える」という判定のままなので、#3776 が残り、resource にも広がる。author が `#Orders { shape: hexagon; }` と書いた `[table, api]` のノードも cylinder に書き戻される。値で出どころを推測する限り、author の値と組み込みの値を区別できない。

### 案3: 負けた variant の組み込みルールを、カスケードに入れる前に外す

ノードが持つ variant タグのうち、最初の 1 つ以外を「負けたタグ」とする。style resolver はノードに一致したルールから、組み込みシート（`NON_AUTHOR_SHEET_IDS`）のルールで負けたタグを名指すものを外し、残りをいつも通りカスケードにかける。

`resource [table, api]` では、組み込みシートの `resource[api]` と icon theme の `resource[api]` が外れ、`resource[table]` だけが残る。shape mode は cylinder、icon mode は `table`、Outline は `table` になる。

**メリット**

- 1 つの規則が両方の表示モードに効く。shape mode のルールも icon theme のルールも、同じ組み込みシートのルールとして外れるので、shape の値を別に持たない。
- 値を見ずに、ルールの出どころ（`sheetId`）で決める。author のルールは外れないので、author の宣言は単一タグのノードと同じ強さで勝つ。#3776 が直る。
- 後段（`applyVariantFirstMatch`）が無くなり、カスケードの後で値を書き換える処理が 1 つ減る（TPL-2234）。

**デメリット**

- 組み込みシートに、variant タグと別のタグを組み合わせたルール（例 `resource[api][external]`）を足すと、それも外れる。今はそのようなルールは無い。足すときは「負けた variant のルール」として外れるのが意図どおりかを決める必要がある。

## 比較

| 観点                          | 案1                | 案2                                          | 案3                     |
| ----------------------------- | ------------------ | -------------------------------------------- | ----------------------- |
| icon / shape / Outline の一致 | する               | する                                         | する                    |
| author のルールへの影響       | 同点の規則が変わる | variant の値なら書き戻される（#3776 が残る） | 無い                    |
| variant の語彙の持ち方        | 1 か所             | shape を後段に写す                           | 1 か所                  |
| 変更の範囲                    | カスケード（全面） | 後段                                         | resolver のルールの選別 |

## 現時点の方針

**案3 を採用する** — 組み込みのルールだけを対象にすれば、author のルールとカスケードの規則に触れずに、3 つの表示面を最初のタグにそろえられる。値ではなく出どころで決めるので、#3776 も同じ変更で直る。

### 挙動の変化

| ノード                                                                           | 表示モード   | 今              | 変更後           |
| -------------------------------------------------------------------------------- | ------------ | --------------- | ---------------- |
| `resource [table, api]`                                                          | shape        | hexagon         | cylinder         |
| `resource [table, api]`                                                          | icon         | `api`           | `table`          |
| `resource [api, table]`                                                          | shape / icon | hexagon / `api` | 変わらない       |
| `client [mobile, desktop]` に author の `#App { shape: url("client-desktop"); }` | shape / icon | `client-mobile` | `client-desktop` |
| variant タグが 1 つ以下のノード                                                  | すべて       | —               | 変わらない       |

### 実装の指針

1. `icon-theme.ts` に `losingVariantTags(kind, tags)` を置く。`VARIANT_ICONS_BY_KIND` から、`tags` に現れる variant タグの集合から最初の 1 つ（`tags` 順）を除いたものを返す。`[table, api, table]` では `api` だけが負けたタグで、勝った `table` は位置にかかわらず負けたタグに入らない。`applyVariantFirstMatch` と `FIRST_MATCH_VARIANT_KINDS` は消し、後段に触れている JSDoc（`VARIANT_ICONS_BY_KIND`・`iconNameForNode`・`CLIENT_SUBTYPE_TAGS`）を新しい規則に合わせる。`ICON_THEME_STYLE_SOURCE` の「Applied before user stylesheets」も、author のシートの後に積む `withDisplayModeSheet` と食い違っているので直す。
2. `resolver/variant-rules.ts` に `withoutLosingBuiltinVariants(node, rules)` を置き、`NON_AUTHOR_SHEET_IDS` のルールで負けたタグを名指すものを外す。`non-author-sheets.ts` は `icon-theme.ts` を import しているので、循環を避けて resolver 側に置く。
3. `style-resolver.ts` の `mergeMatchingProperties` が、一致したルールをこの関数に通してから `mergeInCascadeOrder` に渡す。後段の呼び出しは消す。
4. テスト:
   - `icon-theme.test.ts` の `CASCADE_ORDER_KINDS` と「still needs its exemption」のテストを消す（resource を外すと表が空になる）。既存の parity テストが resource の全組み合わせを、icon mode のカスケードと `iconNameForNode` で比べるようになる。
   - shape mode でも、variant の全組み合わせで「最初のタグの単一 variant と同じ shape になる」ことを確かめる。組み合わせは `ICON_RULES` から生成する。
   - author の id セレクタで variant を指定したノードで、全組み合わせについて author の値が勝つことを確かめる（#3776）。
   - 組み込みシートの variant ルールが、`VARIANT_ICONS_BY_KIND` の語彙の外のタグを使っていないことを確かめる（shape mode の 4 行と `ICON_RULES` の一致）。
5. spec: `docs/spec/syntax.md` / `syntax.ja.md`（client の form-factor）と `docs/spec/tags-annotations.md` / `tags-annotations.ja.md`（resource の shape タグ）に、「variant タグを 2 つ以上書いたノードは、最初のタグで描く。shape mode・icon mode・Outline で同じ」を 1 文ずつ足す。
6. TPL: #3776 は「カスケードの後で値を書き換える処理が、値の出どころを見ずに author の宣言を上書きする」型で、3-Yes ルールに当たるかを実装の PR で判断する。当たれば retrospective TPL を起こし、4 の author のテストをガードにする。
7. changeset: `@karasu-tools/core` と `karasu` に patch。
8. AT: 人間が確かめる項目は無い（描画の結果は 4 のテストで自動で確かめる）。
9. ADR 昇格: 実装の後、`docs/adr/3775-variant-first-tag-wins.md` に昇格し、本 Design Doc を削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: variant タグを 2 つ以上書いた resource の描画が、後に書いた組み込みルールの variant から最初のタグの variant に変わる。`examples/` と docs には該当が無い。
- ドキュメント更新: 上の 5。
- テスト・examples への影響: `icon-theme.test.ts` の例外が無くなる。examples の描画は変わらない。

## 未解決の問い / 決めないこと

- variant タグを 2 つ以上書くことへの診断は決めない（制約・前提）。
