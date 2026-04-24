---
id: ADR-20260417-01
title: "`translate --from openapi` のデフォルトをリソース単位の usecase 集約に変更する"
status: accepted
date: 2026-04-17
topic: cli
depends_on:
  - ADR-20260409-02
scope:
  packages:
    - cli
---

# ADR-20260417-01: `translate --from openapi` のデフォルトをリソース単位の usecase 集約に変更する

- **日付**: 2026-04-17
- **ステータス**: 決定済み
- **関連**:
  - Issue #643, PR #676
  - `packages/cli/src/translate/openapi.ts`
  - `packages/cli/src/translate/translator.ts`
  - `packages/cli/src/index.ts`
  - `docs/acceptance/0053-translate-openapi-db.md`

## 背景

`karasu translate` は ADR-20260409-02 で導入された外部スキーマ → `.krs` 変換機構であり、`--from openapi` は、OpenAPI の HTTP オペレーションを 1 つずつ `.krs` の `usecase` に変換していた。標準的な REST リソース（`GET /orders` / `POST /orders` / `GET /orders/{id}` / `PUT /orders/{id}` / `PATCH /orders/{id}` / `DELETE /orders/{id}`）を変換すると 1 リソースあたり 6 個前後の usecase がフラットに並ぶ。

アーキテクチャモデリングの観点では、これらの個別オペレーションは「Order を管理する」という 1 つのユースケースに相当することがほとんどで、6 個のフラットな usecase は以下の問題を引き起こしていた:

- **ドリルダウンビューがノイジー**: service ブロックの中がエンドポイント一覧で埋め尽くされ、本来読みたいサービス境界・ドメイン構造が視認できない
- **読み手が毎回メンタルでグルーピングする必要**: 「この 6 個は Order リソースのこと」と頭の中で括り直さないと意味が取れない
- **ドメイン未割当て警告が過多**: 生成直後は domain に未所属のため、6 リソース x 6 メソッド = 36 件の "not assigned to any domain" 警告が出る

Issue #643 はこの問題を言語側（`usecase group` 等）ではなく **translate の出力側** で解く提案だった。言語語彙に新概念を追加すると `system → service → domain → usecase → resource` 階層全体に波及するが、translate 出力の改善だけで痛みの大部分は消え、言語変更が本当に必要かの判断材料も得られる。

## 決定

### 1. デフォルトを「リソース単位で集約」に変更する

`translate --from openapi` のデフォルト出力を、オペレーション単位から **リソース単位** に変える。同じリソースに属する全オペレーションを 1 個の `usecase Manage<Resource>` に畳み込む。

```krs
service ECommerce {
  usecase ManageOrders {
    label "manage orders"
    description """
      Operations:
      - GET /orders — List all orders
      - POST /orders — Place a new order
      - GET /orders/{id}
      - DELETE /orders/{id}
      - POST /orders/{id}/cancel — Cancel an order
      """
  }
}
```

### 2. リソース推論ルール: パスの最初の非パラメータセグメント

パスを `/` で分割し、以下の順で処理する:

1. 空セグメントと `{param}` 形式のパラメータセグメントを除外
2. 先頭から `api` および `^v\d+$` に一致するプレフィックスセグメントをスキップ
3. 残った最初のセグメントをリソース名とする

例:
- `/orders` → `orders`
- `/orders/{id}/cancel` → `orders`（`cancel` アクションも親リソースに畳み込む）
- `/orders/{id}/items/{itemId}` → `orders`（ネストされた子リソースも親に畳み込む）
- `/api/v1/orders` → `orders`（API / バージョンプレフィックスをスキップ）
- `/{id}` → 推論不能 → オペレーション単位での出力にフォールバック

グループ化のキーは `toLowerCase()` で正規化し、`/orders` と `/Orders` のような大小文字違いは 1 グループに畳み込む（`toPascalCase` で同じ ID に解決されて衝突するのを防ぐため）。

### 3. オペレーション情報は `description` ブロックで保持する

畳み込み後も各オペレーションを追跡できるよう、`description """..."""` の構造化アノテーションとして一覧を保持する。OpenAPI の `summary` があれば `METHOD path — summary` 形式で併記する。

コメント（`// Operations: ...`）ではなく `description` を採用した理由:
- コメントはパーサで捨てられ、preview の詳細パネルに出ない
- `description` はノードのプロパティとして残り、再フォーマット・再パースに耐える
- `.krs` ユーザーが他のドキュメント用途で書く `description` と同じ構造を使う

### 4. 旧動作は `--granularity operation` で opt-in で維持する

per-operation 出力は廃止せず、`--granularity operation` フラグで引き続き選択できる。`resource`（デフォルト）と `operation` の 2 値だけをサポートする。

```
karasu translate --from openapi spec.yaml                        # グルーピング（デフォルト）
karasu translate --from openapi spec.yaml --granularity operation # 1 オペレーション = 1 usecase
```

### 5. ラベルはセパレータをスペースに置換する

リソース名に `-` / `_` が含まれる場合、ID は `toPascalCase` で正規化する（`ManageOrderItems`）が、ラベルはハイフン/アンダースコアをスペースに置換して自然な英語に近づける（`"manage order items"`）。

## 理由

