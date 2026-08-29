---
id: TPL-2643
title: "走らずに success を報告する gate は、skip 条件を解除する状態変化を必ず trigger 側にも持つ"
status: active
date: 2026-08-28
applicable_to:
  - "条件付き実行で skip されうる Required / blocking なチェック（skip が「合格」と同じ色で報告される仕組み）"
  - "PR や Issue の状態変化（draft 解除、label 付与、base 変更、assignee 変更）で実行要否が変わる CI"
  - "「実行しなかった」と「検証して問題なかった」を同じ報告値に畳む仕組み一般"
known_consumers:
  - ci-check-job
  - draft-pr-gate
discovered_from:
  - issue: "#2643"
  - root_cause_adr: "ADR-2643"
  - root_cause_file: ".github/workflows/ci.yml"
related_to:
  - TPL-1480
  - TPL-2446
topic: build
scope:
  packages: []
---

# TPL-2643: 走らずに success を報告する gate は、skip 条件を解除する状態変化を必ず trigger 側にも持つ

## 観点

チェックを条件付きで skip する仕組みを入れるときは、**skip されたときに何色で報告
されるか**と、**skip の条件が解除される状態変化がそのチェックを再起動するか**を対で
見る。

skip が「合格」として報告される仕組みでは、条件解除の状態変化が trigger に入って
いない限り、最後に残る報告は「走らなかった成功」になる。skip 条件（`if:` / filter）と
再実行 trigger（`on:` / `types:`）は別の場所に書かれていて、言語側は両者の対応を
何も保証しない。

## 想定される失敗モード

- GitHub Actions で job-level の `if:` により skip された job は、Required status
  check に **success** を報告する。draft PR を skip する `if:` を足しながら `types:` に
  `ready_for_review` を足し忘れると、draft を外した PR では何も起動せず、その commit に
  付いた「skip 由来の green」のままマージできる（ADR-2643 で入れた draft gate が
  まさにこの形）。
- 同型: label 付与で走るチェックを label なしのとき skip 扱いにしたが、`labeled` を
  trigger に入れていない。base 変更で対象が変わるチェックが `edited` を持っていない。
- 逆向きの失敗も同じ根から出る。workflow レベルの `paths` / `branches` で発火しない
  場合、check は作られず **pending** のまま残り、PR は永久にマージできない
  （[TPL-1480](TPL-1480-consistency-check-triggers-on-both-sides.md) の paired stub が
  必要になる理由）。skip の報告色が pending か success かで、失敗の出方が
  「止まる」か「すり抜ける」かに変わる。

## チェックリスト

チェックを条件付きで skip する仕組みを追加・改修するとき:

- [ ] skip の条件を解除する状態変化を列挙し、そのすべてが workflow の trigger
      （`on:` / `types:`）に含まれているか確認した
- [ ] skip されたときに Required check へ報告される値（success / pending / neutral）を
      確認し、それが「マージを止める」側か「素通しする」側か言えるようにした
- [ ] skip 条件と trigger のズレを落とす機械チェックを置いた（例:
      `scripts/ci/workflow-draft-gate.test.ts`）
- [ ] 状態変化を実際に 1 度起こして、本番の job が起動することを観測した

## 既知の対処パターン

skip 条件と trigger を 1 つのテストで対にして assert する。karasu では
`scripts/ci/workflow-draft-gate.test.ts` が「draft gate を持つ job の一覧」と
「その workflow の `types:` に `ready_for_review` があること」を同時に検査し、
片方だけの変更で落ちる。

## 関連テスト

- `scripts/ci/workflow-draft-gate.test.ts`
