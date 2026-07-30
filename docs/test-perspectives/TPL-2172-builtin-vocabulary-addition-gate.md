---
id: TPL-2172
title: "builtin 語彙の追加は register 判定・既存表現の有無・停止規則の 3 問を通す"
status: active
date: 2026-07-30
applicable_to:
  - "`reference-data.ts` の `tags` / `annotations` に builtin エントリを追加するとき"
  - "「この名前を builtin にしてほしい」という要望（`tag-not-builtin` / `annotation-not-builtin` の移行先経路）を裁くとき"
  - "既存 builtin 語彙の `appliesTo` を変更するとき"
known_consumers:
  - reference-data
  - default-style
discovered_from:
  - issue: "#2172"
  - root_cause_file: "docs/spec/tags-annotations.md"
related_to:
  - TPL-1503
  - TPL-1625
  - TPL-1386
  - TPL-1296
topic: core-concepts
scope:
  packages:
    - core
---

# TPL-2172: builtin 語彙の追加は register 判定・既存表現の有無・停止規則の 3 問を通す

## 観点

[#2159](https://github.com/kompiro/karasu/issues/2159) 以降、非 builtin の tag / annotation はすべて警告対象になり、その移行先として spec は **builtin 追加要望**という経路を案内している。つまり **builtin 集合の大きさが、ユーザーが警告なしに書ける表現力の上限**を決める。追加要望は今後も繰り返し来るため、その場の妥当性で 1 件ずつ裁くと語彙は単調増加する。

追加を裁くときは 3 つの問いを順に通す。1 つでも落ちたら追加しない。

1. **register は合っているか** — tag = アーキタイプ（その要素が構造上**何であるか**）/ annotation = lifecycle（開発上の**状態**）/ boundary = view 内グルーピング / facet = 外在的な集合所属。technology の名前（`kv`・`redis`・`snowflake`）は tag ではない。membership（`pci`・`pii`・チーム名）は facet であって tag でも annotation でもない。
2. **既存の構文・物理層で既に言えていないか** — 言えているなら追加しない。構造で表現されている事実にタグを重ねると、2 つの表現が食い違ったときに正解が決まらなくなる。
3. **停止規則に反しないか** — 語彙は「同一 kind 内の役割差」など、**判定が一問に畳める軸**でのみ増やす。軸を持たない個別追加は、次の要望を裁く基準を残さない。

3 問を通ったものは [TPL-1503](TPL-1503-accepted-vocabulary-must-have-effect.md) により**同じ PR で既定描画の効果**（badge / shape）を持たせる。**却下したものも記録する** — 却下理由が残っていないと、同じ要望が来るたびに議論をやり直すことになる。

karasu での実例（[#2172](https://github.com/kompiro/karasu/issues/2172)）:

| 候補 | 落ちた問い | 結果 |
| --- | --- | --- |
| `[kv]` | 1（technology であって役割でない） | 却下 |
| `[bff]` | 2（`delivers <ClientId>` が構造として表現済み） | 却下 |
| `@canary` | 1（runtime のロールアウト状態で slowly-changing な lifecycle でない）+ `@experimental` と重複 | 却下 |
| `[replica]` / `[graph]` / `[timeseries]` | 3（技術差は物理層 `store { type }`、運用配置はモデル化しない） | 却下 |
| `[cache]` / `[analytics]` | 3 問通過（`[index]` と同じ「SoR ではない役割」軸で閉じる） | 採用 |

## 想定される失敗モード

- **register 混濁**: technology 名や membership が tag として builtin 入りし、「tag = アーキタイプ」という規約が形骸化する。facet を唯一のユーザー拡張点にした設計判断が無意味になる。
- **二重表現**: 構造（`delivers` / `realizes` / 物理層 `store`）で既に言えている事実にタグを足し、両者が食い違うモデルが書けてしまう。どちらが正しいかを decide する規則がどこにも無い。
- **語彙の単調増加**: 個別要望を個別の妥当性で通し続け、`[graph]` `[timeseries]` `[replica]` … と連鎖する。[ADR-1718](../adr/1718-vector-store-vs-database.md) が新 kind に対して警戒した境界クリープが、タグ側で再現する。
- **inert な追加**: 名前だけ builtin 集合に入れて既定描画の効果を付けず、[TPL-1503](TPL-1503-accepted-vocabulary-must-have-effect.md) の「受理・無効果」状態を作る。警告も効果も無いので、ユーザーは書いたことが効いているか判別できない。
- **却下の消失**: 却下理由が Issue のコメントにしか残らず、半年後に同じ候補が「新しい提案」として再登場する。
- **`appliesTo` の後付け縮小**: 最初に広く受理してから狭めようとする。拡大は後方互換だが**縮小は破壊的**で、v2.0 まで直せない。

## チェックリスト

builtin の tag / annotation を追加する PR で:

- [ ] 3 問（register / 既存表現 / 停止規則）それぞれの答えを PR description か ADR に書いている。
- [ ] 同じ PR で既定描画の効果（`default-style.ts` の badge / shape）が入っており、**light / dark 両シート**に入っている。
- [ ] `pnpm gen:reference` を実行し、spec 表と `reference-data.ts` が一致している（[TPL-1296](TPL-1296-spec-doc-reference-data-sync.md)）。
- [ ] `appliesTo` を必要最小の kind に絞っている（拡大は後で後方互換にできる）。
- [ ] 一緒に検討して**却下した候補とその理由**が ADR に列挙されている。
- [ ] その名前が今日 inert に受理されている（warning が出ていた）ことによる挙動変化を changeset に書いている。
- [ ] 却下した候補が引き続き `tag-not-builtin` / `annotation-not-builtin` の警告対象であることをテストしている（却下が挙動として現れていること）。

## 派生元 spec

- `docs/spec/tags-annotations.md` §*Non-builtin tag names are deprecated (v1.x)* / §*Non-builtin annotation names are deprecated (v1.x)* — builtin 追加要望という移行先経路を規定している節。本 TPL はその経路を裁く側の観点。
- [ADR-1718](../adr/1718-vector-store-vs-database.md) — 「役割は修飾で、技術は物理層で」という判断基準の出典。
