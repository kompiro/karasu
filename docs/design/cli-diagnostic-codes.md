# CLI の診断出力に安定したコードを載せる

- **日付**: 2026-11-07（2026-11-08 に kompiro のコメントを受けて方針を改訂）
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#3654](https://github.com/kompiro/karasu/issues/3654)
  - 発端の修正: [#3640](https://github.com/kompiro/karasu/issues/3640)（`reverse-architecture` skill の検証を `LC_ALL=C` + メッセージ本文の照合に変えた暫定対応）
  - 関連 ADR: [ADR-1567](../adr/1567-rule-diagnostic-separation-and-catalog.md)（診断コードは安定 API）, [ADR-1417](../adr/1417-lsp-cli-i18n.md)（CLI のメッセージは locale に従う）, [ADR-2901](../adr/2901-karasu-authoring-skill.md)（skill の Step 0 は CLI の版の下限だけを照合し、新しい CLI と古い skill の互換は CLI が持つ）, [ADR-2208](../adr/2208-positional-label-error-promotion.md)（診断の重大度を変えた前例）
  - 関連 TPL: [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostics-carry-stable-code.md)（本 Design Doc で起こす）, [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md), [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md), [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md), [TPL-2536](../test-perspectives/TPL-2536-locale-source-chain-completeness.md)
  - コード: `packages/cli/src/report-diagnostics.ts`, `packages/cli/src/compile-system-view.ts`, `packages/cli/src/diff.ts`, `packages/cli/src/lint-style.ts`, `packages/cli/src/tidy-style.ts`, `packages/cli/src/check.ts`, `packages/cli/src/i18n.ts`

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
| 重大度 | カタログは各コードに重大度を 1 つ書く（error 50、warning 54、info 10）。`Warning` の重大度は種類ごとに `warningSeverity` が決める。`Diagnostic` は出す箇所ごとに `severity` を書くが、core の 62 種類のコードを走査したかぎり、同じコードを 2 つの重大度で出す箇所は無い（`this.error` と `rejectConstruct` は常に error） |
| カタログ | 全コードが `docs/spec/diagnostics.md` に載ることを meta-test が強制する（TPL-1623） |
| 診断を流す箇所 | `report-diagnostics.ts`（`render` / `check`、`Warning: <loc>: <msg>`）、`compile-system-view.ts`（`subtree` などのエラー）、`diff.ts`（`Warning: <loc> <msg>`）、`lint-style.ts`（`stdin:<l>:<c> <severity>: <msg>`）、`tidy-style.ts`（`<name>:<l>:<c> error: <msg>`）。重大度の語の位置はコマンドで違う |
| 診断ではない行 | `Warning: --include-matrix requires --output` や `translate` の警告は引数や変換の通知で、カタログのコードを持たない。`karasu fmt` の `Cannot format: ...` も翻訳されない別の形 |
| 機械向け形式の前例 | `karasu coverage --format json`（stdout、版の欄なし）、`karasu capabilities --json`（`schemaVersion` を持つ） |
| ほかの面 | LSP は診断に `code` を付けていない。人がコードを目にする面は CLI の行だけ |
| skill の版の照合 | Step 0 は下限のみ。下限はパック時の CLI の版（`packages/skills/scripts/stamp-version.mjs`）。古い skill と新しい CLI の組み合わせは検出されない |
| 配布中の skill | 公開中の `karasu-skills` は 0.2.1。`karasu render` の出力を kebab のコードで grep し、停止条件は「grep が空」である。#3656 の版（エージェントが `Error:` / `Warning:` / `Info:` の行を読み、メッセージの断片で照合する）は main にあるが未リリースで、changeset が残っている |

## 制約・前提

- **人が読む行と機械が読む出力を分ける。** 人が読む行は短い ID を接頭辞に置き、機械は `karasu check --format json` を読む（kompiro、PR #3663 のコメント）。
- **stdout / stderr の形式は後方互換を保つ方針である**（`docs/release.md`「CLI の後方互換」、ADR-2901）。接頭辞を変えるので、この方針の範囲を改める。機械向けの約束を JSON に移し、診断の行は人向けとして約束から外す。
- **skill と CLI は別々に更新される。** 消費者は 3 つある。公開中の 0.2.1（kebab のコードで grep する）、#3640 の版（エージェントが行の接頭辞を見て読む。月次のトレインを挟んで本件より先に出れば利用者に届く）、利用者のスクリプト（`^Warning: ` など）。どのリリース順でも、照合が空になって停止条件を素通りする #3640 の失敗を、新しい skill で起こしてはいけない。
- **kebab のコードは安定 API のまま残す**（ADR-1567）。短い ID はその表示用の別名で、kebab のコードを置き換えない。
- **コードも ID も翻訳しない。** 接頭辞 `Warning` もすでに locale によらず英語である。
- **対象外:** `karasu serve` の 422 応答の本文（`render-endpoint.ts`）。#3655（未解決 endpoint の報告漏れ）は別の Issue で扱う。

## 検討した選択肢

人が読む行の形と、機械が読む形を分けて検討した。

### 人が読む行

#### 案A: 重大度の文字 + 番号の ID を接頭辞に置く（採用）

```
Warning[W014]: index.krs:7:3: Edge "A → ghost" references unknown node "ghost"; the edge is dropped (the resolved endpoint is kept)
Error[E003]: index.krs:2:1: Expected ';' between properties
stdin:3:5 error[E041]: Unknown property "colour"
```

ID は `E` / `W` / `I`（error / warning / info）の 1 文字と 3 桁の番号で、文字ごとに番号を振る。rustc の `error[E0308]` と同じ位置に置く。

- 行の頭で重大度と診断が読め、4 文字なのでメッセージの読みを邪魔しない
- カタログに ID の列を足せば、行からそのまま引ける
- 重大度を変えると ID も変わる（ADR-2208 のような昇格で `W0xx` が `E0xx` になる）。機械は kebab のコードで判定するので、影響は人の記憶とカタログの引き直しにとどまる

#### 案B: kebab のコードを接頭辞に置く（`Warning[unresolved-edge-endpoint]: ...`）

新しい識別子が要らない。ただしコードは平均 22 文字、最長 37 文字で、行の頭を長く占める。

#### 案C: 重大度によらない通し番号（`Warning[KRS2014]: ...`）

重大度を変えても ID が変わらない。ただし ID から重大度が読めず、5〜7 文字になる。

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
      "id": "W014",
      "code": "unresolved-edge-endpoint",
      "severity": "warning",
      "file": "index.krs",
      "line": 7,
      "column": 3,
      "message": "Edge \"A → ghost\" references unknown node \"ghost\"; ...",
      "details": []
    }
  ]
}
```

- 改行や区切り文字の問題が無く、位置も取り出せる
- 読めなかったことが分かる。CLI が JSON を出さずに失敗したら、消費者の parse が失敗するので、「診断が 0 件」と取り違えない。grep の照合は、出力の形が変わると空になり、0 件と区別できなかった
- `coverage --format json` と `capabilities --json` の前例に合う

#### 案K: テキストの行を機械向けにも約束する

案A の行を `^(Error|Warning|Info)\[([EWI][0-9]{3})\]` で読ませる。ID は重大度で変わるので判定の鍵には向かず、kebab のコードが行に無いので、判定にはカタログの対応表が要る。行が読めないときに 0 件と取り違える問題も残る。

#### 案L: オプトインのフラグや環境変数でテキストの行に kebab のコードを足す

指定を忘れると今と同じ出力になり、照合が空のまま通るので、失敗の形が残る。

## 比較

人が読む行:

| 観点 | 案A 文字+番号 | 案B kebab | 案C 通し番号 | 案D 行末 kebab |
| --- | --- | --- | --- | --- |
| 行の頭の長さ | 4 文字 | 12〜37 文字 | 5〜7 文字 | 変わらない（行末に 12〜37 文字） |
| ID から重大度が読める | 読める | 読めない | 読めない | 読めない |
| 重大度を変えたとき | ID が変わる | 変わらない | 変わらない | 変わらない |
| 新しい識別子の管理 | 要る | 要らない | 要る | 要らない |
| 接頭辞で読む消費者（`^Warning: `） | 壊す | 壊す | 壊す | 保つ |

機械が読む形:

| 観点 | 案J JSON | 案K テキストの行 | 案L オプトイン |
| --- | --- | --- | --- |
| 翻訳された文章を読まずに判別できる | できる | できる（対応表が要る） | 指定したときだけ |
| 読めなかったことが分かる | 分かる（parse が失敗する） | 分からない（0 件に見える） | 分からない |
| 位置を構造で取れる | 取れる | 取れない | 取れない |
| 重大度を変えても判定が変わらない | 変わらない（`code` で判定） | 変わる | 変わらない |

## Related TPLs

- [TPL-3654](../test-perspectives/TPL-3654-cli-diagnostics-carry-stable-code.md)（本 Design Doc で起こす proactive TPL）: 診断を流す箇所がすべて ID を載せること、ID とカタログと重大度が一致すること、skill が JSON の `code` で判定すること
- [TPL-1623](../test-perspectives/TPL-1623-diagnostics-catalog-completeness.md): カタログとコードの完全性。ID の列もこの meta-test で守る
- [TPL-1417](../test-perspectives/TPL-1417-single-renderer-for-structured-messages.md): 行の形を 1 か所に集める
- [TPL-2084](../test-perspectives/TPL-2084-skill-cli-command-refs-drift.md): skill が書く CLI のコマンドとフラグのずれ（`check --format json`）
- [TPL-2536](../test-perspectives/TPL-2536-locale-source-chain-completeness.md): locale を変えても ID と JSON の `code` が変わらないこと

## 現時点の方針

**人が読む行は案A、機械が読む形は案J にする。** 人は行の頭の短い ID でカタログを引き、機械は JSON の `code` で判定する。判定の鍵を kebab のコードにするのは、ADR-1567 が安定を約束したのがこちらで、重大度を変えても変わらないからである。ID は人のための別名として扱う。

**後方互換の方針の範囲を改める。** `docs/release.md`「CLI の後方互換」は stdout / stderr の形式を約束に含めている。本件の後は、機械が読む面を `check --format json`（`schemaVersion` で版を示す）、コマンド名、フラグ、終了コードに限り、診断の行は人向けとして約束から外す。人向けの行の形を変えるときは CHANGELOG で知らせる。方針の目的（手元に残る古い skill とスクリプトを壊さない）に対して、壊れるものと残るものは「影響範囲・マイグレーション」に書いた。

### 確定させる約束

1. **ID の形:** `[EWI][0-9]{3}`。文字は、カタログがそのコードに書く重大度（`E` = error、`W` = warning、`I` = info）。番号は文字ごとに 001 から振る。最初の割り当てはカタログの表の順に行い、以後は新しいコードに次の番号を足す。
2. **ID は再利用しない。** コードを廃止するか重大度を変えたときは、古い ID を廃止した ID として残し、番号を空けたままにする。重大度を変えたコードには新しい文字で次の番号を振る。
3. **人が読む行:** カタログの診断を出す行は、重大度の語の直後に `[<ID>]` を置く（`Warning[W014]:`、`stdin:3:5 error[E041]:`）。位置の形、重大度の語の位置と綴り、メッセージはコマンドごとに今のまま変えない。`[<ID>]` の無い行はカタログの診断ではない（引数の通知、`translate` の警告、`karasu fmt` の `Cannot format: ...`）。
4. **機械が読む形:** `karasu check --format json` は、上の形の JSON を 1 つだけ stdout に出す。
   - `diagnostics` の並びは、テキストで出す順と同じにする
   - `id`、`code`、`severity`、`message` は必ずある。`code` は `DiagnosticParamsByCode` のキーか `WarningKind` のメンバーで、locale によらない。`message` と `details` は locale に従う
   - `file`、`line`、`column` は位置を持つ診断にだけある。`file` はテキストの行と同じ表示用のパス
   - `errorCount` は error の件数で、終了コードはテキストのときと同じ（error があれば 1、無ければ 0）
   - カタログの外の失敗（ファイルが無い、未知のフラグ、想定外の例外）では JSON を出さず、stderr にテキストを出して 0 以外で終わる。消費者は、stdout が JSON として読めなければ失敗として止まる
   - フィールドを足すのは互換の範囲内とし、消す・意味を変えるときは `schemaVersion` を上げる
   - 既定は `--format text` で、今の出力に案A の ID を足したもの

### 実装の指針

<!-- absent-path-next-line: the registry this design intends to add (#3654) -->
1. **ID の登録簿を core に置く。** `packages/core/src/types/diagnostic-ids.ts` に、kebab のコードから ID への対応 `Record<DiagnosticCode | WarningKind, DiagnosticId>` と、廃止した ID の一覧を置く。`Record` なので、コードを足して ID を忘れると型検査で落ちる。テストで次を確かめる:
   - ID が重複しない。廃止した ID と現役の ID が重ならない
   - 文字ごとに、現役と廃止を合わせた番号が 001 から空きなく並ぶ（ID を消すと番号が空くので落ちる。再利用はこれで防ぐ）
   - `Warning` の ID の文字が `warningSeverity` と一致する
   - `Diagnostic` を出す箇所の重大度と ID の文字が一致する。`packages/core/src` を走査し、`severity:` と `code:` の組に加えて、重大度を固定した helper（`this.error`、`rejectConstruct`）に渡すコードも見る

   並行する 2 本の PR が同じ番号を取ると、両方が通ってからマージした時点で main の重複検査が落ちる（ruleset は base への追従を求めない）。リリースは月次なので、公開前に後の方の番号を振り直す。
2. **カタログに ID の列を足す。** `docs/spec/diagnostics.md` と `.ja.md` の各表に `ID` 列を足し、meta-test（`diagnostics-catalog.test.ts`）で列と登録簿の一致、文字と `Severity` 列の一致を確かめる。廃止した ID は、カタログの節に「廃止した ID」として旧コードとともに残し、古い出力からも引けるようにする。
3. **行の形を 1 か所に集める。** `packages/cli/src/i18n.ts` に、重大度の語に `[<ID>]` を付ける関数を置き、stderr / stdout へ診断を流す箇所はすべてこれを使う（TPL-1417）。素のメッセージを返す `formatDiagnostic` / `formatWarning` / `renderDiagnostic` / `renderWarning` を呼ぶのは `i18n.ts`、`render-endpoint.ts`、JSON を組む箇所だけにし、`packages/cli/src` を走査するテストで新しい箇所の取りこぼしを止める。
4. **`karasu check --format json` を足す。** 不明な形式は `coverage` と同じ形で拒否する。`agent-surface.json` にフラグを足し（`compat.test.ts` が求める）、`capabilities --json` にも出す。
5. **contract test を `packages/cli` に足す。** テキストは `render` / `check` / `subtree` / `diff` / `lint-style` / `tidy-style` の各形で ID が重大度の語の直後に付くこと、JSON は上の約束の各項目、`ja` の locale でも ID と `code` が同じこと、ファイルが無いときに stdout が空で 0 以外で終わることを確かめる。接頭辞を固定した既存のテスト（`check.test.ts` の `Style file not found` など）は新しい形に更新する。
6. **skill を更新する。** 到達状態は、`packages/skills/skills/**` が判定を `karasu check --format json` の `code` で行い、翻訳された文章も、行の接頭辞も、ID も照合しないことである。`LC_ALL=C` を外すので、文章の断片を 1 つでも判定に残すと `ja` の locale で空振りする。メッセージの内容は、エージェントが locale のまま読む。`reverse-architecture` では次を直す。
   - Phase 4 step 2: `karasu check --format json index.krs` で判定する形にし、`LC_ALL=C` と `Message contains` 列を外す。stdout が JSON として読めなければ止まると書く。`Circular dependency detected` の行は `cyclic-dependency` に直す
   - Reached state: 「the CLI prints messages, not codes」と、`references unknown node` の断片を見る停止条件を、`code` での判定に直す
   - Phase 1 step 5: 「the error `Duplicate node id`」を `duplicate-node-id-parent` の `code` に直す
   - Phase 3: 英語の文章を引いた「a wall of ...」と「The infra message says ...」は意味の説明に直す。block と leaf のどちらが無いかは `code` では分からないので、エージェントが `message` を読む
   - `render` を検証に使うと書いた箇所と、Step 0 が呼ぶコマンドの一覧に `check --format json` を反映する

   `karasu-author` の「コードは出ない」という記述は、行の ID でカタログを引く説明と、検証は JSON で行う説明に直す。
<!-- absent-path-next-line: the guard this design intends to add (#3654) -->
7. **skill の drift ガードとして `scripts/lint/skill-diagnostic-codes.ts` を足す。** 公開する skill の `SKILL.md` について次を確かめる。
   - 判定に使うコードを書く形を `` `code:<kebab>` `` に決め（JSON の `code` 欄を指す）、その形の語がすべて `DiagnosticParamsByCode` / `WarningKind` に実在する。表か散文かは問わず、ヘッダの名前にも頼らない
   - `[EWI][0-9]{3}` の形の ID を書かない（ID は重大度で変わるので判定の鍵にしない）
   - `reverse-architecture` に `` `code:<kebab>` `` が 1 つも無い状態を落とす
   - `lint:skill-cli-refs` と同じく pre-push と CI に載せ、glob に core の `types/ast.ts` と `types/warnings.ts` を足す。core だけの改名でも落ちるように、実際の skill を読む vitest の mirror も `ci.yml` で動かす
   - 対象は `SKILL.md` だけである。同梱の reference は spec の写しなので対象にしない

   この lint が捕まえるのは、この形で書いたコードの実在と ID の不使用だけである。文章の断片で照合する新しい行は検出できないので、手順 6 の到達状態はレビューで確かめる。
8. **ドキュメント。** `docs/spec/diagnostics.md`（と `.ja.md`）に「CLI での表示」の節を足し（ID の形、行の形、JSON の約束）、`> Related TPLs:` で TPL-3654 に紐付ける。`docs/tools/cli.md`（と `.ja.md`）の `check` に `--format json` を書く。`docs/release.md`「CLI の後方互換」を、上の範囲に改める。同梱の reference を再生成する。
9. **changeset。** `karasu` の minor（ID の表示と `--format json`。CHANGELOG に、診断の行の接頭辞が変わることと、機械は JSON を読むことを書く）と `karasu-skills`（`.claude/rules/changesets.md` の「skill が前提にする CLI の挙動」）。#3640 の changeset（`.changeset/reverse-skill-current-diagnostics.md`）が未消費なら、同じトレインで誤りになるので、実装 PR で書き直す。
10. **AT。** `docs/acceptance/` に新規ファイル。人の確認は要らず、TC はすべて上の自動テストに到達させる。
    - `karasu check` の警告とエラーの行の頭に、locale によらず同じ ID が付く
    - `unresolved-edge-endpoint` を発火させた fixture で、`ja` の locale でも `--format json` の `code` で判定できる
    - ファイルが無いとき、`--format json` は stdout に何も出さず 0 以外で終わる
    - 登録簿の ID がカタログの `ID` 列と重大度に一致し、番号に空きが無い
    - `reverse-architecture` の `` `code:<kebab>` `` がすべてカタログに実在し、ID を書いていない
11. **ADR 昇格。** 実装完了後に `docs/adr/3654-cli-diagnostic-codes.md` として昇格し、本 Design Doc は同じ PR で削除する。

実装は 1 本の PR にする。分けるなら、skill の更新は `--format json` と同じ PR に置く（skill だけが先に出ると、Step 0 の下限が JSON を持たない CLI を止めないまま判定が失敗する）。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: 診断の行の重大度の語の直後に `[<ID>]` が増える。`^Warning: ` のように接頭辞で読むスクリプトは空振りするので、`karasu check --format json` へ移ってもらう（CHANGELOG で知らせる）。終了コードは変わらない。
- 公開中の 0.2.1 と新しい CLI: テキストの行に kebab のコードは載らないので、0.2.1 のコードの grep は今と同じく空のままで、後退も改善もしない。新しい skill で直る。
- #3640 の版と新しい CLI: エージェントは手順に従って `Error:` / `Warning:` / `Info:` の行を読むので、`Warning[W014]:` の行を読み落とす恐れがある。本件を次のトレイン（11-29）に載せれば、#3640 の版は利用者に届かない。間に合わなければ、#3640 の版が公開されたあとに本件が出る組み合わせが残る。その場合でもメッセージは変わらないので、エージェントが行を読めば判定は動く。
- 新しい skill と古い CLI: Step 0 の下限（パック時の CLI の版）が止める。下限は `--format json` を持つ版になる。
- ドキュメント更新: `docs/spec/diagnostics.md`, `docs/spec/diagnostics.ja.md`, `docs/tools/cli.md`, `docs/tools/cli.ja.md`, `docs/release.md`, 同梱の reference。
- テスト・examples への影響: 行の形を固定した CLI のテストの更新。examples への影響は無い。

## 決めないこと

- `render` など `check` 以外のコマンドの JSON 出力: 消費者が現れたときに、同じスキーマで足す。
- LSP（VS Code の Problems）に ID や `code` を載せるか: 今は `code` を付けていない。人が目にする面を揃えるなら別の Issue で扱う。
- カタログの ID ごとのアンカー（docs-site で `#W014` に飛ぶ）: カタログの表を引ければ足りるので、要望が出たら決める。
- テキストの行に改行を含むメッセージを 1 行に整えること: 行は人向けになり、機械は JSON を読むので扱わない。
- `karasu serve` の 422 応答にコードを載せるか: 消費者がいないので決めない。
- 診断ではない `Warning:` 行（引数の通知、`translate` の警告）への ID の付与と、`karasu fmt` の `Cannot format: ... (<codes>)` の形: カタログの外か、`check` で確かめられるので変えない。
