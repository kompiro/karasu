---
id: TPL-20260514-04
title: "whole-file import は system だけでなく deploy / organization も伝搬する"
status: active
date: 2026-05-14
applicable_to:
  - "複数の並行ビュー（論理 / 物理 / 組織）を 1 つのプロジェクト内で扱う resolver"
  - "import 経由で取り込まれる top-level block の種類が時間と共に増えるシステム"
known_consumers:
  - import-resolver
discovered_from:
  - root_cause_file: "docs/spec/syntax.md#multi-file-import-semantics"
  - issue: "#1381"
related_to:
  - TPL-20260514-02
  - TPL-20260510-22
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260514-04: whole-file import は system だけでなく deploy / organization も伝搬する

## 観点

karasu は論理 (`system`)・物理 (`deploy`)・組織 (`organization`) の三面を 1 つの `.krs` artifact 内で並行ビューとして扱う（TPL-20260510-22）。import 規則も同じ三面に対称に適用されるべきで、`import "p.krs"` は p.krs に書かれた `deploy` / `organization` も importer に流す。

新しい top-level block 種別を spec に追加するたびに resolver の merge 経路が一覧から漏れるリスクがあるため、「**top-level block の全種類を列挙する curated table**」で merge 対象を管理する（観察 A: curated table for meta-checks、`docs/test-perspectives/README.md` 「横断観察」）。

## 想定される失敗モード

- `deploy` だけ実装、`organization` を忘れる（あるいは逆）。一方のビューだけが import 経由で空になる
- 新 block（仮: `legend` / 将来追加されるかもしれないビュー）を追加したとき、merge 関数の switch / if-else から漏れる
- bundled SVG では「タブ」だけ表示され、コンテンツが「No deploy block defined」になる類のサイレント失敗が起こる（#1381）

## チェックリスト

新しい top-level block 種別を追加するとき / 既存の resolver merge を変更するとき:

- [ ] resolver の wildcard merge 対象として全 top-level block 種別が一覧されているか（curated table またはそれに準ずる exhaustiveness 担保）
- [ ] 新 block の merge を追加したら、import 経由で imported ファイルの該当 block が importer に現れるテストを追加したか
- [ ] `deploy.nodes` / `organization.teams` のような nested の relation（`realizes` / `owns`）も union されているか
- [ ] 3 並行ビュー（system / deploy / org）の cross-face integration test（同じ fixture から 3 面を render して全コンテンツが現れる）を 1 件持っているか

## 既知の対処パターン

- `KrsFile` の top-level 配列フィールドを 1 箇所で列挙し、wildcard merge は「全フィールドを iterate する一般化された helper」で処理する
- 新 block 追加時の漏れは TS の exhaustive type check で防ぐ（discriminated union や `satisfies` で）

## 関連テスト

未確立（spec PR 後の実装 PR で `examples/ja/multi-file-system/` を使った AT を追加予定）。

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S4
