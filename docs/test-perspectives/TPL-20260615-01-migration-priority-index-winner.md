---
id: TPL-20260615-01
title: "1:1 index は migration 共存の重複から @migration_target を勝者に選ぶ — 全 index で一貫させる"
status: active
date: 2026-06-15
applicable_to:
  - "同一 ID / 同一被所有ノードが複数経路から到達しうる 1:1 の index を新規に構築するとき（nodePathIndex / ownerIndex など）"
  - "migration 共存（@migration_target / @deprecated）の最中に「主」を 1 つ選ぶ必要があるロジックを追加・変更するとき"
discovered_from:
  - issue: "#1583"
  - root_cause_adr: "ADR-20260411-02"
related_to:
  - TPL-20260514-08
  - TPL-20260512-01
topic: core-concepts
scope:
  packages:
    - core
---

# TPL-20260615-01: 1:1 index は migration 共存の重複から @migration_target を勝者に選ぶ — 全 index で一貫させる

## 観点

karasu は逆コンウェイ戦略の過渡期（移行元 → 移行先の引き継ぎ中）に、同じものが
2 箇所に属する状態を **事実として描く**（[[TPL-20260514-08]]）。一方、内部の
索引は 1:1 のものが複数ある:

- `nodePathIndex`（`Map<nodeId, path[]>`）— 同名 domain がどの service に属するか
- `ownerIndex`（`Map<nodeId, teamId>`）— あるノードの主オーナー team

これらが migration 共存の重複に出会ったとき、**主**を 1 つ選ぶ規則は全 index で
同一でなければならない:

1. `@migration_target`（移行先）が勝つ（priority 2）
2. 無印が次（priority 1）
3. `@deprecated`（移行元）が負ける（priority 0）
4. 同 priority の tie は **first-wins**（最初の宣言を保持）

この規則は parser の `migrationPriority()` helper に集約し、各 index 構築箇所
（`buildNodePathIndex` / `indexTeams`）はこれを共有する。新しい 1:1 index を
足すときも同じ helper を使う。

## 想定される失敗モード

- **index ごとに規則がずれる**: ある index は first-wins、別の index は
  `@migration_target` 優先、という非対称が生まれる。ユーザーから見ると「カードの
  オーナーは移行先なのに、ナビゲーションは移行元に飛ぶ」のような一貫しない挙動になる。
- **priority のハードコード重複**: `migration_target ? 2 : deprecated ? 0 : 1` の
  三項を各所にコピペすると、新しい migration アノテーション（将来）を足したときに
  片方だけ更新され静かに drift する（[[TPL-20260519-02]] と同型の dual-representation drift）。
- **tie 規則の取りこぼし**: 同 priority のとき「後勝ち」にしてしまうと、宣言順を
  変えただけで主が入れ替わり、差分が不安定になる。
- **継承の混同**: domain は親 service のアノテーションを継承して priority を決めるが、
  team の owns は「宣言した team 自身」で決める（継承しない）。index ごとに継承の
  有無が異なる点を取り違えると誤った勝者を選ぶ。

## チェックリスト

新しい 1:1 index、または migration 共存の「主」選択ロジックを追加・変更する PR を出す前に:

- [ ] 勝者選択に `migrationPriority()`（または同等の単一 helper）を使っているか。
      三項のコピペになっていないか
- [ ] `@migration_target` が勝ち、`@deprecated` が負け、tie が first-wins になっているか
- [ ] 重複が起きても info 診断（`duplicate-owner-assignment` / `domain-dispersal`）は
      引き続き発火し、severity が error に戻っていないか（[[TPL-20260514-08]]）
- [ ] 継承の有無（domain=親 service を継承 / team=継承しない）を意識して priority の
      入力アノテーションを選んでいるか
- [ ] 宣言順を入れ替えても勝者が変わらないこと（`@migration_target` が後置でも前置でも勝つ）を
      テストしているか

## 既知の対処パターン

- priority は `packages/core/src/parser/parser.ts` の module-level `migrationPriority(annotations)`
  に集約する。新 index は import せず同関数を呼ぶ
- index 構築時に「現在の主の priority」を併走 `Map` で持ち、より高い priority が来たら
  差し替える（`indexTeams` / `buildNodePathIndex` のインライン swap パターン）
- info 診断の文言は「採用した主」を事実先行で述べる（swap 後の値を読む）

## 関連テスト

- `packages/core/src/parser/parser.test.ts` — 重複 owns で `@migration_target` team が
  主になる（宣言順 前後 両方）/ `@deprecated` が負ける / 無印 tie は first-wins /
  info が依然発火するケース。domain 側は同名 domain の `@migration_target` が
  nodePathIndex の勝者になるケース

## 派生元 spec

- `docs/spec/tags-annotations.md` §「Team contact convention」（team アノテーションと
  primary-owner 優先ルール）/ §「Migration annotations」（domain 側の共存ルール）
- ADR-20260411-02（deprecated-domain-migration-coexistence）、ADR-20260615-01
  （duplicate-owner-assignment を info に下げる）
