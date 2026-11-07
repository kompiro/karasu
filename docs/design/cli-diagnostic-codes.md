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
| 診断ではない行 | `Warning: --include-matrix requires --output` や `translate` の警告は引数や変換の通知で、カタログのコードを持たない。`karasu fmt` の `Cannot format: ... (<codes>)` は、コードを文中の括弧に書く別の形で、翻訳もされない |
| 1 行にならないメッセージ | 利用者の文字列やパスを埋め込む行は行の区切りを含みうる。実測で `Unexpected token in block: StringLiteral ("no` と `newline")` の 2 行に分かれて出た。`.krs` の文字列の `\r` や U+2028、改行を含むファイル名でも同じで、行単位の消費者には `Warning: ...` で始まる別の行に見える。`formatDiagnostic` のコメントが言う one-line は成り立っていない |
| 機械向け形式の前例 | `karasu coverage --format json`、`karasu capabilities --json` |
| skill の版の照合 | Step 0 は下限のみ。下限はパック時の CLI の版（`packages/skills/scripts/stamp-version.mjs`）。古い skill と新しい CLI の組み合わせは検出されない |
| 配布中の skill | 公開中の `karasu-skills` は 0.2.1。`karasu render` の出力をコードで grep し、停止条件は「grep が空」で、いまは常に通る。#3656 の版（`Error:` / `Warning:` / `Info:` の行を読み、メッセージの断片で照合する）は main にあるが未リリースで、changeset が残っている |

## 制約・前提

- **skill と CLI は別々に更新される。** 消費者は 3 つある。公開中の 0.2.1（コードで grep する）、#3640 の版（行の接頭辞とメッセージの断片で読む。月次のトレインを挟んで本件より先に出れば利用者に届く）、利用者のスクリプト（`^Warning: ` など）。どのリリース順でも、grep が空になって停止条件を素通りする #3640 の失敗を起こしてはいけない。
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

- 接頭辞と位置の形を変えないので、#3640 の版の照合も利用者の `^Warning: ` も動き続ける
- 公開中の 0.2.1 のコードの grep が初めて当たるようになる。これまで常に空だった停止条件が機能し始めるので、0.2.1 の利用者には修復の手順が増えるが、これは本来の動作である（案2 でも同じ）
- フラグが要らず、人が読む出力からそのままカタログを引ける
- `render` / `check` / `subtree` / `diff` / `lint-style` / `tidy-style` に同じ規則で届く

**デメリット**

- 行の末尾を約束にするので、行全体が 1 行でなければならない。行の区切りを CLI の出口で正規化する必要がある
- カタログの外の行が利用者の文字列で終わると同じ形に見えうる（`Error: File not found: nope [unresolved-edge-endpoint]`）
- 位置やパラメータを構造として取り出せない

### 案2: 接頭辞にコードを入れる（`Warning[unresolved-edge-endpoint]: ...`）

rustc の形で、コードの位置はメッセージの長さや改行に左右されない。公開中の 0.2.1 のコードの grep も当たるようになる。

**デメリット**

- `^Warning: ` で読む利用者のスクリプトが空振りする。#3640 の版が本件より先のトレインで届いた場合は、行の接頭辞で読むその版でも起きる。どちらも grep が空のまま進むという #3640 と同じ失敗で、Step 0 は下限しか見ないので検出されない
- 行の内容に左右されないという利点は、案1 でも行全体を正規化すれば得られる

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
| `^Warning: ` で読む消費者との互換 | 保つ | 黙って壊す | 保つ | 保つ |
| 公開中の 0.2.1 の grep が当たる | 当たる | 当たる | 当たらない | 指定したときだけ |
| メッセージからカタログを引ける | できる | できる | できない | 指定したときだけ |
| `check` 以外のコマンドへ届く | 全部 | 全部 | 別途決める | 全部 |
| 構造化された位置を取れる | できない | できない | できる | できない |
| 変更量 | 小 | 小 | 中 | 小 |

## 現時点の方針

**案1 を採用する。** Issue の受け入れ条件（翻訳された文章を解析せずに、どの診断かを判別できる / skill の検証がそれを使う）を、新しい出力形式を増やさずに満たす。案2 と比べると、どのリリース順でも `^Warning: ` で読む消費者を壊さない点で勝り、案2 の利点（行の内容に左右されない）は行全体の正規化で得られる。

案3 は却下ではなく見送る。位置やパラメータを構造で読みたい消費者が現れたら、`coverage` の前例に沿って足す。案1 のコードと矛盾しない。

### 確定させる出力の約束

1. カタログの診断を出す行は、末尾が ` [<code>]` で終わる。`<code>` は `DiagnosticParamsByCode` のキーか `WarningKind` のメンバーで、locale によらない。CLI が最後に足すので、利用者の文字列では偽造できない。
2. その行は、位置を含めて全体で 1 行である。行の区切りと制御文字（C0、U+0085、U+2028、U+2029）をエスケープする。`\n`、`\r`、`\t` は 2 文字の形、それ以外は `\uXXXX` にする。
3. 既存の接頭辞と位置の形は、コマンドごとに今のまま変えない。変わるのは行末だけである。
4. `[<code>]` の無い行はカタログの診断ではない。逆は成り立たない。カタログの外の行が利用者の文字列で終わると同じ形に見えうるので、照合は語をカタログのコードに限り、終了コードとあわせて読む。

