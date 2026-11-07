# CLI の診断出力に安定したコードを載せる

- **日付**: 2026-11-07
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3654](https://github.com/kompiro/karasu/issues/3654)
  - 発端の修正: [#3640](https://github.com/kompiro/karasu/issues/3640)（`reverse-architecture` skill の検証を `LC_ALL=C` + メッセージ本文の照合に変えた暫定対応）
  - 関連 ADR: [ADR-1567](../adr/1567-rule-diagnostic-separation-and-catalog.md)（診断コードは安定 API）, [ADR-1417](../adr/1417-lsp-cli-i18n.md)（CLI のメッセージは locale に従う）, [ADR-2901](../adr/2901-karasu-authoring-skill.md)（skill の Step 0 は CLI の版の下限だけを照合する）
  - 関連 TPL: [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostic-line-carries-code.md)（本 Design Doc で起こす）, [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md), [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md), [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md), [TPL-2536](../test-perspectives/TPL-2536-locale-source-chain-completeness.md)
  - コード: `packages/cli/src/report-diagnostics.ts`, `packages/cli/src/compile-system-view.ts`, `packages/cli/src/diff.ts`, `packages/cli/src/lint-style.ts`, `packages/cli/src/tidy-style.ts`, `packages/cli/src/i18n.ts`

## 背景・課題

`karasu render` と `karasu check` は `Warning: <location>: <message>` を stderr に出す。コードは出さず、メッセージは locale に従う。

そのため、特定の診断に反応したいスクリプトやエージェントには、翻訳された文章しか照合する手がかりが無い。`reverse-architecture` skill はコードを grep していたが、コードは出力されないので結果は常に空で、壊れたモデルでも停止条件を通っていた。#3640 は `LC_ALL=C` とメッセージの断片で照合する形に直したが、文言を変えると次はまた黙って壊れる。

もう 1 つの症状は参照の断絶である。`reference/diagnostics.md`（`docs/spec/diagnostics.md` を同梱したもの）はコードをキーにしているのに、CLI の出力にコードが無いので、メッセージからカタログを引けない。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| コードの有無 | `Diagnostic` の `code` と `Warning` の `kind` はどちらも必須（`packages/core/src/types/ast.ts`, `warnings.ts`）。欠けているのは出力だけ |
| コードの文字種 | `DiagnosticParamsByCode` と `WarningKind` の全メンバーが `[a-z0-9-]+`（確認済み） |
| カタログ | 全コードが `docs/spec/diagnostics.md` に載ることを meta-test が強制する（TPL-1623） |
| 診断を流す箇所 | `report-diagnostics.ts`（`render` / `check`）、`compile-system-view.ts`（`subtree` などのエラー）、`diff.ts`、`lint-style.ts`、`tidy-style.ts` |
| 診断ではない行 | `Warning: --include-matrix requires --output` や `translate` の警告は引数や変換の通知で、カタログのコードを持たない |
| 複数行のメッセージ | 利用者の文字列を埋め込むメッセージは改行を含みうる。実測で `Unexpected token in block: StringLiteral ("no` と `newline")` の 2 行に分かれて出た。`formatDiagnostic` のコメントが言う one-line は成り立っていない |
| 機械向け形式の前例 | `karasu coverage --format json`、`karasu capabilities --json` |
| skill の版の照合 | Step 0 は下限のみ。下限はパック時の CLI の版（`packages/skills/scripts/stamp-version.mjs`）。古い skill と新しい CLI の組み合わせは検出されない |

## 制約・前提

- **古い skill が新しい CLI で動く。** 利用者の手元の skill は `Error:` / `Warning:` / `Info:` で始まる行を読み、メッセージの断片で照合する。この形を壊すと、grep が空になって停止条件を素通りするという、今回と同じ失敗が起きる。
- **コードは翻訳しない。** 接頭辞 `Warning:` もすでに locale によらず英語である。
- **`[code]` の無い行は「カタログの診断ではない」ことを意味する。** 引数の通知まで無理にコード化しない。
- **対象外:** `karasu serve` の 422 応答の本文（`render-endpoint.ts`）。stderr の行ではなく HTTP の応答で、形式の約束もここでは決めない。#3655（未解決 endpoint の報告漏れ）は別の Issue で扱う。

## 検討した選択肢

### 案1: 行末に `[code]` を足す

```
Warning: index.krs:7:3: Edge "A → ghost" references unknown node "ghost"; the edge is dropped (the resolved endpoint is kept) [unresolved-edge-endpoint]
```

スクリプトは `\[([a-z0-9-]+)\]$` で取り出せる。

**メリット**

- 接頭辞と位置の形を変えないので、古い skill の照合も利用者の `^Warning: ` も動き続ける
- フラグが要らず、人が読む出力からそのままカタログを引ける
- `render` / `check` / `subtree` / `diff` / `lint-style` / `tidy-style` に同じ規則で届く

**デメリット**

- 行の末尾を約束にするので、メッセージは 1 行でなければならない。改行を CLI の出口で正規化する必要がある
- 位置やパラメータを構造として取り出せない

### 案2: 接頭辞にコードを入れる（`Warning[unresolved-edge-endpoint]: ...`）

rustc の形で、コードの位置はメッセージの長さや改行に左右されない。

**デメリット**

- `^Warning: ` で読む既存の利用者が空振りする。古い skill では、停止条件を黙って通る #3640 の失敗がそのまま再発する。Step 0 は下限しか見ないので検出もされない

### 案3: `karasu check --format json`

```json
{"diagnostics":[{"severity":"warning","code":"unresolved-edge-endpoint","file":"index.krs","line":7,"column":3,"message":"..."}]}
```

**メリット**

- 改行や区切り文字の問題が無く、位置も取り出せる。`coverage --format json` の前例に合う

**デメリット**

- 新しい出力形式を 1 つ持つことになり、スキーマの互換性、ファイル未検出のときの出力、`render` など他のコマンドへの広げ方を決める必要がある
- 人が読む出力は変わらないので、メッセージからカタログを引けないという症状が残る
- いまの消費者（skill の表の照合）はコードしか使わないので、位置の構造化を求める消費者がまだいない

### 案4: オプトインのフラグや環境変数で案1の形にする

既定の出力は変わらない。ただし指定を忘れると今と同じ出力になり、grep が空のまま通るので、失敗の形が残る。人の出力も改善しない。

## 比較

| 観点 | 案1 行末 | 案2 接頭辞 | 案3 JSON | 案4 オプトイン |
| --- | --- | --- | --- | --- |
| 翻訳された文章を読まずに判別できる | できる | できる | できる | 指定したときだけ |
| 古い skill・既存スクリプトとの互換 | 保つ | 黙って壊す | 保つ | 保つ |
| メッセージからカタログを引ける | できる | できる | できない | 指定したときだけ |
| `check` 以外のコマンドへ届く | 全部 | 全部 | 別途決める | 全部 |
| 構造化された位置を取れる | できない | できない | できる | できない |
| 変更量 | 小 | 小 | 中 | 小 |

## 現時点の方針

**案1 を採用する。** Issue の受け入れ条件（翻訳された文章を解析せずに、どの診断かを判別できる / skill の検証がそれを使う）を、新しい出力形式を増やさずに満たし、配布済みの skill を壊さない唯一の案だからである。

案3 は却下ではなく見送る。位置やパラメータを構造で読みたい消費者が現れたら、`coverage` の前例に沿って足す。案1 のコードと矛盾しない。

### 確定させる出力の約束

1. カタログの診断を出す行は、末尾が ` [<code>]` で終わる。`<code>` は `DiagnosticParamsByCode` のキーか `WarningKind` のメンバーで、locale によらない。
2. その行は 1 行である。メッセージ中の改行は `\n` の 2 文字に置き換える。
3. 既存の接頭辞と位置の形は変えない。`Warning: <file>:<line>:<column>: <message> [<code>]`、`diff` の `Warning: <line>:<column> <message> [<code>]`、`lint-style` の `<file>:<line>:<column> <severity>: <message> [<code>]`。
4. `[<code>]` の無い行はカタログの診断ではない。

### 実装の指針

1. `packages/cli/src/i18n.ts` に、1 行に整えてコードを足す `formatDiagnosticLine` / `formatWarningLine` を置く（TPL-1417: 形を 1 か所に集める）。stderr / stdout へ診断を流す箇所はすべてこれを使う。`formatDiagnostic` の直接の呼び出しは `i18n.ts` と `render-endpoint.ts` だけになり、それを走査するテストで新しい箇所の取りこぼしを止める。
2. コマンドごとの contract test を `packages/cli` に足す（`render` / `check` / `subtree` / `diff` / `lint-style` / `tidy-style`）。`ja` の locale でコードが同じこと、改行を含むメッセージが 1 行になることも確かめる。末尾を `$` で固定した既存のテスト（`check.test.ts` の `Style file not found` など）は新しい形に更新する。
3. skill を更新する。`reverse-architecture` の Phase 4 step 2 は `karasu check index.krs` を実行してコードで判定する形にし、`LC_ALL=C` と `Message contains` 列を外す。`Circular dependency detected` の行は `cyclic-dependency` に直す。`karasu-author` の「コードは出ない」という記述を、行末のコードでカタログを引く説明に直す。
4. drift のガードとして `scripts/lint/skill-diagnostic-codes.ts` を足す。公開する skill の、先頭列が `Diagnostic` の表に書かれたコードが `DiagnosticParamsByCode` / `WarningKind` に実在することを検査し、`lint:skill-cli-refs` と同じ pre-push と CI に載せる。表が 1 つも見つからない状態もテストで落とす。
5. `docs/spec/diagnostics.md`（と `.ja.md`）に CLI の出力の約束の節を足し、`> Related TPLs:` で TPL-3654 に紐付ける。`docs/tools/cli.md` の `check` にも書く。同梱の reference を再生成する。
6. changeset は `karasu` の minor と `karasu-skills`（`.claude/rules/changesets.md` の「skill が前提にする CLI の挙動」）。
7. AT: `docs/acceptance/` に新規ファイル。人の確認は要らず、TC はすべて上の自動テストに到達させる。
   - `karasu check` の警告とエラーの行から、locale によらず同じコードを取り出せる
   - `reverse-architecture` の表のコードが、実際に発火した診断の行末と一致する
8. ADR 昇格: 実装完了後に `docs/adr/3654-cli-diagnostic-codes.md` として昇格し、本 Design Doc は同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 診断の行の末尾に ` [code]` が増える。行全体を完全一致で比べるスクリプトと、行末を `$` で固定した照合は変更が要る。改行を含むメッセージは 1 行になる。終了コードは変わらない。
- 古い skill と新しい CLI: 接頭辞とメッセージの断片がそのままなので動き続ける。
- 新しい skill と古い CLI: Step 0 の下限（パック時の CLI の版）が止める。
- ドキュメント更新: `docs/spec/diagnostics.md`, `docs/spec/diagnostics.ja.md`, `docs/tools/cli.md`, `docs/tools/cli.ja.md`, 同梱の reference。
- テスト・examples への影響: 行の形を固定した CLI のテストの更新。examples への影響は無い。

## 決めないこと

- JSON 出力（案3）: 構造を読みたい消費者が現れたときに決める。
- `karasu serve` の 422 応答にコードを載せるか: 消費者がいないので決めない。
- 診断ではない `Warning:` 行（引数の通知、`translate` の警告）へのコード付与: カタログの外なので扱わない。