- **痛みの大部分を言語変更なしで解消できる**: 6 → 1 の削減はドリルダウンビューと警告パネル両方で体感できるノイズ低減になる。言語側の抽象追加は設計・ドキュメント・マイグレーション全てに波及するので、まず translate 側で解決できるかを検証してから判断する。
- **「manage X」という粒度は多くの REST API で適切**: 典型的な CRUD リソースの 6 メソッドは、サービス境界を議論するレベルでは区別する必要がほとんどない。「このサービスは Order を管理する」で十分。
- **サブパス（アクション/ネスト）も親に畳むのが安定**: `/orders/{id}/cancel` を独立 usecase にするか親に畳むかは OpenAPI 定義から判別できない。最も集約的な解釈（親に畳む）をデフォルトにすれば、少なくともビューはクリーンに保たれる。細粒度が必要なら `--granularity operation` で明示的に opt-in する、という原則に寄せる。
- **`description` は情報ロスなく UI に残る**: コメントだと生成後にユーザーが編集した時点で「何のオペレーションから生まれたか」の手がかりが失われる。構造化プロパティならパーサ経由で保持され、詳細パネルで常に参照できる。
- **大小文字違いの吸収**: `/orders` と `/Orders` が混在する spec は稀だが、混在した場合に duplicate usecase id となってパーサエラーになるのは防ぎたい。低コストな正規化で回避できる。
- **互換性確保**: per-operation 出力に依存する既存パイプライン（CI で usecase 名を grep している等）を破壊しないため、旧動作をフラグで維持する。

## 却下した案

### 案 A: 言語側に `usecase group` 概念を追加する

Issue #643 で明示的に out-of-scope とした。`system → service → domain → usecase → resource` の階層に新しいレイヤを挿入すると、ネスト可否・エッジの跨ぎ可否・ドリルダウンタブでの扱いなど設計判断が波及する。translate 出力の改善で痛みが消えるなら、言語変更は当面不要。必要性が残れば別途 Design Doc で議論する。

### 案 B: リソースの推論ルールを「最後の `{id}` の直前のセグメント」にする

Issue 本文で検討されたルールだが、`/orders`（パラメータなし）や `/{id}` のようなパラメータのみのケースでフォールバックが必要になり、全体として場合分けが増える。「最初の非パラメータセグメント + プレフィックススキップ」の方がルールが単純で予測しやすい。

### 案 C: OpenAPI の `tags` でグルーピングする

`tags` はリソース粒度とほぼ一致することが多いが、必ずしも一致しない（複数タグ・クロスカット的なタグが珍しくない）。また tags を付けていない spec もそれなりにある。パス構造の方がほぼ常に存在するので、デフォルトの推論ソースとしては path が安定。将来 `--granularity tag` を追加する余地は残す。

### 案 D: ネストされたサブリソース（`/orders/{id}/items`）を独立したグループにする

「items は orders に属するサブエンティティだから独立表示すべき」という直感もあるが、OpenAPI パスからはサブリソース（コレクション）とアクション（`cancel`）の区別がつかない。一貫した解釈のため、どちらも親リソースに畳み込む。細粒度が必要なら `--granularity operation` で全オペレーション見える化する。

### 案 E: `// Operations: ...` コメントで情報を残す

コメントはパーサで捨てられるため、preview の詳細パネルに出ない。ユーザーが出力を手で編集した後に「これは何から生まれた usecase か」を辿る手段がなくなる。`description` の方が情報を UI に残せて再パースにも耐える。

### 案 F: ラベルもリソース名の原文ケーシングを保つ（例: `"manage Orders"`）

`toPascalCase` で作った ID との対比で label も PascalCase にする案もあるが、`label "manage orders"` の方が自然な英語として読める。ID は識別子として PascalCase、ラベルは表示用として小文字＋スペース、という責任分離を明確にする。

## 実装への影響

1. **更新**: `packages/cli/src/translate/openapi.ts` — `inferResource` / `collectOperations` / `emitOperationUsecase` / `emitResourceUsecases` に分解。グループキーは lowercase、displayName で元ケーシング保持。
2. **更新**: `packages/cli/src/translate/translator.ts` — `TranslatorContext` に `granularity?: "resource" | "operation"` を追加。
3. **更新**: `packages/cli/src/index.ts` — `--granularity <mode>` フラグを追加、Commander action 層で値を検証。
4. **更新**: `packages/cli/src/translate/translate.e2e.test.ts`, `openapi.test.ts` — 新デフォルト用の期待値に差し替え、グルーピング関連テストを追加。
5. **更新**: `packages/cli/src/{append,apply,insert,remove}.e2e.test.ts` — パイプラインテストの期待 usecase 名を新デフォルト（`ManageOrders` / `ManagePayments` 等）に更新。
6. **AT**: `docs/acceptance/0053-translate-openapi-db.md` — AT-0053-01/02/03/06 を新出力に合わせて更新、AT-0053-09（`--granularity operation` opt-out）と AT-0053-10（不正値の拒否）を追加。e2e カバー状況をマーク。

## 将来の拡張余地

- **`--granularity tag`**: OpenAPI `tags` をグルーピングキーにするモード。必要性が出てきたら追加。
- **`--granularity nested-resource`**: `/orders/{id}/items` を親と分離するモード。現状誰も要求していないので追加しない。
- **言語側 `usecase group`**: translate 出力の改善だけでは不十分な痛みが残ったら改めて Design Doc で議論する。