### 実装の指針

1. `packages/cli/src/i18n.ts` に、1 行に整えてコードを足す `formatDiagnosticLine` / `formatWarningLine` を置く（TPL-1417: 形を 1 か所に集める）。stderr / stdout へ診断を流す箇所はすべてこれを使う。素のメッセージを返す `formatDiagnostic` / `formatWarning` / `renderDiagnostic` / `renderWarning` の呼び出しは `i18n.ts` と `render-endpoint.ts` だけになり、`packages/cli/src` を走査するテストで新しい箇所の取りこぼしを止める。
2. コマンドごとの contract test を `packages/cli` に足す（`render` / `check` / `subtree` / `diff` / `lint-style` / `tidy-style`）。`ja` の locale でコードが同じこと、`\n` / `\r` / U+2028 を含むメッセージと改行を含むファイル名が 1 行になることも確かめる。末尾を `$` で固定した既存のテスト（`check.test.ts` の `Style file not found` など）は新しい形に更新する。
3. skill を更新する。到達状態は、`packages/skills/skills/**` の判定が翻訳された文章を読まないことである。`LC_ALL=C` を外すので、断片での照合を 1 つでも残すと `ja` の locale で空振りする。`reverse-architecture` では次を直す。
   - Phase 4 step 2: `karasu check index.krs` を実行してコードで判定する形にし、`LC_ALL=C` と `Message contains` 列を外す。`Circular dependency detected` の行は `cyclic-dependency` に直す
   - Reached state: 「the CLI prints messages, not codes」と、`references unknown node` の断片を見る停止条件を、コードでの判定に直す
   - `render` を検証に使うと書いた箇所と、Step 0 が呼ぶコマンドの一覧に `check` を反映する

   `karasu-author` の「コードは出ない」という記述は、行末のコードでカタログを引く説明に直す。
<!-- absent-path-next-line: the guard this design intends to add (#3654) -->
4. drift のガードとして `scripts/lint/skill-diagnostic-codes.ts` を足す。公開する skill の、先頭列が `Diagnostic` の表に書かれたコードが `DiagnosticParamsByCode` / `WarningKind` に実在することを検査する。
   - `lint:skill-cli-refs` と同じく pre-push と CI に載せ、glob に core の `types/ast.ts` と `types/warnings.ts` を足す。core だけの改名でも落ちるように、実際の skill を読む vitest の mirror も `ci.yml` で動かす
   - 表が 1 つも見つからない状態もテストで落とす
   - 検査は表だけに限る。文中のコード（`invalid-owns` など）は、バッククォートの語と区別できないので対象にしない。TPL の項目も表に限って書く
5. `docs/spec/diagnostics.md`（と `.ja.md`）に CLI の出力の約束の節を足し、`> Related TPLs:` で TPL-3654 に紐付ける。`docs/tools/cli.md` の `check` にも書く。同梱の reference を再生成する。
6. changeset は `karasu` の minor と `karasu-skills`（`.claude/rules/changesets.md` の「skill が前提にする CLI の挙動」）。#3640 の changeset（`.changeset/reverse-skill-current-diagnostics.md`）が未消費なら、「コードを出さない」という記述が同じトレインで誤りになるので、実装 PR で書き直す。
7. AT: `docs/acceptance/` に新規ファイル。人の確認は要らず、TC はすべて上の自動テストに到達させる。
   - `karasu check` の警告とエラーの行から、locale によらず同じコードを取り出せる
   - `reverse-architecture` の表のコードが、実際に発火した診断の行末と一致する
8. ADR 昇格: 実装完了後に `docs/adr/3654-cli-diagnostic-codes.md` として昇格し、本 Design Doc は同じ PR で削除する。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 診断の行の末尾に ` [code]` が増える。行全体を完全一致で比べるスクリプトと、行末を `$` で固定した照合は変更が要る。行の区切りを含むメッセージは 1 行になる。終了コードは変わらない。
- 公開中の 0.2.1 と新しい CLI: コードの grep が当たるようになり、停止条件が機能し始める。
- #3640 の版と新しい CLI: 本件より先のトレインで届いた場合も、接頭辞とメッセージの断片がそのままなので動き続ける。
- 新しい skill と古い CLI: Step 0 の下限（パック時の CLI の版）が止める。
- リリース順: 本件が次のトレインに間に合えば #3640 の版は利用者に届かない。どちらの順でも上のとおり動くので、順序は固定しない。
- ドキュメント更新: `docs/spec/diagnostics.md`, `docs/spec/diagnostics.ja.md`, `docs/tools/cli.md`, `docs/tools/cli.ja.md`, 同梱の reference。
- テスト・examples への影響: 行の形を固定した CLI のテストの更新。examples への影響は無い。

## 決めないこと

- JSON 出力（案3）: 構造を読みたい消費者が現れたときに決める。
- `karasu serve` の 422 応答にコードを載せるか: 消費者がいないので決めない。
- 診断ではない `Warning:` 行（引数の通知、`translate` の警告）へのコード付与: カタログの外なので扱わない。
- `karasu fmt` の `Cannot format: ... (<codes>)` の形: すでにコードを読めて翻訳もされないので変えない。
