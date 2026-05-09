# `.krs.style` AST の形と将来の拡張

- **日付**: 2026-05-08
- **ステータス**: フェーズ 1 = 決定済み（[ADR-20260509-02](../adr/20260509-02-style-ast-position-and-recovery.md) として昇格・実装済み）。フェーズ 2 / 3 は引き続き検討中
- **関連**:
  - 引き金 Issue: [#1168](https://github.com/kompiro/karasu/issues/1168) — `,` と `;` の取り違えが silent に通る
  - 関連 ADR: [ADR-20260322-01](../adr/20260322-01-builtin-style-and-reference.md)（builtin + cascade）、
    [ADR-20260328-01](../adr/20260328-01-unified-style-pipeline.md)（resolver 一元化）、
    [ADR-20260506-01..03](../adr/20260506-01-gui-driven-style-editing.md)、
    [ADR-20260508-01](../adr/20260508-01-gui-style-inplace-update.md)
  - コード:
    `packages/core/src/types/style.ts`、
    `packages/core/src/lexer/style-lexer.ts`、
    `packages/core/src/parser/style-parser.ts`、
    `packages/core/src/resolver/style-resolver.ts`

## 背景・課題

`.krs.style` の AST は `StyleSheet { rules: StyleRule[] }`、`StyleRule { selector,
properties: Record<string, string>, specificity, sourceIndex }` という最小構造を
持つ。これは「カスケード解決して `ResolvedNodeStyle` / `ResolvedEdgeStyle` を作る」
という主目的には十分だが、ここ最近の機能要請で **AST が不足している領域** が
立ち上がってきた:

1. **LSP 診断の精度 (#1168)**: `color: red, direction: down;` のように `;` の代わりに
   `,` を書くと、`parseValue` が `;` `}` `EOF` まで貪欲に value を集める結果、
   `color = "red , direction : down"` という壊れた値が成立し、`direction`
   property は AST から消える。診断も出ないので、LSP は誤りをユーザーに
   報告できない
2. **GUI in-place update (#1142 / ADR-20260508-01)**: 単一プロパティ rule の
   in-place 書き換えを **テキスト正規表現** で実装した。AST が位置情報を
   持たないので、AST 経由で安全に編集する選択肢が今は無い
3. **Tidy Style コマンド** (将来): append 連発で散らかった `.krs.style` を
   整理する。AST writer が必要だが、現在の AST はコメントも空白も持たない
4. **複数 `.krs.style` 横断のエラー位置参照**: 現在 `sourceIndex` は重複する
   ことがあり（resolver で flatMap する手前で振り直されるが、複数シートで
   グローバル順序が必要）、source identity（どのファイルの何行目）を
   遡れない
5. **将来の formatter / linter**: コメント・空行・整形を保つ round-trip
   formatter は、現在の AST ではどう作っても情報が足りない

これらは個別に対処してきたが、**AST が何を覚え、何を捨てるかの方針** が
明示化されていないため、各機能が独自に raw text を触るか、resolver の
出力を後処理する形に偏っている。Issue #1168 の修正もそうした 1 例で、
本格的に直すには parser の責務（どこまでで止まり、何を診断するか）を
言語化したくなる。

## 現状（インベントリ）

### token / lexer

`packages/core/src/lexer/style-lexer.ts`:

- 空白とコメント (`/* */`, `//`) は `skipWhitespaceAndComments` で **skip** される
  → AST には残らない
- 各 token に `loc: { line, column, offset }` がある
- 16 種類の token: identifier, hex color, string literal, brace/bracket/paren,
  comma, colon, semicolon, hash, at, dot, asterisk, gt, gte (`->`), eq

### parser

`packages/core/src/parser/style-parser.ts`:

- `parseRuleSet` → `parseSelector` × N (comma 区切り) → `parseDeclaration` × N
- **`parseValue` は `Semicolon` `RightBrace` `EOF` まで貪欲**:
  - identifier、string literal、comma、その他 token を `.value` で集めて
    `parts.join(" ").trim()` する
  - 関数呼び出し `url(...)` は再構築して 1 文字列にする
  - `,` は単に `parts` に push される（valid な multi-value のため）
  - **`,` の後に `<ident> :` が続いても気付かない** (#1168)
- 既知の診断:
  - `style-token-type-mismatch`（expect 失敗）
  - `expected-style-property-name`（property 位置に identifier 以外）

### AST

```ts
interface StyleSelector {
  nodeType?: string;       // "service" / "edge" / ...
  tags: string[];
  annotations: string[];
  id?: string;             // node #<id>
  edgeId?: string;         // edge#<id>
}

interface StyleRule {
  selector: StyleSelector;
  properties: Record<string, string>;  // value は parts.join(" ") の文字列
  specificity: number;
  sourceIndex: number;     // 同一シート内のルール出現順
}

interface StyleSheet {
  rules: StyleRule[];
}
```

**AST が持っていないもの**:

- 各 rule / selector / property の **位置情報** (`loc`)
- **コメント**（lexer で捨てている）
- 元の **空白・改行・整形**
- property value の **構造化形式**（"red , sans-serif" のような joined string、
  parser が間に挿入したスペース込み）
- 複数 stylesheet 間の **シート識別子**（どの `.krs.style` のルールか）
- 元 token への back-pointer（位置検索のため）

## 制約・前提

- **後方互換**: 既存の resolver はこの AST 形に依存している。AST を拡張する
  ときは additive な変更（既存フィールドを保ち、新フィールドを追加）を
  優先する
- **複数の利用者**: AST は `core/resolver`、`core/spec/operations`（CRUD 等の
  別 view）、`app/lib/append-style-rule`（テキスト書き換え）、`lsp`（診断・
  hover）、将来の `Tidy Style` や fmt から参照される。共通 AST に増やす
  情報は全利用者にコストを乗せる
- **位置情報のコスト**: token が既に loc を持つので、parser の段階で
  伝搬するコストは小さい。AST node 一つに loc を 1〜2 個生やすだけで足りる
- **コメント/空白のコスト**: lossless round-trip を狙うと AST がほぼ
  syntax tree になり、結合度が上がる。**段階的に**、必要な機能が出てきた
  時に追加する方が安全
- **CSS 互換性は局所的**: `font-family: "X", sans-serif` のような
  comma-separated 値は今後も使う想定。「`,` を完全に拒否」はできない

## 目指す方向性（ハイレベル）

> 「resolver の input としては今のままで十分。LSP / GUI / Tidy のために
> **位置情報** と **少量の trivia** を additive に足し、parser 側では
> **誤りに気付ける範囲を増やす**」

具体的には次の 3 段階で考える:

| フェーズ | 追加するもの | 利用者 | 動機 |
|---|---|---|---|
| 1. 診断強化 | `loc` を rule / declaration / value に伝搬。エラー回復方針を明文化 | LSP、editor | #1168 系の silent failure を潰す |
| 2. trivia 保持 | コメント・空白を `leadingTrivia` / `trailingTrivia` として AST に残す（オプション） | Tidy Style、fmt | 整形を壊さない round-trip |
| 3. 構造化 value | property value を tokens の配列で保持し、resolver が必要な型に変換 | 厳密な validation、completion | エラー検出と補完の精度 |

本 design doc では **フェーズ 1 を最優先**、フェーズ 2/3 は方向性のみ示し、
実装は具体機能が立ち上がった時に再検討する。

## フェーズ 1（採用候補）: 位置情報 + 明示的エラー回復

### 1.1 AST に `loc` を追加（additive）

```ts
interface StyleRule {
  selector: StyleSelector;
  properties: Record<string, string>;
  specificity: number;
  sourceIndex: number;
  // additive:
  loc?: SourceRange;                                  // rule 全体（{ から } まで）
  declarationLocs?: Record<string, SourceRange>;      // property ごとの宣言範囲
}

interface StyleSelector {
  // ...
  loc?: SourceRange;  // selector の範囲
}
```

- すべて `?:` で optional にする → 既存テストや consumer は壊れない
- `SourceRange` は既存型を再利用（`packages/core/src/types/ast.ts`）

### 1.2 「`,` の位置に新規 declaration が来たら error + recover」

`parseValue` 内で `,` を見たとき、次のトークンが `Identifier Colon` の組
（= 新しい property の先頭）なら:

1. `expected-semicolon-between-properties` 診断を error severity で push
2. `,` を semicolon として消費（AST 上は今読んでいる property の値だけを
   保存し、次の property は通常通りパースされる）
3. **value 文字列には `,` 以降を含めない**（`color = "red"`、`direction =
   "down"` の 2 properties が AST に残る）

これにより:
- `color: red, direction: down;` → 診断 1 件 + properties 2 件
- `font-family: "Noto", sans-serif;` → 既存挙動（`,` の後は `;`、
  `Identifier Colon` ではないので診断は出ない）

### 1.3 既存の他の silent ケースを棚卸し

- `parseSelector` でも recovery が緩く、`edge#A->B,` のような入力で diagnostic
  が出ているか不明。本フェーズで小規模に audit して、**少なくとも error
  severity の診断が必ず 1 件出る** ことを保証する
- 監査結果は AT に追加する（フェーズ 1 のスコープ）

### 1.4 `sourceIndex` のシート横断グローバル化

`resolver` 側で flatMap 前に振り直されているが、AST の段階で **どのシート
由来か** が分からない。`StyleRule` に `sheetId?: string` を生やすと、
将来「複数 `.krs.style` を見ているとき、どのファイルのどの行から来たルール
か」を遡れる。

- 識別子は `.krs.style` のパス（main では既に判明している）
- resolver 側はこれを使わなくてもよい（既存ロジックを維持）が、LSP /
  GUI 側でこれを参照できるようにする

### 採否

**採用済み** — [ADR-20260509-02](../adr/20260509-02-style-ast-position-and-recovery.md)
として昇格、PR [#1173](https://github.com/kompiro/karasu/pull/1173) で
実装。`StyleSheet.sheetId` のみ envelope レベルで optional に残す譲歩あり
（test fixture 数の都合）。それ以外は本 design doc の MVP どおり。

## フェーズ 2（方向性のみ）: trivia 保持

> Tidy Style や round-trip fmt が必要になったときに着手する。本 design
> doc ではゴールだけ書く。

- **lexer**: `skipWhitespaceAndComments` を「skip」ではなく「trivia
  collector」に置き換え、各 token の前後 trivia を `leadingTrivia` /
  `trailingTrivia` として保持
- **AST**: `StyleRule` / `Declaration` レベルに trivia を持たせる
- **writer**: AST → text の round-trip を作る（fmt の核）
- **互換性**: trivia フィールドは optional のまま、resolver は無視

決め切らないこと:
- trivia をどの粒度で持つか（token 単位 vs rule 単位）
- inline コメント (`color: red; // primary`) の所属（trailing of decl?）
- ライン情報まで保つか、空白の文字列をそのまま保つか

## フェーズ 3（方向性のみ）: 構造化 value

> hover の precise な型表示や `direction: dwon` の typo 補完など、
> エディタ体験の高度化が要請になったら着手する。

- `properties: Record<string, string>` を `Record<string, ValueNode>` に
  置き換える（または別フィールドに `ast` を生やす additive 拡張）
- `ValueNode` は `Identifier`, `HexColor`, `Number`, `Length`, `Function`,
  `String`, `List` のユニオン
- resolver 側は thin shim で文字列に変換
- diagnostic も「数値で書くべきところに文字列が来た」のような型レベルの
  ものを出せる

## 比較

| 観点 | 現状 | フェーズ 1 | フェーズ 2 | フェーズ 3 |
|---|---|---|---|---|
| LSP 診断（#1168 系） | × silent | ◯ error + recover | ◯ | ◯ |
| 位置情報 | ✕ | ◯ rule/decl 単位 | ◯ token 単位 | ◯ token 単位 |
| コメント保持 | ✕ | ✕ | ◯ | ◯ |
| Tidy Style 実装可能性 | × | △（テキスト依存） | ◯ | ◯ |
| value の型レベル diagnostic | ✕ | △（限定的） | △ | ◯ |
| 後方互換 | n/a | ◎ | ◎ | △（resolver shim 要） |
| 実装コスト | 0 | 中 | 高 | 高 |

## 現時点の方針（仮）

**フェーズ 1 を採用** する。具体的には:

1. **#1168 を「`,` の誤用検出」だけで closeしない**。フェーズ 1 全体
   （`loc` 追加 + recovery audit + 診断追加）として PR を切る
2. 同じ PR で `expected-semicolon-between-properties` を導入し、parseValue
   の recovery 規則を明文化する
3. ADR-20260328-01（resolver 一元化）に refines する形で **新 ADR
   `style-ast-position-and-recovery`** を起こす。AST に `loc?` を生やすこと、
   recovery のセマンティクス（error severity + 前進）、`sourceIndex` の
   シート横断ポリシーを記録する
4. フェーズ 2/3 は本 doc のメモとして残し、Tidy Style / fmt が立ち上がった
   時に **本 doc に戻ってきて** 詳細化する

### MVP スコープ（フェーズ 1 = #1168 PR の対象）

- `parseValue` recovery: `, <Ident> :` 検出 → 診断 + comma を semicolon と
  みなして break
- AST 拡張:
  - `StyleRule.loc` (`{` から `}`)
  - `StyleRule.declarationLocs[propName]` (property 名 token の loc から
    `;` まで)
  - `StyleSelector.loc`
- 診断追加:
  - `expected-semicolon-between-properties` (error)
- 既存 audit + 診断補完:
  - selector 部分の `expected-comma-or-brace` のような silent ケースを
    1 つだけスポットチェックし、必要なら追加診断（範囲は #1168 PR に
    入れる小規模なものに留める）
- Tests: parser test に上記を追加。resolver test は変更なし
- Spec: `docs/spec/style.md` に「property 区切りはセミコロン、コンマで
  区切ると診断が出る」と明記

### 決めないこと

- フェーズ 2 のコメント保持戦略（trivia の粒度・inline コメントの所属）
- フェーズ 3 の ValueNode ユニオンの正確な型シェイプ
- formatter のスタイル（カスケード順をどう保つか、property の並べ方）

これらは具体機能が立ち上がるときに再検討する。

## 確定した方針

レビューで以下を確定した:

- **`loc` は最初から required**: `StyleRule.loc: SourceRange` などを
  optional にしない。parser で必ずセットする責任を型で強制する。代償
  として既存の test fixture（`makeRule(...)` ヘルパ等）と builtin-style
  の生成パスに `loc` を埋める修正が一斉に必要になる。LSP 等の consumer
  側で「loc が undefined かもしれない」分岐を書かなくて済む価値の方が
  大きいと判断
- **`sheetId` はファイルパス文字列**: `sheetId: string` を main で
  処理されているパス（例: `"/project/site.krs.style"`）で持つ。builtin
  は `"<builtin>"` のような sentinel。`StyleSheetIndex` 型を導入する
  symbolic ID 案より consumer のコストが小さい
- **`expected-semicolon-between-properties` は error severity**: silent に
  property が消えるのは明らかな誘いバグなので、error で表面化させる。
  診断は表示のみで build を止めないため、既存の壊れた `.krs.style` も
  recover で動作を継続する
- **#1168 PR の scope は audit 結果を含めて広く取る**: parser の他の silent
  ケース（parseSelector / parseDeclaration の recovery が緩い箇所）も
  同じ PR で audit して必要な診断を追加する。レビュー負荷は上がるが、
  「parser 全体の診断方針」を一度の PR で足並み揃えて整理した方が
  後の認知コストが低い

## 未解決の問い

なし（フェーズ 1 のスコープは確定。フェーズ 2/3 は意図的に方向性のみで
止め、機能要請が立ち上がった時に本 doc に戻ってきて詳細化する）
