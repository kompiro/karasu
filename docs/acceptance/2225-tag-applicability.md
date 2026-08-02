# AT: builtin タグの適用範囲（`appliesTo`）を診断で強制する

- **日付**: 2026-08-02
- **関連 Issue**: [#2225](https://github.com/kompiro/karasu/issues/2225)（親 [#2065](https://github.com/kompiro/karasu/issues/2065)、前提 [#2159](https://github.com/kompiro/karasu/issues/2159)）
- **関連 spec**: [`docs/spec/diagnostics.md`](../spec/diagnostics.md)（+ja、`tag-not-applicable`）/ [`docs/spec/tags-annotations.md`](../spec/tags-annotations.md)（適用範囲の表）
- **関連 TPL**: [TPL-1503](../test-perspectives/TPL-1503-accepted-vocabulary-must-have-effect.md)（受理・無効果の第 4 状態）/ [TPL-2172](../test-perspectives/TPL-2172-builtin-vocabulary-addition-gate.md)（`appliesTo` の部分的な inert）
- **対象ファイル**:
  - `packages/core/src/types/warnings.ts`（`tag-not-applicable` の kind と params）
  - `packages/core/src/resolver/warnings.ts`（`detectTagsNotApplicable`）
  - `packages/i18n/src/{types,en,ja,render-warning}.ts`

> スコープは **builtin タグの kind 次元の強制**のみ。`appliesTo` の内容そのもの（どの
> タグがどの kind に適用されるか）は変更しない。builtin 語彙の追加（[#2172](https://github.com/kompiro/karasu/issues/2172)）は別 Issue。

## 背景

`appliesTo` は全 builtin タグに宣言され、`reference.ts` の公開 API に出て、生成される
spec 表にも印字されているが、**どの consumer も検証していなかった**。`service Api [index]`
は exit 0・警告ゼロ・バッジゼロで通る — TPL-1503 が禁じる「受理・無効果・未文書化」の
第 4 状態が、#2159 が**名前**の次元で解消した後も **kind** の次元に残っていた。
著者から見ると「タグを書いたのに何も起きない」はタイポと区別がつかない。

## 受け入れ条件

- [x] AT-A: builtin タグを `appliesTo` 外の kind に書くと `tag-not-applicable`（warning）が出る — Issue が CLI で実測した 3 例（`service Api [index]` / `user U [table]` / `database DB [mobile]`）すべて

  > ✅ Automated — `packages/core/src/resolver/warnings.test.ts` › `tag-not-applicable — builtin tag on a kind outside appliesTo (#2225)` › `warns on each of the issue's verified cases and stays silent on the control`

- [x] AT-B: 対照例 `database Ok [index]` は警告されない

  > ✅ Automated — 同上（同じテストが対照例を含む）

- [x] AT-C: 診断は「書かれた kind」と「適用先の kind 一覧」を報告する

  > ✅ Automated — 同 describe › `reports the kind written and the kinds the tag applies to`

- [x] AT-D: edge タグは literal kind `edge` で判定される — `[sync]` / `[async]` は通り、`[mobile]` を edge に書くと警告

  > ✅ Automated — 同 describe › `checks edge tags against the literal kind \`edge\``

- [x] AT-E: system-assigned タグ（`[inferred]` 等）は警告されない

  > ✅ Automated — 同 describe › `stays silent for system-assigned tags — they carry no appliesTo to violate`

- [x] AT-F: `tag-not-builtin` と同時発火しない（1 つのタグに 1 つの register）

  > ✅ Automated — 同 describe › `never fires together with tag-not-builtin — one tag, one register`

- [x] AT-G: infra sub-resource（`table` / `queue-item` / `bucket`）は警告されない — shape タグは style-resolver が dot-notation id に対して推論するもので `node.tags` に入らない

  > ✅ Automated — 同 describe › `does not fire on infra sub-resources — their shape tags are inferred, never in node.tags`

- [x] AT-H: register は warning（info ではない）

  > ✅ Automated — `warningSeverity — exhaustive register map` › `tag-not-applicable → warning`

- [x] AT-I: en / ja のメッセージが「効果が無い」ことと適用先を伝える

  > ✅ Automated — `packages/i18n/src/render-warning.test.ts`（`tag-not-applicable` の en/ja レンダリングとプレースホルダ解決）

- [x] AT-J: 既存の `examples/` が新たに警告を出さない（`appliesTo` を将来狭めたときの退行フェンスにもなる）

  > ✅ Automated — `packages/core/src/examples.test.ts` › `examples: every shipped .krs is free of node-not-in-context warnings` › `%s puts every builtin tag on an applicable kind`（#2165 / #2184 と同じ per-diagnostic フェンスの形）

- [x] AT-K: 全 builtin タグの `appliesTo` が空でなく、実在する kind のみを指す

  > ✅ Automated — 同 describe › `covers every builtin tag: each applies cleanly to at least one declared kind (TPL-2172)`

- [ ] AT-L: 🧑 Manual — app のプレビューで `service Api [index]` を書き、警告パネルに `tag-not-applicable` が warning アイコンで出て、メッセージが適用先（`database`）を示すこと

  > `pnpm --filter @karasu-tools/app dev` → `index.krs` に `system S { service Api [index] {} }` を入力

- [ ] AT-M: 🧑 Manual — VS Code 拡張で同じ `.krs` を開き、LSP 経由で該当行に warning の波線が出ること

## 補足 — 挙動が変わる既存記述

`storage Bucket [storage]` は**新たに警告される**。`[storage]` は resource の shape タグ
（`appliesTo: ["resource"]`）なので、`storage` ノードに書くのは冗長である。Issue #2225 が
「warning が正しい結果」と判断し、changeset で明示することを求めている。同型のケースとして
`queue Q [queue]` も警告される。
