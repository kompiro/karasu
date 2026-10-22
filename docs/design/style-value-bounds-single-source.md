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

食い違いは 3 種類ある。

- **union は最初の枝の診断を出す。** `label-position` と `label-max-chars` は `keyword | number` の union なので、範囲外の数値が「キーワードではない」と報告され、範囲が一度も示されない。
- **範囲外の扱いがプロパティごとに違う。** 警告文はすべて「— ignored」と書くが、`label-position` だけは範囲外を clamp して描く（spec もそう書いている）。他は値を捨てて既定に戻す。
- **同じ宣言を 2 層が報告する。** validator は宣言ごとに 1 回、resolver は該当ノードごとに 1 回出す。`grid-columns` では 1 宣言で 3 件になり、整数でない値は validator が通して resolver だけが拾う。

再発する構造も見えている。#3130 が length に `min` を足したとき、`border-width` / `border-radius` / `font-size` / `stroke-width` / `opacity` に同じガードを resolver 側へ手で足す必要があり、初版は `opacity` を漏らした（負の opacity でノードが消え、警告は「無視した」と言っていた）。範囲を 1 つ足すたびに 2 か所を編集し、両者が一致しているかを見るものが無い。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| 値の型 | parser が宣言ごとに `properties`（文字列）と `valueNodes`（`ValueNode`）の両方を持つ（ADR-1178 の二重表現） |
| validator | `validateStyleValues` が `PROPERTY_SCHEMAS` に照らして宣言ごとに `Diagnostic` を出す。LSP・`karasu lint-style`・`collectModelWarnings`（app / `karasu render`）が同じ関数を呼ぶ |
| cascade | `flattenSheetsInCascadeOrder` が全シートを 1 列に並べる。tool vocabulary 外のタグ・アノテーションを名指すルールはここで外す（#2677）。node / edge / frame の解決と legend の色解決が同じ関数を読む |
| resolver | `mergeInCascadeOrder` の結果（文字列）をプロパティごとに parse し、範囲外を捨てる・clamp する。`finalizeLayoutHints` が `column` と `grid-columns` の不正値をノードごとに警告する |
| spec | `docs/spec/style.md` は「範囲外は `style-out-of-range` で、既定が残る」とし、`label-position` / `grid-columns` / `label-max-chars` はそれぞれの節で別の規則を書く（`label-position` は clamp） |

## 制約・前提

- validator が全 surface で同じ関数であること（ADR-1178）は変えない。
- 未知のプロパティは警告だけで、宣言は残す（ADR-1178 Q2、forward compat）。
- `url("<name>")` の未登録アイコン（`style-unknown-icon`）は warning で、描画は `box` に落ちる。値としては構造上正しいので、本件の「捨てる」対象にしない。
- 本件で触るのは**値がスキーマを満たさない宣言の扱い**だけ。プロパティが効かないビュー（`style-column-ignored-non-system-view`）や、セレクタの照合は対象外。

## 検討した選択肢

### 案1: スキーマを満たさない宣言を cascade で捨てる

`flattenSheetsInCascadeOrder` が各ルールの宣言を `PROPERTY_SCHEMAS` に照らし、満たさない宣言をその場で外す。tool vocabulary 外のルールを外しているのと同じ場所で、同じ理由（どの surface でも効かない）による。resolver は検査を通った宣言しか読まないので、範囲を持たなくなる。

**メリット**

- 範囲が書かれるのは `PROPERTY_SCHEMAS` だけになる。範囲を 1 つ足す編集は 1 か所で、resolver との不一致が構造的に起きない
- 診断は validator が宣言ごとに 1 回出すだけになる
- cascade の消費者（node / edge / frame / legend）が全部同じ結果を見る
- 「無効な宣言は書かれなかったものとして扱う」は CSS と同じ規則で、著者の予想に合う

**デメリット**

- 挙動が 2 点変わる（後述「影響範囲」）。範囲外の `label-position` は clamp されなくなり、弱いルールに同じプロパティの有効な値があればそれが効く
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
| 変更量 | cascade + resolver の削減 + 警告 2 種の廃止 | resolver | resolver |

## 現時点の方針

**案1 を採用する** — 範囲を 1 か所に置くという Issue の目的を、新しいプロパティでも崩れない形で満たすのは案1だけで、無効な宣言の扱いが CSS と同じになる。

あわせて次の 3 点を決める。

