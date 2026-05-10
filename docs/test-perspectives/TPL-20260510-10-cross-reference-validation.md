---
id: TPL-20260510-10
title: "新しい cross-reference プロパティには resolver-side 検証と unresolved warning を必ず付ける"
status: active
date: 2026-05-10
applicable_to:
  - "他ノードの id を指す参照プロパティ（handles / realizes / from / to / 将来追加される similar 系）を AST に追加する変更"
  - "logical 層と physical 層、あるいは異なる集合間を横断する identifier 参照を扱う機能"
known_consumers:
  - parser
  - resolver
  - warnings
discovered_from:
  - issue: "#907"
  - root_cause_file: "packages/core/src/resolver/warnings.ts:586"
related_to:
  - TPL-20260510-08
topic: parser
scope:
  packages:
    - core
---

# TPL-20260510-10: 新しい cross-reference プロパティには resolver-side 検証と unresolved warning を必ず付ける

## 観点

`.krs` の構文に「他のノードの id を指す参照プロパティ」を追加するとき（`handles`, `realizes`, edge の `from` / `to`, 将来追加される類似プロパティ）、parser はそのプロパティを「任意の identifier として」受理してしまう。**識別子が実在のノードに解決できるかは parser の責任ではなく、resolver の責任**。ここに validator を入れ忘れると、**typo がサイレントに連結を切り、ユーザーは「描画が出ない」現象として遅れて気づく** ことになる。

karasu には既に `unresolved-handles`（`warnings.ts:402`）と `unresolved-realizes`（`warnings.ts:586`）の前例がある。新しい cross-reference プロパティを追加する PR は、必ずこの**「validator + warning kind を一緒に追加する」** パターンを踏襲する必要がある。

## 想定される失敗モード

- **typo がサイレント** — 参照先の名前を 1 文字間違えただけで連結が切れるのに、警告も診断も出ない
- ユーザーは「機能が壊れている」「自分の構文が間違っている」のどちらか分からない
- 実装者の手元では正しい id でテストするので、開発時には気付かれない
- import 経由で参照する場合と直接参照する場合で挙動が違う（一方だけ resolve しないなど）と、原因切り分けがさらに困難

## チェックリスト

新しい cross-reference プロパティを追加するとき、以下を確認する:

- [ ] 参照先 id を resolve するための **set / map** を `analyze()` 経由で構築しているか（`handles` / `realizes` の既存 detector と同じ位置に並べる）
- [ ] 解決失敗時に発火する **新しい warning kind**（`unresolved-<property>`）を導入しているか。i18n（en/ja）と formatter switch を併せて更新したか
- [ ] 同一 id が **import 経由でファイル境界をまたぐ** 場合と、**top-level 宣言** にぶら下がる場合の両方で resolve されることをテストで確認したか
- [ ] 既存の `unassigned-*` 系 warning と二重発火しないか（同じ id について「unresolved」「unassigned」両方が出ないよう、source-of-truth を 1 つに揃えているか）
- [ ] 反対方向の test（**正しい参照に warning が出ない**）も入っているか

## 既知の対処パターン

- 新しい cross-reference のたびに parser だけでなく resolver の `warnings.ts` に detector を追加する。**parser PR と resolver PR を分けない**（分けると validator なしの状態が main に乗る期間ができる）
- 既存の `handles` / `realizes` validator をテンプレートとして使う。`buildResolvableIds()` のような共通ヘルパを抜き出して、参照プロパティ追加が「参照プロパティ名と target kind の組を渡すだけ」で済むようにすると将来追加が楽
- warning メッセージは「**何が** resolve できなかったか + **どこで** 宣言されているか + 候補の suggestion（fuzzy match で近い id を提示）」を含めると、typo の修正に直接つながる

## 関連テスト

- `packages/core/src/resolver/warnings.test.ts`（`unresolved-handles`, `unresolved-realizes` の test）
- `docs/spec/syntax.md` — 新しい参照プロパティの仕様記述
