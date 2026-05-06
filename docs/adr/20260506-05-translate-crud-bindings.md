---
id: ADR-20260506-05
title: translate adapter で usecase → resource バインディング + 任意 CRUD 装飾を emit する
status: accepted
date: 2026-05-06
topic: cli
related_to:
  - ADR-20260503-01
  - ADR-20260502-01
  - ADR-20260430-03
  - ADR-20260417-01
  - ADR-20260419-01
scope:
  packages:
    - cli
assumptions:
  - "file: packages/cli/src/translate/openapi.ts"
  - "file: packages/cli/src/translate/db.ts"
  - "file: packages/cli/src/translate/translator.ts"
  - "file: packages/cli/src/translate/bindings.test.ts"
  - "symbol: packages/cli/src/translate/translator.ts :: TranslatorContext"
  - "grep: packages/cli/src/index.ts :: --emit-bindings"
  - "grep: packages/cli/src/index.ts :: --emit-crud-decoration"
---

# ADR-20260506-05: translate adapter で usecase → resource バインディング + 任意 CRUD 装飾を emit する

- **日付**: 2026-05-06
- **ステータス**: 決定済み
- **実装**: PR #1143（Issue #1104）
- **関連**:
  - ADR-20260503-01: verb 装飾構文 — 本 ADR が emit する装飾の入力先
  - ADR-20260502-01: CRUD マトリクスビュー — 装飾を消費する側
  - ADR-20260430-03: usecase 内 resource の `operations` プロパティ — 本 ADR が emit する構造
  - ADR-20260417-01: openapi resource grouping — 本 ADR が拡張する emit 元
  - ADR-20260419-01: db aggregate grouping — 本 ADR が拡張する emit 元

## 背景

ADR-20260503-01 で `<verb>:<crud>[,<crud>...]` の装飾構文が parser に入り、ADR-20260502-01 のマトリクスビューが装飾を読んで `?` suffix を消すようになった。一方で `karasu translate openapi` / `karasu translate db` は **そもそも `usecase` → `resource` バインディングを emit していない** 状態だった：

- `packages/cli/src/translate/openapi.ts` は `service` 直下に `usecase` ブロックを出すが body は label / description のみ。`resource` ブロックは無い。
- `packages/cli/src/translate/db.ts` は `database` ブロックと `table` 子だけを emit し、`usecase` も `service` も出さない。

装飾を emit する以前にバインディング自体を作る必要がある。

## 決定

`karasu translate` に opt-in flag を 2 つ追加する：

- `--emit-bindings` — usecase 配下に `resource` ブロックを生成する（bare verb）
- `--emit-crud-decoration` — 上記に加え `<verb>:<crud>` 装飾を付ける。`--emit-bindings` を含意

emit 対象は granularity 別に決める：

| | バインディング emit | 装飾 emit |
| --- | --- | --- |
| openapi `granularity=resource` | する | flag が有効なら付く |
| openapi `granularity=operation` | しない（warning） | しない |
| db `granularity=aggregate` | する | flag が有効なら付く |
| db `granularity=table` | しない（warning） | しない |

### openapi: per-resource-group の placeholder resource

`Manage<Resource>` usecase の中に 1 ブロック emit する：

```krs
resource <Resource>Resource {
  operations get:read, list:read, post:create, put:update, delete
}
```

infra-side の `<Resource>Resource` 定義は emit しない（OpenAPI からは推測不能）。`.krs` 構文上、`usecase` 内の `resource` は参照宣言として有効。

**list 判定**: GET でかつパスが parameter なし（`/orders`）なら `list`、`/orders/{id}` なら `get`。実装は path に `{` を含まないかで判別。

### db: aggregate ごとに `usecase Manage<Aggregate>` を出す

`database` ブロックは現状互換で出しつつ、`--emit-bindings` 時は同じファイルに：

```krs
service <DbName>Service {
  usecase Manage<Aggregate> {
    resource <DbName>.<AggregateRoot>Table {
      operations select:read, insert:create, update, delete
    }
  }
}
```

aggregate にまとまっていない単独テーブルも 1 usecase / 1 resource として emit。