1. **範囲外の値は捨てる（clamp しない）。** 警告文はすでに全プロパティで「— ignored」と言っており、clamp していたのは `label-position` だけだった。規則を 1 つにし、`docs/spec/style.md` の冒頭の値の節に「スキーマを満たさない宣言は書かれなかったものとして扱う」と書く。各プロパティの節の個別規則（clamp、「既定が残る」）はこの 1 文への参照に置き換える
2. **union は数値に対して数値を読む枝の診断を出す。** 値が数値で、number / length の枝があれば、その枝の失敗（`style-out-of-range`、`min` / `max` 付き）を報告する。それ以外は従来どおり最初の枝。キーワードを一般にキーワードの枝へ回す案は採らない: `color: primary` が CSS の named color 148 個を並べる診断になり、現在の hex の診断より読めなくなる
3. **整数のプロパティはスキーマが整数を要求する。** `grid-columns` と `label-max-chars` の number spec に `integer: true` を足す。整数でない値は `style-invalid-enum-value`（許容 `<integer>`）で、`<number>` を要求する既存の診断と同じ形にする。新しい診断コードは足さない

### 実装の指針

1. `property-schema.ts`: number spec に `integer?: boolean`。`grid-columns` / `label-max-chars` に付ける。範囲がこの表だけにあることを冒頭のコメントに書く
2. `value-validator.ts`: `satisfiesPropertySchema(property, node)` を公開する（未知のプロパティは `true`）。union の報告規則（上記 2）。整数判定
3. `cascade.ts`: `flattenSheetsInCascadeOrder` で、`valueNodes` を持つルールからスキーマを満たさない宣言を外す。`valueNodes` の無いルール（テストで手組みしたもの）と、parser が値を分類できなかった宣言（parser が既に報告している）はそのまま残す
4. `style-resolver.ts`: 範囲のガードを外し、parse（有限値かどうか）だけを残す。`label-position` の clamp を外す。`finalizeLayoutHints` から `style-column-invalid-value` / `style-grid-columns-invalid-value` を外す
5. 警告 2 種の廃止: `types/warnings.ts`、`packages/i18n`（en / ja / `render-warning.ts`）、`docs/spec/diagnostics{,.ja}.md`、`docs/spec/style{,.ja}.md`、skills の `reference/diagnostics.md`、既存テスト
6. 既存 AT の更新: AT-0969 / AT-1737 / AT-2879 / AT-3097 のうち、廃止する 2 種の警告を判定に使っている項目を、validator の診断で判定する形に書き換える
7. TPL: proactive TPL-3141「スタイル値の診断は描画を説明する: 範囲はスキーマ 1 か所、無効な宣言は cascade で 1 回捨てる」を起こす。機械検証として、`PROPERTY_SCHEMAS` の範囲を持つ全プロパティについて、範囲外の値が (a) 診断を 1 件だけ出し、(b) その宣言を書かなかったときと同じ解決結果になることを、スキーマから導出したテストで固定する
8. AT: `docs/acceptance/3141-style-value-bounds.md`。TC は:
   - 範囲外の `label-position` / `label-max-chars` が `style-out-of-range`（`min` / `max` 付き）で報告され、宣言が無いときと同じに描かれる
   - `grid-columns` の範囲外・非整数が、ノードの数によらず 1 件だけ報告される
   - 無効な宣言の後、弱いルールの同じプロパティの値が効く
   - `color: primary` は従来どおり hex の診断になる
9. changeset: `@karasu-tools/core` と `karasu` に patch（診断の変更と挙動の変更）
10. ADR 昇格: 実装完了後、`docs/adr/3141-style-value-bounds-single-source.md` に昇格する。ADR-969 / ADR-1737 は警告の部分だけを覆すので、新 ADR から `related_to` で指し、部分的な supersede であることを本文に書く（両 ADR の本文は変えない）

### 影響範囲・マイグレーション

- 既存ユーザーへの影響:
  - `label-position` に `[0, 1]` の外の数値を書いていた場合、端に寄せて描かれていたラベルが既定（`middle`）に戻る。診断は以前から出ていた（error severity）
  - 同じプロパティを弱いルールが有効な値で設定していると、強いルールの無効な値の後はその値が効く（以前は既定）。例: `service { opacity: 0.5; } #A { opacity: 2; }` で `A` は 0.5（以前は 1）
  - `style-column-invalid-value` / `style-grid-columns-invalid-value` が出なくなり、代わりに validator の `style-invalid-enum-value` / `style-out-of-range` が宣言の位置で 1 件出る。警告の kind を見て処理している外部のコードがあれば影響を受ける
- ドキュメント更新: `docs/spec/style{,.ja}.md`、`docs/spec/diagnostics{,.ja}.md`、skills の diagnostics reference
- テスト・examples への影響: 廃止する警告 2 種を期待するテストを書き換える。examples に範囲外の値は無い（`pnpm` の examples 検証で確認する）

## 未解決の問い / 決めないこと

- `column` の不正値（範囲ではなくキーワード）も同じ規則で捨てるので、`style-column-invalid-value` も廃止に含めた。Issue の範囲（数値の範囲）を超えるが、残すと「1 宣言 1 診断」と「無効な宣言は cascade で捨てる」のどちらかに例外を作ることになる
- `properties` を `valueNodes` から作る置き換え（ADR-1178 のスコープ外）はここでも扱わない。本件は二重表現のまま、`valueNodes` を判定にだけ使う
