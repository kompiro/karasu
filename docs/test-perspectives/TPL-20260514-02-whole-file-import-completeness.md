---
id: TPL-20260514-02
title: "whole-file import は imported ファイルの全 top-level ノードと全 children を merged に流す"
status: active
date: 2026-05-14
applicable_to:
  - "`import \"path\"` 形式（wildcard）を持つ言語 / DSL の resolver"
  - "再帰的に展開した結果をキャッシュして再利用する import 解決"
known_consumers:
  - import-resolver
discovered_from:
  - root_cause_file: "docs/spec/syntax.md#multi-file-import-semantics"
  - issue: "#1381"
related_to:
  - TPL-20260514-01
  - TPL-20260514-03
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260514-02: whole-file import は imported ファイルの全 top-level ノードと全 children を merged に流す

## 観点

`import "p.krs"` は **p.krs を完全再帰展開した KrsFile を importer に取り込む**。完全展開とは「p.krs 自身の import を全部解決した後の最終形」であり、importer ごとに改めて計算する必要はなくファイル単位でメモ化できる。

メモ化と「再到達は空を返す」を取り違えると、ある importer が named import で先に p.krs を取り込んだ後、別の場所からの whole-file import が空になり、p.krs に宣言された他の top-level ノード（`system` / `service` / `database` / `legend` / `deploy` / `organization`）と children が消失する。

## 想定される失敗モード

- A.krs が `import { X } from "p.krs"` だけを書き、エントリ B.krs が `import "p.krs"` を書くと、B.krs から見た p.krs の中身が「named import で取り出した X だけ」になり、それ以外の宣言が静かに消える（#1381）
- imported ファイルの `database` / `queue` / `storage` infra ノードが消えると、その infra に依存する `usecase` の `resource` 参照が unresolved になり、edge やノードの二次的な消失を引き起こす
- spec で `deploy` / `organization` の伝搬を約束しているのに、whole-file import の実装が system しか流さないことで「物理 / 組織ビューが空」のサイレント失敗が起きる

## チェックリスト

新規 import 形式の追加、または既存 resolver の merge 経路の変更時に確認する:

- [ ] imported ファイルの top-level ノード（`system` / `service` / `client` / `database` / `queue` / `storage` / `legend` / `deploy` / `organization`）が **すべて** merged 結果に現れるテストがある
- [ ] 同じファイルを named + whole-file 両方で import したとき、whole-file 側で imported ファイルの全内容が importer に流入することを assert している
- [ ] memo / cache を導入する場合、再到達時に空でなく完全な resolved KrsFile を返すことを直接 assert している
- [ ] `@import` で参照されたスタイルシートも cascade に追加されることを確認している

## 既知の対処パターン

- ファイル単位の `resolvedCache: Map<string, KrsFile>` を導入し、importer に依存しない「完全展開済みスナップショット」を保持する
- merge 側を idempotent にする（既存 system は id ごとの find-or-create で union、重複完全一致 edge は dedup）
- named import は cache から fetch した後で「指定 id のみ」を抽出するフィルタを適用する（cache 共有 + ビュー切り出し）

## 関連テスト

未確立（spec PR 後の実装 PR で追加予定）。

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S2
