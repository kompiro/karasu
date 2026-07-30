---
id: TPL-20260730-03
title: "同じモデリング状態を表す複数の配置は、綴りが違っても同じ診断を出す"
status: active
date: 2026-07-30
applicable_to:
  - "ある kind に 2 つ以上の配置（親）を認めるとき"
  - "`canContain` に配置を追加するとき（その kind を対象にする既存の診断が追従するか確認するため）"
  - "`unassigned-*` のような「あるべき親の下にいない」ことを報告する検出器を追加・変更するとき"
  - "検出器が `file.<kind>s` など特定の格納先だけを走査しているとき"
known_consumers:
  - resolver
  - lsp
  - app
discovered_from:
  - issue: "#2184"
  - root_cause_file: "packages/core/src/resolver/warnings.ts"
  - root_cause_adr: "ADR-2165"
related_to:
  - TPL-20260730-02
  - TPL-20260623-02
  - TPL-20260510-01
  - TPL-20260610-01
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260730-03: 同じモデリング状態を表す配置は同じ診断を出す

## 観点

karasu は 1 つのモデリング状態に複数の書き方（配置）を認めることがある。
`domain` は「まだ service に割り当てられていない」ことを、ファイル直下でも
`system` 直下でも表せる（ADR-2165）。このとき **著者が選んでいるのは綴りであって
意味ではない**。診断が片方の綴りにしか出ないと、意味を変えずに診断だけ消せて
しまい、診断が設計上の指摘として機能しなくなる。

到達状態: 「あるべき親の下にいない」ことを報告する検出器は、**その kind が
`canContain` 上で取りうる親をすべて**走査する。走査範囲を `file.<kind>s` のような
1 つの格納先に限定するのは、他の配置がその状態を表さない場合に限り、その理由を
コメントか spec に書く。

#2184 の実例: `detectUnassignedDomains` は `file.domains` だけを走査していたので、
`system { domain D {} }` は無言だった。一方 warning 文言は
`Domain "D" is not assigned to any service` と言っており、実装・文言・spec の 3 つが
別々のことを主張する状態になっていた。

検証:

```
pnpm --filter @karasu-tools/core test -- warnings
```

## 想定される失敗モード

- **診断を「意味を変えずに」回避できる** — ユーザーが warning を消すために
  ノードを別の配置へ移し、モデルの意味は変わらないまま診断だけ消える。
  診断が設計上の指摘ではなく「書き方の癖への注意」に成り下がる。
- **`canContain` に配置を足したときに検出器が置き去りになる** — 配置規則の正典は
  `canContain`（[TPL-20260730-02](TPL-20260730-02-containment-rule-has-single-definition.md)）だが、
  診断側の走査範囲はそこから導出されていない。親を 1 つ足しても parser は追従するが
  検出器は追従せず、新しい配置だけ無言になる。
- **文言と走査範囲がズレる** — 文言が親 kind の話（`not assigned to any service`）を
  しているのに走査範囲が格納先の話（top-level のみ）になっており、どちらが規則なのか
  読み手に判別できない。[TPL-20260610-01](TPL-20260610-01-accepted-vocabulary-must-have-effect.md)
  （受理された語彙は効果を持つ）の変種で、こちらは「効果の範囲が語彙より狭い」ケース。
- **逆方向の過剰報告** — 走査範囲を広げすぎて、`canContain` に無い入れ子
  （既に `node-not-in-context` が出ている）にも重ねて報告し、同じ 1 つの誤りに
  2 つの診断が付く。

## チェックリスト

「あるべき親の下にいない」系の検出器を追加・変更するとき、または `canContain` に
配置を追加するときに確認する:

- [ ] 対象 kind が `canContain` 上で取りうる**親をすべて**列挙したか。そのうち
      どれが「割り当て済み」でどれが「未割り当て」かを、走査範囲を書く前に決めたか。
- [ ] 検出器の走査範囲と warning 文言が同じことを言っているか。文言が親 kind の
      話をしているなら、走査範囲も親 kind で決まっているか（格納先ではなく）。
- [ ] `docs/spec/diagnostics.md` / `.ja.md` の「Fires when」列が、実装の走査範囲と
      一致しているか（en / ja 両方）。
- [ ] `canContain` に**無い**入れ子で二重報告していないか。`node-not-in-context` が
      既に出る配置には重ねない。
- [ ] テストに「同じ意味の全綴り」が入っているか。片方の配置だけの fixture では
      非対称に気付けない。
- [ ] 走査範囲を意図的に狭くする場合、その理由（他の配置ではその状態を表さない）を
      コメントか spec に書いたか。

## 既知の対処パターン

- **親 kind で規則を書く**: 「`file.<kind>s` にある」ではなく「親が `service` でない」を
  条件にする。格納先は AST の都合、親 kind は意味である。
- **綴りごとのテストを 1 つの describe にまとめる**: 同じ意味の全配置を並べた
  テーブル駆動テストにすると、配置が増えたときに行を足す圧力がかかる
  （`packages/core/src/resolver/warnings.test.ts` の `unassigned-domain warning`）。
- **診断と描画を分けて考える**: 「同じ診断を出す」ことと「同じ見た目にする」ことは
  別の関心事。`(Unassigned)` 擬似 system（[ADR-681](../adr/681-top-level-service-rendering.md)）は
  描画先の無い node に container を与える機構であって、未割り当ての標識ではない。
  片方だけ揃えるのが正しい場合があり、そのときは理由を spec に書く。

## 派生元 spec

- `docs/spec/syntax.md` / `syntax.ja.md` §「Nesting placement」/「入れ子の配置」
  （`domain` の 3 配置と、そのうち 2 つが同じモデリング状態を表すという規定）

チェックリストが同期を要求するもう一方の面は `docs/spec/diagnostics.md` / `.ja.md`
§「Assignment & cohesion」の「Fires when」列（派生元ではなく、ズレの検出対象）。
