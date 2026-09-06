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
  - ADR-2596
scope:
  packages: [core]
assumptions:
  - "symbol: packages/core/src/parser/reference-validation.ts :: buildNodePathIndex"
  - "grep: packages/core/src/parser/reference-validation.ts :: PathCandidate"
  - "file: packages/core/src/parser/node-path-index.test.ts"
  - "file: docs/test-perspectives/TPL-1583-migration-priority-index-winner.md"
---

# ADR-2550: nodePathIndex の多重判定を collect-then-decide にして宣言順非依存にする

- **日付**: 2026-08-19（2026-08-22 改訂: PR #2570 のレビューで判定を論理層に限定）
- **ステータス**: 決定済み・実装完了
- **関連**:
  - Issue: [#2550](https://github.com/kompiro/karasu/issues/2550)（[#2088](https://github.com/kompiro/karasu/issues/2088) の計測中に発見。プログラム自体とは独立）、[#2596](https://github.com/kompiro/karasu/issues/2596)（cross-file の再構築 follow-up）
  - 関連 ADR: [ADR-477](477-deprecated-domain-migration-coexistence.md)（migration 共存の priority 規則）, [ADR-1386](1386-style-prescription-stance.md)（domain-dispersal の info register）, [ADR-1566](1566-ownership-during-migration.md)（ownerIndex 側の同型規則）, [ADR-2547](2547-shared-node-path-machinery.md)（path 記法。permalink が nodePathIndex を引く文脈）
  - 関連 TPL: [TPL-1583](../test-perspectives/TPL-1583-migration-priority-index-winner.md)（1:1 index の勝者規則は index 間で一貫させる。本 Issue はこの観点の名指しの failure mode）, [TPL-1352](../test-perspectives/TPL-1352-composite-key-must-cover-all-distinguishing-dimensions.md), [TPL-2221](../test-perspectives/TPL-2221-merge-only-facts-decided-on-merged-model.md)（完全なデータセットで判定する）

## 背景

`node-id-multiple-locations` は**宣言順**で発火が変わっていた。`buildNodePathIndex`
の walk は非 domain 分岐だけが `index.has` を見て報告し、domain 分岐（per-system の
`seenDomainIds`）と top-level infra ループは無条件に `index.set` していたため、後から
walk された側が黙って勝つ。`service Payment` → ネスト `domain Payment` の順は沈黙
（かつ service の entry を上書き）、逆順は警告。`nodePathIndex` は `viewPath` と
deep permalink の解決元なので、silent overwrite は「service の permalink が別階層の
domain を指す」形で表面化しうる。

初版の実装レビュー（PR #2570）で、警告の範囲が広すぎることが分かった。
候補全体を無差別に多重判定すると、複数の database が同名の table を持つ日常的な
物理レイアウト（dot 修飾参照 `resource OrderDB.users` はまさにこの形のためにある）や、
service とそれを支える同名 database の共存まで警告になる。レビューで
「型（層）が違えば同名は許容する」方針を確認し、判定を論理層に限定した。

## 決定

多重性の判定を walk 中から **walk 完了後**へ移し（collect-then-decide）、警告は
**論理層の多重**に限定する:

1. 収集パスは候補（`{path, kind, loc, priority, layer}`）を traversal 順に
   **記録するだけ**にする。traversal 順は
   systems → top-level domains → top-level services / clients → top-level infra。
   system 外に置かれた（parked）service / client も候補として index に載せ、
   到達可能にする
2. priority は walk 中に計算する。annotations を持たない domain は親 service の
   annotations を継承し（rendering と同じ規則）、annotations を持たない infra の子
   （table 等）はブロックの annotations を継承する。この文脈は walk 後には復元できない
3. id ごとの勝者は **priority 最大、同点は traversal 順で最初**（`indexTeams` /
   `buildOwnerIndex` と同じ TPL-1583 の規則）。論理層のパスが物理層より先に記録される
   ため、無印同士の層またぎ同名は論理層ノードが entry を取る
4. 警告は**論理層（service / domain / client）の候補が 2 つ以上**あり、かつ
   **すべて domain ではない**ときだけ出す。負けた論理層候補ごとに、その loc で
   `node-id-multiple-locations` warning を 1 つ出す。論理層と物理層の間の同名、
   物理層内の同名は許容して沈黙する（物理参照は dot 修飾されるため bare id の
   多重に打つ手がない）
5. **完全に同じパス**の候補はネスト位置では最初の 1 つに畳む。同一親内の重複は
   `duplicate-node-id-parent`（error）の領分で、同じ宣言への二重報告になるだけ。
   top-level の同パス組（parked `service X` と `client X` 等）は親スコープの error が
   存在しないため畳まない
6. 候補が**すべて domain** の多重は沈黙のまま（`domain-dispersal` info の領分、
   ADR-1386）

## 理由

- 判定を完全な候補集合の上で行えば、順序依存は構造的に消える（TPL-2221 と同じ
  collect-then-decide の形）
- 勝者規則を priority → traversal-first に揃えるのは、`ownerIndex` が既に採る
  TPL-1583 の規則との一貫化。keep-deeper 案は却下した（深さの比較は
  service vs top-level infra で定義できず、codebase に前例も無い）
- 警告を論理層に限定するのは karasu の論理/物理分離（docs/concepts.md）の帰結:
  層が違えば語彙が違い、物理参照は dot 修飾が正準なので、bare id の多重は
  論理層の中でだけ航法上の問題になる
- 非勝者の loc で報告するのは、従来警告が出ていたケース（後から現れた重複）の
  位置をそのまま保ちつつ、新たに報告されるケースでも「どの宣言が index に
  乗らなかったか」を指すため
- 警告と `domain-dispersal` info は併存させる。answering が違う（警告 = bare id の
  航法がどこに解決されるか、info = domain がどう分散しているか）ため、
  mixed なケース（service X と複数の domain X）で両方出るのは冗長ではなく役割分担

## スコープ

この順序非依存は**単一ファイル内**の保証。ImportResolver は per-file の index を
first-file-wins で union しており、ファイルをまたぐ衝突は依然 silent に先勝ちする。
merged model 上での再構築（facetIndex / ownerIndex / boundaryMembership と同じ
パターン）は [#2596](https://github.com/kompiro/karasu/issues/2596) で追う。

## 意図的な差分

- cross-system の重複 domain の entry が accidental last-wins から
  priority-then-first に変わる（従来は per-system reset の副作用で後の system が勝っていた）。
  top-level の同名 domain 同士も同様に last-wins から first-wins に変わる（沈黙のまま）
- service / client も `@migration_target` を entry の勝者選定で尊重する
  （従来は first-wins 固定）
- warning の emit 位置が per-system の `duplicate-node-id-parent` エラー群の後に
  まとまる（CLI 出力の並びで観測可能）
- 論理層と物理層の間・物理層内の同名は**警告しない**（初版実装は警告していた。
  translate の DB scaffold の `database X` + 暫定 `domain X` もこれで沈黙に戻る）。
  layer 判定の導入で、`system Shop { service Payment }` と `database Payment {}` の
  共存も従来どおり沈黙のまま、entry だけが service 側に決定的に揃う
- parked（system 外）の service / client が index に載る。従来は不可視で、bare id の
  permalink が解決できなかった。walked ノードと同名の parked service は論理層の
  多重として警告される

## 却下した案

- **report + keep-deeper**: 深さで勝者を選ぶ規則は kind をまたぐと定義できず、
  既存 index に前例が無い。TPL-1583 の一貫性を破る
- **loc 順の tie-break**: ファイル内の記述位置で勝者が変わり、「infra ブロックを
  system の上に書いたら permalink の解決先が変わる」を再導入する
- **候補全体での多重警告（初版）**: 物理層の日常的な同名（複数 DB の同名 table、
  service と同名の database）に毎 parse 警告が出て、reverse 生成モデルでは
  警告が積み上がる。層をまたぐ許容は PR #2570 のレビューで決定
