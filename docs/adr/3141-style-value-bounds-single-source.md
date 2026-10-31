---
id: ADR-3141
title: スタイル値の範囲はスキーマ 1 か所に置き、スキーマを満たさない著者の宣言は cascade で 1 回捨てる
status: accepted
date: 2026-10-31
topic: styling
refines: [ADR-969, ADR-1737, ADR-1184]
related_to: [ADR-1178, ADR-3022]
scope:
  packages: [core, i18n, cli]
assumptions:
  - "symbol: packages/core/src/style/value-validator.ts :: satisfiesPropertySchema"
  - "symbol: packages/core/src/style/cascade.ts :: flattenSheetsInCascadeOrder"
  - "symbol: packages/core/src/builtins/non-author-sheets.ts :: NON_AUTHOR_SHEET_IDS"
  - "grep: packages/core/src/style/property-schema.ts :: kind: \"sequence-of\""
  - "grep: packages/core/src/style/property-schema.ts :: \"grid-columns\": \\{ kind: \"number\", min: 1, integer: true \\}"
  - "file: docs/test-perspectives/TPL-3141-style-diagnostic-describes-drawing.md"
  - "file: docs/acceptance/3141-style-value-bounds.md"
---

# ADR-3141: スタイル値の範囲はスキーマ 1 か所に置き、スキーマを満たさない著者の宣言は cascade で 1 回捨てる

