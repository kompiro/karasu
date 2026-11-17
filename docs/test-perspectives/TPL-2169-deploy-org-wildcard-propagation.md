---
id: TPL-2169
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
  - TPL-1383
  - TPL-1225
topic: resolver
scope:
  packages:
    - core
---

# TPL-2169: whole-file import は system だけでなく deploy / organization も伝搬する

## 観点

karasu は論理 (`system`)・物理 (`deploy`)・組織 (`organization`) の三面を 1 つの `.krs` artifact 内で並行ビューとして扱う（TPL-1225）。import 規則も同じ三面に対称に適用されるべきで、`import "p.krs"` は p.krs に書かれた `deploy` / `organization` も importer に流す。

新しい top-level block 種別を spec に追加するたびに resolver の merge 経路が一覧から漏れるリスクがあるため、「**top-level block の全種類を列挙する curated table**」で merge 対象を管理する（観察 A: curated table for meta-checks、`docs/test-perspectives/README.md` 「横断観察」）。

## 想定される失敗モード

- `deploy` だけ実装、`organization` を忘れる（あるいは逆）。一方のビューだけが import 経由で空になる
- 新 block（仮: `legend` / 将来追加されるかもしれないビュー）を追加したとき、merge 関数の switch / if-else から漏れる
- bundled SVG では「タブ」だけ表示され、コンテンツが「No deploy block defined」になる類のサイレント失敗が起こる（#1381）

## チェックリスト

新しい top-level block 種別を追加するとき / 既存の resolver merge を変更するとき:

- [ ] resolver の wildcard merge 対象として全 top-level block 種別が一覧されているか（curated table またはそれに準ずる exhaustiveness 担保） [guard: `packages/core/src/fs/import-merge-tables.test.ts`]
- [ ] 新 block の merge を追加したら、import 経由で imported ファイルの該当 block が importer に現れるテストを追加したか [guard: `packages/core/src/fs/import-merge-tables.test.ts`]
- [ ] `deploy.nodes` / `organization.teams` のような nested の relation（`realizes` / `owns`）も union されているか
- [ ] 3 並行ビュー（system / deploy / org）の cross-face integration test（同じ fixture から 3 面を render して全コンテンツが現れる）を 1 件持っているか [guard: `packages/core/src/compile/three-face-render-corpus.test.ts`]

## 既知の対処パターン

- `KrsFile` の top-level 配列フィールドを 1 箇所で列挙し、wildcard merge は「全フィールドを iterate する一般化された helper」で処理する
- 新 block 追加時の漏れは TS の exhaustive type check で防ぐ（discriminated union や `satisfies` で）

## 関連テスト

- `packages/core/src/fs/import-resolver.test.ts` — `multi-file import semantics (#1381)` の「S4: same-id `deploy`
  and `organization` blocks merge across files」。whole-file import で imported 側の deploy node と team が importer
  に現れ、両ファイルの deploy node と team が union されること（node / team の id で見ており、`realizes` /
  `owns` の relation そのものは assert していない）
- 同じファイルの「S2 + S4: end-to-end on the examples/ja/multi-file-system fixture」。出荷サンプルを入力に、
  system / deploy / organization の 3 面すべての内容が merge 結果に現れること
- 同じファイルの `wildcard import` の「merges deploy blocks from wildcard import」と「merges same-named deploy
  blocks from wildcard import」
- `packages/core/src/fs/import-merge-tables.test.ts` — `every top-level KrsFile array reaches the importer`：`KrsFile` の配列のキーごとの表 `TOP_LEVEL` を `satisfies Record<ArrayKeys<KrsFile>, …>` で型付けし、各行を whole-file / directory などの import で取り込んで、importer に imported ファイルと同じ要素が現れることを assert する。新しい top-level block を `KrsFile` に足すと、表に行を足すまで型検査が落ち、足した行は merge に載っていなければ落ちる（チェックリスト 1・2 項目目のガード。TPL-1383 と同じ表）
- `packages/core/src/compile/three-face-render-corpus.test.ts` — 4 項目目のガード。全 example を
  `buildAllViewsSvgProject`（`karasu render` が書く bundle）で描き、merge 結果が宣言する論理ノード・deploy node・team と member（入れ子の team を含む）
  がそれぞれ system / deploy / org の pane に描かれることを確かめる。期待値は merge 結果から導くので、新しい example と
  新しい宣言は追加した日から加わる。3 面すべてを import 先のファイルから埋める entry と、入れ子の team と member が corpus にあることも確かめる。
  例外は 2 つで、テストに理由を書いてある: `system` が 1 つのモデルではその `system` が root の canvas になること、
  同じ id のコンテナが 2 か所にあるとき bundle は anchor id ごとに 1 階層しか持たないこと（#2933）。
  後者では anchor が解決する側（`nodePathIndex` の勝者。index が記録しない kind では bundle が先に辿る側）の配下は期待値に残し、もう一方の配下だけを外す

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S4
