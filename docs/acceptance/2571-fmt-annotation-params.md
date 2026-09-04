---
type: product
---

# AT: `fmt` がアノテーションのパラメータを保つ（#2571）

- **日付**: 2026-09-04
- **関連 Issue**: [#2571](https://github.com/kompiro/karasu/issues/2571)
- **Related TPLs**: [TPL-1101](../test-perspectives/TPL-1101-round-trip-guarantee.md)（round-trip 保証。「AST 比較のヘルパがあっても fixture が通らない枝は守られない」節を本件で追加）
- **対象ファイル**:
  - `packages/core/src/formatter/formatter.ts`（`renderAnnotations` と 2 つの呼び出し元）
  - `packages/core/src/parser/parser.ts`（`ANNOTATION_PARAM_KEYS` を値種つきで export）

> `karasu fmt` の契約は「整形するが何も変えない」だが、アノテーションのパラメータを無言で捨てていた。`@draft(confidence: "low")` は `@draft` になり、組織軸ではアノテーションが丸ごと消えていた（`renderTeam` がアノテーションを 1 つも出力していなかった）。parser は受理し compiler は消費するのに formatter だけが読まない、ADR-2076 と同じ「parse できるのに `fmt` が黙って消す」クラス。

## 受け入れ条件

### AC-1: パラメータが round-trip する

- [x] AT-A: 認識されるパラメータキーすべてが、両方の emit 経路（`service` / `team` / ネストした `team`）で `fmt` を通しても残る

  > ✅ Automated — `packages/core/src/formatter/annotation-params-round-trip.test.ts` › `annotation parameters survive fmt (#2571)` › 各 `annotation.key` × 各 host（`deprecated.until` / `experimental.until` / `draft.confidence` / `migration_target.from` × node / team / nestedTeam の 12 通り）

- [x] AT-B: `fmt` が冪等で、`parse(format(x)) ≡ parse(x)` が成り立つ

  > ✅ Automated — 同上（各ケースが `expectRoundTrip` を通り、AST 構造比較と 2 回目の整形一致を確認）

- [x] AT-C: `--write` が実ファイルのパラメータを保つ

  > ✅ Automated — `packages/cli/src/fmt.test.ts` › `fmt() with explicit files` › `preserves annotation parameters when writing back (#2571)`

### AC-2: 値の意味が変わらない

- [x] AT-D: 既知の 3 水準の外にある `confidence` が verbatim で残る（`docs/spec/tags-annotations.md` の明示的な約束）

  > ✅ Automated — `annotation-params-round-trip.test.ts` › `annotation parameter values keep their meaning` › `keeps an unrecognized confidence verbatim`

- [x] AT-E: 裸で書けない参照値（空白入り・予約語・数字始まり）が引用符を保つ

  > ✅ Automated — 同上 › `keeps quotes on a reference that cannot be spelled bare`（`"my legacy"` / `"system"` / `"2legacy"`）

- [x] AT-F: `"` や `\` を含む文字列値が escape され、読み戻して同じ値になる

  > ✅ Automated — 同上 › `escapes a string value that contains a quote or a backslash`

- [x] AT-G: パラメータのないアノテーションが空の括弧を持たない

  > ✅ Automated — 同上 › `emits no empty parentheses for a bare annotation`

- [x] AT-H: 複数のアノテーション（パラメータ有無混在）とタグが書かれた順で残る

  > ✅ Automated — 同上 › `keeps several annotations, parameterized or not, in the order written`

### AC-3: 網羅性ガードが空振りしない

- [x] AT-I: 新しいパラメータキーを表に足すと、fixture が無いことで落ちる

  > ✅ Automated — `annotation-params-round-trip.test.ts` › `covers every recognized parameter key`。負のテスト実施済み（`draft` に `reviewer` を足して 1 件 fail、復帰を確認）

- [x] AT-J: `annotationParams` を宣言する AST 型が増えると、host が無いことで落ちる

  > ✅ Automated — 同上 › `covers every AST type that carries annotationParams`。負のテスト実施済み（`MemberNode` に付与して 1 件 fail、復帰を確認）

- [x] AT-K: 修正を部分 revert するとガードが落ちる

  > ✅ Automated — `packages/core/src/formatter/annotation-params-round-trip.test.ts` › `annotation parameters survive fmt (#2571)`。実装時に部分 revert して確認済み（パラメータ出力を外すと 17 件 fail、`renderTeam` の呼び出しを外すと 8 件 fail、どちらも復帰後は 20 件 pass）

## 手動確認

N/A — 自動テストですべて覆っている。
