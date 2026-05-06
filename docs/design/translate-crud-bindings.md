---
title: translate adapter で usecase → resource バインディング + 任意 CRUD 装飾を emit する
status: 検討中
date: 2026-05-06
related_issue: "#1104"
related_to:
  - ADR-20260503-01
  - ADR-20260502-01
  - ADR-20260417-01
  - ADR-20260419-01
---

# Design Doc: translate adapter で usecase → resource バインディング + 任意 CRUD 装飾を emit する

- **対象 Issue**: #1104
- **関連 ADR**:
  - ADR-20260503-01（verb 装飾構文）— 装飾の入力先
  - ADR-20260502-01（CRUD マトリクスビュー）— 装飾を消費する側
  - ADR-20260417-01（openapi resource grouping）
  - ADR-20260419-01（db aggregate grouping）
- **関連 PR**: #1100（装飾構文の本体実装、本機能を defer した）

## 背景

ADR-20260503-01 で `<verb>:<crud>[,<crud>...]` の装飾構文が parser に入り、ADR-20260502-01 のマトリクスビューが装飾を読んで `?` suffix を消すようになった。一方で `karasu translate openapi` / `karasu translate db` は **そもそも `usecase` → `resource` バインディングを emit していない**：

- `packages/cli/src/translate/openapi.ts` は `service` 直下に `usecase` ブロックを出すが body は label / description のみ。`resource` ブロックは無い。
- `packages/cli/src/translate/db.ts` は `database` ブロックと `table` 子だけを emit し、`usecase` も `service` も出さない。

装飾を emit する以前にバインディング自体を作る必要がある。

## 目的

CRUD-equivalent な signal を持つ translate adapter（HTTP method、SQL 動詞）が、

1. `usecase` → `resource` のバインディング骨格を emit する
2. `--emit-crud-decoration` flag で各 operation を装飾済み verb として出力する

## スコープ

| | バインディング emit | 装飾 emit (`--emit-crud-decoration`) |
| --- | --- | --- |
| openapi | granularity=resource のときのみ | 同左で flag が有効なら装飾付き |
| db | granularity=aggregate のときのみ | 同左で flag が有効なら装飾付き |
| その他 (`operation` / `table` granularity) | 既存挙動を維持（バインディング非出力） | 装飾も非対象 |

`operation` / `table` は「ソースの粒度をそのまま見たい」という意図なので、勝手に usecase/resource をぶら下げない。flag を渡された場合は warning を出して無視する。

## 決定事項

### D1. デフォルトは opt-in（`--emit-crud-decoration`）

ADR-20260503-01 の方針を踏襲。バインディング emit 自体も「`resource` / `aggregate` granularity の追加挙動」として opt-in 扱いにする — すなわち `--emit-bindings` のような追加 flag を導入し、何も渡さないときの出力は現状互換。

**理由**: 既存ユーザーの translate 出力が無断で変わるのを避ける。`apply` で既存ファイルにマージするユースケースで diff が爆発するのを防ぐ。

flag 設計：
- `--emit-bindings`：usecase 配下に resource ブロックを生成する（bare verb）
- `--emit-crud-decoration`：上記に加えて `<verb>:<crud>` 装飾を付ける。`--emit-bindings` を含意する（指定が冗長にならないよう、後者だけで両方有効化）

### D2. openapi: per-resource-group の placeholder resource

`granularity=resource` の `Manage<Resource>` usecase の中に、

```krs
resource <Resource>Resource {
  operations get:read, list:read, post:create, put:update, patch:update, delete
}
```

を 1 ブロック emit する。infra-side の `<Resource>Resource` 定義は **emit しない**（OpenAPI からは推測不能）。`.krs` 構文上、`usecase` 内の `resource` は参照宣言として有効で、他ファイルで定義されていれば import で解決される — 解決されなくても parser は warning に留める。

**list 判定**: GET でかつパスが parameter なし（`/orders` であって `/orders/{id}` ではない）なら `get` ではなく `list:read`（装飾時）/ `list`（bare verb のとき。recognized でないので装飾推奨）にする。実装は path セグメントの末尾が `{...}` でないかで判別。

### D3. db: aggregate ごとに `usecase Manage<Aggregate>` を出す

`database` ブロックは現状互換で出しつつ、`--emit-bindings` 時は同じファイルに

```krs
service <DbName>Service {
  usecase Manage<Aggregate> {
    resource <DbName>.<AggregateRoot>Table {
      operations select:read, insert:create, update, delete
    }
  }
}
```

を追記する。`<DbName>.<AggregateRoot>Table` は dotted path で既存の table 定義を参照する。aggregate にまとまっていない単独テーブルも 1 usecase / 1 resource として emit。

service 名は `<DbName>Service` 固定。`--service <name>` で上書きできるようにする（既存の `--database` と対称）。

### D4. SQL → CRUD の対応

| SQL verb | bare emit | 装飾 emit |
| --- | --- | --- |
| SELECT | `select` | `select:read` |
| INSERT | `insert` | `insert:create` |
| UPDATE | `update` | `update`（recognized） |
| DELETE | `delete` | `delete`（recognized） |
| MERGE / UPSERT | `upsert` | `upsert:create,update` |
| TRUNCATE | `truncate` | `truncate:delete` |

ただし現状の db translator は **SQL の DML を解析しない**（`CREATE TABLE` のみ）。本 PR では「テーブル単位で常に `select / insert / update / delete` の 4 動詞を emit」する — 物理的にはそれが CRUD アクセスの最大集合だから。将来 DML を解析するようになれば実際に使う動詞だけに絞れる。これは「DB schema → ER 視点の最大 CRUD 表面」の意。

### D5. HTTP verb 命名は raw を維持

