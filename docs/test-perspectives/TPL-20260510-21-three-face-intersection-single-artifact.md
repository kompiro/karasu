---
id: TPL-20260510-21
title: "論理・物理・組織の三面は一つの `.krs` artifact 内で交差させる"
status: active
date: 2026-05-10
applicable_to:
  - "新しい関係性 / メタデータ（ownership・deployment・realization など）を導入する機能"
  - "外部システム（issue tracker / ownership registry / infra config / IaC / HR システム）との統合機能"
  - "「組織情報は別ツールから取ればよい」「物理配置は infra repo を見ればよい」と省略しがちな設計判断"
known_consumers:
  - core
  - cli
  - app
  - vscode
related_to:
  - TPL-20260510-18
  - TPL-20260510-10
discovered_from:
  - root_cause_file: "docs/concepts.ja.md"
topic: core-concepts
scope:
  packages:
    - core
    - cli
    - app
    - vscode
---

# TPL-20260510-21: 論理・物理・組織の三面は一つの `.krs` artifact 内で交差させる

## 観点

karasu はシステムを **論理・物理・組織** の三つの面で記述する（`docs/concepts.ja.md` 「論理・物理・組織の三面構造」）。
このとき重要なのは「三つの面が描けること」ではなく、**三つの面の交点が同じ artifact の中で参照可能であること** である。
`realizes`（物理 → 論理）と `owns`（組織 → 論理/物理）は、面同士をまたぐ関係を表す cross-face link であり、Conway / 逆コンウェイ戦略の議論はこの交点に発生する。

新機能を設計するとき、便利さや責務分割を理由に **どれか一つの面を `.krs` の外に押し出してしまう** 圧力がしばしば働く:

- 「team / member は組織 repo の YAML から取ればよい」
- 「deploy 情報は IaC（Terraform / k8s manifest）から自動生成すればよい」
- 「ownership は GitHub の CODEOWNERS / Linear のチームから取ればよい」

これらは個別にはもっともらしいが、**`realizes` / `owns` のような cross-face link が `.krs` の外に漏れた瞬間、三面交点を「一つの言語で語る」という karasu の核が壊れる**。
論理 service と組織 team を結ぶ `owns` は、両端が同じ artifact に居なければ書けない。
join しなければ復元できない関係は、議論のテーブルに乗らない。

この TPL は「三面のどれか一つでも `.krs` の外に出さない」という制約を、新機能・新統合機能の設計時にチェックするための観点である。

## 想定される失敗モード

- ownership を外部 registry から fetch する機能を追加した結果、`team owns Service` が `.krs` 上に書けなくなり、**逆コンウェイ戦略の議論ができない図** に退化する
- deploy 情報を IaC から自動生成する optimizer を入れた結果、`deploy realizes` が `.krs` から消え、**論理と物理の対応が `.krs` 単独では参照できない** 状態になる
- AI 支援機能（translate / chat）が「組織情報は別 source から取って context に積む」設計になり、`.krs` 単体で読んでも三面の交点が見えない artifact が量産される
- VSCode 拡張やビューワが「組織 view は GitHub Teams API から fetch」のような外部依存を前提に作られ、**オフラインや別組織での再利用ができない** 図になる
- 三面のいずれかが optional / lazy になることで、`realizes` / `owns` の **cross-reference 検証**（→ TPL-10）が一部しか効かなくなる

## チェックリスト

新機能・新統合・新ビューを設計するとき、以下を確認する:

- [ ] この機能は **論理・物理・組織** のいずれかの面を `.krs` 外（issue tracker / ownership registry / IaC / HR システム / 外部 API）に押し出していないか
- [ ] `realizes`（物理 → 論理）と `owns`（組織 → 論理/物理）の **両端が同じ artifact に居る** 設計になっているか。片方だけ外部 source なら、cross-face link は表現できない
- [ ] 「便利だから外部から fetch」の誘惑があるとき、それを採用すると Conway / 逆コンウェイ戦略の議論ができなくなる artifact が生まれないか考えたか
- [ ] 外部システムとの統合は **取り込み（import / abstraction）** にとどめ、参照を外部 source に対する live link にしていないか（取り込み後は `.krs` が source of truth → TPL-18 と整合）
- [ ] サンプル / fixture / e2e に **三面が同居した `.krs`** が含まれているか。論理だけ / 物理だけ / 組織だけのテストでは、cross-face link の壊れが検出できない
- [ ] AT / DesignDoc で「この機能を使うと、三面の交点（`realizes` / `owns` の通り道）がどう保たれるか」を一文で説明できるか

## 既知の対処パターン

- 外部 system からの取り込みは **import / abstract** ステップを設け、その output として `.krs` に書き出す（live binding ではない）。これで `.krs` 単体で三面が完結する
- 新しい関係性や属性を入れたくなったら、まず **論理・物理・組織のどれに属するか / どの面とどの面を結ぶか** を分類してから語彙を設計する。「どこにも属さない」属性は、たいてい karasu のスコープ外である（→ `concepts.ja.md` 「ゆっくり変化する構造的な文脈」フィルタ）
- 機能の AT に「論理ノードに `owns` する team が居る」「物理ノードが論理を `realizes` する」fixture を含め、cross-face link が壊れる変更を検知できるようにする
- AI 機能（translate / chat）の context 構築は、外部 source ではなく **同じ `.krs`** から組み立てる。組織情報が必要なら `.krs` の `organization` / `team` から読み、足りなければ `.krs` を拡張する方向に倒す

## 関連テスト

- `docs/concepts.ja.md` 「論理・物理・組織の三面構造」 / 「目標 → 三面構造の目標」
- `docs/spec/syntax.md` — `realizes` / `owns` の構文
- `examples/` — 三面が同居したサンプル `.krs`
- 関連 TPL: TPL-20260510-18（text を single source of truth に保つ）/ TPL-20260510-10（cross-reference の resolver 側検証）
