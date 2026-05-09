# Tidy Style コマンドと style AST の trivia 保持（フェーズ 2）

- **日付**: 2026-05-09
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1177](https://github.com/kompiro/karasu/issues/1177) — Tidy Style command
  - 親 Design Doc（フェーズ計画全体）: [`docs/design/style-ast-shape.md`](./style-ast-shape.md)
  - 前提 ADR: [ADR-20260509-02](../adr/20260509-02-style-ast-position-and-recovery.md)（Phase 1 — 位置情報 + recovery）
  - 関連 ADR: [ADR-20260508-01](../adr/20260508-01-gui-style-inplace-update.md)（GUI in-place update — Tidy が後始末する累積を減らす予防策）
  - 関連 Issue: [#1178](https://github.com/kompiro/karasu/issues/1178)（フェーズ 3 — 構造化 value AST、本フェーズの後続）

## 背景

`docs/design/style-ast-shape.md` のフェーズ 2 で「trivia（コメント・空白）保持」
の方向性だけが示されていた。Tidy Style コマンド（#1177）が具体的な機能要請
として立ち上がったので、本 design doc でフェーズ 2 のスコープを Tidy Style
を駆動軸として詳細化する。

直接の動機:

- ADR-20260508-01 の単一プロパティ in-place update で iterative editing 時の
  累積は予防できるが、**過去ファイル・複数プロパティ rule の bulk 編集** は
  依然散らかる
- AI / Translate 機能（#355 系）が複数 `.krs.style` を生成するときの正規化
  ベースが欲しい
- フェーズ 1 で AST に `loc` を入れたので、**parser → trivia 付き AST →
  formatter → 文字列** の round-trip を実装する基盤が揃った

## 制約・前提

- **既存の resolver 出力は不変**: フェーズ 1 と同じく additive な拡張に
  留め、resolver は trivia を無視する
- **idempotent 必須**: Tidy(Tidy(x)) === Tidy(x)。CI で `tidy --check` を
  使えるように
- **フェーズ 3（構造化 value AST）は後続**: 本フェーズでは property value は
  文字列のまま扱う。値レベルの正規化（`#FF0000` → `red` のような変換）は
  対象外
- **`SnapshotOverlayFs` などの特殊 fs は対象外**: Tidy はファイルパスに対する
  操作で、in-memory snapshot 等は触らない

## 確定した方針（インタビューで確定）

1. **コマンド surface**: 3 つすべて提供
   - **CLI**: `karasu tidy-style <file>` / `karasu tidy-style --check <file>` /
     `karasu tidy-style --write <file>`（ディレクトリ再帰、複数ファイル指定可）
   - **App / Preview**: `.krs.style` を開いた状態でツールバーから「Tidy」
     ボタン。内部的には CLI と同じ実装ロジックをラップ
   - **VS Code 拡張**: `Karasu: Tidy Style` パレットコマンド + `karasu.style`
     言語に対する formatter プロバイダ（`editor.formatOnSave` をユーザーが
     有効にすれば自動）
2. **プロパティの並び順**: **4 軸グループ順**（visual / typography / layout / karasu）、
   各軸内は宣言順を保つ
   - `visual`: `color`、`background-color`、`border-*`、`opacity`、`stroke-*`
   - `typography`: `font-*`
   - `layout`: `direction`、`column`
   - `karasu`: `shape`、`badge-*`
3. **コメント**: leading / trailing 方式で AST に保持
   - leading — 改行を挟んで直後のデクラレーション/ルールに付く
   - trailing — 同一行で直前のデクラレーション/ルールに付く
   - 並べ替え時は **デクラレーションと一緒に動く**
4. **Idempotence**: 厳密に保証。`tidy --check` が CI から使える
5. **重複ルール**: 同一 selector の rule は cascade-tail 勝ちでマージして 1 つに
   そろえる（黙ってマージ。警告は出さない）
6. **ルール間の空行**: 常に 1 行空行に正規化（著者の 2 行・ゼロ行は 1 行に）
7. **グループセレクタ**: `a, b { ... }` はそのまま保つ（デデュプリは selector
   ごとに展開した状態で行う）

## AST 拡張（フェーズ 2 の core）

フェーズ 1 で `StyleRule.loc` などを足した上に、**trivia を additive で
追加** する:

```ts
interface Trivia {
  /** カンマで連結されたコメント・空行のオリジナルテキスト（再シリアライズ用）。 */
  text: string;
  kind: "block-comment" | "line-comment" | "blank-line";
  /** `text` が出現した範囲。formatter から不要なら無視可能。 */
  loc: SourceRange;
}

interface StyleRule {
  // ... フェーズ 1 まで
  leadingTrivia: Trivia[];   // ルール先頭 `{` の前
  trailingTrivia: Trivia[];  // ルール末尾 `}` の後（同一行のみ）
}

interface StyleSheet {
  rules: StyleRule[];
  // ... フェーズ 1 まで
  /** 末尾の trivia（最後の `}` 以降の空行・コメント）。 */
  trailingTrivia: Trivia[];
}
```

declaration レベルの trivia は **`Record<string, DeclarationTrivia>`** として
ルールに持つ:

```ts
interface DeclarationTrivia {
  leading: Trivia[];   // property 名の前
  trailing: Trivia[];  // `;` の後（同一行）
}

interface StyleRule {
  // ... 上記
  declarationTrivia: Record<string, DeclarationTrivia>;
}
```

理由:

- `properties: Record<string, string>` を破壊的に置き換えず、別フィールドに
  trivia を持つ → resolver / formatter / その他 consumer が optional に
  読める
- フェーズ 3 で `valueNodes` に置き換える時に declarationTrivia 側だけ
  キーを継承すれば移行が局所化する

## Tidy アルゴリズム（idempotent な順序で）

入力 → AST（trivia 付き） → 正規化変換 → 文字列出力。変換は次の順序で:

1. **同一 selector の rule をマージ**
   - cascade-tail 勝ちで properties を統合
   - leading/trailing trivia は最初の rule のものを採用、後続の rule に
     付いていた trivia は ad-hoc 付加（後述）
2. **プロパティを軸グループ順に並べる**
   - 各 declaration には軸タグを resolver-free な lookup で付与
   - グループ内は宣言順（マージ後の出現順）を保持
3. **declaration の trivia は declaration と一緒に移動**
   - leading は前述の通り
   - trailing は同一行に付ける（並べ替え後も同一行を保つ）
4. **ルール間の空行を 1 行に正規化**
   - 著者の 0 行・2 行は 1 行に揃える
   - 末尾改行は 1 つに正規化
5. **再シリアライズ**
   - selector / `{` / declarations / `}` のフォーマットは固定（インデント
     2 スペース、property の `:` の後に半角 1 スペース）

idempotent を保証するために:

- 出力フォーマットは決定的（selector list の表記揺れを正規化）
- マージ時の trivia 統合ルールは「マージ前の最大集合をルール先頭にまとめる」
  ように 1 回で集約。2 回目以降は変化しない
- 軸グループ判定は `property name → axis` の純粋関数

## CLI / App / VS Code 統合

### CLI

```
karasu tidy-style <file>...               # stdout に書き出し
karasu tidy-style --write <file>...        # ファイルに上書き
karasu tidy-style --check <file>...        # diff があれば exit 1
karasu tidy-style --no-merge <file>...     # 重複 rule のマージを無効化
```

実装は `packages/cli` で `packages/core/src/style/tidy.ts` を呼ぶ thin shim。

### App / Preview

ツールバー（`.krs.style` を開いている時）に **Tidy ボタン** を追加。
Click → core の `tidy(content): { content, changed }` を呼び、`fs.writeFile`
で書き戻す。`ObservableFileSystemProvider` 経由でエディタは
`useEditorExternalRefresh` で reload される（既存の round-trip）。

### VS Code 拡張

LSP の `textDocument/formatting` ハンドラを実装。`Karasu: Tidy Style`
パレットコマンドはこのハンドラを呼ぶラッパ。`editor.formatOnSave` を
ユーザーが有効化すれば format-on-save も動く（コア実装は同じ）。

## 検討した選択肢（採用しなかったもの）

### 案: 並び順をアルファベット順だけにする

- 却下: `color` と `background-color` が離れる、`border-color` と
  `border-style` も離れる。視覚的なグループを破壊する。覚えやすさより
  読みやすさを優先

### 案: 並び順は元順序を保つ（並べ替えなし）

- 却下: Tidy の主目的の半分（読みやすさ）が達成できない。重複ルールの
  マージだけでも価値はあるが、複数ファイルで一貫した見た目にはならない

### 案: 重複ルールはマージせずそのまま保つ

- 却下: cascade-tail 勝ちで効果は同じなのに行数だけ膨らむ状態が放置
  される。`--no-merge` フラグで個別 opt-out できるようにすれば十分

### 案: format-on-save をデフォルト挙動にする

- 却下: 想定外の差分が PR にまぎれ込みやすい。ユーザーが明示的に
  enable する選択にする

### 案: trivia を AST に保持せず、ファイル全体を AST → 規範化テキストで
再生成（コメント完全消去）

- 却下: 著者のコメントが消えるのは破壊的。Tidy の信頼を損なう

## MVP スコープ

1. **AST**: フェーズ 2 の trivia フィールドを `StyleRule` / `StyleSheet` /
   `declarationTrivia` に additive に追加
2. **lexer**: `skipWhitespaceAndComments` を **trivia collector** に置き換え、
   各 token の前後に attaching するロジック
3. **parser**: 既存ロジックは触らず、token の trivia を AST に集約
4. **`packages/core/src/style/tidy.ts`**: 入力 string → 出力 string の純関数
5. **CLI コマンド** `karasu tidy-style` (commander で `tidy-style` サブコマンド
   追加)
6. **テスト**:
   - golden test: 代表的な `.krs.style` を 5〜10 本用意し、Tidy 後の出力を
     スナップショットで固定
   - idempotence: 各 fixture に対し `tidy(tidy(x)) === tidy(x)`
   - コメント保持: leading/trailing が並び替えで一緒に動く
   - 重複 rule マージ
   - グループ selector の non-touch
   - 軸グループ順
7. **AT（acceptance）**:
   - CLI: 上記 fixture と check モードの正常終了 / 異常終了
   - App: ツールバーボタン押下で `.krs.style` が更新される（manual）
   - VS Code: パレットコマンドで現在のファイルが整形される（manual）
8. **spec docs**: `docs/spec/style.md` に「Tidy Style コマンドが行うこと
   と行わないこと」のセクションを追加

### 副次的な扱い

- **`SnapshotOverlayFs` などの特殊 fs**: 対象外（実ファイル経由のみ）
- **`.krs` 側の Tidy**: 別 issue（論理モデル削除を伴うため）
- **複数 `.krs.style` 横断のクロスファイル dedup**: 別 issue（diamond import
  時の重複ルール検出）
- **format-on-save の VS Code 設定 UI**: ユーザーが手で settings に書く
  運用で開始

## 確定した方針（追加レビューで確定）

1. **マージ後の leading コメントは出現順にルール先頭へ連結**:
   - 同一 selector の rule が複数あった場合、各 rule の `leadingTrivia` を
     **元の出現順** で結合してマージ後 rule の `leadingTrivia` にする
   - 著者のコメントは 1 つも捨てない
   - blank-line trivia は通常通りそのまま保持
2. **コメント直後の blank line は Trivia として保持**:
   - `/* group: visuals */\n\n service { ... }` のような「表題 + 空行」を
     著者の意図として残す
   - 通常の rule 間 blank line（コメントなし連続）は前述の通り 1 行に正規化
   - **例外**: コメント trivia の直後に来る blank line は別扱いで保持
3. **行末コメントは常に同一行を保つ（折り返さない）**:
   - 長さに関わらず `color: red; /* primary */` のスタイルを維持
   - idempotent の証明が軽い（行幅判定を入れない）
   - 将来 `--print-width` のような設定が要れば別 issue で
4. **VS Code formatter プロバイダは `krs-style` 言語のみに登録**:
   - `.krs.style` のみ format 対象。`.krs` は `.krs` Tidy が立ち上がる
     まで対象外
   - `editor.formatOnSave` でユーザーが意図せず `.krs` を破壊するリスクを
     避ける
