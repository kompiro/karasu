# 診断の位置情報にファイル識別を持たせる

- **日付**: 2026-09-11
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#2715](https://github.com/kompiro/karasu/issues/2715)
  - 派生元: [#2596](https://github.com/kompiro/karasu/issues/2596)（`node-id-multiple-locations` を cross-file 判定にした PR の手動確認で踏んだ）
  - 関連 ADR: [ADR-2596](../adr/2596-node-path-index-merged-model.md)（却下案の理由として「`Diagnostic` の `loc` はファイル識別を持たない」と明記している）, [ADR-121](../adr/121-cli-render-command.md)（CLI stderr の契約 `Error: <file>:<line>:<col>: <message>`）, [ADR-429](../adr/429-cross-file-navigation.md)（`nodeFileIndex` の導入）, [ADR-2161](../adr/2161-boundary-membership-1n.md) / [ADR-2410](../adr/2410-import-coupled-diagnostics-decline-and-invalid-owns-kind-only.md)（マージ後に判定する診断群）
  - 関連 TPL: [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md), [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md), [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md), [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md), 新規 proactive TPL-2715（本 PR で起こす）
  - コード: `packages/core/src/types/tokens.ts`, `packages/core/src/parser/parser.ts`, `packages/core/src/fs/import-resolver.ts`, `packages/cli/src/compile-system-view.ts`, `packages/cli/src/diff.ts`, `packages/app/src/components/PreviewPane.tsx`

## 背景・課題

`Diagnostic` は `loc`（行・列・offset）を持つが、**その行が何というファイルの行なのかを持たない**。
消費側はそれを「ユーザーが指定したエントリファイルの行」として読む。マルチファイルのモデルでは
これが成立しないので、CLI と app は**どのファイルにも存在しない位置**を印字する。

Issue はマージ後に判定される 5 コード（`duplicate-*` と `node-id-multiple-locations`）を挙げているが、
再現を取った結果、**欠落はその 5 コードに閉じていない**。実測した 3 件を示す。

### 実測 1: マージ後判定の診断が、別ファイルの行をエントリファイルの行として印字する

`index.krs`（7 行）が `legacy.krs`（15 行）を import し、両者が同名の `service Search` を宣言する。

```
$ karasu render index.krs -o out.svg
Warning: index.krs:13:4: Node id "Search" appears in multiple locations; ...
```

警告が指す宣言は `legacy.krs` の 12 行 3 列にある。印字は `index.krs` の 13 行 4 列で、
**`index.krs` は 7 行しかない**。ファイルも行も列も違う。

### 実測 2: 単一ファイルでも行と列が 1 ずれる

```
$ cat -n single.krs
     1  system Shop {
     2    service Api
     3  }
     4  user Bob
$ karasu render single.krs -o out.svg
Error: single.krs:5:2: A top-level user is not allowed — declare it inside a system block
```

core の位置は 1-based である（`Lexer.line = 1` から開始し、`packages/lsp/src/lsp-position.ts` は
「Core positions are 1-based; LSP positions are 0-based」として 1 を**引いて**いる）。
ところが `formatDiagLoc` は `line + 1` / `column + 1` を印字する。4 行のファイルで 5 行目を指す。
同じ CLI の中でも `karasu lint-style` は `+1` せず 1-based のまま印字しており、**CLI 自身が食い違っている**。

このずれは実測 1 とは独立した欠陥だが、症状は同じ（存在しない行を指す）で、発生箇所も同じ関数である。
Issue 本文の「`index.krs:121:3` で `index.krs` に無い行を印字する」は両方の原因で起こる。

### 実測 3: `.krs.style` の parse 診断がエントリ `.krs` に付く

```
$ karasu render styled.krs -o out.svg
Error: styled.krs: Expected LeftBrace but got RightBrace ("}")
```

エラーは `theme.krs.style` にある。`ImportResolver.resolveStyleSheet` は
`StyleParser.parse(source, filePath)` の診断をそのまま project の診断に積むため、
スタイルシートの構文エラーが `.krs` のエラーとして出る。

### 影響範囲は「マージ後の 5 コード」より広い

`ImportResolver.loadFileRecursive` は**全 import 先ファイルの parse 診断**を
（`MERGED_SPACE_REFERENCE_CODES` を落とした残りすべて）project の診断に積む。
つまり import 先ファイルの構文エラーは、マージ後判定かどうかに関係なく、
エントリファイルの位置として印字される。頻度で言えばこちらの方が圧倒的に多い。

さらに compile 側にもマージ後判定がある。`validateProjectEdgeIdUniqueness`（`duplicate-edge-id`）と
`assignEdgeCanonicalIds`（`ambiguous-edge-base`）は `ImportResolver` の**後**で走り、
どのファイルの宣言にでも anchor しうる。

したがって設計は「5 コードに `file` を足す」ではなく、**位置情報がファイル識別を伴って運ばれる形**を
決める問題として扱う。

## 現状（インベントリ）

### 位置情報の生産者

| 生産者 | 位置の出どころ | ファイル識別 |
| --- | --- | --- |
| `Parser`（per-file parse） | token の `loc` | 無い。`Parser.parse(source)` はパスを受け取らない |
| `StyleParser` | token の `loc` | `sheetId`（= filePath）を受け取り **`StyleSheet` / `StyleRule` には載せている**が、診断には載せていない |
| `reference-validation.ts` のマージ後 rebuild | 宣言ノード / `boundary` / `facet` / `team` / `resource` 参照の `loc` | 無い |
| `resolver/canonical-id.ts`（compile 段階） | edge の `loc` | 無い |
| `ImportResolver` 自身（`file-not-found` 等） | loc 無し。`params.filePath` が持つ | params にある |

### 位置情報の消費者

| 消費者 | 現在の印字 | 欠陥 |
| --- | --- | --- |
| `packages/cli/src/compile-system-view.ts` `formatDiagLoc` | `<entry>:<line+1>:<col+1>` | ファイル識別なし + 1 ずれ |
| `packages/cli/src/diff.ts` | `<line+1>:<col+1>`（ファイル名なし） | 1 ずれ |
| `packages/cli/src/lint-style.ts` | `<file>:<line>:<col>` | 正しい（単一ファイルを自分で走査するため） |
| `packages/app/src/components/PreviewPane.tsx` | `Line <line>` | 開いている文書の行として読ませる |
| `packages/lsp/src/diagnostics.ts` | LSP range（`line - 1`） | 単一文書 parse なので現状は正しい |
| `packages/nest/src/gallery/validate.ts` | 件数のみ | 影響なし |

### 位置を運ぶ型

```ts
// packages/core/src/types/tokens.ts
export interface SourceLocation { line: number; column: number; offset: number; }
export interface SourceRange { start: SourceLocation; end: SourceLocation; }

// packages/core/src/types/ast.ts
export type Diagnostic = { severity; code; params; loc?: SourceRange }[DiagnosticCode];
```

`.krs` の `SourceRange` を作る箇所は **`packages/core/src/parser/parser.ts:286` の `range()` 1 箇所だけ**である
（`{ start: {...start}, end: {...end} }`。token の `loc` を spread する）。
`SourceLocation` を作る箇所も `Lexer.loc()` 1 箇所。合成ノード（`collapse-stub.ts` / `unassigned-system.ts`）は
ゼロ値の loc を持つが、これらはソース上の実体を持たないので対象外でよい。

## 制約・前提

- **CLI の stderr は契約である**（ADR-121）。書式 `Error: <file>:<line>:<col>: <message>` は変えない。
  変えるのは `<file>` が正しいファイルを指すことと、`<line>:<col>` が 1-based のまま出ることの 2 点。
  1 ずれの修正は出力が変わる破壊的変更だが、**現在の値が誰にとっても正しくない**ので後方互換の対象にしない。
- **LSP は単一文書 parse を続ける**（ADR-429 の案F 却下理由: LSP ハンドラでは entryPath が不明）。
  したがって LSP 経路にはファイル識別が付かない。「付いていない」の意味を契約として決める必要がある。
- **perf を悪化させない**。app はデバウンス付きとはいえ編集のたびに compile する。
  診断のためだけに AST 全体を追加で walk する設計は避けたい。
- **`nodeFileIndex` は流用できない**。ADR-429 の「残課題」にあるとおり id キーの後勝ちで、
  しかも `system` / `service` / `client` とその子孫しか載らない。
  今回問題になる anchor は `facet` / `boundary` / `team` / edge も含み、
  さらに `node-id-multiple-locations` は**同じ id が複数ファイルにある**ことこそが判定の中身なので、
  id から引く索引は構造的に答えを持たない。
- スコープ外: 診断メッセージ本文の変更（i18n カタログ）、app から診断をクリックして該当ファイルへ飛ぶ導線。

## 検討した選択肢

### 案1: `Diagnostic` に `file?: string` を足し、resolver が stamp する

`ImportResolver` が診断を集める時点で `file` を埋める。per-file parse 診断は `loadFileRecursive` の
`filePath` をそのまま付ける。マージ後 rebuild の診断は、Pass 1 で作る
`Map<SourceRange, filePath>`（loc オブジェクトの identity をキーにする索引）で引いて付ける。
compile 段階で足される診断のために、`ResolvedProject` がこの索引を露出する。

**メリット**

- 型の変更が `Diagnostic` に閉じる。消費側は `d.file` を読むだけ
- 索引を遅延構築すれば、診断が 1 件も無いときのコストはゼロ

**デメリット**

- **stamp 漏れが黙って起きる**。将来マージ後判定を足した人が choke point を通さなければ、
  その診断だけファイル識別を失う。TPL-1032 が戒める「同じ事実の導出が 2 本になる」形
- loc オブジェクトの identity に依存する。`mergeNamedImport` の
  `{ ...service, tags, annotations }` のように spread でノードを複製する箇所があり、
  「identity は保たれる」という前提の説明が毎回必要になる
- 索引は AST 全体の walk を要する。遅延にしても、編集中は診断が出ている時間の方が長い

### 案2: `SourceRange` に `file?: string` を足し、parse 時に流し込む

`Parser.parse(source, filePath?)` を追加し、`range()` が生成する `SourceRange` に `file` を載せる。
`ImportResolver` は `Parser.parse(source, filePath)` / `StyleParser.parse(source, filePath)` を呼ぶ。
以降、`loc` を持つ診断は**どこで作られても**ファイル識別を持つ。

```ts
export interface SourceRange { start: SourceLocation; end: SourceLocation; file?: string; }

// parser.ts
private range(start: Token["loc"], end?: Token["loc"]): SourceRange {
  return { start: { ...start }, end: end ? { ...end } : { ...start }, ...(this.filePath ? { file: this.filePath } : {}) };
}
```

**メリット**

- **構造的に漏れない**。位置とファイルが同じオブジェクトで運ばれるので、
  診断を新設した人が何もしなくても識別が付く。compile 段階の `duplicate-edge-id` /
  `ambiguous-edge-base` も、`.krs.style` の parse 診断も、追加作業なしで直る
- 索引も stamp パスも要らない。追加コストは `SourceRange` 1 個につき文字列参照 1 つ
- 生成箇所が `parser.ts:286` の 1 箇所なので、実装は数行
- `Warning.loc` も同じ型なので同時に恩恵を受ける。ノードの `loc` にも載るため、
  `nodeFileIndex` の後勝ち（ADR-429 の残課題）を将来直す土台にもなる
- `StyleParser` が既に `sheetId` を受け取って `StyleSheet` に載せている前例と同型

**デメリット**

- `SourceRange` は AST 全体で使われる中心的な型で、変更の影響半径が名目上は大きい
  （実際には optional 追加なので型エラーは出ない）
- `Parser.parse(source)` を引数なしで呼ぶ既存テストは `file` が付かない。
  `toEqual` での loc 比較は `undefined` キーを持たない形にすれば影響しない
- 消費側は `d.loc?.file` と 2 段で読むことになる（`d.file` よりわずかに冗長）

### 案3: 報告時に `nodeFileIndex` から引く（Issue の第 2 案）

型は変えず、印字の直前に `nodeFileIndex.get(nodeId)` で解決する。

**メリット**

- 型変更ゼロ

**デメリット**

- **今回の 5 コードに対して構造的に答えを持たない**。索引は id キーの後勝ちなので、
  `node-id-multiple-locations` が anchor する「負けた側の宣言」のファイルは引けない
  （引けるのは勝者のファイルである）。`duplicate-facet-id` / `duplicate-boundary-id` に至っては
  facet / boundary が索引に載っていない
- 消費側それぞれが解決ロジックを持つことになり、TPL-1417 が言う「構造化メッセージの
  レンダラは 1 本」から外れる

## 比較

| 観点 | 案1（`Diagnostic.file`） | 案2（`SourceRange.file`） | 案3（報告時解決） |
| --- | --- | --- | --- |
| 実装の変更量 | 中（索引 + stamp 経路 + 露出） | 小（`range()` と parse の引数） | 小 |
| 5 コードを直せるか | ○ | ○ | **✗**（索引が答えを持たない） |
| import 先の parse 診断を直せるか | ○ | ○ | ✗ |
| `.krs.style` の診断を直せるか | △（別経路の stamp が要る） | ○ | ✗ |
| compile 段階の診断を直せるか | △（索引の露出が要る） | ○ | ✗ |
| 将来の新診断が自動で正しいか | **✗**（stamp 漏れ） | ○ | ✗ |
| 実行コスト | AST walk（遅延可） | `SourceRange` あたり参照 1 つ | ゼロ |
| 型の影響半径 | 小 | 中（optional 追加） | なし |

## Related TPLs

- [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md): マージ後にしか見えない事実はマージ後のモデルで判定する。本件はその判定が**どこで下されたか**を運べていない裏面
- [TPL-1032](../test-perspectives/TPL-1032-derived-state-staleness.md): 同じ事実の導出を 2 本にしない。案1 の stamp 漏れを却下理由にした根拠
- [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md): 構造化メッセージのレンダラは 1 本。案3 の却下理由
- [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md): 記録が指すアドレスは到達可能でなければならない。診断の位置も同じ性質を持つ
- **TPL-2715（本 PR で新規に起こす proactive TPL）**: 位置情報は文書識別と対でしか運べない

## 現時点の方針

**案2 を採用する。** 理由は 2 つある。

1 つは**欠落の広さ**である。実測 1 だけを直すなら案1 でも足りるが、実測 3（`.krs.style`）と
compile 段階の 2 コードは別経路を通るので、案1 では stamp 箇所が 3 つに増える。
案2 は「位置を作る場所」が 1 箇所しかないので、そこに識別を載せれば全経路が同時に直る。

もう 1 つは**再発の止め方**である。この欠陥は #2596 の時点で認識されていた
（ADR-2596 は却下案の理由として「`Diagnostic` の `loc` はファイル識別を持たない」と明記している）
のに、診断が増えるたびに同じ穴に落ちる形で残った。位置とファイルを同じオブジェクトに置けば、
新しい診断を書く人は何も意識しなくてよい。stamp 方式は「意識すべきこと」を 1 つ増やす。

### 決めること: `file` が無いときの意味

**`loc.file` が無い診断は、消費側が自分で parse した文書のものとして読む。**
これは単一文書 parse（LSP、`karasu lint-style`、`nest` の validate）の経路だけが該当する。
`ImportResolver` を通った診断は、`loc` を持つ以上 `file` を必ず持つ。
resolver のテストで「`loc` を持つ診断は全件 `file` を持つ」を assert して機械的に縛る。

`file` には**絶対パスを入れる**（resolver が扱う通貨に合わせる。`nodeFileIndex` と同じ）。
表示用の綴りは消費側が決める。

### 決めること: 各消費者の表示

| 消費者 | 変更後 |
| --- | --- |
| CLI `formatDiagLoc` | `+1` をやめる。`loc.file` がエントリと同じなら**ユーザーが打った綴り**をそのまま使い、違うなら cwd からの相対パスにする |
| CLI `diff.ts` | `+1` をやめる。ファイル名は before / after の 2 系統があるので本 Issue では足さない（`loc.file` を出す形は follow-up） |
| app `PreviewPane` | 開いている文書の診断は `Line <n>: <message>` のまま。別ファイルの診断は `<相対パス>:<n>: <message>` にする（新しい訳語を増やさない書式を選ぶ） |
| LSP | 変更なし。単一文書 parse にパスを渡さないので `file` は付かない |

### 実装の指針

1. `packages/core/src/types/tokens.ts`: `SourceRange` に `file?: string` を足す
2. `packages/core/src/parser/parser.ts`: `Parser.parse(source, filePath?)` を足し、`range()` で `file` を載せる
3. `packages/core/src/parser/style-parser.ts`: 既存の `sheetId` を同じ形で `SourceRange` に載せる
   （匿名シートのときは載せない）
4. `packages/core/src/fs/import-resolver.ts`: `Parser.parse(source, filePath)` を渡す
5. `packages/cli/src/compile-system-view.ts` / `diff.ts`: 1 ずれを直し、`loc.file` を優先する
6. `packages/app/src/components/PreviewPane.tsx`（+ `PreviewColumn`）: 現在のファイルパスを受け取り、
   別ファイルの診断にはパスを前置する
7. `docs/spec/diagnostics.md` / `diagnostics.ja.md`: 「Source locations」節を新設し、
   位置が 1-based であること・`file` の意味・無いときの解釈を規定する。
   spec に新規節を足すので proactive TPL を同 PR で起こす（`.claude/rules/spec-audit.md`）
8. AT: `docs/acceptance/diagnostic-source-file-identity.md`。TC は:
   - 2 ファイルモデルで `karasu render` が import 先の宣言を**そのファイルのパスと行**で印字する
   - 印字された行番号がそのファイルの実テキストと一致する（1 ずれの回帰ガード）
   - `.krs.style` の parse エラーがスタイルシートのパスで印字される
   - app のプレビュー banner が、別ファイル由来の診断にファイル名を前置する
   - LSP の単一文書診断が変わらない
9. ADR 昇格: 実装完了後 `docs/adr/2715-diagnostic-source-file-identity.md` として昇格し、
   本 Design Doc は同 PR で削除する

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: CLI の stderr に出る行・列が 1 減る（今まで 1 多かった）。
  マルチファイルでは印字されるファイル名が変わる。どちらも「今まで正しくなかった値」が直る向き
- ドキュメント更新: `docs/spec/diagnostics.md` / `.ja.md`（新設節）、`docs/adr/121-cli-render-command.md` は
  書式を変えないので更新不要
- テスト・examples への影響: `Parser.parse(source)` を引数なしで呼ぶテストは `file` が付かないので無影響。
  resolver 経由のテストで loc を厳密比較しているものがあれば `file` の追加に追随する

## 未解決の問い / 決めないこと

- **app の診断バナーからのジャンプ**は決めない。`useJumpToEditor` に cross-file ジャンプの
  機構は既にあるので繋げられるが、本 Issue の主題は「嘘の位置を出さない」ことであり、
  導線は別 Issue に切る
- **`diff.ts` にファイル名を出すか**は決めない。before / after の 2 系統があり、
  どちらのファイルかを示す表記を別途決める必要がある
- **`nodeFileIndex` を `loc.file` から導出し直すか**は決めない（ADR-429 の残課題である id 後勝ちを
  直せる可能性があるが、本 Issue のスコープ外）