- **日付**: 2026-10-31
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3141](https://github.com/kompiro/karasu/issues/3141)（発見元 #3032 / PR #3130）。Design Doc PR #3323、実装 PR #3409
  - 本 ADR が一部を変える ADR: [ADR-969](969-style-column-layout-hint.md)（`style-column-invalid-value` を廃止）、[ADR-1737](1737-balanced-grid-sibling-layout.md)（`style-grid-columns-invalid-value` を廃止）、[ADR-1184](1184-edge-label-position-offset.md)（`label-position` の範囲外を clamp しない）
  - 維持する ADR: [ADR-1178](1178-style-value-diagnostics.md)（値の診断は validator に一本化、builtin は検査しない）、[ADR-3022](3022-edge-label-disclosure.md)（`label-max-chars`）
  - TPL: [TPL-3141](../test-perspectives/TPL-3141-style-diagnostic-describes-drawing.md)（proactive）、[TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)
  - AT: [AT-3141](../acceptance/3141-style-value-bounds.md)
  - コード: `packages/core/src/style/property-schema.ts`、`packages/core/src/style/value-validator.ts`、`packages/core/src/style/cascade.ts`、`packages/core/src/parser/style-parser.ts`、`packages/core/src/resolver/style-resolver.ts`、`packages/core/src/builtins/non-author-sheets.ts`

## 背景

範囲を持つスタイル値の許容範囲が 3 か所に書かれていて、互いに食い違っていた。

1. `PROPERTY_SCHEMAS`（validator が読む表）
2. validator の判定（`collectMismatch`）
3. resolver のプロパティごとの手書きのガード（`nonNegativeLength`、`opacity` の `0..1`、`label-position` の clamp、`grid-columns` の正の整数判定など）

その結果、著者が見る診断が描画を説明しなかった。ノード 2 つとエッジ 1 本のモデルで測った例:

| スタイル | 診断 | 描かれるもの |
| --- | --- | --- |
| `edge { label-position: -0.5; }` | `style-invalid-enum-value`（許容 `start / middle / end`） | ラベルが始点に寄る（`label-position: 0` と同じ） |
| `edge { label-max-chars: 0; }` | `style-invalid-enum-value`（許容 `none`） | 既定（48） |
| `service { grid-columns: -2; }` | `style-out-of-range` 1 件 + `style-grid-columns-invalid-value` がノードごとに 1 件（計 3 件） | 既定 |
| `service { grid-columns: 2.5; }` | `style-grid-columns-invalid-value` がノードごと（validator は通す） | 既定 |

食い違いは 5 種類あった。

- **union は最初の枝の診断を出す。** `label-position` と `label-max-chars` は `keyword | number` の union なので、範囲外の数値が「キーワードではない」と報告され、範囲が示されなかった
- **範囲外の扱いがプロパティごとに違う。** 警告文はすべて「— ignored」と書くが、`label-position` だけは clamp して描き、他は既定に戻していた
- **同じ宣言を 2 層が報告する。** validator は宣言ごとに 1 回、resolver は該当ノードごとに 1 回出していた
- **validator が「無視する」と言う値を resolver が描く。** 単位の無い長さ（`stroke-width: 4`）、`12pt` のような許されない単位、不正な hex、`url()` で包まない登録済みアイコン名は、「— ignored」と報告されながら描かれていた
- **parser が値を分類できない宣言は検査を素通りする。** カンマの無い複数の値（`opacity: -0.5 0.2`、`label-offset: 0 8px`、`font-family: Noto Sans`）は値ノードが作られず、validator は何も言わず、resolver が文字列を自分で読んでいた

再発の構造も見えていた。#3130 が length に `min` を足したとき、同じガードを resolver 側の 5 プロパティへ手で足す必要があり、初版は `opacity` を漏らした（負の opacity でノードが消え、警告は「無視した」と言っていた）。範囲を 1 つ足すたびに 2 か所を編集し、両者の一致を見るものが無かった。

## 決定

**範囲は `PROPERTY_SCHEMAS` にだけ置く。著者のシートでスキーマを満たさない宣言は、`flattenSheetsInCascadeOrder` が cascade の前に外し（書かれなかったものとして扱う）、診断は validator が宣言の位置で 1 回だけ出す。**

細部は次のとおり。

1. **範囲外の値は捨てる（clamp しない）。** `label-position` の clamp をやめ、全プロパティで警告文の「— ignored」を本当にする。弱いルールに同じプロパティの有効な値があればそれが効く（CSS と同じ）。`docs/spec/style.md` は値の節の 1 文にまとめ、プロパティごとの個別規則はそこへの参照にした
2. **union は数値に対して数値を読む枝の診断を出す。** 値が数値で number / length の枝があれば、その枝の失敗（`style-out-of-range`、`min` / `max` 付き）を報告する。許容には union の全枝を並べる
3. **整数のプロパティはスキーマが整数を要求する。** `grid-columns` と `label-max-chars` の number spec に `integer: true` を付ける。整数でない値は `style-invalid-enum-value` で報告し、新しい診断コードは足さない
4. **karasu が同梱するシートからは捨てない。** cascade は ADR-1178 の信頼境界を、シートの位置ではなく各ルールの `sheetId` で判定する（validator の側は従来どおり `sheets[0]` を検査しない。icon theme は validator に渡らない）。`BUILTIN_SHEET_ID` / `ICON_THEME_SHEET_ID` は `builtins/non-author-sheets.ts` の `NON_AUTHOR_SHEET_IDS` に置き、resolver と cascade が同じ集合を読む。icon theme は著者のシートの後に足されるので、位置では判定できない。builtin が単位なしで書く長さはそのまま効く
5. **単位の無い `0` は長さとして有効にする。** CSS と同じく `border-width: 0` は `0px` と読む。それ以外の単位の無い数値・許されない単位・不正な hex・`url()` で包まないアイコン名は捨てる
6. **値を分類できない宣言も、報告元を決めてから捨てる。** parser は空白区切りの複数の値を `sequence` の値ノードにし（カンマ区切りの各項目の中でも同じ）、スキーマに `ident` と `sequence-of` を足した。列を受けるのは `label-offset`（長さ 1 つか 2 つ。3 つ以上は宣言全体を拒否し、先頭 2 つだけを使わない）と `font-family` の各項目（引用符の無い複数語の名前）だけで、ほかのプロパティでは型の不一致として報告する。値として持てないトークン・空の値・空のカンマ項目は parser が `style-token-type-mismatch` で拒否する。既知のプロパティで値ノードの無い宣言が残れば validator が報告し、cascade が外す。報告せずに捨てる経路は作らない
7. **`style-column-invalid-value` と `style-grid-columns-invalid-value` を廃止する。** 不正な `column` / `grid-columns` は validator の診断（`style-invalid-enum-value` / `style-out-of-range`）が宣言の位置で 1 件出し、resolver はノードごとの警告を出さない。ADR-969 / ADR-1737 のうち、この 2 つの警告を決めた部分だけを変える
8. **resolver は範囲を持たない。** 範囲のガードと `label-position` の clamp を外し、数値については有限かどうかの parse だけを残す（builtin の単位なしの長さを読むため）。キーワードや shape の照合（`column`、`direction`、`shape` など）は resolver に残る

捨てる対象は、既知のプロパティで値がスキーマを満たさない宣言に限る。次は捨てない。

- **未知のプロパティ**: 警告だけで宣言は残す（ADR-1178 の forward compat）。`satisfiesPropertySchema` は未知のプロパティに `true` を返す
- **未登録のアイコン名を包んだ `url("<name>")`**: 値としては構造上正しいので、`style-unknown-icon` の警告だけで残し、描画は `box` に落ちる
- **値は正しいがビューで効かない宣言**（`style-column-ignored-non-system-view`）とセレクタの照合: 本件の対象外

### 実装で設計に足したこと

実装 PR #3409 のレビューで、次を足した。

- **Tidy は parse エラーのあるシートを書き換えない。** parser が拒否した宣言を消さないように、Tidy はそのシートをそのまま返し、`tidy-style` は parse エラーを報告して終了コード 1 を返す。重複ルールのマージでも、捨てられた宣言を持つルールはマージの対象から外す（ほかのルールを取り込まず、ほかのルールにも取り込まれない）
- **不正な hex（`#zzzz`）は hex の atom のまま残す。** 未分類トークンとして拒否せず、色の診断として報告するため
- **グループセレクタの宣言は 1 回だけ報告する。** セレクタごとにルールが作られても、同じ位置の同じ宣言は 1 件にする

### 挙動の変化

診断は以前から出ていた値（error severity）が、本当に描かれなくなる。範囲外の `label-position` は端に寄らず既定（`middle`）に戻る。`0` 以外の単位の無い長さ、許されない単位、不正な hex、`url()` で包まないアイコン名、大文字小文字の違う色名（`White`）は描かれない。`border-width: 0` は逆に診断が消える。新たに、parser が値として持てない宣言（`color: ;` など）は error になるので、`karasu render` は非ゼロで終了する（#3140 の余分な `-` と同じ）。builtin テーマの描画は変わらない（実装 PR の `pr:shots` で examples と AT の描画差分なし）。

## 理由

- 範囲を 1 つ足す編集が `PROPERTY_SCHEMAS` の 1 か所で済み、resolver との不一致が構造的に起きない。cascade が全プロパティを一律に見るので、新しいプロパティでガードを書き忘れる形が無い
- 診断が宣言ごとに 1 回になり、node / edge / frame / legend の全消費者が同じ結果を見る
- 「無効な宣言は書かれなかったものとして扱う」は CSS と同じ規則で、弱いルールへ戻る挙動が著者の予想に合う
- TPL-3141 のガード（`schema-bounds.test.ts`）が `PROPERTY_SCHEMAS` から範囲を持つ全プロパティを導出し、範囲外の値が診断 1 件で、宣言が無いときと同じ解決結果になることを固定する。cascade のフィルタを外すと 13 件中 9 件が落ちる

## 却下した案

- **resolver が `PROPERTY_SCHEMAS` から範囲を読む**: 数値の min / max は 1 か所になるが、捨てる・clamp・整数といった解釈が resolver に残り、キーワード・単位・整数の判定はスキーマから読めない。resolver のノードごとの警告を消すなら同じ廃止が要り、残すなら重複が残る
- **resolver のガードを validator の判定関数（`satisfiesPropertySchema`）で置き換える**: 判定は同じ関数になるが、宣言ではなくマージ後の値を見るので、捨てた後に弱いルールの値へ戻れない。呼び出しがプロパティの数だけ散り、呼び忘れる形が残る
- **union のキーワードを一般にキーワードの枝へ回す**: `color: primary` が CSS の named color 148 個を並べる診断になり、hex の診断より読めなくなる
- **builtin を px に書き換えて検査対象に入れる**: 80 以上の宣言の書き換えに対して、著者から見える効果が無い
- **1 つのルール内で繰り返したプロパティの先の値を残す**（`opacity: 0.5; opacity: 2;` で 0.5）: まれな書き方で、validator は報告する。先の値を残すには parser がスキーマを読む必要があり、見送った。この場合は既定に戻る

## 決めないこと

- `properties` を `valueNodes` から作る置き換え（ADR-1178 のスコープ外）。二重表現のまま、`valueNodes` を判定にだけ使う
- `font-family: -apple-system` が #3140 以来拒否されている件は本件の変更ではなく、別に扱う
