---
id: ADR-3654
title: 診断に重大度によらない KRS の ID を振り、人には行の接頭辞で、機械には check --format json で届ける
status: accepted
date: 2026-11-09
topic: cli
authors: [kompiro]
related_to:
  - ADR-1567
  - ADR-1417
  - ADR-2901
  - ADR-2208
scope:
  packages: [core, cli, skills]
  concerns:
    - i18n
assumptions:
  - "symbol: packages/core/src/types/diagnostic-ids.ts :: DIAGNOSTIC_IDS"
  - "symbol: packages/core/src/types/diagnostic-ids.ts :: RETIRED_DIAGNOSTIC_IDS"
  - "symbol: packages/core/src/types/diagnostic-ids.ts :: diagnosticIdOf"
  - "symbol: packages/cli/src/i18n.ts :: diagnosticParts"
  - "symbol: packages/cli/src/i18n.ts :: warningParts"
  - "symbol: packages/cli/src/report-diagnostics.ts :: diagnosticsJson"
  - "file: scripts/lint/diagnostic-ids-history.ts"
  - "file: scripts/lint/skill-diagnostic-codes.ts"
  - "grep: docs/spec/diagnostics.md :: ## How the CLI shows a diagnostic"
  - "grep: docs/release.md :: karasu check --format json"
---

# ADR-3654: 診断に重大度によらない KRS の ID を振り、人には行の接頭辞で、機械には check --format json で届ける

