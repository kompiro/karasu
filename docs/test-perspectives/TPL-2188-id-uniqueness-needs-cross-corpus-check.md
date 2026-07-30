---
id: TPL-2188
title: "採番 id の一意性は corpus 横断の機械検証か大域 allocator で担保する"
status: active
date: 2026-07-30
applicable_to:
  - "ブランチ内の既存集合から次の番号を導出する採番規約（date-sequence / local max+1 など）"
  - "per-file / per-row の検査のみで corpus 全体の不変条件（id 一意性など）を見ない validator"
known_consumers:
  - tpl-tools
  - adr-tools
discovered_from:
  - issue: "#2188"
  - root_cause_adr: "ADR-2092"
related_to: []
topic: adr-tooling
scope:
  packages: []
---

# TPL-2188: 採番 id の一意性は corpus 横断の機械検証か大域 allocator で担保する

## 観点

「既存の id 集合を見て次の番号を決める」採番規約は、**単一ツリーの中でしか衝突を防げない**。並行ブランチはそれぞれ自分のツリーだけを見て同じ番号を「空いている」と判断するため、衝突はマージで初めて成立する。そして per-file / per-row の検査だけの validator は、各ファイルが自分自身と整合している限り重複 id を検出できない。

id 体系を導入・変更するときは、次のどちらか（両方が理想）を確認する:

1. **割り当て元が大域的に一意か** — GitHub Issue / PR 番号のような、単一ツリーの外でも一意性が保証される allocator から番号を導出する
2. **corpus 横断の一意性検査があるか** — 重複 id をマージ時（両ファイルが同一ツリーに入った最初の時点）に CI で fail させる

## 想定される失敗モード

- 同日に切られた 2 ブランチが同じ `TPL-YYYYMMDD-01` を採番 → 両方 merge → validator は全 per-file 検査を通過し、人間が類似ファイル名に気づくまで重複が残る（#2188 の実例。ADR 旧 `YYYYMMDD-NN` 形式でも #1985/#1986、#2086/#2092 で同型の衝突）
- 大域 allocator へ移行しても fallback の local 採番（既存 max+1）経路が残る場合、その経路だけ race が残存する — proactive TPL のように Issue を持たない起点で発生しやすい

## チェックリスト

- [ ] 新しい採番規約の割り当て元は、単一ツリーの外でも一意か（大域 allocator か）?
- [ ] validator に corpus 横断の id 一意性検査があるか（per-file 検査だけになっていないか）?
- [ ] fallback の local 採番経路が残るなら、その衝突をマージ時に検出する機械チェックが同時に入っているか?
- [ ] 旧 id 体系からの移行では、書き換え不能な外部参照（過去の PR description / Issue コメント）のために旧→新対応表を永続記録（ADR 等）に残したか?

## 既知の対処パターン

- ADR: `YYYYMMDD-NN` → Issue/PR 番号ベース `ADR-<n>` へ移行（#2083 / #2100）
- TPL: 同様に `TPL-<n>` へ移行し、残る local 採番経路は `tpl-tools` 0.0.7 の `duplicate-id` 検査（cross-file）で防護（[ADR-2188](../adr/2188-tpl-issue-number-ids.md)、上流 [kompiro/tpl-tools#14](https://github.com/kompiro/tpl-tools/issues/14)）

## 関連テスト

- [kompiro/tpl-tools `test/validate.test.ts`](https://github.com/kompiro/tpl-tools/blob/main/test/validate.test.ts) — `duplicate id check` suite（並行ブランチ衝突シナリオを `validateAll` で再現）
- `.github/workflows/tpl-validate.yml` — 本 repo 側で `pnpm tpl:validate` を PR gate として実行
