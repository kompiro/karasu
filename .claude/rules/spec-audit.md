---
paths:
  - "docs/spec/**/*.md"
  - "packages/core/src/types/warnings.ts"
---

# Spec Conformance Audit Rules

仕様適合性監査（spec ⇔ 実装の突き合わせ）で「仕様にある機能 X が未実装」
という指摘を出す・Issue 化するときのルール。

## 「未実装」と断定する前に repo-wide で経路を追う

機能が「ありそうなファイル」だけを grep して断定しない。karasu では
仕様が約束する診断・警告の実装が、構文処理本体（parser / resolver の
コア）ではなく **横断レイヤーに集約されている** ため、ファイル単位の
grep は false positive を生む。

最低限、以下の経路を順に追ってから結論を出す:

1. **warning kind 定義** — `packages/core/src/types/warnings.ts` の
   `WarningKind` union に該当しそうなコードがないか。仕様の文言から
   kind 名を推測して grep する（例: "defined in multiple files" →
   `style-conflict`）
2. **発行箇所** — kind 名で repo-wide grep。警告系は
   `packages/core/src/resolver/warnings.ts`（`analyze()`）に集約されて
   いることが多い
3. **i18n メッセージ** — `packages/i18n/src/render-warning.ts` と
   `en.ts` / `ja.ts`。仕様の例示メッセージに対応する i18n キーを grep
   するのが最短の検出経路
4. **UI 表示 / 抑制** — `WarningPanel`（app）と
   `packages/lsp/src/diagnostics.ts`（LSP は単一ドキュメント文脈で
   一部 warning を意図的に抑制している）

経路の途中までしか存在しない場合は「未実装」ではなく「どの層まで
実装されているか」を指摘に書く。

## 過去の false positive

- **#1493** — 「セレクタ重複警告（`docs/spec/style.md`
  § @import scope and conflicts）が未実装」と Issue 化したが、実際は
  `detectStyleConflicts()` + `style-conflict` 警告として end-to-end
  実装済みだった。裏取り grep を `style-resolver.ts` /
  `style-parser.ts` に絞ったことが原因。invalid クローズ済み

## 指摘・Issue 化の作法

- 指摘には「何を grep して不在を確認したか」（検索語と対象範囲）を
  含める。repo-wide で追っていない指摘は「未検証」と明示する
- 監査由来の Issue は、着手時にもう一度上記の経路追跡からやり直す
  （監査時の結論を信用しない）
