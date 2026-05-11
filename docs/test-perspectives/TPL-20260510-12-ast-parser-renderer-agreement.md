---
id: TPL-20260510-12
title: "ノード共通フィールドの追加には AST 型 / parser keyword / renderer fallback の三点同意が必要"
status: active
date: 2026-05-10
applicable_to:
  - "全 node kind が共通で持つはずの field（label, tags, annotations など）を追加・変更する変更"
  - "新しい node kind を追加するとき、既存 kind と共通の振る舞いをどう継承させるかを決める変更"
known_consumers:
  - ast
  - parser
  - deploy-layout
  - svg-builder
related_to:
  - TPL-20260510-03
  - TPL-20260510-11
discovered_from:
  - issue: "#74"
  - issue: "#1233"
  - issue: "#1234"
  - root_cause_file: "packages/core/src/types/ast.ts:41"
  - root_cause_file: "packages/core/src/parser/parser.ts"
  - root_cause_file: "packages/core/src/renderer/deploy-layout.ts"
topic: parser
scope:
  packages:
    - core
---

# TPL-20260510-12: ノード共通フィールドの追加には AST 型 / parser keyword / renderer fallback の三点同意が必要

## 観点

karasu の AST には `BaseNodeFields`（`packages/core/src/types/ast.ts:41`）という共通インターフェースがあり、`label`, `tags`, `annotations` など全ノード共通のはずの field はここに定義される。**ある field を「全 kind が持つべき」と決めたら、3 点で同意を取る必要がある:**

1. **AST 型** — その node 型が `BaseNodeFields` を `extends` しているか
2. **parser** — その keyword が当該 node の `*_PROPERTY_KEYWORDS` に含まれ、`parseXxxNode` が AST に書き込んでいるか
3. **renderer** — 表示時に `node.label ?? node.id` のような fallback で正しく扱っているか

#74 の deploy node では、`DeployNode` が `BaseNodeFields` を extends していない（`label?: string` を持たない）ため、（a）AST 型に label が無い、（b）`DEPLOY_PROPERTY_KEYWORDS` に `label` が無い、（c）`deploy-layout.ts` が `unit.id` を直接表示する、の **3 つすべてが連動して欠落** していた。`reference.ts` の `sampleKrs` は既に `label "本番環境"` 構文を使っているのに、parser がそれを受理しない、という不整合まで発生していた。

これは「**ある層では追加されているが他層が追従していない**」という形で観測される。schema-level の一貫性を保つ仕掛け（共通基底 + 利用側でも default fallback）が無いと、追加忘れが silent な形で残る。

## 想定される失敗モード

- ある field を node に書いても **silently に無視される**（parse error にもならない）
- spec / examples / sample fixture では使えるが、実装が追いついていない（→ ドキュメントだけ進んで実装が遅れる）
- ある kind では `label` が効くのに、別の kind では効かない、という **kind 依存の挙動差**
- renderer が `id` を直接表示しているため、ユーザーは「label が反映されない」が「id 表示は出ている」状態を見る

## チェックリスト

ノードの共通 field を追加・変更するとき、以下を確認する:

- [ ] その field を持つべき全 node kind が `BaseNodeFields` のような **共通基底を extends している** か（していないなら、まず継承構造の修正から）
- [ ] parser 側の `*_PROPERTY_KEYWORDS` セット（system / deploy / org など各 kind 群）すべてに新 field の keyword が含まれているか
- [ ] 各 `parseXxxNode` が field を AST に書き込むコードを持っているか（keyword だけ追加して書き込みを忘れていないか）
- [ ] renderer / layout で `node.<field> ?? fallback` のような **defensive な default** が使われているか。`node.id` を直接表示している箇所が無いか
- [ ] `sampleKrs` / `examples/` / `docs/spec/syntax.md` の記述と実装が一致しているか（spec が先行している場合、実装の遅れに気づける）

## 既知の対処パターン

- 全 node kind を 1 つの **共通基底（`BaseNodeFields`）** に集約し、新 field の追加はそこに 1 行加えるだけで全 kind に伝播させる。kind ごとに独自フィールドを持つ場合のみ、個別 interface で extend
- parser 側は `PROPERTY_KEYWORDS` を **kind 群ごとの単一 set** にしておき、parseXxx が共通の keyword 処理関数を呼ぶ。各 kind に分散させると追加漏れを誘発する
- renderer は `node.label ?? node.id` のような fallback を **共通ヘルパ関数** に集約し、各レイアウトで再実装しない
- 「spec / sample で使えるが parser が受理しない」状態を CI で検出するため、`sampleKrs` および `examples/**.krs` を全件 parse してエラーが無いことを smoke test する

## 関連テスト

- `packages/core/src/parser/parser.test.ts`
- `packages/core/src/parser/base-node-fields-coverage.test.ts` — `BaseNodeFields` のユーザー入力フィールド × 全 kind の coverage meta-test。`BaseNodeFields` に新 field を追加すると compile-time の `Equal<keyof BaseNodeFields, ExpectedKeys>` 契約で fail し、新 kind を追加すると `Equal<_Covered, KrsNode["kind"]>` で fail する（gap G12-1 / #1233）
- `packages/core/src/renderer/deploy-layout.test.ts`
- `packages/core/src/builtins/reference.test.ts` — sample との整合
- `packages/core/src/examples.test.ts` — `examples/**/*.krs` 全件 smoke parse
- `packages/core/src/spec-syntax.test.ts` — `docs/spec/syntax.md` / `docs/spec/style.md` の \`\`\`krs / \`\`\`krs.style fence 全件 smoke parse。snippet が top-level fragment（service / edge のみなど）の場合は `system __SpecSmoke { ... }` に wrap してリトライする（gap G12-2 / #1234）
