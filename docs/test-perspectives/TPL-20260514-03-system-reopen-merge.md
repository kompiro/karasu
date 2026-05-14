---
id: TPL-20260514-03
title: "同名 system / deploy / organization の再オープンは children を union し、property は import-graph root に近い側が勝つ"
status: active
date: 2026-05-14
applicable_to:
  - "コンテナ的なブロック（`system` / `deploy` / `organization`）を複数ファイルに分割して書ける構文の resolver"
  - "import / include / require などで取り込んだブロックを既存のブロックに合流させる merge ロジック"
known_consumers:
  - import-resolver
discovered_from:
  - root_cause_file: "docs/spec/syntax.md#multi-file-import-semantics"
  - issue: "#1381"
related_to:
  - TPL-20260514-02
  - TPL-20260514-04
topic: resolver
scope:
  packages:
    - core
---

# TPL-20260514-03: 同名 system / deploy / organization の再オープンは children を union し、property は import-graph root に近い側が勝つ

## 観点

同じ id の `system` / `deploy` / `organization` ブロックが複数ファイルに現れた場合、karasu は **重複エラーではなく union merge** する（再オープン）。これにより 1 つの大きな system を複数ファイルに分割して書ける。

merge 規則:

- **本体プロパティ** (`label` / `description` / タグ): `ImportResolver.resolve()` に渡された entry file（= App / CLI で開いているファイル）に近い側が勝つ。bottom-up に merge し、root 側が既に値を持つフィールドだけ採用、無ければ importee の値を採用。**異なる non-empty 値の衝突は警告 `system-property-conflict`** を発し、採用値 / 無視値 / 両者の location を含める。
- **children**: id ごとに find-or-create で union。重複 id は既存の `duplicate-node-in-system` エラー。
- **edges**: union（exact 重複のみ dedup）。

「root に近い側が勝つ」は WYSIWYG mental model（今開いているファイルの宣言がプレビューに見える）と一致する。同じファイル群でも、開くファイルを変えれば top-level 表記が切り替わる。

## 想定される失敗モード

- importee が `label "X"` を書き importer が `label "Y"` を書いたとき、無言で X が勝つ / Y が勝つの混乱
- 警告を出さずに無言で上書きすると、サブファイルで `label` を変えても見た目が変わらず、ユーザーは「壊れている」と誤解する
- children の merge を「先勝ち」「後勝ち」のような順序依存にすると、import 宣言の並び替えで結果が変わる非決定的バグになる
- `deploy` / `organization` を merge 対象から外すと、physical / org ビューが部分的に欠ける（TPL-20260514-04）

## チェックリスト

container 系ブロックの再オープン / merge を実装 / 変更するときに確認する:

- [ ] 本体プロパティの優先規則を `ImportResolver.resolve()` の entry を root としたグラフ距離で決めているか
- [ ] 衝突時に warning（採用 / 無視 / location 含む）を発しているか
- [ ] children を id ごとの find-or-create で union しているか（順序依存になっていないか）
- [ ] 同じ id を持つ 2 つのファイルが entry と sub-import で逆転したとき、テストで「開いているファイルが変わると採用値も変わる」ことを assert しているか
- [ ] `deploy` / `organization` にも同じ規則が適用されているか（spec S3 + S4）

## 既知の対処パターン

- merge 関数を「empty な値だけ埋める」シャロー merge にする。non-empty 衝突は呼び出し側に warning を生成させる
- entry からの距離は再帰呼び出しの深さで自然に表現できる（importer → importee の方向で merge 関数を呼ぶ）

## 関連テスト

未確立（spec PR 後の実装 PR で追加予定）。

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S3 / S4
