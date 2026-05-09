---
id: ADR-20260509-02
title: "`.krs.style` AST に位置情報と sheetId を持たせ、parser の error recovery を明示する"
status: accepted
date: 2026-05-09
topic: parser
related_to:
  - ADR-20260322-01
  - ADR-20260328-01
  - ADR-20260508-01
scope:
  packages: [core]
assumptions:
  - "file: packages/core/src/parser/style-parser.ts"
  - "file: packages/core/src/types/style.ts"
  - "symbol: packages/core/src/parser/style-parser.ts :: StyleParser"
  - "grep: packages/core/src/types/ast.ts :: expected-semicolon-between-properties"
---

# ADR-20260509-02: `.krs.style` AST に位置情報と sheetId を持たせ、parser の error recovery を明示する

- **日付**: 2026-05-09
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue/PR: [#1168](https://github.com/kompiro/karasu/issues/1168) / [#1173](https://github.com/kompiro/karasu/pull/1173)
  - Design Doc（フェーズ計画全体）: [`docs/design/style-ast-shape.md`](../design/style-ast-shape.md)
  - 関連 ADR: [ADR-20260322-01](./20260322-01-builtin-style-and-reference.md)（builtin + cascade）、
    [ADR-20260328-01](./20260328-01-unified-style-pipeline.md)（resolver 一元化）

## 背景

`.krs.style` の AST は `StyleSheet { rules }`、`StyleRule { selector,
properties: Record<string, string>, specificity, sourceIndex }` という
最小構造で、cascade 解決には十分だったが、近年の機能要請で次の不足が
顕在化していた:

- **silent な構文エラー**: `color: red, direction: down;` のような
  `,` の誤用は `parseValue` が `;`/`}`/`EOF` まで貪欲に value を集める
  結果、`color = "red , direction : down"` という壊れた値が成立し、
  `direction` property が AST から消える。診断も出ない（#1168）
- **位置情報の欠如**: AST に `loc` が無いため、LSP はエラー位置を
  ピンポイントで指せず、GUI の in-place update（[ADR-20260508-01](./20260508-01-gui-style-inplace-update.md)）も
  AST 経由でなくテキスト正規表現で実装するしかなかった
- **シート横断のルール出自が不明**: 複数 `.krs.style` を解決した後、
  各 rule がどのファイル由来かを遡れなかった

`docs/design/style-ast-shape.md` ではこれらを 3 フェーズで段階的に
解消する方針を立てた。本 ADR はそのうち **フェーズ 1**（位置情報
追加 + sheetId 追加 + parser の error recovery 明示）の決定を記録する。
フェーズ 2（trivia 保持）／ 3（構造化 value AST）は依然 Design Doc 上で
方向性のみ保持し、機能要請が立ち上がった時に再検討する。

## 決定

`.krs.style` parser と AST を以下のように拡張する:

1. **AST に位置情報を必須フィールドとして追加**:
   - `StyleRule.loc: SourceRange`（`{` から `}` まで）
   - `StyleRule.declarationLocs: Record<string, SourceRange>`（property
     名から `;` まで、または `;` 省略時は最後のトークン末尾まで）
   - `StyleSelector.loc: SourceRange`
2. **`sheetId` をルール単位で必須に**:
   - `StyleRule.sheetId: string`。parser を通れば必ずセットされる。
   - `StyleParser.parse(source, sheetId?)` の第 2 引数で渡し、デフォルトは
     `"<anonymous>"`。builtin / icon-theme は `"<builtin>"` /
     `"<icon-theme>"` の sentinel、import-resolver は解決済みのファイル
     パスを渡す。
   - `StyleSheet.sheetId` は envelope レベルでは optional のまま残す
     （40+ 箇所のテスト fixture を破壊しないための実装上の譲歩。実用上
     は parser を通る限り常にセットされる）。
3. **`parseValue` に明示的な error recovery を入れる**:
   - `,` を見たとき、続く 2 トークンが `Identifier` + `Colon`（次の
     property 宣言の先頭）なら、新診断
     `expected-semicolon-between-properties` を **error severity** で
     push し、`,` を `;` として消費して値の蓄積を中断する。
   - 結果として両 property が AST に残り、cascade 解決も期待通り動く。
   - 正当な multi-value comma（`font-family: "X", sans-serif`）には
     影響しない（次が `Identifier` + `;` であって `Colon` ではないため）。
4. **fallback severity の方針**: 新診断は **error**。silent に property
   が消える誘いバグは表面化させる方を優先。診断は表示のみで build を
   止めないため、既存の壊れた `.krs.style` も recover で動作を継続する。

## 理由

- **位置情報を required にする** ことで、LSP / GUI / 将来の Tidy Style
  が「`loc` が undefined かもしれない」分岐を書く必要がなくなる。
  parser でセットし忘れるバグは型で防げる。
- **`sheetId` を rule 単位で必須にする** ことで、複数シート解決後も
  各 rule の出自を一意に遡れる。LSP の jump-to-definition や GUI の
  「どのファイルに書き戻すか」決定を支援できる。
- **error recovery を明示する** ことで、parser の暗黙の責務（どこまで
  読み、何を診断するか）が言語化される。`,` ケースは「silent に property
  が消える」のが具体的な誘いバグだったため、これだけでも体験改善が
  大きい。
- **AST writer ではなくテキストレベルで in-place update した
  ADR-20260508-01 の選択を補完する**: 位置情報があれば、将来
  AST writer に切り替えるときに既存実装を段階的に置き換えられる。

## 却下した案

### 案: `loc` を optional フィールドにする
parser からの差分が小さく、test fixture の修正もほぼ不要。

- 却下理由: consumer 側に「loc が undefined かもしれない」分岐を
  永続的に残す。型で渡し忘れを防げない。`StyleSheet.sheetId` は
  test fixture 数の都合で例外的に optional に残したが、`StyleRule`
  と `StyleSelector` レベルは required を維持する

### 案: `sheetId` を見送る（フェーズ 1 では `loc` だけ追加）
issue #1168 の修正と LSP 改善には `loc` だけで足りる。

- 却下理由: 複数シート解決後の rule 出自追跡は遠からず必要になる
  （AI 機能・複数 `.krs.style` ナビゲーションなど）。`loc` と一緒に
  入れるコストは小さく、後付けで required にする方が変更範囲が広がる

### 案: 新診断を warning severity にする
既存の壊れた `.krs.style` を持つユーザーへの影響を最小化。

- 却下理由: 診断は表示のみで build を止めないので、error にしても
  ユーザー体験への悪影響は無い。silent failure を警告レベルで放置すると
  気付かれにくく、issue #1168 のような事故が再発する

### 案: `,` を「property 区切り」として正式に許可する
CSS 互換性とは別に、karasu 独自で `;` も `,` も区切りとして受け入れる。

- 却下理由: `font-family: "X", sans-serif` のような **value 内の
  `,`** との曖昧性が出る。lookahead で peek すれば技術的には判別可能
  だが、spec に「区切りは `;` のみ」を明記して silent failure を消す
  方が、単純で誤読しにくい

## スコープ外（フォローアップ）

- **フェーズ 2**: コメント・空白を保持する trivia 設計。Tidy Style や
  formatter が立ち上がった時に Design Doc に戻ってきて詳細化する
- **フェーズ 3**: `properties: Record<string, string>` を構造化された
  `ValueNode` ユニオンに置き換える。エディタ補完・型レベル diagnostic が
  必要になった時に検討する
- **既存の他の silent ケース**: 今回の audit では parser の他の
  `silent` 系 recovery は `expect()` 経由で `style-token-type-mismatch`
  が出ることを確認した。さらなる審査が必要になれば別 issue で個別対応
- **`StyleSheet.sheetId` の required 化**: 40+ 箇所のテスト fixture を
  整理する別 PR で対応可能。本 ADR ではコスト/価値の判断で見送る
