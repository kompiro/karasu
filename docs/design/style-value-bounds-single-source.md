# `.krs.style` の値の範囲を 1 か所に置き、診断と描画を一致させる

- **日付**: 2026-10-22
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3141](https://github.com/kompiro/karasu/issues/3141)（発見元 #3032 / PR #3130）
  - 関連 ADR: [ADR-1178](../adr/1178-style-value-diagnostics.md)（値の診断を validator に一本化）、[ADR-969](../adr/969-style-column-layout-hint.md)（`column` と `style-column-invalid-value`）、[ADR-1737](../adr/1737-balanced-grid-sibling-layout.md)（`grid-columns` と `style-grid-columns-invalid-value`）、[ADR-1184](../adr/1184-edge-label-position-offset.md)（`label-position` の clamp）、[ADR-3022](../adr/3022-edge-label-disclosure.md)（`label-max-chars`）
  - 関連 TPL: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理される語彙は効果を持つか警告される）
  - コード: `packages/core/src/style/property-schema.ts`、`packages/core/src/style/value-validator.ts`、`packages/core/src/style/cascade.ts`、`packages/core/src/resolver/style-resolver.ts`

## 背景・課題

範囲を持つスタイル値の許容範囲が 3 か所に書かれていて、互いに食い違っている。

1. `PROPERTY_SCHEMAS`（validator が読む表）
2. validator の判定（`collectMismatch`）
3. resolver のプロパティごとの手書きのガード（`nonNegativeLength`、`opacity` の `0..1`、`label-position` の clamp、`grid-columns` の正の整数判定など）

その結果、著者が見る診断が描画を説明しない。`main`（7a8ed4bb 時点）で、ノード 2 つとエッジ 1 本のモデルに対して測った:

| スタイル | 診断 | 描かれるもの |
| --- | --- | --- |
| `edge { label-position: -0.5; }` | `style-invalid-enum-value`（許容 `start / middle / end`） | ラベルが始点に寄る（y=120。`label-position: 0` と同じ） |
| `edge { label-max-chars: 0; }` | `style-invalid-enum-value`（許容 `none`） | 既定（48） |
| `service { grid-columns: -2; }` | `style-out-of-range` 1 件 + `style-grid-columns-invalid-value` がノードごとに 1 件（計 3 件） | 既定 |
| `service { grid-columns: 2.5; }` | `style-grid-columns-invalid-value` がノードごと（validator は通す） | 既定 |

食い違いは 5 種類ある。

- **union は最初の枝の診断を出す。** `label-position` と `label-max-chars` は `keyword | number` の union なので、範囲外の数値が「キーワードではない」と報告され、範囲が一度も示されない。
- **範囲外の扱いがプロパティごとに違う。** 警告文はすべて「— ignored」と書くが、`label-position` だけは範囲外を clamp して描く（spec もそう書いている）。他は値を捨てて既定に戻す。
- **同じ宣言を 2 層が報告する。** validator は宣言ごとに 1 回、resolver は該当ノードごとに 1 回出す。`grid-columns` では 1 宣言で 3 件になり、整数でない値は validator が通して resolver だけが拾う。
- **validator が「無視する」と言う値を resolver が描く。** 単位の無い長さ（`stroke-width: 4`。`style-missing-length-unit`）、`12pt` のような許されない単位（resolver の `parseFloat` は数値だけ読む）、不正な hex（そのまま SVG に渡る）、`url()` で包まない登録済みアイコン名（`shape: cloud-node`。resolver の `hasShape` が受ける）は、警告文が「— ignored」なのに描かれる。spec の例 `border-width: 0;`（`docs/spec/style.md`）も今は `style-missing-length-unit` を出しながら描かれている。
- **parser が値を分類できない宣言は検査を素通りする。** カンマの無い複数の値（`opacity: -0.5 0.2`、`label-offset: 0 8px`、引用符の無い `font-family: Noto Sans`）は `valueNodes` に値ノードが入らず、validator は何も言わない。resolver は文字列を自分で読む（`opacity` は `parseFloat` で -0.5 になる）。

再発する構造も見えている。#3130 が length に `min` を足したとき、`border-width` / `border-radius` / `font-size` / `stroke-width` / `opacity` に同じガードを resolver 側へ手で足す必要があり、初版は `opacity` を漏らした（負の opacity でノードが消え、警告は「無視した」と言っていた）。範囲を 1 つ足すたびに 2 か所を編集し、両者が一致しているかを見るものが無い。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 値の型 | parser が宣言ごとに `properties`（文字列）と `valueNodes`（`ValueNode`）の両方を持つ（ADR-1178 の二重表現）。カンマの無い複数の値は `buildValueNode` が値ノードを作らない。`Unknown` トークンは `style-token-type-mismatch` を出して宣言を拒否するが、それ以外の未分類トークンは文字列にだけ残る |
| builtin シート | `builtins/default-style.ts` は長さを単位なしで書く（`border-width: 2;`、`font-size: 13;` など 80 以上）。validator は `sheets[0]` を信頼して検査しない（ADR-1178、`collectModelWarnings`） |
| validator | `validateStyleValues` が `PROPERTY_SCHEMAS` に照らして宣言ごとに `Diagnostic` を出す。LSP・`karasu lint-style`・`collectModelWarnings`（app / `karasu render`）が同じ関数を呼ぶ |
| cascade | `flattenSheetsInCascadeOrder` が全シートを 1 列に並べる。tool vocabulary 外のタグ・アノテーションを名指すルールはここで外す（#2677）。node / edge / frame の解決と legend の色解決が同じ関数を読む |
| resolver | `mergeInCascadeOrder` の結果（文字列）をプロパティごとに parse し、範囲外を捨てる・clamp する。`finalizeLayoutHints` が `column` と `grid-columns` の不正値をノードごとに警告する |
| spec | `docs/spec/style.md` は「範囲外は `style-out-of-range` で、既定が残る」とし、`label-position` / `grid-columns` / `label-max-chars` はそれぞれの節で別の規則を書く（`label-position` は clamp） |

## 制約・前提

- validator が全 surface で同じ関数であること（ADR-1178）は変えない。
- builtin / icon theme のシートは信頼し、検査しない（ADR-1178）。本件で宣言を捨てる対象もユーザーのシートだけにする。
- 未知のプロパティは警告だけで、宣言は残す（ADR-1178 Q2、forward compat）。
- `url("<name>")` の未登録アイコン（`style-unknown-icon`）は warning で、描画は `box` に落ちる。値としては構造上正しいので、本件の「捨てる」対象にしない。
- 本件で触るのは**値がスキーマを満たさない宣言の扱い**だけ。プロパティが効かないビュー（`style-column-ignored-non-system-view`）や、セレクタの照合は対象外。

## 検討した選択肢

### 案1: スキーマを満たさない宣言を cascade で捨てる

`flattenSheetsInCascadeOrder` がユーザーのシートの各ルールの宣言を `PROPERTY_SCHEMAS` に照らし、満たさない宣言をその場で外す。tool vocabulary 外のルールを外しているのと同じ場所で、同じ理由（どの surface でも効かない）による。resolver は検査を通った宣言しか読まないので、範囲を持たなくなる。

**メリット**

- 範囲が書かれるのは `PROPERTY_SCHEMAS` だけになる。範囲を 1 つ足す編集は 1 か所で、resolver との不一致が構造的に起きない
- 診断は validator が宣言ごとに 1 回出すだけになる
- cascade の消費者（node / edge / frame / legend）が全部同じ結果を見る
- 「無効な宣言は書かれなかったものとして扱う」は CSS と同じ規則で、著者の予想に合う

**デメリット**

- 範囲外だけでなく、スキーマを満たさない宣言はすべて描かれなくなる（後述「影響範囲」）。範囲外の `label-position` は clamp されなくなり、単位の誤り・不正な hex・`url()` で包まないアイコン名も効かなくなる。弱いルールに同じプロパティの有効な値があればそれが効く
- `style-column-invalid-value` と `style-grid-columns-invalid-value` は発火しなくなる。ADR-969 / ADR-1737 が決めた警告を廃止することになる

### 案2: resolver が `PROPERTY_SCHEMAS` から範囲を読む

resolver のガードは残し、数値の min / max を手書きせずスキーマから引く。

**メリット**

- 変更が resolver の中で閉じる。cascade の意味は変わらない

**デメリット**

- 「範囲をどう解釈するか」（捨てる・clamp・整数）が resolver のガードに残るので、validator との一致はやはり誰も見ていない。キーワード・単位・整数の判定はスキーマから読めない
- 1 宣言 1 診断にならない。resolver の per-node 警告を消すなら案1と同じ廃止が要り、残すなら重複が残る

### 案3: resolver のガードを validator の判定関数で置き換える

resolver が各値を parse する前に `satisfiesPropertySchema` を呼ぶ。

**メリット**

- 判定は validator と同じ関数になる

**デメリット**

- 宣言ではなくマージ後の値を見るので、捨てたあとに弱いルールの値へ戻れない（既定に戻る）。CSS と違う
- 呼び出しがプロパティの数だけ resolver に散り、新しいプロパティで呼び忘れる形が残る

## 比較

| 観点 | 案1 | 案2 | 案3 |
| --- | --- | --- | --- |
| 範囲が書かれる場所 | スキーマのみ | スキーマ（数値）+ resolver（解釈） | スキーマのみ |
| 1 宣言 1 診断 | なる | resolver 警告の扱い次第 | resolver 警告の扱い次第 |
| 新しいプロパティでの書き忘れ | 起きない（cascade が一律に見る） | 起きる | 起きる |
| 無効な宣言の後の cascade | 弱いルールに戻る（CSS と同じ） | 既定に戻る | 既定に戻る |
| 変更量 | parser（列の値ノード）+ cascade + resolver の削減 + 警告 2 種の廃止 | resolver | resolver |

## 現時点の方針

**案1 を採用する。** 範囲を 1 か所に置くという Issue の目的を、新しいプロパティでも崩れない形で満たすのは案1だけで、無効な宣言の扱いが CSS と同じになる。

あわせて次の 6 点を決める。

1. **範囲外の値は捨てる（clamp しない）。** 警告文はすでに全プロパティで「— ignored」と言っており、clamp していたのは `label-position` だけだった。規則を 1 つにし、`docs/spec/style.md` の冒頭の値の節に「スキーマを満たさない宣言は書かれなかったものとして扱う」と書く。各プロパティの節の個別規則（clamp、「既定が残る」）はこの 1 文への参照に置き換える
2. **union は数値に対して数値を読む枝の診断を出す。** 値が数値で、number / length の枝があれば、その枝の失敗（`style-out-of-range`、`min` / `max` 付き）を報告する。それ以外は従来どおり最初の枝。キーワードを一般にキーワードの枝へ回す案は採らない: `color: primary` が CSS の named color 148 個を並べる診断になり、現在の hex の診断より読めなくなる
3. **整数のプロパティはスキーマが整数を要求する。** `grid-columns` と `label-max-chars` の number spec に `integer: true` を足す。整数でない値は `style-invalid-enum-value` で、`<number>` を要求する既存の診断と同じ形にする。許容には union の全枝を並べる（`label-max-chars: 2.5` は `none / <integer>`。`<integer>` だけだと有効なキーワード `none` が診断から消える）。新しい診断コードは足さない
4. **builtin / icon theme のシートからは捨てない。** ADR-1178 の信頼境界をシートの位置ではなく各ルールの `sheetId` で判定し、`BUILTIN_SHEET_ID` / `ICON_THEME_SHEET_ID` を宣言のフィルタ対象から外す。builtin が単位なしで書く長さはそのまま効く。builtin を px に書き換えて検査対象に入れる案は採らない: 80 以上の宣言の書き換えに対して、著者から見える効果が無い
5. **単位の無い `0` は長さとして有効にする。** CSS と同じで、`border-width: 0` は `0px` と同じ意味に読む。`0` 以外の単位の無い数値・許されない単位・不正な hex・`url()` で包まないアイコン名は、警告文どおり捨てる（「— ignored」を本当にする）
6. **値を分類できない宣言も、報告元を決めてから捨てる。** parser はカンマの無い複数の値を空白区切りの列（`sequence`）として値ノードにし、スキーマが受けるかを決める。列を受けるのは `label-offset`（長さ 1 つか 2 つ）と、`font-family` の各項目（引用符の無い複数語の名前。CSS と同じ）だけで、ほかのプロパティでは列は型の不一致として既存の診断（数値のプロパティなら `style-invalid-enum-value`、許容 `<number>`）で報告する。`Unknown` トークンの報告と拒否は既存の parser の経路を維持し、ほかの未分類トークンにも広げる。既知のプロパティで値ノードの無い宣言が残った場合は validator が報告し、cascade が外す。各経路の契約は下記 2〜4 とする。報告せずに捨てる経路を作らない（#3130 の、負の opacity でノードが消えて何も言わなかった形を繰り返さない）

### 実装の指針

1. `property-schema.ts`: number spec に `integer?: boolean`。`grid-columns` / `label-max-chars` に付ける。length spec は単位の無い `0` を受ける。`ValueSpec` に次の 2 種を追加し、`label-offset` と `font-family` を定義する:

   ```ts
   // ValueSpec に追加
   | { kind: "ident" }
   | { kind: "sequence-of"; item: ValueSpec; minItems: number; maxItems?: number }

   // PROPERTY_SCHEMAS の項目
   "label-offset": { kind: "sequence-of", item: LENGTH_PX_SPEC, minItems: 1, maxItems: 2 },
   "font-family": {
     kind: "list-of",
     item: {
       kind: "union",
       specs: [
         { kind: "string" },
         { kind: "sequence-of", item: { kind: "ident" }, minItems: 1 },
       ],
     },
   },
   ```

   `ident` は任意の識別子を受ける（引用符の無いフォント名用）。`sequence-of` は単一の atom を 1 項目として、`sequence` をその全項目として検査し、`list` は受けない。項目数を `minItems` / `maxItems` で検査してから全項目を `item` で検査する。`label-offset` は 3 項目以上を `style-invalid-enum-value`（許容 `<length> / <length> <length>`）で拒否し、先頭 2 項目だけを使わない。範囲がこの表だけにあることを冒頭のコメントに書く。`label-offset` の既存コメント（「2 つの長さはリストとして parse される」）も直す。
2. `types/value-node.ts` / `style-parser.ts`: 既存の `list`（カンマ区切り）を残し、空白区切り専用の `ValueNode` を追加する:

   ```ts
   | { kind: "sequence"; items: [ValueNode, ValueNode, ...ValueNode[]]; loc: SourceRange }
   ```

   `buildValueNode` は関数・引用文字列の外のカンマで項目を分ける。カンマが無いとき、atom が 1 つならその atom、2 つ以上なら全 atom を順に持つ `sequence` とする。カンマがあるときは `list` を作り、各項目を同じ規則で atom / `sequence` にする（`Noto Sans, serif` の先頭項目を `Noto` だけで代用しない）。`sequence.loc` は最初の atom の先頭から最後の atom の末尾までで、`file` も引き継ぐ。文字列・`url(...)` の内部は分割しない。

   拒否の印は既存の `parseValue` の戻り値の `refused: boolean` とし、AST に別の印は追加しない。`Unknown` は現在も `reportUnknownValueToken` が `style-token-type-mismatch` を出して `refused = true` にし、`parseDeclaration` が `properties` / `valueNodes` への格納を見送っている。この経路を維持し、ほかの未分類トークン、空の値、空のカンマ項目も同じコードの parser 診断（問題のトークンの `loc` 付き）で拒否する。parser が診断を返す時点で報告は完了しており、cascade の呼び出し前に拒否された宣言は除かれている。各 surface は既存どおり parser 診断を結果に含め、validator は重ねて報告しない。
3. `value-validator.ts`: `satisfiesPropertySchema(property, node)` を公開する（未知のプロパティは `true`）。union の報告規則（上記 2）と整数判定（許容の並べ方は上記 3）を実装する。

   `collectMismatch` の `ValueSpec.kind` の switch に `ident` / `sequence-of` を加える。`ident` の型不一致は `style-invalid-enum-value`（許容 `<identifier>`）。`sequence-of` の型・項目数不一致も同じコードで要求する列の形を示し、項目の不一致は `item` の診断を使う。`list-of` はカンマ区切りだけを展開し、単一値として渡された `sequence` は分割せず `item` に照合する。したがって `font-family` は識別子だけの列を受け、数値などを混ぜた列は拒否する。ほかの既存スカラー spec は `sequence` を型不一致として扱う。

   `stringifyValueNode` の `node.kind` の switch は `ident` / `hex` / `number` / `length` / `string` / `function` の全既存 case を維持する。`list` は再帰して `", "` で結合し、新しい `sequence` は再帰して `" "` で結合する。`default` の `never` による網羅検査も維持する。`specAcceptsUrl` の spec switch も `sequence-of` では `list-of` と同じく `item` を再帰し、`ident` は `false` とする。

   `validateStyleValues` はフィルタ前の元のシートを検査する。未知のプロパティの warning を先に判定し、既知のプロパティで `valueNodes` のあるルールに値ノードだけが無いときは、`properties[property]` の文字列とスキーマの許容形を使い `style-invalid-enum-value` を `declarationLocs[property]` の位置で 1 件返す。これで parser が拒否せず残した宣言にも報告元がある。`valueNodes` 自体の無い手組みルールは従来どおり検査しない。
4. `cascade.ts`: `flattenSheetsInCascadeOrder` は各ルールの `sheetId` を調べ、`BUILTIN_SHEET_ID`（`builtins/default-style.ts`）/ `ICON_THEME_SHEET_ID`（`builtins/icon-theme.ts`）以外を宣言フィルタの対象にする。配列内の位置や省略可能な `StyleSheet.sheetId` には依存しない。対象ルールに `valueNodes` があるとき、既知のプロパティについてスキーマを満たさない宣言と値ノードの無い宣言を外す。未知のプロパティは warning のみで残す。builtin / icon theme の宣言と、`valueNodes` の無いルール（テストで手組みしたもの）はそのまま残す。今の `{ ...rule }` は `properties` をキャッシュした builtin シートと共有しているので、宣言を外すルールは `properties` / `declarationLocs` / `valueNodes` を新しいオブジェクトに写してから外す。既存のセレクタによるルール除外と `sourceIndex` の採番は維持する
5. `style-resolver.ts`: 範囲のガードを外し、parse（有限値かどうか）だけを残す。`label-position` の clamp を外す。`finalizeLayoutHints` から `style-column-invalid-value` / `style-grid-columns-invalid-value` を外す。builtin の単位なしの長さを読む parse は残す
6. 警告 2 種の廃止: `types/warnings.ts`、`types/style.ts`（`ResolvedStyleWarning` の kind）、`compile/model-warnings.ts` のコメント、`packages/i18n`（en / ja / `render-warning.ts`）、`docs/spec/diagnostics{,.ja}.md`、`docs/spec/style{,.ja}.md`、skills の `reference/diagnostics.md` と `packages/skills/skills/{karasu-author,reverse-architecture}/reference/diagnostics.md`（`lint:skill-reference-bundle-sync`）、既存テスト（`resolver/warnings.test.ts`、`compile/all-views-project-styles.test.ts`、`compile-diff-warnings.test.ts`、app の `WarningPanel.test.tsx` など。`grep -rln "style-column-invalid-value\|style-grid-columns-invalid-value"` で全件を拾う）
7. 既存 AT の更新: AT-0969 / AT-1737 / AT-2879 / AT-3097 のうち、廃止する 2 種の警告を判定に使っている項目を、validator の診断で判定する形に書き換える。単位の無い長さに頼る項目（AT-0045 の `stroke-width: 4;`、AT-1061 AT-I）は `px` を付ける。AT-2696 AT-M の `border-width: 0;` は上記 5 で有効のまま
8. TPL: proactive TPL-3141「スタイル値の診断は描画を説明する: 範囲はスキーマ 1 か所、無効な宣言は cascade で 1 回捨てる」を起こす。機械検証として、`PROPERTY_SCHEMAS` の範囲を持つ全プロパティについて、範囲外の値が (a) 診断を 1 件だけ出し、(b) その宣言を書かなかったときと同じ解決結果になることを、スキーマから導出したテストで固定する
9. AT: `docs/acceptance/3141-style-value-bounds.md`。TC は:
   - 範囲外の `label-position` / `label-max-chars` が `style-out-of-range`（`min` / `max` 付き）で報告され、宣言が無いときと同じに描かれる
   - `grid-columns` の範囲外・非整数が、ノードの数によらず 1 件だけ報告される
   - 無効な宣言の後、弱いルールの同じプロパティの値が効く
   - `color: primary` は従来どおり hex の診断になる
   - `stroke-width: 4` は報告されて描かれず、`border-width: 0` は報告されずに枠が消える
   - `opacity: -0.5 0.2` は報告されて描かれず、`label-offset: 0 8px` と `font-family: Noto Sans` は報告されずに効く
   - `label-offset` は長さ 1 つ・2 つなら効き、3 つ以上なら 1 件の診断で宣言全体が外れる（先頭 2 つだけを使わず、弱いルールの値が効く）
   - ユーザーのスタイルが無いモデルの描画が変わらない（builtin の単位なしの長さが効いている）
10. changeset: `@karasu-tools/core` と `karasu` に patch（診断の変更と挙動の変更）。skills の diagnostics reference を変えるので `karasu-skills` も入れる（`.claude/rules/changesets.md`）
11. ADR 昇格: 実装完了後、`docs/adr/3141-style-value-bounds-single-source.md` に昇格する。覆すのは各 ADR の一部（ADR-969 / ADR-1737 は警告、ADR-1184 は `label-position` の clamp）なので、`supersedes` ではなく `refines: [ADR-969, ADR-1737, ADR-1184]` で指し、どの部分を変えたかを本文に書く。ADR-1178 の「builtin は検査しない」は維持し、cascade で捨てる範囲も同じ境界にしたことを書く（`related_to`）。旧 ADR の本文は変えない

### 実装時に追加・更新するテスト

以下は実装 PR の検証項目であり、現行実装の結果を示す表ではない。

| 対象 | 入力・条件 | 期待結果 |
| --- | --- | --- |
| `style-parser.test.ts` / `value-validator.test.ts` | `label-offset: 8px` / `label-offset: 4px 8px`（`0 8px` も確認） | それぞれ単一 atom / 2 項目の `sequence`。診断なし、schema 判定も `true`。解決結果はそれぞれ `(0, 8)` / `(4, 8)` |
| 同上 / cascade・resolver のテスト | `label-offset: 4px 8px 12px`（4 項目以上も確認） | 全項目を持つ `sequence`。schema 判定は `false`、`style-invalid-enum-value` が 1 件。宣言全体が外れ、弱いルールの有効な値が効く |
| `style-parser.test.ts` | `Noto Sans, serif`、`"Noto Sans", serif`、`url("a b")` | それぞれ `list([sequence([ident, ident]), ident])`、`list([string, ident])`、単一の `function`。項目・順序・`loc` / `file`・canonical な `properties` を保持 |
| `value-validator.test.ts` | `font-family: Noto Sans, serif` / `font-family: Noto 12px`、`label-offset: 4px, 8px` | 識別子の列だけのフォント名は受理。数値を混ぜた名前とカンマ区切りの offset は拒否。`list-of` と `sequence-of` の区別を確認 |
| `value-validator.test.ts` | 既存の全スカラー kind の診断と、`opacity: -0.5 0.2`、不正なフォント名のリスト | `stringifyValueNode` の既存 case を維持し、`sequence` の診断値は空白区切り、`list` はカンマ区切り。数値 spec への列は `style-invalid-enum-value`（許容 `<number>`） |
| parser・validator・cascade のテスト | `label-offset: - 20px`、未分類トークン、空の値・カンマ項目 | parser 診断の `style-token-type-mismatch` と位置を確認。拒否された宣言は parser の結果に無く、validator は重複報告しない。各 surface の結果に parser 診断が残る |
| validator・cascade のテスト | `valueNodes: {}` を持つ手組みルールに既知の宣言がある | validator は宣言位置に 1 件報告し、cascade が除外。元のシートの各 map は変化しない。未知のプロパティなら warning のみで宣言を保持 |
| `cascade.test.ts` | builtin / icon theme を先頭以外に置く。ユーザーのシートを先頭に置く | 両 sentinel の `rule.sheetId` だけを宣言フィルタから除外し、ユーザーの無効な宣言は位置に関係なく外す。省略・不一致のある envelope の `sheetId` に影響されない |
| `cascade.test.ts` | `valueNodes` の無いルール、無効な強い宣言と有効な弱い宣言、tool vocabulary 外のセレクタ | 手組みルールを保持し、弱い有効値へ戻る。既存のセレクタ除外と全体の `sourceIndex`、元のシートの非破壊性を維持 |

### 影響範囲・マイグレーション

- 既存ユーザーへの影響:
  - `label-position` に `[0, 1]` の外の数値を書いていた場合、端に寄せて描かれていたラベルが既定（`middle`）に戻る。診断は以前から出ていた（error severity）
  - ユーザーのシートで、validator が「— ignored」と報告していた値が本当に効かなくなる: `0` 以外の単位の無い長さ（`stroke-width: 4`）、`pt` などの許されない単位、不正な hex、`url()` で包まないアイコン名（`shape: cloud-node`）。診断は以前から出ていた。単位の無い `0` は逆に診断が消え、描画は変わらない
  - カンマの無い複数の値は、受けるプロパティ（`label-offset`、`font-family`）以外では報告されて効かなくなる（以前は無診断で、resolver が文字列から読めた分だけ効いていた）
  - 同じプロパティを弱いルールが有効な値で設定していると、強いルールの無効な値の後はその値が効く（以前は既定）。例: `service { opacity: 0.5; } #A { opacity: 2; }` で `A` は 0.5（以前は 1）
  - builtin のテーマは変わらない（検査しないので、単位なしの長さがそのまま効く）
  - `style-column-invalid-value` / `style-grid-columns-invalid-value` が出なくなり、代わりに validator の `style-invalid-enum-value` / `style-out-of-range` が宣言の位置で 1 件出る。警告の kind を見て処理している外部のコードがあれば影響を受ける
- ドキュメント更新: `docs/spec/style{,.ja}.md`、`docs/spec/diagnostics{,.ja}.md`、skills の diagnostics reference
- テスト・examples への影響: 廃止する警告 2 種を期待するテストを書き換える。範囲外だけでなくスキーマを満たさない宣言がすべて捨てられるので、確かめるのは「examples と docs の `.krs.style` の例に validator の診断が 1 件も無い」こと（単位の無い `0` を有効にした後で数える）。診断が出る例は、実装 PR で値を直す

## 未解決の問い / 決めないこと

- `column` の不正値（範囲ではなくキーワード）も同じ規則で捨てるので、`style-column-invalid-value` も廃止に含めた。Issue の範囲（数値の範囲）を超えるが、残すと「1 宣言 1 診断」と「無効な宣言は cascade で捨てる」のどちらかに例外を作ることになる
- `properties` を `valueNodes` から作る置き換え（ADR-1178 のスコープ外）はここでも扱わない。本件は二重表現のまま、`valueNodes` を判定にだけ使う