`get` / `post` / `put` / `patch` / `delete` をそのまま使う（`http_get` のような prefix は付けない）。

**理由**:
- `:` で CRUD と分離されるため衝突しない。
- ユーザーが書く `.krs` の bare 装飾なし運用と語彙が一貫する（`operations create, list:read` のような混在を許容）。
- `delete` は HTTP/SQL/CRUD の三方で同名。recognized 集合に既に入っているので bare で OK、装飾は不要。
- 将来 `get` を別意味の built-in verb として追加する予定は無い。仮に出てきたら ADR で扱う。

### D6. apply との round-trip

`karasu translate ... --apply <file>` は現状「対象ファイルが空ならそのまま書く / 既存ならマージしようとする」挙動。`usecase` ブロックが既に `resource` 子を持つ場合の merge は ADR-20260411-07 の対象外で、現状は **service ブロックを単純上書き** する。

本 PR ではここを変更しない。`--emit-bindings` を `--apply` と併用したときの注意として doc に明記し、新規 export は `--out` でファイル分離するワークフローを推奨する。merge 改善は別 Issue。

### D7. duplicate / collision 対策

- openapi で同じ resource group が複数 service / file から来た場合は既存 ADR-20260417-01 の挙動を踏襲（同じ usecase id にまとめる）。
- db で aggregate root と単独テーブルが同名 usecase を生成する事は無い（aggregate 化された場合は children が usecase emit から外れるため）。
- service / database 名衝突は既存の `--service` / `--database` flag で回避。

## 却下した案

### A. デフォルトでバインディング emit

既存 `.krs` を再生成すると無関係な `resource` 追加で diff が増える。ADR-20260503-01 が「装飾はオプトイン」と明記している以上、バインディングも opt-in が一貫。

### B. openapi で resource definition も emit する

外部リソース（DB / queue / external API）は OpenAPI から推測できない。空の `<Resource>Resource { }` を別ブロックで emit すると「実体不明な infra 定義」がノイズとして残る。usecase 内の参照宣言だけに留めて、infra 側は人間が書く方が pragmatic。

### C. HTTP verb に prefix（`http_get`）

将来の collision 想定が薄く、現実の `.krs` で `get` 単独は recognized でないため装飾必須 → 結局 `get:read` になる。prefix を付けると装飾の収まりが悪い。

### D. `operation` / `table` granularity でもバインディングを emit

`operation` granularity の openapi は「1 HTTP operation = 1 usecase」が出る。そこに 1 動詞だけ持つ resource block を emit すると非常に冗長で、ADR-20260502-01 のマトリクスビューが usecase ごとに 1 行 1 列しか持たない縮退表示になる。利用価値が低いので非対応。

### E. SQL DML を実際にパースして使われている動詞だけ emit

CRUD バインディングの目的は「マトリクス上で resource × operation が見えること」。DML の実利用情報まで取り込むのは scope が大きすぎる。本 Issue では「schema → max CRUD surface」の意味論で固定し、必要が出てから別 Issue で DML 解析を追加。

## 実装方針

### packages/cli

1. `TranslatorContext` に `emitBindings: boolean` / `emitCrudDecoration: boolean` を追加。
2. `OpenApiTranslator.emitResourceUsecases`：bindings ON のとき各 group に resource ブロックを追記。装飾 ON のとき `verb:crud` で出す。`list` 判定は path に `{` を含まない GET を `list` 扱い。
3. `DbTranslator`：bindings ON のとき `service <DbName>Service { ... }` を `database` ブロックに続けて追記。
4. `packages/cli/src/translate/translator.ts` の CLI 引数に `--emit-bindings` / `--emit-crud-decoration` を追加。
5. `--emit-crud-decoration` 単独指定時は `emitBindings = true` を含意。
6. `operation` / `table` granularity と `--emit-*` の併用は warning を出して flag 側を無視。

### packages/core

変更なし。装飾構文と resource block syntax は ADR-20260503-01 / ADR-20260430-03 で実装済み。

## アクセプタンステスト

人間確認が必要なものは無し（CLI 出力は文字列比較で完結）。Vitest で十分。実装 PR で `packages/cli/tests/translate-bindings.test.ts` を追加：

- AT-1: openapi `granularity=resource` + `--emit-bindings` で `Manage<Resource>` usecase 内に resource block が出る
- AT-2: openapi で同上 + `--emit-crud-decoration` で `get:read, list:read, post:create, ...` 装飾が付く
- AT-3: openapi で `/orders/{id}` の GET は `get:read`、`/orders` の GET は `list:read` になる
- AT-4: openapi `granularity=operation` + `--emit-bindings` は warning + 既存挙動
- AT-5: db `granularity=aggregate` + `--emit-bindings` で `service <Db>Service` が `database` に続いて emit される
- AT-6: db で同上 + `--emit-crud-decoration` で `select:read, insert:create, update, delete` が付く
- AT-7: db で aggregate にまとめられた children テーブルは usecase resource として現れない（root のみ）
- AT-8: 出力が parser を通り、ADR-20260502-01 のマトリクスビューが `?` suffix を出さないこと（既存マトリクステストの fixture を再利用）

## Out of scope

- recognized CRUD 集合の変更
- authorization 周り（Issue #832 領域）
- 装飾デフォルト on 化（後続 Issue で操作実績を見てから判断）
- `apply` の resource block レベルの merge 改善

## Open questions（implementation 中に解決）

- `--emit-bindings` の short name を切るか（`-b` は他で使ってないか確認）
- openapi で path operation の `summary` を resource description に持ち上げるか（現在は usecase description に入っている。重複を避けるため bindings ON 時は resource 側に description を出さない方針で実装）