### SQL → CRUD の対応

| SQL verb | bare emit | 装飾 emit |
| --- | --- | --- |
| SELECT | `select` | `select:read` |
| INSERT | `insert` | `insert:create` |
| UPDATE | `update` | `update`（recognized） |
| DELETE | `delete` | `delete`（recognized） |

現状の db translator は SQL の DML を解析しない（`CREATE TABLE` のみ）。**テーブル単位で常に `select / insert / update / delete` の 4 動詞を emit** する — 物理的に CRUD アクセスの最大集合だから。「DB schema → ER 視点の最大 CRUD 表面」の意。

### HTTP verb 命名は raw を維持

`get` / `post` / `put` / `patch` / `delete` をそのまま使う（`http_get` のような prefix は付けない）。`:` で CRUD と分離されるため衝突しない。

## 理由

- **opt-in 維持**: ADR-20260503-01 が「装飾はオプトイン」と明記している以上、バインディング emit も opt-in が一貫。既存ユーザーの translate 出力が無断で変わるのを避け、`apply` で既存ファイルにマージするユースケースで diff が爆発するのを防ぐ。
- **placeholder resource のみ**: 外部リソース（DB / queue / external API）は OpenAPI から推測できない。空の infra 定義を emit するとノイズになるため、usecase 内の参照宣言だけに留めて infra 側は人間が書く方が pragmatic。
- **list/get 区別**: マトリクスビュー上で list と read-by-id は同じ R 列に入るが、装飾元の動詞を区別しておくと round-trip 時に元の HTTP semantics が失われない。
- **SQL は最大 CRUD 表面**: DML 解析まで含めると本 Issue のスコープが大きくなりすぎる。schema レベルで「テーブルが持ちうる CRUD」を全部出しておけば、マトリクスは保守的に「触れる範囲」を示す。実利用ベースの絞り込みは将来 DML 解析を入れたときに対応。
- **HTTP verb raw**: 装飾なし運用と語彙が一貫し、`operations create, list:read` のような混在が許容される。`delete` は HTTP/SQL/CRUD の三方で同名で recognized なので bare で OK。

## 却下した案

### デフォルトでバインディング emit

既存 `.krs` を再生成すると無関係な `resource` 追加で diff が増える。ADR-20260503-01 が「装飾はオプトイン」と明記している以上、バインディングも opt-in が一貫。

### openapi で `<Resource>Resource` の infra definition も emit する

外部リソース（DB / queue / external API）は OpenAPI から推測できない。空の `<Resource>Resource { }` を別ブロックで emit すると「実体不明な infra 定義」がノイズとして残る。usecase 内の参照宣言だけに留めて、infra 側は人間が書く方が pragmatic。

### HTTP verb に prefix（`http_get`）

将来の collision 想定が薄く、現実の `.krs` で `get` 単独は recognized でないため装飾必須 → 結局 `get:read` になる。prefix を付けると装飾の収まりが悪い。

### `operation` / `table` granularity でもバインディングを emit

`operation` granularity の openapi は「1 HTTP operation = 1 usecase」が出る。そこに 1 動詞だけ持つ resource block を emit すると非常に冗長で、マトリクスが usecase ごとに 1 行 1 列しか持たない縮退表示になる。利用価値が低いので非対応。

### SQL DML を実際にパースして使われている動詞だけ emit

CRUD バインディングの目的は「マトリクス上で resource × operation が見えること」。DML の実利用情報まで取り込むのは scope が大きすぎる。本 ADR では「schema → max CRUD surface」の意味論で固定し、必要が出てから別 Issue で DML 解析を追加。

## Follow-up

- **system block への wrap** — translate 出力は top-level に `service` / `database` を吐くため、`karasu matrix` が `system { ... }` 内の infra しか見ない関係で直接 matrix に食わせられない。`--system <Name>` flag で wrap するオプションは Issue #1154 で追跡。
- **装飾デフォルト on 化** — 後続 Issue で操作実績を見てから判断。
- **`apply` の resource block レベルの merge 改善** — 別 Issue。
