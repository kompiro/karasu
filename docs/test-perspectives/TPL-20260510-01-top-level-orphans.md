---
id: TPL-20260510-01
title: "KrsFile のトップレベル宣言（unassigned orphans）を全消費側で扱う"
status: active
date: 2026-05-10
applicable_to:
  - "KrsFile.systems を消費する機能"
  - "top-level の services / databases / queues / storages / domains を扱う機能"
known_consumers:
  - renderer
  - matrix
  - org-view
  - deploy-view
discovered_from:
  - issue: "#1160"
  - root_cause_file: "packages/core/src/view/unassigned-system.ts"
related_to: []
topic: core-concepts
scope:
  packages:
    - core
    - app
---

# TPL-20260510-01: KrsFile のトップレベル宣言（unassigned orphans）を全消費側で扱う

## 観点

`.krs` の AST では `service` / `database` / `queue` / `storage` / `domain` を `system { ... }` の外側（top-level）に宣言できる。これらは特定のシステムに所属しない **orphan** として扱われ、`KrsFile.systems` には含まれない。AST を消費する各機能は、`KrsFile.systems` だけを走査するのではなく、orphan を含めるかどうかを **明示的に判断する責務** を持つ。

renderer は `synthesizeUnassignedSystem()`（`packages/core/src/view/unassigned-system.ts`）を使って合成 system ノードでラップしているが、新しいビュー（matrix / chart / 統計など）を実装するときに同じ責務を引き継ぎ忘れると、orphan が一律に無視されるバグになる。

## 想定される失敗モード

- ある機能（matrix / org-view / deploy-view など）でだけ orphan ノードが描画されない、集計から漏れる
- ユーザーから見ると「特定のビューだけ要素が消える」現象として観測され、原因特定が遅れる
- 別のビューでは見えるため AT が pass していても、当該ビューのテストが orphan を含む fixture を使っていなければ気付けない

## チェックリスト

新機能の実装/修正時に、以下を確認する:

- [ ] top-level の `service` / `database` / `queue` / `storage` / `domain` が含まれる `.krs` で動作確認されているか
- [ ] `KrsFile.systems` を走査するロジックで、orphan を扱う責務を `synthesizeUnassignedSystem()` に委ねるか自前で扱うかが明示的に決まっているか
- [ ] 合成 system を UI に表示するか / 表示しないかが決定されているか
- [ ] 表示する場合、ラベル `Unassigned` の有無やアイコン扱いが他ビューと整合しているか
- [ ] 関連 AT / ユニットテストに「orphan のみの `.krs`」と「orphan + system 混在の `.krs`」の両方が含まれているか

## 既知の対処パターン

- 共通ヘルパー `synthesizeUnassignedSystem(krsFile)` を呼んで返り値を `systems` の末尾に append する形で統一する（renderer / matrix が採用）
- 「orphan を扱わない」ことが意図的な機能（例: 物理配置のみを扱う deploy-view など）では、その判断を実装内コメントまたは Design Doc に明記する

## 関連テスト

- `packages/core/src/view/unassigned-system.test.ts`
- `packages/core/src/view/crud-matrix-extract.test.ts`
