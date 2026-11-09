# 診断の出力に安定したコードを載せる（CLI・VS Code・app）

- **日付**: 2026-11-07（2026-11-08 に kompiro のコメントを受けて方針を改訂）
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3654](https://github.com/kompiro/karasu/issues/3654)
  - エディタとプレビューの実装: [#3712](https://github.com/kompiro/karasu/issues/3712)
  - 発端の修正: [#3640](https://github.com/kompiro/karasu/issues/3640)（`reverse-architecture` skill の検証を `LC_ALL=C` + メッセージ本文の照合に変えた暫定対応）
  - 関連 ADR: [ADR-1567](../adr/1567-rule-diagnostic-separation-and-catalog.md)（診断コードは安定 API）, [ADR-1417](../adr/1417-lsp-cli-i18n.md)（CLI のメッセージは locale に従う）, [ADR-2901](../adr/2901-karasu-authoring-skill.md)（skill の Step 0 は CLI の版の下限だけを照合し、新しい CLI と古い skill の互換は CLI が持つ）, [ADR-2208](../adr/2208-positional-label-error-promotion.md)（診断の重大度を変えた前例）
  - 関連 TPL: [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostics-carry-stable-code.md)（本 Design Doc で起こす）, [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md), [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md), [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md), [TPL-2536](../test-perspectives/TPL-2536-locale-source-chain-completeness.md)
  - コード: `packages/cli/src/report-diagnostics.ts`, `packages/cli/src/compile-system-view.ts`, `packages/cli/src/diff.ts`, `packages/cli/src/lint-style.ts`, `packages/cli/src/tidy-style.ts`, `packages/cli/src/check.ts`, `packages/cli/src/i18n.ts`, `packages/lsp/src/diagnostics.ts`, `packages/app/src/components/PreviewPane.tsx`, `packages/app/src/components/WarningPanel.tsx`, `packages/app/src/utils/docs-site-links.ts`

## 背景・課題

`karasu render` と `karasu check` は `Warning: <location>: <message>` を stderr に出す。コードは出さず、メッセージは locale に従う。

そのため、特定の診断に反応したいスクリプトやエージェントには、翻訳された文章しか照合する手がかりが無い。`reverse-architecture` skill はコードを grep していたが、コードは出力されないので結果は常に空で、壊れたモデルでも停止条件を通っていた。#3640 は `LC_ALL=C` とメッセージの断片で照合する形に直したが、文言を変えると次はまた黙って壊れる。

もう 1 つの症状は参照の断絶である。`reference/diagnostics.md`（`docs/spec/diagnostics.md` を同梱したもの）はコードをキーにしているのに、CLI の出力にコードが無いので、メッセージからカタログを引けない。

読み手は 2 種類いて、求めるものが違う。人は行の頭で短い識別子を見てカタログを引きたい。機械（skill、スクリプト）は、翻訳されず、行の形にも左右されない構造を読みたい。1 つの形で両方を満たそうとすると、どちらかに無理が出る（改訂前の案は行末に kebab のコードを足し、1 行を保つためのエスケープ規則まで要った）。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| コードの有無 | `Diagnostic` の `code` と `Warning` の `kind` はどちらも必須（`packages/core/src/types/ast.ts`, `warnings.ts`）。欠けているのは出力だけ |
| コードの形 | `DiagnosticParamsByCode` と `WarningKind` の全 114 件が `[a-z0-9-]+`。長さは 12〜37 文字（平均 22 文字、例 `expected-semicolon-between-properties`）で、行の頭に置くには長い。短い識別子はまだ無い |
| 重大度 | カタログは各コードに重大度を 1 つ書く（error 50、warning 54、info 10）。`Warning` の重大度は種類ごとに `warningSeverity` が決める。`Diagnostic` は出す箇所ごとに `severity` を書く。core の 62 種類の `Diagnostic` のコードを走査したかぎり、同じコードを 2 つの重大度で出す箇所は無い（`this.error` と `rejectConstruct` は常に error）。`app-*` のコードは `packages/app` が出す |
| 面によって重大度が変わるコード | `DiagnosticParamsByCode` と `WarningKind` は 7 つの名前を共有する（81 + 40 = 121 件で、名前は 114 種類）。そのうち `style-invalid-enum-value`、`style-invalid-hex-color`、`style-invalid-length-unit`、`style-missing-length-unit`、`style-out-of-range` の 5 つは、スタイルシートを検査する `lint-style` / `tidy-style` では `Diagnostic` の error、モデルを組む `render` / `check` / LSP では `resolver/model-warnings.ts` の `diagnosticToWarning` で `Warning` になり warning で出る。カタログはこの 5 つを error とだけ書いている。残る `style-unknown-property` と `style-unknown-icon` はどちらの面でも warning |
| カタログ | 全コードが `docs/spec/diagnostics.md` に載ることを meta-test が強制する（TPL-1623） |
| 診断を流す箇所 | `report-diagnostics.ts`（`render` / `check`、`Warning: <loc>: <msg>`）、`compile-system-view.ts`（`subtree` などのエラー）、`diff.ts`（`Warning: <loc> <msg>`）、`lint-style.ts`（`<file>:<l>:<c> <severity>: <msg>`、stdin のときは `stdin:<l>:<c> ...`。どちらも stdout）、`tidy-style.ts`（`<name>:<l>:<c> error: <msg>`）。重大度の語の位置はコマンドで違う |
| 診断ではない行 | `Warning: --include-matrix requires --output` や `translate` の警告は引数や変換の通知で、カタログのコードを持たない。`karasu fmt` の `Cannot format: ...` も翻訳されない別の形 |
| 機械向け形式の前例 | `karasu coverage --format json`（stdout、版の欄なし）、`karasu capabilities --json`（`schemaVersion` を持つ） |
| エディタとプレビュー | VS Code は LSP の `Diagnostic` で表示する。`packages/lsp/src/diagnostics.ts` は `severity`、`range`、`message`、`source: "karasu"` を付け、`code` を付けない。app はエラーのバナー（`PreviewPane.tsx`）と警告のパネル（`WarningPanel.tsx`）に、アイコン、位置、メッセージを出す。どちらにもコードは出ない |
| docs-site へのリンク | app は `packages/app/src/utils/docs-site-links.ts` で docs-site の URL を組み、locale の接頭辞（`ja/`）を付ける。`#` の付いた route は持たない（見出しの slug が locale で違うため。TPL-1621）。カタログは `spec/diagnostics/` で公開されている |
| skill の版の照合 | Step 0 は下限のみ。下限はパック時の CLI の版（`packages/skills/scripts/stamp-version.mjs`）。古い skill と新しい CLI の組み合わせは検出されない |
| 配布中の skill | 公開中の `karasu-skills` は 0.2.1。`karasu render` の出力を kebab のコードで grep し、停止条件は「grep が空」である。#3640 の版（#3656 でマージ。エージェントが `Error:` / `Warning:` / `Info:` の行を読み、メッセージの断片で照合する）は main にあるが未リリースで、changeset が残っている |

## 制約・前提

- **人が読む行と機械が読む出力を分ける。** 人が読む行は短い ID を接頭辞に置き、機械は `karasu check --format json` を読む（kompiro、PR #3663 のコメント）。
- **stdout / stderr の形式は後方互換を保つ方針である**（`docs/release.md`「CLI の後方互換」、ADR-2901）。接頭辞を変えるので、この方針の範囲を改める。機械向けの約束を JSON に移し、診断の行は人向けとして約束から外す。
- **skill と CLI は別々に更新される。** 消費者は 3 つある。公開中の 0.2.1（kebab のコードで grep する）、#3640 の版（エージェントが行の接頭辞を見て読む。月次のトレインを挟んで本件より先に出れば利用者に届く）、利用者のスクリプト（`^Warning: ` など）。どのリリース順でも、照合が空になって停止条件を素通りする #3640 の失敗を、新しい skill で起こしてはいけない。
- **kebab のコードは安定 API のまま残す**（ADR-1567）。短い ID はその表示用の別名で、kebab のコードを置き換えない。
- **コードも ID も翻訳しない。** 接頭辞 `Warning` もすでに locale によらず英語である。
- **ID は人が診断を目にするすべての面に出す。** CLI の行に加えて、VS Code と app の表示にも同じ ID を出す（kompiro、PR #3663 のコメント）。面によって文言が違う診断（上の 5 つの style コード）も、ID で同じものだと分かる。
- **対象外:** `karasu serve` の 422 応答の本文（`render-endpoint.ts`）。#3655（未解決 endpoint の報告漏れ）は別の Issue で扱う。

## 検討した選択肢

人が読む行の形と、機械が読む形を分けて検討した。

### 人が読む行

#### 案A: 重大度の文字 + 番号の ID を接頭辞に置く（`Warning[W014]: ...`）

ID は `E` / `W` / `I`（error / warning / info）の 1 文字と 3 桁の番号で、文字ごとに番号を振る。4 文字で、ID だけを見ても重大度が分かる。

却下した。行では文字が直前の重大度の語と同じことを言うので、情報が重複する（kompiro、PR #3663 のコメント）。しかも文字があるために ID が重大度に縛られる。

- 面によって重大度が変わる 5 つのコードは、ID を 2 つ持つことになる（`lint-style` では `E0xx`、`render` では `W0xx`）。1 つにすると、`Warning[E0xx]:` のように文字と語が食い違う
- 重大度を変えると ID も変わる（ADR-2208 のような昇格で `W0xx` が `E0xx` になる）。人の記憶や古い出力の ID が引けなくなる

#### 案B: kebab のコードを接頭辞に置く（`Warning[unresolved-edge-endpoint]: ...`）

新しい識別子が要らない。ただしコードは平均 22 文字、最長 37 文字で、行の頭を長く占める。

#### 案C: 重大度によらない `KRS` + 番号の ID を接頭辞に置く（採用）

```
Warning[KRS014]: index.krs:7:3: Edge "A → ghost" references unknown node "ghost"; the edge is dropped (the resolved endpoint is kept)
Error[KRS003]: index.krs:2:1: Expected ';' between properties
theme.krs.style:3:5 error[KRS041]: Invalid hex color for "fill": "#12" (expected ...)
Warning[KRS041]: theme.krs.style:3:5: fill: "#12" is not a valid hex color (expected ...) ...
```

最後の 2 行は同じ `style-invalid-hex-color` で、`lint-style` と `render` の出力である（番号は例）。ID は `KRS` と 3 桁の番号で、コードごとに 1 つ振る。rustc の `error[E0308]` と同じく、重大度の語の直後に置く。重大度は語が示し、ID は診断だけを示す。

- 6 文字でメッセージの読みを邪魔せず、カタログに ID の列を足せば行からそのまま引ける
- `KRS` は拡張子 `.krs` と揃い、ほかのツールの番号（`E0308`、`TS2322`）と混ざらないので、grep や Web 検索で引ける
- 面によって重大度が変わるコードも ID は 1 つで、上の例のように同じ `KRS041` が `lint-style` では error、`render` では warning の語と並ぶ
- 重大度を変えても ID は変わらない。kebab のコードと同じく、コードが続くかぎり同じ ID が同じ診断を指す

#### 案D: 行末に kebab のコードを足す（改訂前の方針）

接頭辞を変えないので互換の例外が小さい。ただし人には長いコードが行末に来て読みにくく、機械にとっては行全体を 1 行に保つエスケープ規則が要り、カタログの外の行が利用者の文字列で同じ形に見えうる。機械向けを JSON に分けるなら、この複雑さを持つ理由が無い。

### 機械が読む形

#### 案J: `karasu check --format json`（採用）

```json
{
  "schemaVersion": 1,
  "errorCount": 0,
  "diagnostics": [
    {
      "id": "KRS014",
      "code": "unresolved-edge-endpoint",
      "severity": "warning",
      "file": "index.krs",
      "line": 7,
      "column": 3,
      "params": { "from": "A", "to": "ghost", "unresolvedId": "ghost" },
      "message": "Edge \"A → ghost\" references unknown node \"ghost\"; ...",
      "details": []
    }
  ]
}
```

- 改行や区切り文字の問題が無く、位置と `params`（言語によらない値）も取り出せる
- 読めなかったことが分かる。CLI が JSON を出さずに失敗したら、消費者の parse が失敗するので、「診断が 0 件」と取り違えない。grep の照合は、出力の形が変わると空になり、0 件と区別できなかった
- `coverage --format json` と `capabilities --json` の前例に合う

#### 案K: テキストの行を機械向けにも約束する

案C の行を `^(Error|Warning|Info)\[(KRS[0-9]{3})\]` で読ませる。kebab のコードが行に無いので、判定にはカタログの対応表が要る。位置は行の形から切り出すしかなく、行が読めないときに 0 件と取り違える問題も残る。

#### 案L: オプトインのフラグや環境変数でテキストの行に kebab のコードを足す

指定を忘れると今と同じ出力になり、照合が空のまま通るので、失敗の形が残る。

## 比較

人が読む行:

| 観点 | 案A 文字+番号 | 案B kebab | 案C `KRS`+番号 | 案D 行末 kebab |
| --- | --- | --- | --- | --- |
| 行の頭の長さ | 4 文字 | 12〜37 文字 | 6 文字 | 変わらない（行末に 12〜37 文字） |
| 重大度の語との重複 | ある（文字が語を繰り返す） | 無い | 無い | 無い |
| 面によって重大度が変わるコード | ID が 2 つ | 1 つ | 1 つ | 1 つ |
| 重大度を変えたとき | ID が変わる | 変わらない | 変わらない | 変わらない |
| 新しい識別子の管理 | 要る | 要らない | 要る | 要らない |
| 接頭辞で読む消費者（`^Warning: `） | 壊す | 壊す | 壊す | 保つ |

機械が読む形:

| 観点 | 案J JSON | 案K テキストの行 | 案L オプトイン |
| --- | --- | --- | --- |
| 翻訳された文章を読まずに判別できる | できる | できる（対応表が要る） | 指定したときだけ |
| 読めなかったことが分かる | 分かる（parse が失敗する） | 分からない（0 件に見える） | 分からない |
| 位置を構造で取れる | 取れる | 取れない | 取れない |

## Related TPLs

- [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostics-carry-stable-code.md)（本 Design Doc で起こす proactive TPL）: 診断を流す箇所がすべて ID を載せること、ID とカタログと重大度が一致すること、skill が JSON の `code` で判定すること
- [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md): カタログとコードの完全性。ID の列もこの meta-test で守る
- [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md): 行の形を 1 か所に集める
- [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md): skill が書く CLI のコマンドとフラグのずれ（`check --format json`）
- [TPL-2536](../test-perspectives/TPL-2536-locale-source-chain-completeness.md): locale を変えても ID と JSON の `code` が変わらないこと
- [TPL-1621](../test-perspectives/TPL-1621-docs-pipeline-link-anchor-resolution.md): VS Code と app のリンクを locale で slug が変わる見出しのアンカーに向けないこと

## 現時点の方針

**人が読む行は案C、機械が読む形は案J にする。** 人は行の頭の短い ID でカタログを引き、機械は JSON の `code` で判定する。ID もコードと 1 対 1 で変わらないが、判定の鍵は kebab のコードに 1 つに決める。ADR-1567 が安定を約束したのがこちらで、名前だけで意味が読めるからである。ID は人のための別名として扱う。

**後方互換の方針の範囲を改める。** `docs/release.md`「CLI の後方互換」は stdout / stderr の形式を約束に含めている。本件の後は、機械が読む面を `check --format json`（`schemaVersion` で版を示す）、コマンド名、フラグ、終了コードに限り、診断の行は人向けとして約束から外す。人向けの行の形を変えるときは CHANGELOG で知らせる。方針の目的（手元に残る古い skill とスクリプトを壊さない）に対して、壊れるものと残るものは「影響範囲・マイグレーション」に書いた。

### 確定させる約束

1. **ID の形:** `KRS[0-9]{3}`。ID は kebab のコードに 1 つ振り、重大度を含まない。番号は 001 から振る。最初の割り当てはカタログの表の順に行い、以後は新しいコードに次の番号を足す。
   - `DiagnosticParamsByCode` と `WarningKind` が同じ名前を持つとき（上の 7 つ）は、重大度が同じでも違っても、1 つの ID を共有する
   - 1 つの ID が指すのは、常に 1 つのコードである。コードの重大度を変えても ID は変わらない
2. **ID は再利用しない。** コードを廃止したときは、その ID を廃止した ID として残し、番号を空けたままにする。一度公開した ID は、現役でも廃止でも、同じコードを指し続ける。公開前の ID は、重複を解くために振り直してよい。
3. **人が読む行:** カタログの診断を出す行は、重大度の語の直後に `[<ID>]` を置く（`Warning[KRS014]:`、`stdin:3:5 error[KRS041]:`）。位置の形、重大度の語の位置と綴り、メッセージはコマンドごとに今のまま変えない。`[<ID>]` の無い行はカタログの診断ではない（引数の通知、`translate` の警告、`karasu fmt` の `Cannot format: ...`）。
4. **機械が読む形:** `karasu check --format json` は、上の形の JSON を 1 つだけ stdout に出す。
   - `diagnostics` の並びは、テキストで出す順と同じにする
   - `id`、`code`、`severity`、`params`、`message`、`details` は必ずある。`code` は `DiagnosticParamsByCode` のキーか `WarningKind` のメンバーで、`params` はそのコードの型に従う値である。どちらも locale によらない。`message` と `details` は locale に従う。`details` は、ほかに行を持たない診断では `[]` である
   - `file` は、テキストの行が位置にファイルを出す診断にある（位置を持たない `Diagnostic` は入口のファイルだけを出す）。`line` と `column` は行と桁を持つ診断にだけある。位置を持たない `Warning` には 3 つとも無い。`file` はテキストの行と同じ表示用のパス
   - `errorCount` は error の件数である。終了コードはテキストのときと同じで、読める JSON と 1 はモデルの error、読める JSON と 0 は error なしを表す
   - カタログの外の失敗（ファイルが無い、未知のフラグ、想定外の例外）では JSON を出さず、stderr にテキストを出して 0 以外で終わる。JSON を出したときは、カタログの診断を stderr に出さない（廃止したフラグの通知など、カタログの外の行は stderr に残る）
   - 消費者は、stdout が JSON として読めないか、`schemaVersion` が知らない値なら、失敗として止まる
   - フィールドを足すのは互換の範囲内とし、消す・意味を変えるとき（`params` のキーを含む）は `schemaVersion` を上げる
   - 既定は `--format text` で、今の出力に案C の ID を足したもの
5. **エディタとプレビュー:** CLI と同じ ID を、同じ登録簿から出す。locale では変えない。
   - VS Code: LSP の `Diagnostic` の `code` に ID を、`codeDescription.href` に docs-site のカタログ（`spec/diagnostics/`、LSP の locale の接頭辞付き）を入れる。VS Code は Problems パネルとホバーに `karasu(KRS014)` と出し、ID をカタログへのリンクにする。kebab のコードは載せない（エディタの読み手は人で、機械は `check --format json` を読む）
   - app: エラーのバナーと警告のパネルで、重大度のアイコンの直後に ID を出し、同じカタログのページへのリンクにする（新しいタブで開く）
   - リンク先はページの先頭で、ID ごとのアンカーは付けない（下の「決めないこと」）。読み手はページ内を ID で検索する

### 実装の指針

1. **ID の登録簿を core に置く。** `packages/core/src/types/diagnostic-ids.ts` に、`Diagnostic` の対応 `Record<DiagnosticCode, DiagnosticId>`、`Warning` の対応 `Record<WarningKind, DiagnosticId>`、廃止した ID の一覧（ID と旧コードの組）を置く。`Record` なので、コードを足して ID を忘れると型検査で落ちる。テストで次を確かめる:
   - 1 つの ID が指すコードは 1 つで、廃止した ID と現役の ID が重ならない。2 つの対応が同じ名前を持つときは同じ ID である
   - 現役と廃止を合わせた番号が 001 から空きなく並ぶ（廃止の記録なしに ID を消すと番号が空いて落ちる）
2. **ID の履歴を検査する。** 連続と重複の検査だけでは、廃止したコードの ID を別のコードに付け替える変更が通る。`scripts/lint/diagnostic-ids-history.ts` で、公開済みの最新版（最新の `karasu@*` タグ）の登録簿にある ID が、HEAD でも同じコードを（現役か廃止として）指していることを確かめ、pre-push と CI に載せる。そのタグに登録簿が無い（本件を含む版がまだ出ていない）あいだは、比べるものが無いので通す。
   比べる相手を merge base でなく公開済みの版にするのは、公開前の振り直しを許すためである。並行する 2 本の PR が同じ番号を取ると、両方が通ってからマージした時点で main の重複検査が落ちる（ruleset は base への追従を求めない）。そのときは次の PR で後の方の番号を振り直す。まだ公開していない ID なので、振り直しは再利用に当たらず、履歴の検査も通る。重複を残したまま公開しないよう、リリース PR の CI も重複検査を通る。
3. **カタログに ID の列を足す。** `docs/spec/diagnostics.md` と `.ja.md` の各表の `Code` 列の後ろに `ID` 列を足す（meta-test は先頭の列をコードとして読むので、先頭には置かない）。meta-test（`diagnostics-catalog.test.ts`）で、列と登録簿の一致を確かめる。
   - 面によって重大度が変わる 5 つのコードは、`Severity` 列に面ごとの重大度を書く（`error`（`lint-style` / `tidy-style`）、`warning`（`render` / `check`））。今のカタログは error とだけ書いており、`render` の行と食い違っている。`ID` 列は 1 つである
   - 廃止した ID は「廃止した ID」の表に、ID を先頭の列にして旧コードとともに残し、古い出力からも引けるようにする。旧コードを先頭の列のバッククォートで書くと、meta-test の「廃止したコードを載せない」検査に当たる
4. **行の形を 1 か所に集める。** `packages/cli/src/i18n.ts` に、重大度の語に `[<ID>]` を付ける関数を置き、stderr / stdout へ診断を流す箇所はすべてこれを使う（TPL-1417）。素のメッセージを返す `formatDiagnostic` / `formatWarning` / `renderDiagnostic` / `renderWarning` を呼ぶのは `i18n.ts`、`render-endpoint.ts`、JSON を組む箇所だけにし、`packages/cli/src` を走査するテストで新しい箇所の取りこぼしを止める。
5. **`karasu check --format json` を足す。** 不明な形式は `coverage` と同じ形で拒否する。`agent-surface.json` にフラグを足す（`compat.test.ts` が求める）。`capabilities --json` は commander の定義から作られるので、フラグはそのまま載る。
6. **contract test を `packages/cli` に足す。** テキストは `render` / `check` / `subtree` / `diff` / `lint-style` / `tidy-style` の各形で ID が重大度の語の直後に付くこと、面によって重大度が変わるコードが `lint-style` と `check` で同じ ID を違う重大度の語と出すこと、JSON は上の約束の各項目、`ja` の locale でも ID・`code`・`params` が同じこと、ファイルが無いときに stdout が空で 0 以外で終わることを確かめる。既存のテストは 2 種類を直す。
   - 接頭辞を固定した照合（`check.test.ts` の `Style file not found` など）は新しい形に更新する
   - 接頭辞が無いことを確かめる否定の照合（`check.test.ts` の `not.toMatch(/^Error: /m)`、`render.e2e.test.ts` の `not.toContain("Error:")`）は、新しい形では何にも当たらず素通りするので、`^Error(\[KRS[0-9]{3}\])?:` のように両方の形に当たる照合に直す。ほかにも同じ形の否定の照合が無いかを `packages/cli` で探す
7. **skill を更新する。** 到達状態は、`packages/skills/skills/**` が判定を `karasu check --format json` の `code` で行い、翻訳された文章も、行の接頭辞も、ID も照合しないことである。`LC_ALL=C` を外すので、文章の断片を 1 つでも判定に残すと `ja` の locale で空振りする。メッセージの内容は、エージェントが locale のまま読む。`reverse-architecture` では次を直す。
   - Phase 4 step 2: `karasu check --format json index.krs` で判定する形にし、`LC_ALL=C` と `Message contains` 列を外す。stdout が JSON として読めないか、`schemaVersion` が知らない値なら止まると書く。`Circular dependency detected` の行は `cyclic-dependency` に直す
   - Reached state: 「the CLI prints messages, not codes」と、`references unknown node` の断片を見る停止条件を、`code` での判定に直す
   - Phase 1 step 5: 「the error `Duplicate node id`」を、ファイル内の重複の `duplicate-node-id-parent` と、ファイルをまたぐ重複の `duplicate-node-in-system` の 2 つの `code` に直す
   - Phase 3: 英語の文章を引いた「a wall of ...」と「The infra message says ...」は意味の説明に直す。block と leaf のどちらが無いかは、`unresolved-resource-ref` / `unresolved-table-ref` の `params.missing`（`block` / `leaf`）で判定する
   - `render` を検証に使うと書いた箇所と、Step 0 が呼ぶコマンドの一覧に `check --format json` を反映する

   `karasu-author` の「コードは出ない」という記述は、行の ID でカタログを引く説明と、検証は JSON で行う説明に直す。
<!-- absent-path-next-line: the guard this design intends to add (#3654) -->
8. **skill の drift ガードとして `scripts/lint/skill-diagnostic-codes.ts` を足す。** 公開する skill の `SKILL.md` について次を確かめる。
   - 判定に使うコードを書く形を `` `code:<kebab>` `` に決め（JSON の `code` 欄を指す）、その形の語がすべて `DiagnosticParamsByCode` / `WarningKind` に実在する。表か散文かは問わず、ヘッダの名前にも頼らない
   - `KRS[0-9]{3}` の形の ID を書かない（判定の鍵を `code` の 1 つに保つ。2 つの鍵が混ざると、片方だけ直したときにずれる）
   - `reverse-architecture` に `` `code:<kebab>` `` が 1 つも無い状態を落とす
   - `lint:skill-cli-refs` と同じく pre-push と CI に載せ、glob に core の `types/ast.ts` と `types/warnings.ts` を足す。core だけの改名でも落ちるように、実際の skill を読む vitest の mirror も `ci.yml` で動かす
   - 対象は `SKILL.md` だけである。同梱の reference は spec の写しなので対象にしない

   この lint が捕まえるのは、この形で書いたコードの実在と ID の不使用だけである。文章の断片で照合する新しい行は検出できないので、手順 7 の到達状態はレビューで確かめる。
9. **ドキュメント。** `docs/spec/diagnostics.md`（と `.ja.md`）に「CLI での表示」の節を足し（ID の形、行の形、JSON の約束）、`> Related TPLs:` で TPL-3654 に紐付ける。`docs/tools/cli.md`（と `.ja.md`）の `check` に `--format json` を書く。`docs/release.md`「CLI の後方互換」を、上の範囲に改める。同梱の reference を再生成する。
10. **changeset。** `karasu` の minor（ID の表示と `--format json`。CHANGELOG に、診断の行の接頭辞が変わることと、機械は JSON を読むことを書く）と `karasu-skills`（`.claude/rules/changesets.md` の「skill が前提にする CLI の挙動」）。#3640 の changeset（`.changeset/reverse-skill-current-diagnostics.md`）が未消費なら、同じトレインで誤りになるので、実装 PR で書き直す。
11. **AT。** `docs/acceptance/` に新規ファイル。人の確認は要らず、TC はすべて上の自動テストに到達させる。
    - `karasu check` の警告とエラーの行の頭に、locale によらず同じ ID が付く
    - `unresolved-edge-endpoint` を発火させた fixture で、`ja` の locale でも `--format json` の `code` で判定できる
    - モデルに error があるとき、`--format json` は読める JSON を出して 1 で終わる。ファイルが無いときは stdout に何も出さず 0 以外で終わる
    - 登録簿の ID がカタログの `ID` 列に一致し、番号に空きが無く、公開済みの版の ID が同じコードを指し続ける
    - `reverse-architecture` の `` `code:<kebab>` `` がすべてカタログに実在し、ID を書いていない
12. **ADR 昇格。** 1 本目の実装が終わったら `docs/adr/3654-cli-diagnostic-codes.md` として昇格し、本 Design Doc は同じ PR で削除する。ADR にはエディタとプレビューの約束（確定させる約束の 5）も残し、#3712 はその ADR に沿って実装する。

上の 1〜12 は 1 本の PR にし、11-29 のトレインに載せる。分けるなら、skill の更新は `--format json` と同じ PR に置く（skill だけが先に出ると、Step 0 の下限が JSON を持たない CLI を止めないまま判定が失敗する）。

#### エディタとプレビューでの表示（2 本目の PR、#3712）

1 本目が core に足す登録簿を使うので、その後に出す。skill や CLI の互換に関わらないので、トレインの期限には縛られない。

1. **カタログの URL を 1 か所で組む。** app と lsp がともに依存する場所（`packages/i18n` など）に、locale を受けてカタログの URL を返す関数を置き、`docs-site-links.ts` の base URL と locale の接頭辞の規則もそこへ移す。`scripts/lint/reference-docs-links.ts` の検査対象に `spec/diagnostics/` を足し、公開されていない route を指したら落ちるようにする。
2. **LSP。** `computeDiagnostics` が、parser の `Diagnostic` と resolver の `Warning` の両方に `code` と `codeDescription` を付ける。`diagnostics.test.ts` で、`ja` の locale でも `code` が同じで `href` だけが `ja/` になることを確かめる。登録簿の対応を通さずに `Diagnostic` を組む箇所が増えないよう、組む関数を 1 つにする（TPL-1417）。
3. **app。** バナーと警告のパネルに ID とリンクを出す。component のテストで、同じ fixture の診断に CLI と同じ ID が出ることを確かめ、e2e で表示とリンク先を確かめる。
4. **ドキュメントと changeset。** `docs/spec/diagnostics.md` の「CLI での表示」の節を「表示」に広げ、VS Code と app の形を書く。changeset は `karasu-vscode` と、app を同梱する `karasu`（`karasu serve`）に付ける（`@karasu-tools/app` と `@karasu-tools/lsp` は changeset の対象外）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 診断の行の重大度の語の直後に `[<ID>]` が増える。`^Warning: ` のように接頭辞で読むスクリプトは空振りするので、`karasu check --format json` へ移ってもらう（CHANGELOG で知らせる）。終了コードは変わらない。
- 公開中の 0.2.1 と新しい CLI: テキストの行に kebab のコードは載らないので、0.2.1 のコードの grep は今と同じく空のままで、後退も改善もしない。新しい skill で直る。
- #3640 の版と新しい CLI: エージェントは手順に従って `Error:` / `Warning:` / `Info:` の行を読むので、`Warning[KRS014]:` の行を読み落とす恐れがある。本件は次のトレイン（11-29）に載せ、#3640 の版を利用者に届けない（kompiro、PR #3663 のコメント）。
- 新しい skill と古い CLI: Step 0 の下限（パック時の CLI の版）が止める。下限は `--format json` を持つ版になる。
- ドキュメント更新: `docs/spec/diagnostics.md`, `docs/spec/diagnostics.ja.md`, `docs/tools/cli.md`, `docs/tools/cli.ja.md`, `docs/release.md`, 同梱の reference。
- テスト・examples への影響: 行の形を固定した CLI のテストの更新。examples への影響は無い。

## 決めないこと

- `render` など `check` 以外のコマンドの JSON 出力: 消費者が現れたときに、同じスキーマで足す。
- カタログの ID ごとのアンカー（VS Code や app のリンクから `#krs014` に飛ぶ）: 見出しの slug は locale で違うので使えず（TPL-1621）、表の行に locale によらない `id` を埋める必要がある。ページ内を ID で検索すれば引けるので、リンクの利用が増えてから決める。
- テキストの行に改行を含むメッセージを 1 行に整えること: 行は人向けになり、機械は JSON を読むので扱わない。
- `karasu serve` の 422 応答にコードを載せるか: 消費者がいないので決めない。
- 診断ではない `Warning:` 行（引数の通知、`translate` の警告）への ID の付与と、`karasu fmt` の `Cannot format: ... (<codes>)` の形: カタログの外か、`check` で確かめられるので変えない。
