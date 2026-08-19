---
id: ADR-2550
title: nodePathIndex の多重判定を collect-then-decide にして宣言順非依存にする
status: accepted
date: 2026-08-19
topic: parser
related_to:
  - ADR-477
  - ADR-1386
  - ADR-1566
  - ADR-2547
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/parser.ts :: buildNodePathIndex"
  - "grep: packages/core/src/parser/parser.ts :: PathCandidate"
  - "file: packages/core/src/parser/node-path-index.test.ts"
  - "file: docs/test-perspectives/TPL-1583-migration-priority-index-winner.md"
---

# ADR-2550: nodePathIndex の多重判定を collect-then-decide にして宣言順非依存にする

- **日付**: 2026-08-19
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2550](https://github.com/kompiro/karasu/issues/2550)（[#2088](https://github.com/kompiro/karasu/issues/2088) の計測中に発見。プログラム自体とは独立）
  - 関連 ADR: [ADR-477](477-deprecated-domain-migration-coexistence.md)（migration 共存の priority 規則）, [ADR-1386](1386-style-prescription-stance.md)（domain-dispersal の info register）, [ADR-1566](1566-ownership-during-migration.md)（ownerIndex 側の同型規則）, [ADR-2547](2547-shared-node-path-machinery.md)（path 記法。permalink が nodePathIndex を引く文脈）
  - 関連 TPL: [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者規則は index 間で一貫させる — 本 Issue はこの観点の名指しの failure mode）, [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md), [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)（完全なデータセットで判定する）

## 背景

`node-id-multiple-locations` は**宣言順**で発火が変わっていた。`buildNodePathIndex`
の walk は非 domain 分岐だけが `index.has` を見て報告し、domain 分岐（per-system の
`seenDomainIds`）と top-level infra ループは無条件に `index.set` していたため、後から
walk された側が黙って勝つ。`service Payment` → ネスト `domain Payment` の順は沈黙
（かつ service の entry を上書き）、逆順は警告。`nodePathIndex` は `viewPath` と
deep permalink の解決元なので、silent overwrite は「service の permalink が別階層の
domain を指す」形で表面化しうる。

## 決定

多重性の判定を walk 中から **walk 完了後**へ移す（collect-then-decide）:

1. walk は候補（`{path, kind, loc, priority}`）を traversal 順に**記録するだけ**にする。
   priority は walk 中に計算する — annotations を持たない domain は親 service の
   annotations を継承し（rendering と同じ規則）、この文脈は walk 後には復元できない
2. id ごとの勝者は **priority 最大、同点は traversal 順で最初**（`indexTeams` /
   `buildOwnerIndex` と同じ TPL-1583 の規則）。traversal 順は
   systems → top-level domains → top-level infra で固定し、infra ブロックの記述位置に
   判定が依存しないようにする
3. 候補が**すべて domain** の多重は沈黙のまま（`domain-dispersal` info の領分、
   ADR-1386）。それ以外の 2 件以上は、**非勝者ごとにその loc** で
   `node-id-multiple-locations` warning を 1 つ出す

## 理由

- 判定を完全な候補集合の上で行えば、順序依存は構造的に消える（TPL-2221 と同じ
  collect-then-decide の形）
- 勝者規則を priority → traversal-first に揃えるのは、`ownerIndex` が既に採る
  TPL-1583 の規則との一貫化。keep-deeper 案は却下した — 深さの比較は
  service vs top-level infra で定義できず、codebase に前例も無い
- 非勝者の loc で報告するのは、従来警告が出ていたケース（後から現れた重複）の
  位置をそのまま保ちつつ、新たに報告されるケースでも「どの宣言が index に
  乗らなかったか」を指すため

## 意図的な差分

- cross-system の重複 domain の entry が accidental last-wins から
  priority-then-first に変わる（従来は per-system reset の副作用で後の system が勝っていた）
- service / client も `@migration_target` を entry の勝者選定で尊重する
  （従来は first-wins 固定）
- warning の emit 位置が per-system の `duplicate-node-id-parent` エラー群の後に
  まとまる（CLI 出力の並びで観測可能）
- translate の DB scaffold（`database X` + 暫定 `domain X`）のような cross-kind
  同名は従来 silent overwrite だったが警告されるようになる。scaffold の TODO
  （暫定 domain の rename）を促す方向の差分として受容した

## 却下した案

- **report + keep-deeper**: 深さで勝者を選ぶ規則は kind をまたぐと定義できず、
  既存 index に前例が無い。TPL-1583 の一貫性を破る
- **loc 順の tie-break**: ファイル内の記述位置で勝者が変わり、「infra ブロックを
  system の上に書いたら permalink の解決先が変わる」を再導入する