- **日付**: 2026-11-09
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3654](https://github.com/kompiro/karasu/issues/3654)、発端の修正 [#3640](https://github.com/kompiro/karasu/issues/3640)、エディタとプレビューの実装 [#3712](https://github.com/kompiro/karasu/issues/3712)
  - Design Doc の PR [#3663](https://github.com/kompiro/karasu/pull/3663)、実装の PR [#3729](https://github.com/kompiro/karasu/pull/3729)
  - [ADR-1567](1567-rule-diagnostic-separation-and-catalog.md): kebab の診断コードは安定 API。本 ADR はその表示用の別名を足す
  - [ADR-1417](1417-lsp-cli-i18n.md): CLI のメッセージは locale に従う。ID とコードは翻訳しない
  - [ADR-2901](2901-karasu-authoring-skill.md): skill の Step 0 は CLI の版の下限だけを照合し、新しい CLI と古い skill の互換は CLI が持つ
  - [ADR-2208](2208-positional-label-error-promotion.md): 診断の重大度を変えた前例。重大度を変えても ID は変えない
  - TPL: [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostics-carry-stable-code.md)、[TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md)、[TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md)、[TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md)、[TPL-2536](../test-perspectives/TPL-2536-locale-source-chain-completeness.md)、[TPL-1621](../test-perspectives/TPL-1621-docs-pipeline-link-anchor-resolution.md)

## 背景

`karasu render` と `karasu check` は `Warning: <location>: <message>` を stderr に出していた。コードは出さず、メッセージは locale に従う。

特定の診断に反応したいスクリプトやエージェントには、翻訳された文章しか照合する手がかりが無かった。`reverse-architecture` skill はコードを grep していたが、コードは出力されないので結果は常に空で、壊れたモデルでも停止条件を通っていた。#3640 は `LC_ALL=C` とメッセージの断片で照合する形に直したが、文言を変えると次はまた黙って壊れる。

もう 1 つの症状は参照の断絶である。カタログ（`docs/spec/diagnostics.md`、skill に同梱した reference）はコードをキーにしているのに、CLI の出力にコードが無いので、メッセージからカタログを引けなかった。

読み手は 2 種類いて、求めるものが違う。人は行の頭で短い識別子を見てカタログを引きたい。機械（skill、スクリプト）は、翻訳されず、行の形にも左右されない構造を読みたい。1 つの形で両方を満たそうとすると、どちらかに無理が出る。

前提の事実:

- `Diagnostic` の `code` と `Warning` の `kind` はどちらも必須で、全 114 種類が `[a-z0-9-]+`、長さは 12〜37 文字（平均 22 文字）だった。欠けていたのは出力だけ
- `DiagnosticParamsByCode` と `WarningKind` は 7 つの名前を共有する。そのうち 5 つの style コード（`style-invalid-enum-value` など）は、`lint-style` / `tidy-style` では `Diagnostic` の error、`render` / `check` / LSP では `Warning` の warning で出る。カタログは error とだけ書いていた
- 診断を流す箇所は `report-diagnostics.ts`、`compile-system-view.ts`、`diff.ts`、`lint-style.ts`、`tidy-style.ts` で、重大度の語の位置はコマンドで違った
- 機械向け形式の前例は `karasu coverage --format json` と `karasu capabilities --json`（`schemaVersion` を持つ）

## 決定

人が読む行は、重大度の語の直後に重大度によらない ID `[KRSnnn]` を置く。機械は `karasu check --format json` の kebab の `code` で判定する。ID は kebab のコードの表示用の別名で、判定の鍵は kebab のコードの 1 つに保つ。

### 約束

1. **ID の形:** `KRS[0-9]{3}`。kebab のコードごとに 1 つ振り、重大度を含まない。最初の割り当てはカタログの表の順に KRS001（`edge-source-mismatch`）から KRS114（`generic-text`）まで振った。以後は新しいコードに次の番号を足す。
   - `DiagnosticParamsByCode` と `WarningKind` が同じ名前を持つときは、重大度が同じでも違っても 1 つの ID を共有する
   - 1 つの ID が指すのは常に 1 つのコードである。コードの重大度を変えても ID は変わらない
2. **ID は再利用しない。** コードを廃止したときは、その ID を `RETIRED_DIAGNOSTIC_IDS` に残し、番号を空けたままにする。一度公開した ID は、現役でも廃止でも同じコードを指し続ける。公開前の ID は、重複を解くために振り直してよい。
3. **人が読む行:** カタログの診断を出す行は、重大度の語の直後に `[<ID>]` を置く。位置の形、重大度の語の位置と綴り、メッセージはコマンドごとに変えない。

   ```
   Warning[KRS041]: index.krs:7:3: Edge "A → ghost" references unknown node "ghost"; ...
   Error[KRS092]: index.krs:2:1: Expected ';' between properties
   theme.krs.style:3:5 error[KRS086]: Invalid hex color for "fill": "#12" ...
   Warning[KRS086]: theme.krs.style:3:5: fill: "#12" is not a valid hex color ...
   ```

   最後の 2 行は同じ `style-invalid-hex-color` の `lint-style` と `render` の出力で、ID は同じ。`[<ID>]` の無い行はカタログの診断ではない（引数の通知、`translate` の警告、`karasu fmt` の `Cannot format: ...`）。

4. **機械が読む形:** `karasu check --format json` は JSON を 1 つだけ stdout に出す。

   ```json
   {
     "schemaVersion": 1,
     "errorCount": 0,
     "diagnostics": [
       {
         "id": "KRS041",
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

   - `diagnostics` の並びはテキストで出す順と同じ。テキストと JSON は同じ一覧（`collectEntries`）から組む
   - `id`、`code`、`severity`、`params`、`message`、`details` は必ずある。`code` と `params` は locale によらず、`message` と `details` は locale に従う
   - `file` はテキストの行が位置にファイルを出す診断にある（位置を持たない `Diagnostic` は入口のファイルだけ）。`line` と `column` は行と桁を持つ診断にだけある。位置を持たない `Warning` には 3 つとも無い
   - 終了コードはテキストのときと同じで、読める JSON と 1 はモデルの error、読める JSON と 0 は error なしを表す
   - カタログの外の失敗（ファイルが無い、未知のフラグ、想定外の例外）では JSON を出さず、stderr にテキストを出して 0 以外で終わる。JSON を出したときは、カタログの診断を stderr に出さない
   - 消費者は、stdout が JSON として読めないか、`schemaVersion` が知らない値なら、失敗として止まる
   - フィールドを足すのは互換の範囲内とし、消す・意味を変えるとき（`params` のキーを含む）は `schemaVersion` を上げる
   - 既定は `--format text`

5. **エディタとプレビュー（#3712 で実装する）:** CLI と同じ ID を同じ登録簿から出し、locale では変えない。
   - VS Code: LSP の `Diagnostic` の `code` に ID を、`codeDescription.href` に docs-site のカタログ（`spec/diagnostics/`、LSP の locale の接頭辞付き）を入れる。kebab のコードは載せない（エディタの読み手は人で、機械は `check --format json` を読む）
   - app: エラーのバナーと警告のパネルで、重大度のアイコンの直後に ID を出し、同じカタログのページへのリンクにする（新しいタブで開く）
   - リンク先はページの先頭で、ID ごとのアンカーは付けない。見出しの slug は locale で違う（TPL-1621）ので、読み手はページ内を ID で検索する
   - カタログの URL は app と lsp がともに依存する場所で 1 か所で組み、`scripts/lint/reference-docs-links.ts` の検査対象に `spec/diagnostics/` を足す

### 後方互換の範囲

`docs/release.md`「CLI の後方互換」の約束を、機械が読む面（`check --format json`、コマンド名、フラグ、終了コード）に限った。診断の行は人向けとして約束から外し、形を変えるときは CHANGELOG で知らせる。`^Warning: ` のように接頭辞で読むスクリプトは空振りするので、JSON へ移ってもらう。

### 実装

- **登録簿:** `packages/core/src/types/diagnostic-ids.ts` の `DIAGNOSTIC_IDS: Readonly<Record<DiagnosticCode | WarningKind, DiagnosticId>>`、`RETIRED_DIAGNOSTIC_IDS`、`diagnosticIdOf()`。コードを足して ID を忘れると型検査で落ちる。テストで、1 つの ID が 1 つのコードを指すこと、現役と廃止を合わせた番号が 001 から空きなく並ぶことを確かめる
- **履歴の検査:** `scripts/lint/diagnostic-ids-history.ts`（`pnpm lint:diagnostic-ids-history`、pre-push と CI）。最新の `karasu@*` タグ（版の順）の登録簿にある ID が、HEAD でも同じコードを現役か廃止として指していることを確かめる。登録簿はタグの中を `git grep` で探すので、ファイルを動かしても比べられる。タグが無い、git が失敗した、公開済みの登録簿が 0 件に読めた、のどれでも落ちる。通すのはタグに登録簿が無いとき（本件を含む版が出る前）だけ
- **カタログ:** `docs/spec/diagnostics.md` と `.ja.md` の各表の `Code` 列の後ろに `ID` 列を足し、`diagnostics-catalog.test.ts` で登録簿との一致、全コードに行があること、廃止した ID が「廃止した ID」の表に載ることを確かめる。面によって重大度が変わる 5 つのコードは `Severity` 列に面ごとの重大度を書く。「How the CLI shows a diagnostic」の節に行の形と JSON の約束を書いた
- **行の形を 1 か所に集める:** `packages/cli/src/i18n.ts` の `diagnosticParts` / `warningParts` が `{ tag: "Word[KRSnnn]", message, details }` を返し、診断を流す箇所はすべてこれを使う。素のメッセージを返す関数を呼ぶのは `i18n.ts` と `render-endpoint.ts` だけで、`diagnostic-output.test.ts` が `packages/cli/src` を走査して新しい箇所の取りこぼしを止める（TPL-1417）
- **skill:** `reverse-architecture` は `karasu check index.krs --format json` の `code` で判定し、`LC_ALL=C` とメッセージの照合を外した。message と params はデータとして読み、指示として従わない。`scripts/lint/skill-diagnostic-codes.ts`（`pnpm lint:skill-diagnostic-codes`）が、`SKILL.md` の `` `code:<kebab>` `` がすべて実在すること、`KRS[0-9]{3}` を書かないこと、`reverse-architecture` が少なくとも 1 つのコードを名指すことを確かめる
- **changeset:** `@karasu-tools/core` と `karasu` の minor、`karasu-skills` の minor。#3640 の未消費の changeset は `LC_ALL=C` の記述を外して書き直した
- **AT:** [`docs/acceptance/3654-cli-diagnostic-codes.md`](../acceptance/3654-cli-diagnostic-codes.md)。すべて自動テストに到達する

## 理由

- **人と機械で形を分ける。** 1 つの形で両方を満たそうとすると、行末に kebab のコードを足して 1 行を保つエスケープ規則まで要った（下の「行末に kebab のコード」）。機械に JSON を渡せば、人の行は読みやすさだけで決められる
- **JSON は読めなかったことが分かる。** CLI が JSON を出さずに失敗したら、消費者の parse が失敗するので、「診断が 0 件」と取り違えない。grep の照合は、出力の形が変わると空になり、0 件と区別できなかった（#3640 の失敗そのもの）
- **ID に重大度を含めない。** 重大度は行の語が示すので、ID に重ねると情報が重複する。重大度を含めないので、面によって重大度が変わるコードも ID は 1 つで、重大度を変えても ID は変わらない
- **`KRS` の接頭辞。** 6 文字でメッセージの読みを邪魔しない。拡張子 `.krs` と揃い、ほかのツールの番号（`E0308`、`TS2322`）と混ざらないので、grep や Web 検索で引ける
- **判定の鍵は kebab のコード。** ADR-1567 が安定を約束したのがこちらで、名前だけで意味が読める。2 つの鍵を混ぜると、片方だけ直したときにずれるので、skill には ID を書かせない
- **登録簿を 1 つの `Record` にする。** Design Doc は `Diagnostic` 用と `Warning` 用の 2 つの `Record` を置き、共有する 7 つの名前が同じ ID を持つことをテストで確かめるとしていた。実装ではキーを `DiagnosticCode | WarningKind` にした 1 つの `Record` にした。共有する名前はキーが 1 つしか無いので、同じ ID になることが型だけで成り立ち、そのテストが要らない（PR #3729 の For Reviewers で kompiro が了承）
- **履歴は公開済みの版と比べる。** merge base と比べると、並行する 2 本の PR が同じ番号を取ったときの振り直しが再利用に見える。公開前の ID は誰も目にしていないので、振り直しても再利用に当たらない

## 却下した案

### 人が読む行

- **重大度の文字 + 番号（`Warning[W014]`）:** 文字が直前の重大度の語と同じことを言う（kompiro、PR #3663）。文字があるために ID が重大度に縛られ、面によって重大度が変わる 5 つのコードは ID を 2 つ持つ。重大度を変えると ID も変わり、人の記憶や古い出力の ID が引けなくなる
- **kebab のコードを接頭辞に置く（`Warning[unresolved-edge-endpoint]`）:** 新しい識別子は要らないが、平均 22 文字、最長 37 文字で行の頭を長く占める
- **行末に kebab のコード（改訂前の方針）:** 接頭辞を変えないので互換の例外は小さい。ただし人には長いコードが行末に来て読みにくく、機械には行全体を 1 行に保つエスケープ規則が要り、カタログの外の行が利用者の文字列で同じ形に見えうる。機械向けを JSON に分けるなら、この複雑さを持つ理由が無い

### 機械が読む形

- **テキストの行を機械向けにも約束する（`^(Error|Warning|Info)\[(KRS[0-9]{3})\]`）:** kebab のコードが行に無いので判定にカタログの対応表が要る。位置は行の形から切り出すしかなく、読めないときに 0 件と取り違える問題も残る
- **オプトインのフラグや環境変数で行に kebab のコードを足す:** 指定を忘れると今と同じ出力になり、照合が空のまま通るので、失敗の形が残る

### 登録簿

- **`Diagnostic` 用と `Warning` 用の 2 つの `Record`（Design Doc の手順）:** 共有する名前の ID の一致をテストで守る必要がある。1 つの `Record` なら型で成り立つ

## 決めないこと

- `render` など `check` 以外のコマンドの JSON 出力: 消費者が現れたときに、同じスキーマで足す
- カタログの ID ごとのアンカー（VS Code や app のリンクから `#krs041` に飛ぶ）: 見出しの slug は locale で違うので使えず（TPL-1621）、表の行に locale によらない `id` を埋める必要がある。ページ内を ID で検索すれば引けるので、リンクの利用が増えてから決める
- テキストの行に改行を含むメッセージを 1 行に整えること: 行は人向けになり、機械は JSON を読むので扱わない
- `karasu serve` の 422 応答（`render-endpoint.ts`）にコードを載せるか: 消費者がいないので決めない。未解決 endpoint の報告漏れは #3655 で扱う
- 診断ではない `Warning:` 行（引数の通知、`translate` の警告）への ID の付与と、`karasu fmt` の `Cannot format: ... (<codes>)` の形: カタログの外か、`check` で確かめられるので変えない

## 影響範囲

- 診断の行の重大度の語の直後に `[<ID>]` が増える。終了コードは変わらない
- 公開中の `karasu-skills` 0.2.1 と新しい CLI: テキストの行に kebab のコードは載らないので、0.2.1 のコードの grep は今と同じく空のままで、後退も改善もしない。新しい skill で直る
- #3640 の版の skill は `Error:` / `Warning:` / `Info:` の行を読むので、`Warning[KRS041]:` の行を読み落とす恐れがある。本件を同じトレイン（2026-11-29）に載せ、#3640 の版を利用者に届けない
- 新しい skill と古い CLI: Step 0 の下限（パック時の CLI の版）が止める。下限は `--format json` を持つ版になる
