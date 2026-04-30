---
id: ADR-20260430-03
title: usecase 内 resource に CRUD operations プロパティを追加する
status: accepted
date: 2026-04-30
topic: parser
scope:
  packages:
    - core
    - app
related_to:
  - ADR-20260417-01
  - ADR-20260419-01
---

# ADR-20260430-03: usecase 内 resource に CRUD operations プロパティを追加する

- **日付**: 2026-04-30
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#1046](https://github.com/kompiro/karasu/issues/1046)
  - 設計 PR: [#1050](https://github.com/kompiro/karasu/pull/1050)
  - 実装 PR: [#1055](https://github.com/kompiro/karasu/pull/1055)
  - ADR-20260417-01（OpenAPI の CRUD を 1 usecase に集約）
  - ADR-20260419-01（DB 側の集約）
  - 関連 Issue: [#643](https://github.com/kompiro/karasu/issues/643)（usecase 爆発を回避する逆方向の決定。本 ADR はその反対面）
  - 仕様: `docs/spec/syntax.md` §`Writing logical diagrams` › `service block`、`docs/spec/syntax.ja.md` 同
  - 受け入れテスト: `docs/acceptance/1046-resource-operations.md`

## 背景

`usecase` 内に書く `resource` は「どのリソースに触るか」までしか表せず、`PlaceOrder` が `OrderTable` を **書く** のか **読むだけ** なのかが読み取れなかった。CRUD の区別は以下の場面で実用上の意味を持つ:

- **CRUD マトリクスビュー**（usecase × resource）: ドメイン分析の定番アーティファクト
- **結合度シグナル**: 同じリソースを 2 つの usecase が *書く* 結合は、両方が *読む* よりも強い
- **translate アダプタの情報損失**: `translate openapi` / `translate db` は CRUD 相当の分類を内部で持っているが `.krs` 出力時に捨てていた（ADR-20260417-01 / 20260419-01）
- **描画の差**: 書き込みエッジと読み取り専用エッジは視覚的に区別する価値がある

Issue #643（クローズ済）は「6 個の REST メソッドを 1 つの usecase にまとめる」逆方向の決定だった。本 ADR はその決定を **覆さず**、まとめた 1 つの `manage X` usecase の中に「どの CRUD verbs をカバーするか」を記録するための語彙を追加する。

## 決定

`usecase` 内の `resource` ブロックに `operations` プロパティを追加し、CRUD verbs（`create` / `read` / `update` / `delete`）をカンマ区切りで宣言できるようにする。

```krs
usecase PlaceOrder {
  resource OrderTable {
    label "Order table"
    operations create, read
  }
  resource InventoryAPI [external] {
    operations read
  }
}
```

### 仕様の要点

- 場所: `usecase` 直下の `resource` ブロック内のプロパティ。`database` / `queue` / `storage` 配下のインフラ宣言には書けない（`property-not-for-node-kind` error）。
- 値: 識別子のカンマ区切り、または複数行 `operations` 行で並列宣言可（`handles` と同じ受理形）。複数行は累積する。
- AST 配置: `ResourceNode.properties.operations: string[]`（`ServiceNode.properties.handles` / `properties.delivers` と同階層）。
- 認識セット（v1）: `create` / `read` / `update` / `delete`。認識外 verb は `unknown-resource-operation` warning だが AST には保持して translate アダプタの拡張余地を残す。
- 重複は `duplicate-resource-operation` warning を出して AST 上で重複排除。
- 省略時は警告を出さず `properties.operations` は `undefined`（"未決定の許容" 方針を踏襲）。

### 出さないもの（本 ADR のスコープ外）

- CRUD マトリクスビューの描画（renderer は無変更）
- translate アダプタからの自動付与
- 認可モデリング（Issue #832 と重複するため切り離す）
- スタイルセレクタ拡張（`:operation(write)` など）

## 理由

- **タグ名前空間を温存できる**。`[read]` / `[write]` は今後ユーザー定義タグやスタイルセレクタとして自然に欲しくなる名前で、CRUD verb で先取りすると後悔する。
- **役割と動作が物理的に分離**される。`[external]` は「リソースの種類」、`operations` は「この usecase がどう触るか」で、文法上のレイヤが別なのが望ましい。
- **既存パターンの踏襲**で学習コストが低い。`handles` / `delivers` / `capability` がいずれも「プロパティ + カンマ区切り or 複数行宣言」を採っており、新しいパターンを導入しなくて済む。
- **AST 配置を `properties.operations` に置くことで `handles` / `delivers` / `team` と同階層に揃う**。`tags` / `annotations` のトップレベル昇格は、`tags` が任意語彙の分類・選択用で `operations` が controlled vocabulary（CRUD 4 種）であり意味階層が違うことから採らない。
- **診断が確定的に書ける**。タグ流用案だと「`[read]` を未認識タグ警告にすべきか CRUD verb として受理すべきか」が文脈依存になり、翻訳ツールやスタイルファイルとの相互作用で運用ルールが揺れる。
- **認識外 verb を AST に保持する**ことで translate アダプタが `list` / `search` / `execute` 等を非破壊で round-trip できる。recognized set の拡張は将来 Issue で個別に議論する。

## 却下した案

### Form A — flag-style tags（`resource OrderTable [create, read]`）

タグ名前空間の汚染と、役割タグ（`[external]`）と動作タグの混在による可読性低下が最大の懸念。`[create, read]` は短く書けるが、その便益は v1 段階では小さい（CRUD は通常 1〜2 verb）。スタイルセレクタとの干渉も将来の拡張余地を狭める。

### Form C — header shorthand `::` 区切り + property のハイブリッド

字句解析器に新しい区切り記号を導入するコストに対し、得られる短縮の便益が小さい。`handles` / `delivers` が shorthand を持たない一貫性も崩したくない。1 行で済ませたければ Form B の `operations create, read` でも十分短い。

### `[external]` を CRUD 表現に再利用する

`[external]` は所在（外部システムかどうか）を表すリソース役割で、操作種別ではない。混ぜると意味の階層が壊れる。

### 認可モデルと統合する（Issue #832 と束ねる）

CRUD 表現は「何をしているか」、認可は「誰が許されているか」で別レイヤ。先に CRUD だけを入れ、認可は別 Issue で独立議論する方が両方の設計余地を確保できる。

### AST 上で `tags` / `annotations` と同階層のトップレベルプロパティに昇格させる

`handles` / `delivers` / `team` が一律 `properties` 配下である慣例に揃え、controlled vocabulary（CRUD）を任意語彙（tags）と同階層に並べないために `properties.operations` に留める。

## 確認事項（follow-up 候補）

- recognized set への `list` / `search` / `execute` 追加要否（translate アダプタの実態を見ながら別 Issue で判断）
- NodeDetailPanel への `operations` 表示（v2 の renderer 拡張で扱うか別 Issue）
- 書き込み／読み取りエッジの視覚的差別化（v2 で個別 Issue 化）
