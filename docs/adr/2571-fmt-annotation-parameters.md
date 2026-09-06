---
id: ADR-2571
title: アノテーションのパラメータを emit 1 箇所に畳み、値の種類ごとに正準形を 1 つ決める
status: accepted
date: 2026-09-06
topic: parser
authors: [kompiro]
related_to: [ADR-438, ADR-1568, ADR-1583, ADR-1990, ADR-1995, ADR-2076, ADR-2087]
scope:
  packages: [core, cli]
assumptions:
  - "symbol: packages/core/src/parser/parser.ts :: annotationParamKind"
  - "grep: packages/core/src/parser/parser.ts :: migration_target: { from: \"ref\" }"
  - "grep: packages/core/src/formatter/formatter.ts :: function renderAnnotations"
  - "file: packages/core/src/formatter/annotation-params-round-trip.test.ts"
  - "file: packages/core/src/parser/annotation-params.test.ts"
---

# ADR-2571: アノテーションのパラメータを emit 1 箇所に畳み、値の種類ごとに正準形を 1 つ決める

- **日付**: 2026-09-06
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#2571](https://github.com/kompiro/karasu/issues/2571)（`karasu fmt` がアノテーションのパラメータを落とす）
  - 実装 PR: [#2701](https://github.com/kompiro/karasu/pull/2701)
  - 後続 Issue: [#2707](https://github.com/kompiro/karasu/issues/2707)（引用符なしの値を lexer が壊す / 読めない値の診断 / `duplicate-annotation` 診断）
  - ADR: [ADR-1568](1568-migration-intent-fields.md)（パラメータ構文と精度による graceful degradation）、[ADR-1995](1995-draft-confidence-annotation.md)（`@draft(confidence:)` — 認識外の文字列も verbatim 保持）、[ADR-1583](1583-team-annotations-owner-priority.md)（`team` がアノテーションを持てるようにした）、[ADR-438](438-krs-formatter.md)（formatter の冪等性）、[ADR-2076](2076-formatter-top-level-exhaustiveness.md) / [ADR-2087](2087-escape-emitted-string-values.md)（同じ round-trip 系列の先行 2 件）、[ADR-1990](1990-karasu-nest-pivot-server-reverse.md)（reverse の正直さの層 — パラメータの消費者）
  - AT: [2571-fmt-annotation-params.md](../acceptance/2571-fmt-annotation-params.md)
  - TPL: [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（本 ADR で「AST 比較のヘルパがあっても fixture が通らない枝は守られない」を追記）
  - spec: [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md) § Annotation parameters

## 背景

`karasu fmt` はアノテーションの括弧の中身を丸ごと捨てていた。`@draft(confidence: "low")` は裸の `@draft` になり、`@deprecated(until: "2026-12-31")` は裸の `@deprecated` になる。診断も警告も出ない。

parser は読み、compiler は消費していた（`getDraftState` / `getMigrationIntent`）。**読まないのは formatter だけ**で、それが「整形するが何も変えない」を契約とする唯一のコマンドだった。

被害は Issue の記述より 1 段大きかった。論理軸（`renderNode`）はパラメータだけを落としたが、組織軸（`renderTeam`）は**アノテーション名すら出力していなかった**。spec が `team payments @migration_target(from: "legacy")` を規定しているのに、`fmt` はそれを丸ごと削除していた（ADR-1583 で `team` にアノテーションを入れたとき、formatter 側を配線し忘れていた）。

実害は生成パイプラインに出る。`packages/nest/src/reverse/prompts.ts` の `HONESTY_DIRECTIVE` は継ぎ目に `@draft(confidence: "low")` を書けと指示し（ADR-1990 決定 4 の正直さの層）、reverse-architecture スキルは合成の最後に `karasu fmt` を走らせる。つまり reverse 実行は自分のパイプラインの最終段で確信度を失っていた。

**本件は TPL-1101 系列の 3 件目である。** ADR-2076 は top-level 構文の列挙漏れ、ADR-2087 は値のエスケープ漏れ、本件はネストしたプロパティの emit 漏れで、いずれも「parser が受理するのに `fmt` が黙って消す」同じクラスである。

最も注目すべきは、**検出機構がすでに存在していた**ことである。`formatter.test.ts` の `expectAstRoundTrip` は #1101 以来 AST の構造比較まで行っており、パラメータを持つ fixture を 1 つ通せば初回で落ちていた。それが 3 世代（#1568 / #1583 / #1995）気づかれなかったのは、**パラメータを持つ fixture が 1 つも無かった**からである。「アノテーションを formatter がテストしている」が「パラメータもテストされている」と読み違えられ続けた。ヘルパの存在は網羅の証拠にならない。

## 決定

### 1. emit を `renderAnnotations` 1 箇所に畳む

`renderNode` の裸ループを置き換え、`renderTeam` からも同じ関数を呼ぶ。1 つの AST プロパティを複数の renderer が別々に描く形が、**片方だけ直すともう片方が残る**構造そのものだった。

### 2. パラメータ表の読み手を `annotationParamKind()` 1 つにする

`ANNOTATION_PARAM_KEYS` をキーごとの値種（`"string"` / `"ref"`）付きに変え、export する。parser は「このキーは効果を持つか」を、formatter は「この値をどう引用符で囲むか」を、同じ 1 つの関数に尋ねる。表を export する理由が「手写しはドリフトする」（TPL-1720、同ファイルの `DEPLOY_KEYWORDS` と同じ）なのに、参照ルール自体を 2 箇所に置けば意味がない。

`Object.hasOwn` でガードするので、`__proto__` のような prototype 由来の名前が `Object.prototype` 経由で解決され、継承メンバを「認識されたキー」と報告することもない。

### 3. 値の種類ごとに正準形を 1 つ決める

引用符の有無は AST に残らない（parser は StringLiteral も Identifier も同じ裸の文字列にする）ため、復元は不可能であり、正準形を 1 つ選ぶしかない。

| キー | 値種 | 出力 |
| --- | --- | --- |
| `until` / `confidence` | 表示専用の opaque な文字列 | `quoteString`（常に引用符つき） |
| `from` | ノード参照 | `quoteId`（id が許すかぎり裸） |

`until` / `confidence` は ADR-1568 / ADR-1995 が「認識外の文字列も verbatim に保つ表示専用値」と定めたものなので、`label` と同じ扱いにする。`from` はノード参照なので、`owns` やエッジ端点など他のすべての参照と同じ規則に揃える。

規定を `docs/spec/tags-annotations.md`（en/ja）に明記し、TPL-1101 と相互リンクした。同時に spec の `team` 例を `from: "legacy"` から `from: legacy` に更新した。**この 1 例だけは表記が変わる**が、これは formatter が既に `service "A"` → `service A` に行っている正規化と同じである。

### 4. 読めなかった値は記録せず、消費する

parser は値トークンが StringLiteral / Identifier でないとき `""` を記録していた。formatter が AST の中身を出力するようになると、`@deprecated(until: 2026)`（診断ゼロで通る）が `fmt --write` で `until: ""` としてユーザーのファイルに焼き込まれる。**パラメータを落とすのがバグなら、でっち上げるのはより悪い。**

記録しないことで、以前と同じ裸の `@deprecated` に戻る。あわせて、malformed な値を次のペア（comma / `)` / EOF）まで**消費する**。カーソルに残していたため、そのトークンが次のキーとして読まれ、`@migration_target(from: system)` が `system` を「未対応のキー」として報告していた。著者がキーとして書いていないものを名指しする診断は、間違った行に誘導する。

### 5. 網羅性は 3 方向から導出する

ADR-2076 の「列挙せず導出する」を、この構文の形に合わせて 3 つに広げた。

1. `ANNOTATION_PARAM_KEYS` から導いた `annotation.key` ペア集合（`satisfies` + 実行時アサーション）
2. `types/` 配下の全モジュールを走査して得た「`annotationParams` を宣言する型」集合（`interface` と `type` の両方、宣言は自身の `}` で閉じる）
3. formatter のソース上で、アノテーションの emit が `renderAnnotations` の外に 1 件も無いこと

(2) は**型が増えたとき**に落ち、(3) は**型が同じまま renderer が増えたとき**に落ちる。#2571 は後者だったので、型側の導出だけでは同じ回帰をもう一度通してしまう。(3) は ADR-2087 の「生補間が 0 件」と同じソースレベルの不変条件である。

4 つのガードすべてを部分 revert で発火確認済み（パラメータ emit を外す / `renderTeam` の呼び出しを外す / パラメータキーを 1 つ足す / 3 つ目の renderer を足す）。

### 6. 同名アノテーションが繰り返されたら、各 occurrence に同じパラメータを出力する

`annotationParams` は名前ごとに 1 スロットなので、AST はどの occurrence が持っていたかを言えない。両方に出力すると `@deprecated @deprecated(until: "x")` が 2 つのパラメータ付きに広がるが、**それが AST を保つ唯一の読み方**である。片方を裸で出せばパラメータが消え、それは本 ADR が直しているバグそのものになる。

## 却下した案

### すべての値を `quoteString` で出力する

規則が 1 つで済み、値種の表も要らない。却下。`from: LegacyMonolith`（spec が示す裸の形）が `from: "LegacyMonolith"` に変わる。ノード参照を引用符で囲むのは、`owns` やエッジ端点を含む他のすべての参照の出力規則と食い違う。

### すべての値を `quoteId` で出力する

lexer 仕様との一致は `quoteId` が既に持っているので、これも規則 1 つで済む。却下。`confidence: "low"` が `confidence: low` になる。ADR-1995 は `confidence` を「認識外の文字列も verbatim に保つ表示専用値」と定めており、`low` は裸、`"we argued about this one"` は引用符つきという不統一な出力になる。

> どちらの案でも spec の例が 1 つ書き換わる（片方は 177 行目の裸、もう片方は 390 行目の引用符つき）。「例が変わらない案」は存在しないので、選択は「どちらの表記が語彙の性質に合うか」で決めた。

### 繰り返されたアノテーションのパラメータを 1 度だけ出力する

`fmt` が著者の書いていない occurrence にパラメータを付ける挙動を避けられる。**実装して取り下げた**。round-trip テストが落ちる。名前ごとに 1 スロットしかない以上、1 度だけ出力するとパラメータが削除され、本 ADR が直しているバグに戻る。

### AST を per-occurrence 表現に変える

上書き自体を根本から直せる。却下（本 ADR の範囲外）。`annotationParams` を名前でキーする形は `annotations/draft-confidence.ts` / `annotations/migration-intent.ts` / `compile/compile.ts` が読み、`annotations: string[]` は style セレクタ・継承・バッジが消費する。スキーマ移行であり、それ自体が ADR を要する。#2707 で、より安い `duplicate-annotation` 診断案と並べて追跡する。

### 読めない値に専用の診断を出す

TPL-1503（受理する語彙は効果を持つか警告される）に照らせば、読めない値は現状どちらも満たしていない。却下（見送り）。新しい診断コードは i18n カタログ・`docs/spec/diagnostics.md` の行・register の選択を伴う。#2707 に分離した。**結果として、読めない値は現在いっさい診断を出さない**（従来は間違ったものを出していた）。これは正直な状態だが、まだ正しい状態ではない。

### `2026-12-31`（引用符なし）も直す

Issue の再現手順に含まれる形なので、一緒に直したくなる。却下（範囲外）。lexer が `2026-12-31` を値 `-` の Identifier 2 つに潰し、数字を捨てている。parser には拒否する手がかりがなく、修正は lexer 側になる。この破壊は本 PR 以前から存在し（以前は `fmt` がパラメータごと削除していた）、#2707 に分離した。

## 影響

- `karasu fmt` の出力が変わるのは、パラメータを持つアノテーションを含む場合と、`team` にアノテーションがある場合のみ。既存テスト（core 4130 / cli 352）は無改変で通る
- `from: "legacy"` は `from: legacy` に正規化される。spec の該当例も同 PR で更新した
- 読めない値（`until: 2026` / `from: system`）は、従来の `annotation-param-unsupported`（誤ったキー名を名指し）を出さなくなる
- `.changeset` は `@karasu-tools/core` / `karasu` の patch（利用者に影響するバグ修正）
