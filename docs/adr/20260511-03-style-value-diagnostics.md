---
id: ADR-20260511-03
title: "`.krs.style` 値レベル診断 — 構造化 ValueNode AST と property schema による validator"
status: accepted
date: 2026-05-11
topic: parser
depends_on:
  - ADR-20260509-02
  - ADR-20260510-01
related_to:
  - ADR-20260322-01
  - ADR-20260328-01
scope:
  packages: [core, app, cli, lsp]
assumptions:
  - "file: packages/core/src/types/value-node.ts"
  - "file: packages/core/src/style/value-validator.ts"
  - "file: packages/core/src/style/property-schema.ts"
  - "file: packages/core/src/style/css-named-colors.ts"
  - "file: packages/cli/src/lint-style.ts"
  - "symbol: packages/core/src/style/value-validator.ts :: validateStyleValues"
  - "symbol: packages/core/src/types/value-node.ts :: ValueNode"
  - "grep: packages/lsp/src/diagnostics.ts :: validateStyleValues"
---

# ADR-20260511-03: `.krs.style` 値レベル診断 — 構造化 ValueNode AST と property schema による validator

- **日付**: 2026-05-11
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1178](https://github.com/kompiro/karasu/issues/1178)
  - 実装 PR: [#1244](https://github.com/kompiro/karasu/pull/1244)（PR-A: ValueNode AST）、
    [#1254](https://github.com/kompiro/karasu/pull/1254)（PR-B: validator + schema）、
    [#1258](https://github.com/kompiro/karasu/pull/1258)（PR-C: LSP / CLI / App surface 統合）
  - 親 Design Doc（フェーズ計画）: [`docs/design/style-ast-shape.md`](../design/style-ast-shape.md)
  - 前提 ADR: [ADR-20260509-02](./20260509-02-style-ast-position-and-recovery.md)（Phase 1 — AST loc + recovery）、
    [ADR-20260510-01](./20260510-01-tidy-style-and-trivia.md)（Phase 2 — trivia + Tidy）
  - フォローアップ Issue: [#1285](https://github.com/kompiro/karasu/issues/1285)（既存
    examples の typo 修正）

## 背景

ADR-20260509-02 で AST に位置情報が、ADR-20260510-01 で trivia が入った。
値そのものは引き続き **文字列 join** で `properties: Record<string,
string>` に格納されており、resolver が必要に応じて `parseFloat` /
enum セット照合をしていた。typo / 型不一致は silent:

- `direction: dwon` — silent に fallback、診断なし
- `border-style: dashedd` — そのまま SVG `stroke-dasharray` に流れ、
  ブラウザが無効値として無視 → 実線
- `color: #zzzz` — そのまま SVG に流れて ブラウザがデフォルト色（黒）に
  fallback（#1168 系の silent failure）
- `stroke-width: 1.5` — 単位なし、ブラウザ依存
- `opacity: 1.5` — 範囲外

これらを個別に resolver で診断するアプローチもあるが、property を
増やすたびに resolver と diagnostic の両方を更新する保守コストが
重なる。フェーズ 3 では **値レベルの validation を一本化** し、parser
は loose に受理して validator が `property → ValueSpec` の schema に
対する整合性だけを見る分業を確立する（TPL-20260510-10 の原則）。

## 決定

### AST 拡張（PR-A）

`packages/core/src/types/value-node.ts` に discriminated union
`ValueNode` を新設する:

```ts
type ValueNode =
  | { kind: "ident"; value: string; loc: SourceRange }
  | { kind: "hex"; value: string; loc: SourceRange }
  | { kind: "number"; value: number; raw: string; loc: SourceRange }
  | { kind: "length"; value: number; unit: string; raw: string; loc: SourceRange }
  | { kind: "string"; value: string; loc: SourceRange }
  | { kind: "function"; name: string; argRaw: string; loc: SourceRange }
  | { kind: "list"; items: ValueNode[]; loc: SourceRange };
```

`StyleRule.valueNodes?: Record<string, ValueNode>` を additive で
追加。`properties: Record<string, string>` は canonical のまま残し、
resolver / Tidy / svg-builder は触らない（TPL-20260510-18 — テキスト
が単一の真実、`valueNodes` は派生）。

### Property schema（PR-B）

`packages/core/src/style/property-schema.ts` に `ValueSpec`
discriminated union と `PROPERTY_SCHEMAS: Record<string, ValueSpec>`
を置く:

```ts
type ValueSpec =
  | { kind: "ident-of"; values: readonly string[] }
  | { kind: "hex" }
  | { kind: "number"; min?: number; max?: number }
  | { kind: "length"; allowedUnits: readonly string[] }
  | { kind: "string" }
  | { kind: "url" }
  | { kind: "list-of"; item: ValueSpec }
  | { kind: "union"; specs: readonly ValueSpec[] }
  | { kind: "any" };
```

- `direction` / `border-style` / `font-weight` / `column` 等は
  `ident-of` 列挙
- `color` / `background-color` / `border-color` / `badge-color` は
  `union(hex, ident-of {CSS-named-colors})`（147 色）
- `shape` は `union(ident-of {...}, url)`
- `font-family` は `list-of {string | ident-of {sans-serif, serif,
  monospace}}`
- `opacity` は `number(min=0, max=1)`
- `font-size` / `border-width` / `stroke-width` / `border-radius` は
  `length({px})`
- `label-position` は `union(ident-of {start, middle, end}, number(0..1))`
- `label-offset` は `list-of length({px})`

### Validator（PR-B）

`validateStyleValues(sheet): Diagnostic[]` がルールごとに
`ValueNode` を走査し、`ValueSpec.kind` の **exhaustive switch**
（TPL-20260510-03）で照合。失敗時は parser-shaped `Diagnostic` を
返す（`loc` 込み）:

- `style-invalid-enum-value` — error
- `style-invalid-hex-color` — error
- `style-missing-length-unit` — error
- `style-invalid-length-unit` — error
- `style-out-of-range` — error
- `style-unknown-property` — **warning**（forward compat のため警告どまり）

enum は **case-sensitive**（`DOWN` は error）。

`union` は各 branch を試し、ひとつでも match すれば成功。すべて
失敗したときは最初の branch の診断を返す。

### Surface 統合（PR-C）

- **LSP**: `validateDocument` で `krs-style` のときに `validateStyleValues`
  を追加で呼び、診断を `publishDiagnostics` に merge。validator が
  返す `loc` を `toLspPosition` に流すだけで Monaco の squiggly が
  該当箇所に出る
- **CLI**: 専用コマンド `karasu lint-style [files...]` を追加。
  `<file>:<line>:<col> <severity>: <message>` 形式で出力。error 1 件
  以上で exit 1、warning のみで exit 0。`--stdin` 対応
- **App**: compile pipeline (`_compileFromPreparedInput`) が
  validator output を **既存の WarningPanel 経路** に流す。validator
  の `Diagnostic[]` を `Warning[]` に翻訳する `diagnosticToWarning`
  ヘルパで 6 種類の `WarningKind` (`style-invalid-enum-value` 等) に
  マッピング。`column: rightd` と同じパネルに `direction: dwon` 等が
  並ぶ
- **builtin / icon theme sheet は validator 対象外**（trust、`sheets[0]`
  をスキップ）

## 理由

- **parser は loose、validator が validate**（TPL-20260510-10）—
  parser を改修する量を最小化し、value validation の責任を 1 箇所に
  集約する
- **`ValueSpec` を discriminated union にして switch + exhaustive
  check**（TPL-20260510-03）— spec に kind を追加したら validator の
  switch が型エラーで網羅漏れを検出する。schema を増やす保守コスト
  が型で軽くなる
- **`union` ケースが `shape` と `color` の両方をカバー**（Q1 の確定）—
  特殊 case を増やさない
- **`properties` と `valueNodes` の二重表現を許容**（案 2 採用）—
  resolver / Tidy / svg-builder への影響をゼロに抑え、将来別 PR で
  `properties` を `valueNodes` 由来に置き換えるロードマップを残す
  （スコープ外、別 ADR）
- **App surface は WarningPanel 集約**（PR-C 中の修正）— validator
  出力を diagnostics チャンネルに流すと PreviewPane の赤バナーに
  二重表示されてしまう。Warning kind を 6 つ増やしてでも `column:
  rightd` と同じパネルに揃えるほうが UX として一貫
- **未知 property は warning だけ**（Q2）— spec.md に追加予定の
  property が将来出ても、ユーザーの旧ファイルを break しない
  forward compat
- **enum は case-sensitive**（Q6）— spec.md は全小文字。karasu の
  vocabulary は小さく、CSS の case-insensitivity に合わせるメリットが薄い
- **全 diagnostic は error severity から開始**（Q5）— 緩める方が後で
  容易。silent failure をすべて表面化させる
- **3 surface すべてが core の `validateStyleValues` を call**（PR-C）
  — 実装の乖離が原理的に発生しない

## 却下した案

### 案: ValueNode を増やさず、validator が生 string を見る
parser は今のまま `properties: Record<string, string>`。validator が
property 名で switch して string に regex / 含有チェックを走らせる。

- 却下理由: validator が parser の知識（`url(...)` の中身を取り出す
  等）を重複して持つことになる。値内のトークン単位 loc が出せない
  ので「typo 部分」を underline できない

### 案: ValueNode AST で `properties` を **置き換える**
`properties: Record<string, ValueNode>` に置換し、resolver / Tidy /
svg-builder の既存 `props["..."]` 読み取りを shim で受ける。

- 却下理由: 全 consumer を一斉に変える必要があり PR サイズが大きい。
  resolver の `parseFloat` / type cast コードが多数あり、置換コスト
  が見合わない。将来別 ADR で段階移行可能

### 案: 全 diagnostic を warning severity で開始
既存ファイルの破壊リスクを最小化する保守的選択。

- 却下理由: CI 統合（`karasu lint-style --check` 相当）で価値を出す
  には error が必要。warning に弱めると silent failure が再発する。
  ファイル破壊は validator が「ignored」と振る舞うので発生しない

### 案: enum 値を case-insensitive で受理
CSS は case-insensitive なので親和性を取る。

- 却下理由: karasu の vocabulary は小さく、規復コストが低い。
  case-insensitive にすると Tidy が正規化するか否かの議論が増える。
  spec.md の表記に揃えるほうが単純

### 案: dedicated コマンドではなく `tidy-style --check` に診断を folding
`karasu tidy-style --check` が drift と validation を兼用。

- 却下理由: Tidy と Lint の役割が混ざる。ファイルが既に tidy でも
  validation 失敗を別個に検出したいケースで `tidy --check` は冗長

### 案: App では LSP / Monaco markers 経由で表示
拡張本体側で Monaco に markers を直接セットする。

- 却下理由: App は LSP を使わない。compile pipeline の既存
  `warnings` チャンネル (`WarningPanel`) を再利用すれば new UI
  plumbing なしで完了する

## スコープ外（フォローアップ）

- **`properties` を `valueNodes` 由来に切り替えるロードマップ**:
  Phase 3 完了後に別 PR / ADR で扱う。本 ADR では「二重表現を維持」
  と明記
- **value 正規化** (`#FF0000` → `red`、`1.5` → `1.5px` の補完など):
  validator では未対応。Tidy の future 拡張 or 専用 fmt パスで検討
- **完成度の高い completion / hover**: 本 ADR は validation のみ。
  LSP の completion / hover は別 issue
- **既存 examples の typo 修正**: [#1285](https://github.com/kompiro/karasu/issues/1285)
  で sweep する
- **CSS named color 以外の色表現** (`rgb(...)`, `hsl(...)` 等):
  対象外。karasu は hex と named のみ
- **value 内のトークン単位の loc を validator が利用する細粒度
  underline**: 一部は実装済み (`node.loc`)、改善余地は残る
