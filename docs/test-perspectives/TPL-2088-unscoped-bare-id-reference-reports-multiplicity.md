---
id: TPL-2088
title: "スコープを持たない bare-id 参照は多重解決を宣言順に依らず報告する"
status: active
date: 2026-08-17
applicable_to:
  - "bare id でノードを指す参照サイトを新設・変更するとき（宣言スコープを持たないもの）"
  - "id をキーにした Map に参照の解決結果を格納するとき（`ownerIndex` / `boundaryMembership` 型）"
  - "同名 id の重複を検出する診断を追加・変更するとき"
known_consumers:
  - owns
  - top-level-boundary
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
  - root_cause_adr: "ADR-927"
related_to:
  - TPL-1352
  - TPL-1583
  - TPL-1936
  - TPL-1386
  - TPL-2161
  - TPL-2221
topic: parser
scope:
  packages:
    - core
---

# TPL-2088: スコープを持たない bare-id 参照は多重解決を宣言順に依らず報告する

## 観点

karasu のノード id は **兄弟の中でだけ error 級に一意**で、層や system をまたいだ同名 id の
共存は正当である（[ADR-927](../adr/927-import-system-nested.md)）。したがって bare id で
ノードを指す参照は、**宣言スコープを持つかどうかで性質が変わる**。

- **スコープを持つ参照** — スコープ内 `boundary … contains`（直下の子）、edge endpoint
  （宣言スコープの peer）、entity 関連（domain 内）。候補が兄弟に絞られ error 一意なので
  曖昧性が構造的に生じない。参照がスコープ外を指したときに報告する
  （`contains-target-not-found` / `edge-endpoint-not-at-scope`）
- **スコープを持たない参照** — `team … owns`、top-level `boundary … contains`。
  organization も top-level boundary もシステム木の外側にある overlay なので、
  照合先を絞る囲いがない。**1 つの id が複数ノードに解決しうる**

スコープを持たない参照サイトを作る／変更するときは、次の 2 点を満たす。

1. **多重解決が観測できること。** 解決に使う索引を `Set<id>` や `Map<id, 単一値>` に
   したままだと、多重度が構造的に見えなくなる。判定に要る次元を持った
   multimap（`Map<id, Array<{ kind, path }>>`）から導く
2. **判定が宣言順に依らないこと。** 「歩いている途中で既に居たら報告する」形の検出は、
   分岐ごとに条件が違うと**同じモデルでも書く順で発火が入れ替わる**。集合を作り終えてから
   判定する

多重解決のすべてが誤りではない点に注意する。**(kind, 深さ) が揃った衝突**は移行共存・
マルチテナント・複数 system の一般名 domain という正当な並行モデリングで
（[ADR-927](../adr/927-import-system-nested.md) /
[ADR-1566](../adr/1566-ownership-during-migration.md)）、報告してはならない。
報告するのは **(kind, 深さ) が揃わない**衝突 — 層をまたいだ事故的な over-claim である。

[[TPL-2161]] とは向きが逆である点に注意する。あちらは **1 ノードが複数グループに属する**
多重度を派生 index が捨てる話で、本観点は **1 参照が複数ノードに解決する**多重度が
そもそも観測できない話である。同じ `ownerIndex` / `boundaryMembership` が両方の
consumer になる。マージ後にしか多重度が確定しない点は [[TPL-2221]] と同じ。

## 想定される失敗モード

- **黙った over-claim** — `owns Payment` が top-level `service Payment` と別 service 配下の
  `domain Payment` の両方にチームチップを付ける。org 図は正しく見えるのに system 図が
  意図しない所有を描く。参照側が `index.get(node.id)` で id だけを引いていると必ずこうなる
  （[[TPL-1352]] の合成キー不足と同型）
- **宣言順で発火が変わる診断** — `buildNodePathIndex` の `node-id-multiple-locations` は
  非 domain 分岐でしか報告しないため、`service X` → ネスト `domain X` の順では黙り、
  逆順では警告する。同じモデルの書き順を変えただけで診断が入れ替わる
- **1:1 索引の黙った上書き** — 多重解決を検出しないまま `index.set` を続けると、後勝ちで
  entry が壊れる。`nodePathIndex` は `viewPath` / permalink の解決元なので、
  「service の permalink が別階層の domain を指す」形で表面化する
- **正当パターンへの誤警告** — 多重解決を一律に報告すると、マルチテナントの
  `owns Billing` のように **broadcast が意図そのもの**のケースで鳴る。rename という
  手当ても取れないため「無視するのが正しい警告」になり、診断全体の信頼を削る
  （[[TPL-1386]] の register 判断を誤った形）

## チェックリスト

bare id の参照サイトを新設・変更する、または id キーの解決索引を足すとき:

- [ ] その参照サイトは宣言スコープを持つか。持たないなら多重解決が起こりうると認める
- [ ] 解決索引は多重度を表現できるか（`Set` / 1:1 `Map` になっていないか）。1:1 にするなら
      勝者選択規則を [[TPL-1583]] に揃え、負けた側を報告する
- [ ] 判定は集合を作り終えてから行っているか（walk 途中の「既に居たら」ではないか）。
      宣言順を入れ替えたテストを 1 件置く
- [ ] 報告する／しないの境界は (kind, 深さ) で説明できるか。同 kind・同深さの衝突
      （移行共存・マルチテナント）で沈黙することをテストで固定する
- [ ] 同じ形状の参照サイトが他にもないか grep する（`owns` と top-level `contains` は
      同型だった）。述語は 1 つの関数に畳み、各サイトはそれを引く（[[TPL-1720]]）

## 既知の対処パターン

`collectDeclaredIds`（`packages/core/src/parser/reference-validation.ts`）と同じ walk から
`Map<id, Array<{ kind, path }>>` を派生させ、`Set` 版はその keys とする。walk を 2 本に
分けない — [ADR-2442](../adr/2442-owns-existence-any-declared-node.md) が存在検査と
`contains` の walk を 1 本に畳んだのと同じ理由で、2 本あると片方だけが更新されて drift する。

判定は合成キー `${kind}:${path.length}` の集合サイズが 1 を超えるかで行い、ヘルパーを
1 つに置いて `owns` / top-level `contains` の両サイトが同じ関数を引く。

## 派生元 spec

- `docs/concepts.ja.md` / `docs/concepts.md` — 「`owns` による組織と論理/物理の対応付け」節
  （`owns` が組織とノードを結ぶという原則。id 一意性の粒度はこの原則の前提になっている）
- `docs/spec/syntax.md` / `.ja.md` — §team node（`owns`）、§Grouping the system view（`boundary`）
- `docs/spec/diagnostics.md` / `.ja.md` — `owns-target-not-found` / `invalid-owns` /
  `node-id-multiple-locations`

## 関連テスト

（未確立 — 本 TPL は proactive として起票した。Issue
[#2088](https://github.com/kompiro/karasu/issues/2088) の実装 PR で
`packages/core/src/parser/reference-validation.test.ts` に順序独立・(kind, 深さ) 境界の
テストを置く）
