---
id: ADR-20260510-01
title: "Tidy Style コマンド — `.krs.style` に trivia 保持と軸グループ並び替えを行う round-trip formatter"
status: accepted
date: 2026-05-10
topic: parser
depends_on:
  - ADR-20260509-02
related_to:
  - ADR-20260322-01
  - ADR-20260328-01
  - ADR-20260508-01
scope:
  packages: [core, cli, app, lsp, vscode]
assumptions:
  - "file: packages/core/src/style/tidy.ts"
  - "file: packages/core/src/style/serialize.ts"
  - "file: packages/core/src/style/property-axes.ts"
  - "symbol: packages/core/src/style/tidy.ts :: tidyStyleSheet"
  - "file: packages/cli/src/tidy-style.ts"
  - "grep: packages/lsp/src/server.ts :: krs-style"
---

# ADR-20260510-01: Tidy Style コマンド — `.krs.style` に trivia 保持と軸グループ並び替えを行う round-trip formatter

- **日付**: 2026-05-10
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#1177](https://github.com/kompiro/karasu/issues/1177)
  - 実装 PR: [#1183](https://github.com/kompiro/karasu/pull/1183)（PR-A: AST trivia）、[#1188](https://github.com/kompiro/karasu/pull/1188)（PR-B: tidy core）、[#1191](https://github.com/kompiro/karasu/pull/1191)（PR-C: surface integration）
  - 親 Design Doc（フェーズ計画）: [`docs/design/style-ast-shape.md`](../design/style-ast-shape.md)
  - 前提 ADR: [ADR-20260509-02](./20260509-02-style-ast-position-and-recovery.md)（Phase 1 — AST `loc` + recovery）
  - 関連 ADR: [ADR-20260508-01](./20260508-01-gui-style-inplace-update.md)（GUI in-place update — Tidy が後始末する累積を予防する片側）

## 背景

ADR-20260508-01 で GUI 編集が単一プロパティの場合に in-place update する
ようになり、iterative editing 時の rule 累積は予防できるようになった。
ただし以下のシナリオでは依然 `.krs.style` が散らかる:

- 過去に append-only 時代の累積を持つファイル
- AI / Translate 機能（#355 系）が複数 `.krs.style` を生成するケース
- 著者が手で大量に rule を書いて並びがバラバラなケース

`docs/design/style-ast-shape.md` のフェーズ 2 で示した「trivia 保持 +
正規化 round-trip」を、ここで Tidy Style コマンドとして具現化する。
Phase 1 で AST に `loc` / `sheetId` が入った上に **コメント・空行を
保持する trivia 層** を additive に重ね、`tidyStyleSheet` 関数が
parser → 正規化 passes → serializer の round-trip を提供する。

## 決定

### AST 拡張（trivia 層）

- `Token.leadingTrivia: Trivia[]`（lexer がコメント・空行を回収）
- `Trivia { kind: "block-comment" | "line-comment" | "blank-line"; text; loc }`
- `StyleRule.leadingTrivia / trailingTrivia / declarationTrivia` を
  optional で追加（resolver は無視）
- `StyleSheet.trailingTrivia` で footer コメントを保持
- 連続する blank line は **1 つの blank-line trivia** に collapse

### `tidyStyleSheet(input, options)` のパス

順序は固定（idempotent を確保）:

1. **重複ルールのマージ**: 同一 selector の rule を cascade-tail 勝ちで
   1 つにそろえる。各 rule の leading trivia は元の出現順に連結。
   declaration の trailing trivia は同 property 名で concatenate。
   `merge: false` で opt-out 可能（CLI の `--no-merge`）。
2. **プロパティ並び替え**: `visual` → `typography` → `layout` → `karasu`
   の 4 軸グループ順にバケットソート。グループ内は元の宣言順を保持。
   未知プロパティは `karasu` に寄せる（forward compatibility）。
3. **再シリアライズ**: 2 スペース indent、`: ` セパレータ、ルール間 1 行
   空行に正規化。trivia は宣言と一緒に移動する（並び替えてもコメントが
   ついていく）。グループ selector (`a, b { ... }`) は body が一致する
   間だけ再グループ化。

### Surface（3 経路）

- **CLI**: `karasu tidy-style [files...]` — `karasu fmt` と同じ shape。
  `--check` / `--stdin` / `--no-merge` をサポート。引数なしのときは
  cwd 配下の `.krs.style` を再帰探索
- **App**: `.krs.style` を開いている時のみ edit-pane toolbar に `✨ Tidy`
  ボタン。`Format` ボタンは同時には出さない（`format()` は `.krs` 専用
  なので silent に何も起きないのを避ける）
- **VS Code**: LSP サーバー (`packages/lsp/src/server.ts`) の
  `onDocumentFormatting` を **言語別ルーティング**:
  - `krs` → `format()`
  - `krs-style` → `tidyStyleSheet()`
  
  formatter プロバイダは LSP 1 つだけが見える形に集約 — VS Code の
  "Configure default formatter" ダイアログを避ける。`Karasu: Tidy Style`
  パレットコマンドは内部で `editor.action.formatDocument` を呼ぶ薄い
  ラッパで、`editor.formatOnSave` 経路と同じコードを通る

### 細部の確定方針

- **コメントの所属**: leading（前置き、改行を挟む）と trailing（同行・
  直後）。並び替えで宣言と一緒に動く
- **コメント直後の blank line**: Trivia として保持（「表題コメント +
  空行」のグループ表現を残す）
- **行末コメント**: 行幅判定なしで常に同一行を保つ（idempotent 保証を軽く）
- **Format-on-save**: デフォルト無効。ユーザーが `editor.formatOnSave`
  を opt-in する運用

## 理由

- **GUI / CLI / VS Code の 3 経路を 1 つの core 関数で支える**:
  `tidyStyleSheet` を `@karasu-tools/core` から export し、すべての
  surface が同じ実装を call する。挙動の乖離が原理的に発生しない
- **idempotent を契約として保証**: `tidy(tidy(x)) === tidy(x)` をテストで
  固定。CI から `karasu tidy-style --check` で drift 検出が安全に使える
- **手書き整形を壊さない**: trivia 層により、軸グループ並び替え後も
  コメントは元の宣言にくっついて移動する。著者の意図が消えない
- **GUI の append-only 予防策と相補関係**: ADR-20260508-01 の
  in-place update は「これからの編集を散らかさない」、Tidy は「過去の
  累積を整理する」。役割分担が明確
- **VS Code formatter の集約**: 拡張本体側で
  `registerDocumentFormattingEditProvider` を別途呼ばず、LSP に集約。
  formatter が 2 つ見える状態を避け、UX を安定させる

## 却下した案

### 案: 並び順をアルファベット順だけにする
プロパティを単純 `localeCompare` で並べる。

- 却下理由: `color` / `background-color` / `border-color` のような関連
  プロパティが離れる。視覚的なグループを破壊し、診断時の認知負荷が
  上がる。軸グループ順（4 軸）の方が読みやすい

### 案: 並び順は元順序を保つ（並び替えなし）
重複マージとコメント保持だけ行う。

- 却下理由: Tidy の主目的の半分（ファイル横断の見た目統一）が達成でき
  ない。複数の `.krs.style` で異なる順序が混在する状態が放置される

### 案: 重複ルールは黙ってマージしない
`--merge` を opt-in 化。

- 却下理由: cascade-tail 勝ちで効果が同じ rule の累積を残す価値が薄い。
  デフォルト merge + `--no-merge` で必要時だけ opt-out できれば十分

### 案: format-on-save をデフォルト挙動にする
ユーザー設定なしで保存時自動 tidy。

- 却下理由: 想定外の差分が PR にまぎれ込みやすい。明示的な opt-in が
  予測可能で安全

### 案: コメントを失う single-pass formatter
trivia 保持を諦めて parser → AST → 規範化テキストの流れにする。

- 却下理由: 著者のコメントが消えるのは破壊的。Tidy の信頼を損なう。
  trivia 層の追加コストはあるが、いったん作れば保守できるサイズ

### 案: VS Code 拡張本体側でも formatter を別途登録
LSP と extension の両方に同名 provider を登録（PR-C 初期実装）。

- 却下理由: VS Code が 2 つの provider を見て "Configure default
  formatter" を出す。ユーザーが LSP 側を選ぶと `format()` が `.krs.style`
  に対して silent に空 edit を返し、tidy が動いていないように見える。
  LSP に集約することで provider が 1 つだけになる

## スコープ外（フォローアップ）

- **フェーズ 3（構造化 value AST）**: [#1178](https://github.com/kompiro/karasu/issues/1178)
  で別管理。`tidyStyleSheet` が文字列値のまま扱う制約は本 ADR では維持
- **`.krs` 側の Tidy**: 別 issue（論理モデル削除を伴うため別の議論）
- **複数 `.krs.style` 横断のクロスファイル dedup**: diamond import 時の
  重複ルール検出。本 ADR では対象外
- **行末コメントの折り返し**: 一定長を超えたら次行に折る挙動は将来
  `--print-width` のような設定で検討
