---
id: TPL-2168
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
  - TPL-1383
  - TPL-2169
topic: resolver
scope:
  packages:
    - core
---

# TPL-2168: 同名 system / deploy / organization の再オープンは children を union し、property は import-graph root に近い側が勝つ

## 観点

同じ id の `system` / `deploy` / `organization` ブロックが複数ファイルに現れた場合、karasu は **重複エラーではなく union merge** する（再オープン）。これにより 1 つの大きな system を複数ファイルに分割して書ける。

merge 規則:

- **本体プロパティ** (`label` / `description` / タグ): `ImportResolver.resolve()` に渡された entry file（= App / CLI で開いているファイル）に近い側が勝つ。bottom-up に merge するので、値は埋めたファイルの距離を持ち続け、衝突は距離で決まる（近い側が、深いファイルから先に埋まった値を上書きする。同じ距離なら先にマージした側）。**異なる non-empty 値の衝突は警告 `system-property-conflict`** を発し、採用値 / 無視値を持ち、負けた側の宣言の location を指す。
- **children**: id ごとに find-or-create で union。重複 id は既存の `duplicate-node-in-system` エラー。
- **edges**: union（exact 重複のみ dedup）。

「root に近い側が勝つ」は WYSIWYG mental model（今開いているファイルの宣言がプレビューに見える）と一致する。同じファイル群でも、開くファイルを変えれば top-level 表記が切り替わる。

## 想定される失敗モード

- importee が `label "X"` を書き importer が `label "Y"` を書いたとき、無言で X が勝つ / Y が勝つの混乱
- 警告を出さずに無言で上書きすると、サブファイルで `label` を変えても見た目が変わらず、ユーザーは「壊れている」と誤解する
- children の merge を「先勝ち」「後勝ち」のような順序依存にすると、import 宣言の並び替えで結果が変わる非決定的バグになる
- `deploy` / `organization` を merge 対象から外すと、physical / org ビューが部分的に欠ける（TPL-2169）

## チェックリスト

container 系ブロックの再オープン / merge を実装 / 変更するときに確認する:

- [ ] 本体プロパティの優先規則を `ImportResolver.resolve()` の entry を root としたグラフ距離で決めているか
- [ ] 衝突時に warning（採用 / 無視 / location 含む）を発しているか
- [ ] children を id ごとの find-or-create で union しているか（順序依存になっていないか）
- [ ] 同じ id を持つ 2 つのファイルが entry と sub-import で逆転したとき、テストで「開いているファイルが変わると採用値も変わる」ことを assert しているか
- [ ] `deploy` / `organization` にも同じ規則が適用されているか（spec S3 + S4）

## 既知の対処パターン

- 本体プロパティの照合は 1 か所（`PropertyReconciler`）にまとめ、空なら埋め、衝突なら距離で決める。警告はマージの後で、最終的に採った値に対して負けた値ごとに 1 回出す（途中のマージの判定は根で覆りうる）
- entry からの距離は、merge の前に import グラフを幅優先でたどって最短経路で測り、埋めた値と一緒に運ぶ。再帰呼び出しの深さや merge の順では表せない: bottom-up の merge では深いファイルの値が先に埋まり、後から来た近いファイルに勝ってしまう（#3713）

## 関連テスト

- `packages/core/src/fs/import-resolver.test.ts` — `multi-file import semantics (#1381)` の S3 / S4。
  「S3: reopened `system` merges children and root entry wins for `label`」は children の union、entry 側の
  `label` 採用、`system-property-conflict` の params（`chosen` / `ignored`）を、「S3: importer with no `label`
  adopts the imported file's value silently」は衝突しない場合に警告が出ないことを、「S4: same-id `deploy` and
  `organization` blocks merge across files」は deploy / organization の子（deploy node と team）が union されることを
  固定する（deploy / organization での値の採用と `system-property-conflict` は、下の #3713 の block が見る）
- 同じファイルの `wildcard import` の「merges edges from same-named system across files」（edges の union）と
  「reports error for duplicate node ID in same-named system」（重複 id は `duplicate-node-in-system`）
- 同じファイルの「S3: the value closest to the entry wins, whatever the import order (#3713)」。2 段下から運ばれた値と
  1 段下の値が衝突したとき、import の順に依らず 1 段下が勝つことを system の `label` / `description`、deploy と
  organization の `label` で固定し、`system-property-conflict` が負けた側の宣言の位置（`loc.file`）を持つことを assert する
  （チェックリスト 1・2・5 項目目）。最短経路で数えること、同じ距離なら import の順で決まること、entry を入れ替えると
  採用値も入れ替わること（チェックリスト 4 項目目）も同じ block が見る。新しいブロックの種類が `PropertyReconciler` を
  通らずに開き直されると、このテストは気づかないので印にはしない

## 派生元 spec

- `docs/spec/syntax.md` §「Multi-file import semantics」 S3 / S4
