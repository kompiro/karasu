---
id: TPL-1381
title: "DAG 経由で同じファイルに 2 回到達するのは循環ではない"
status: active
date: 2026-05-14
applicable_to:
  - "import グラフを再帰的に解決する resolver 全般"
  - "ファイル / モジュール / リソースを path で参照し再帰展開するシステムで、再到達を `visited` セットで管理するコード"
known_consumers:
  - import-resolver
discovered_from:
  - root_cause_file: "docs/spec/syntax.md#multi-file-import-semantics"
  - issue: "#1381"
related_to:
  - TPL-1383
topic: resolver
scope:
  packages:
    - core
---

# TPL-1381: DAG 経由で同じファイルに 2 回到達するのは循環ではない

## 観点

import グラフは **DAG** を許す。あるファイル C が `entry → A → C` と `entry → B → C` の 2 経路で到達されるのは正常なケースであり、循環ではない。`circular-import` 警告は **真の循環** — 現在ロード中のスタックに既に居るファイルへの再到達 — のみに発する。

`visited` という 1 つのセットで「ロード中」「ロード済み」を兼任すると、DAG 再到達を循環と誤判定して false-positive 警告が出る。さらに「再到達は空 KrsFile を返す」実装と組み合わさると、imported ファイルの内容が静かに消失する（spec §「Multi-file import semantics」 S2 と S5 の同時違反）。

## 想定される失敗モード

- 共通の utility / shared module を複数の上位 import が参照すると、毎回 `circular-import` 警告が出る（ユーザーは「直し方が分からない警告」を放置するようになる）
- DAG 再到達のときに 2 度目の resolve が空を返し、wildcard import で imported ファイルの中身が部分的に消失する（#1381）
- 上記の結果、edge endpoint が解決できなくなり、ノード自体が消える二次被害が起こりうる（TPL-2170 と連動）

## チェックリスト

新しい再帰的な resolver / loader を作る、または既存の `visited` ロジックを変更するときに確認する:

- [ ] 「ロード / 解決中」と「ロード / 解決済み」を別のセット（path-stack vs memo）で表現しているか
- [ ] 真の循環（loading-stack に既に居る）のときだけ警告 / 早期 return しているか
- [ ] DAG 再到達のテストケース（同じファイルを 2 経路で到達して全 import が正しく解決される）があるか
- [ ] 真の循環のテストケース（A → B → A）が `circular-import` を発する側でカバーされているか

## 既知の対処パターン

- `loadingKrs: Set<string>`（path-stack: enter で push、exit で pop）と `loadedKrs: Set<string>`（memo: 一度ロードしたら永続）を分ける
- 解決済み KrsFile は `resolvedCache: Map<string, KrsFile>` にメモ化し、再到達時は cache を返す。merge 側で idempotent dedup を担保する

## 関連テスト

- `packages/core/src/fs/import-resolver.test.ts` — `multi-file import semantics (#1381)`：同じファイルに named import と wildcard import の 2 経路で到達しても `circular-import` を出さないこと（`S5: DAG re-arrival of the same file is not a cycle — no circular-import warning`）と、A → B → A の真の循環では出すこと（`S5: a true cycle still produces a circular-import warning`）を固定する。DAG 再到達で全 import が解決されることは同じ block の S2 テストが見る
- `packages/core/src/fs/import-resolver.test.ts` — `circular import detection` › `detects circular krs imports`：`.krs` の真の循環で `circular-import` を出すこと、`directory import` › `does not warn about circular import when entry file is in the imported directory`：entry 自身を含むディレクトリを import しても循環扱いしないことを固定する

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S5
