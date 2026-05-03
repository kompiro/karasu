# Verb-decoration syntax for usecase resource operations (1:N CRUD mapping)

- **日付**: 2026-05-02
- **ステータス**: 検討中
- **関連**:
  - Issue: [#1082](https://github.com/kompiro/karasu/issues/1082)
  - 既存 ADR: [ADR-20260430-03](../adr/20260430-03-resource-crud-operations.md)（`operations` プロパティ導入 — 本提案はその syntax 拡張）
  - 既存 ADR: [ADR-20260502-01](../adr/20260502-01-crud-matrix-view.md)（CRUD マトリクスビュー — `?` suffix を吸収する consumer）
  - 仕様: [docs/spec/syntax.md](../spec/syntax.md) §`Resource operations`
  - 既存実装: [`packages/core/src/parser/parser.ts`](../../packages/core/src/parser/parser.ts) `parseHandlesList()` / `unknown-resource-operation` 警告生成箇所
  - 既存実装: [`packages/core/src/spec/operations.ts`](../../packages/core/src/spec/operations.ts) `isRecognizedResourceOperation` / `isWriteOperation`
  - 関連 translate adapter: `packages/cli/src/translate/openapi/`、`packages/cli/src/translate/db/`

## 背景・課題

ADR-20260430-03 で `usecase` 内 `resource` に `operations` プロパティ（CRUD verbs）が乗った。recognized set は `create` / `read` / `update` / `delete` の 4 種で、それ以外の verb（`list` / `search` / `execute` / `enqueue` / `dequeue` …）は AST に保持されつつ `unknown-resource-operation` warning が出る。

ADR-20260502-01 の CRUD マトリクスビューは「装飾無しの unrecognized verb」を cell に `?` suffix（`R?` 等）として表示し、ユーザーに「CRUD verb で書き直して」と誘導する設計を採った。しかし現実には:

- `list` / `search` は意味的には `read`
- `enqueue` / `publish` は `create`
- `dequeue` / `consume` は `delete`
- `replace` / `upsert` は **`create` + `delete`**（in-place ではない物理 delete-insert）

といった「CRUD には落とせるがユーザーの語彙では別 verb で呼びたい」シーンがある。これを `read` / `create` 等に書き直すと:

- ドメイン語彙が失われる（`enqueue` の方が `create` より意味が伝わる）
- translate アダプタ（OpenAPI / DB schema）の round-trip が破壊的になる
- 1:N（`replace` → C+D）が `update` で潰れて分析の精度が下がる

そこで **`<verb>:<crud>[,<crud>...]`** という装飾構文を `operations` プロパティに導入する。

## 制約・前提

- **既存の controlled vocabulary（`create` / `read` / `update` / `delete`）は維持する**。装飾は追加レイヤであって recognized set の置き換えではない。
- **既存の `operations create, read` 形式は破壊しない**。同じプロパティに装飾あり/なしを混在できる必要がある。
- **AST に raw verb 文字列を残す方針**（ADR-20260430-03）は維持する。translate アダプタの round-trip を壊さない。
- 装飾構文は `usecase` 内 `resource` の `operations` プロパティ **のみ** に適用される。`handles` / `delivers` などの他のリスト系プロパティには波及しない。
- Tokenizer の `TokenType.Colon` は既に存在する（style parser 用）が、`.krs` 本体パーサーでは未使用。`.krs` 内で `:` を文法トークンとして使うのはこれが初めてになる — 将来的な構文拡張との衝突を考えて選定する。

## 設計の選択肢

### Q1. 構文形式

#### Option A — `verb:crud` / `verb:crud,crud` （推奨）

```krs
operations list:read, search:read, replace:create,delete
```

- **Pros**: 短い・読みやすい・SQL/ORM 慣習（`field: type`）に近い。`:` はパーサー本体未使用なので衝突なし。1:N が `verb:c1,c2,c3` で素直に表現できる。
- **Cons**: 1:N で右辺がカンマ区切りなので、「`,` が verb 区切りなのか CRUD 区切りなのか」をパーサーで文脈判定する必要がある（後述 Q1.1）。

#### Option B — `verb -> crud` / `verb -> [crud, crud]`

```krs
operations list -> read, replace -> [create, delete]
```

- **Pros**: 矢印で「マッピングしている」という意図が視覚的に明確。1:N は `[]` で grouping するので曖昧さなし。
- **Cons**: `->` は karasu のエッジ構文（`A -> B "label"`）で既に意味があり、文脈被りで読み手が混乱する。エッジは「ノード間の関係」を表すのに対し、ここでは「verb のメタデータ」なのでセマンティクスがズレる。`[]` は `[external]` タグと衝突しないが、ユーザーが「タグ」と誤読する余地がある。

#### Option C — `verb [crud]` / `verb [crud, crud]`

```krs
operations list [read], replace [create, delete]
```

- **Pros**: タグ風で karasu の既存構文に馴染む。
- **Cons**: `[external]` などのノードタグと意味階層が違うのに同じ表記になり、混乱を招く。CRUD 装飾は「verb の属性」、タグは「ノードの分類」で本来別レイヤ。

##### Q1.1（Option A 採用時）— 1:N の右辺カンマ曖昧性をどう解消するか

`operations replace:create,delete, search:read` という列を見たときに:

- (i) `replace:create,delete` を 1 verb の 1:N と読む（推奨）
- (ii) `replace:create` と独立した `delete` という 2 verb と読む

の 2 通りが構文上ありうる。**(i) を採用** する案。理由:

- パーサー側は「直前トークンが `<verb>:<crud>` パターンならカンマの後の identifier を CRUD 候補として継続消費し、それが `:` を持たない CRUD verb なら 1:N の続き、`:` を持つなら次の verb」と判定できる。
- ただし「`delete`」のような bare verb が 1:N の続きなのか次の verb の頭なのかは曖昧。明確化のために **「装飾の右辺は次の verb トークン直前まで」というルール** を入れる:
  - 次の `verb:` パターン or リスト末尾までが現 verb の CRUD リスト
  - `replace:create,delete, list:read` → `replace` → `[C, D]`、`list` → `[R]`
  - `replace:create,delete, search` → `replace` → `[C, D]`、`search` → 装飾なし（warning + `?` suffix）

#### 採用候補

**Option A（`verb:crud[,crud]`）+ Q1.1 の (i) 解釈** を推奨。

### Q2. 右辺の語彙

#### Option α — 識別子フル形式 `create` / `read` / `update` / `delete`（推奨）

```krs
operations list:read, replace:create,delete
```

- **Pros**: 装飾なしの既存形式と同じ語彙で一貫。grep しやすい。
- **Cons**: 4 文字 vs 1 文字で冗長。

#### Option β — 大文字頭文字 `C` / `R` / `U` / `D`

```krs
operations list:R, replace:C,D
```

- **Pros**: 短い。CRUD マトリクスの cell 表記と直接対応。
- **Cons**: 装飾なし形式（`create` / `read` …）と語彙が割れて学習コスト 2 倍。`C` / `R` 等の 1 文字 identifier は将来的なノード id 命名と衝突する余地がある。

#### Option γ — 両方受理（identifier または 1 文字）

- **Pros**: 書き手の好みに応える。
- **Cons**: フォーマッタが正規化先を決める必要があり、無用な選択肢が増える。

#### 採用候補

**Option α（識別子フル形式）** を推奨。装飾なし形式との一貫性を最優先。

### Q3. AST 表現

#### Option I — `string[]` のまま生 verb を保持し、解釈は consumer 側で行う

```ts
ResourceNode.properties.operations = ["list:read", "replace:create,delete", "create"];
```

- **Pros**: AST 変更ゼロ。translate アダプタの round-trip ロジックは無変更。`@karasu-tools/core` の type 互換性が保たれる。
- **Cons**: matrix / write-dominates / format（fmt）が個別に同じ parsing 関数を呼ぶことになる。

#### Option II — 構造化 `Operation[]`（推奨）

```ts
interface ResourceOperation {
  verb: string;                     // "list", "create", "replace"
  decoratedAs?: CrudVerb[];         // [read] / undefined / [create, delete]
  /** Source slice for round-trip — preserves original spelling, comments not included. */
  raw: string;
}

ResourceNode.properties.operations: ResourceOperation[];
```

- **Pros**: 解釈ロジックを 1 箇所（parser）に集約。consumer（matrix / write-dominates / fmt / translate adapter）は構造化された値を読むだけ。型レベルで「装飾あり/なし」の区別が明示される。
- **Cons**: AST shape の breaking change。`@karasu-tools/core` の API 互換性に影響（ただしまだ pre-1.0 なので許容範囲）。

#### Option III — 構造化 + `string[]` の互換 getter

`properties.operations: ResourceOperation[]` を一級として持ち、後方互換のために `properties.operationsRaw: string[]` または `getOperations()` ヘルパーを用意。

- **Pros**: 段階的移行。
- **Cons**: 重複データソースを維持する持続的コスト。

#### 採用候補

**Option II（構造化 `Operation[]`）** を推奨。`@karasu-tools/core` は外部公開前なので breaking change を受け入れられるタイミング。matrix / spec/operations.ts の `isWriteOperation` / format を全部 `decoratedAs` ベースで書き直す。

### Q4. `isWriteOperation` の write-dominates 判定の改訂

ADR-20260430-04 の write-dominates 判定（`create` / `update` / `delete` のいずれかが含まれていれば write）は装飾構文と整合させる必要がある。

- **採用**: `decoratedAs` がある場合は `decoratedAs` の集合で判定、無い場合は `verb` 自体が recognized verb なら従来通り判定。
- 例: `replace:create,delete` → `decoratedAs = [create, delete]` → write、`list:read` → `decoratedAs = [read]` → not write、`enqueue`（装飾なし unrecognized）→ not write（保守的・現状維持）。

### Q5. 過剰装飾の lint guidance

「単純な in-place 書き換えに `:create,delete` を使うのは `update` を推奨」のような warning を出すべきか。

#### Option L1 — Warning を出す（`overdecorated-replace-as-create-delete`）

`verb:create,delete` パターンで verb 自体が `update` / `replace` / `set` / `put` 系の場合に warning。

- **Pros**: 乱用を抑制。spec ドキュメントだけだと読まれない。
- **Cons**: false positive のリスク（`set` でも物理的に delete-insert なケースはある）。warning 抑制機構が必要になる。

#### Option L2 — spec / docs のガイドラインのみ（推奨）

`docs/spec/syntax.md` § `Resource operations` に「物理削除 + 物理挿入を伴う場合のみ `:create,delete` を使い、論理的に同一エンティティの書き換えなら `update` を使ってください」と記載。warning は出さない。

- **Pros**: 実装コストゼロ。false positive ゼロ。著者の意図を尊重する。
- **Cons**: ガイドラインを読まないユーザーが乱用する可能性。

#### 採用候補

**Option L2（ガイドラインのみ）** を推奨。Lint ルールは将来的に運用実績で判断する余地を残す。

### Q6. translate アダプタの自動装飾

`translate openapi` / `translate db` は HTTP メソッド / SQL 文から CRUD 相当を内部で持っている（ADR-20260417-01 / 20260419-01）。装飾構文があれば、捨てている情報を保持できる。

#### Option T1 — デフォルトで自動装飾を出力

`HTTP GET /products` → `operations list:read`、`SQL DELETE FROM` → `operations delete`、など。

- **Pros**: round-trip で情報損失ゼロ。ユーザーが手で装飾を書く手間を減らす。
- **Cons**: 既存の `karasu translate` 出力フォーマットが変わる（生成済み `.krs` ファイルとの diff が出る）。

#### Option T2 — オプトインフラグで装飾出力（推奨）

`karasu translate openapi --emit-crud-decoration` のような flag。default は従来通り bare verb（`operations list`）を出す。

- **Pros**: 既存ユーザーへの影響ゼロ。実装も既存パスを残せる。
- **Cons**: ユーザーが flag を知らないと恩恵を受けられない。

#### Option T3 — フェーズ移行（次の major で T1 を default）

T2 を v1 で導入し、後続の Issue で default 切り替えを議論。

#### 採用候補

**Option T2（オプトイン）+ T3（次フェーズで default 化を検討）** を推奨。本 Issue のスコープでは flag のみ実装し、default 切り替えは別 Issue。

### Q7. Diagnostic codes

新規:
- **`invalid-crud-decoration`**（error）: `verb:` の後に CRUD verb 以外（`list:foobar`）が来た場合。
- **`empty-crud-decoration`**（error）: `verb:` で右辺が空（`list:,`）の場合。
- **`duplicate-crud-decoration-target`**（warning）: `verb:read,read` のように右辺で重複した場合（dedup する）。

既存挙動の変更:
- **`unknown-resource-operation`**（warning）: 装飾無しの unrecognized verb に対しては従来通り出す。装飾済みなら出さない（装飾でユーザーが意図表明済み）。

### Q8. fmt の正規化

`pnpm karasu fmt` は装飾をどう整形するか:

- 1 verb 1 行ではなく、装飾の塊で grouping（`replace:create,delete` をスペース無しで 1 トークンとして扱う）
- 右辺カンマの後にスペースを入れる: `verb:c, d` ではなく `verb:c,d`（タイトに）か、`verb: create, delete` か。
- **採用**: タイトに `verb:c,d`（スペースなし）。verb 区切りカンマと CRUD 区切りカンマの視覚差別化のため。装飾なし verb は従来通り。

## 決定（提案）

1. **構文**: `<verb>:<crud>[,<crud>...]`、識別子フル形式（`list:read`、`replace:create,delete`）。1:N の右辺カンマは「次の verb トークン or リスト末尾まで」のルールで解釈。
2. **AST**: `ResourceNode.properties.operations: ResourceOperation[]` に breaking change。`{ verb, decoratedAs?, raw }` の構造体配列。
3. **`isWriteOperation`** を `decoratedAs` ベースに改訂。装飾なし unrecognized verb は引き続き not write 扱い（保守的）。
4. **Lint**: `overdecorated-replace-as-create-delete` 警告は **入れない**（spec / docs のガイドラインのみ）。
5. **translate**: `--emit-crud-decoration` opt-in flag（v1）、default 切り替えは別 Issue。
6. **Diagnostic codes**: `invalid-crud-decoration` (error)、`empty-crud-decoration` (error)、`duplicate-crud-decoration-target` (warning)。装飾済みは `unknown-resource-operation` を発火しない。
7. **fmt**: 装飾の右辺はスペースなし（`verb:c,d`）。

### 実装方針（順序）

1. **`packages/core/src/parser/parser.ts`** の `parseHandlesList`（または `operations` 専用の `parseOperationsList` を新設）で装飾構文を受理。raw 文字列も保持。
2. **`packages/core/src/types/ast.ts`** に `ResourceOperation` 型追加、`ResourceNode.properties.operations` の型を `ResourceOperation[]` に変更。`DiagnosticParamsByCode` に新規 3 コード追加。
3. **`packages/core/src/spec/operations.ts`** の `isWriteOperation` を `ResourceOperation[]` 受理に書き換え。`isRecognizedResourceOperation` は据え置き。
4. **`packages/core/src/view/crud-matrix-extract.ts`** の `classifyVerbs` を `ResourceOperation[]` 経由に書き換え、`?` suffix 判定を「装飾無し かつ unrecognized」に絞る。
5. **`packages/core/src/view/view-extract.ts`** の `deriveUsecaseResourceNodes` の `isWriteOperation` 呼び出しを更新。
6. **`packages/core/src/formatter/formatter.ts`** で装飾の整形ルール（スペースなし右辺）を実装。
7. **`packages/cli/src/translate/openapi/`** / **`db/`** に `--emit-crud-decoration` flag を追加、ON 時に装飾済み verb を emit。
8. **`docs/spec/syntax.md`** § Resource operations に装飾構文と「物理 delete-insert と論理 in-place 書き換えの線引き」ガイドラインを追記。
9. **`examples/feature-samples/crud-matrix.krs`** の `SearchOrders { operations read, list }` を `operations read, list:read` に更新し、装飾の実例を見せる。
10. **AT-1082** を `docs/acceptance/` に追加。

### Breaking change の影響範囲

`@karasu-tools/core` の `ResourceNode.properties.operations` 型変更:

- 内部 consumer: `view-extract.ts`、`crud-matrix-extract.ts`、`spec/operations.ts`、`formatter.ts`、`translate/openapi/`、`translate/db/` — すべて自リポジトリ内で同一 PR で更新可能。
- 外部 consumer: 現時点で `@karasu-tools/core` は npm 公開されていない（pre-1.0、local workspace 限定）。breaking change を入れるならこのタイミングが安全。

## 理由

- **`:` 区切りは衝突なし** で karasu 本体パーサーに新しい記号を導入するコストが小さい。`->` はエッジ構文と被り、`[]` はタグと被る。
- **識別子フル形式** で装飾なし形式と語彙が一貫し、ユーザーが「装飾は短縮形」と誤解せずに済む。
- **構造化 AST** にすることで、解釈ロジックを parser に集約できる。`isWriteOperation` / matrix / fmt が個別に文字列を再 parse する重複を防げる。
- **Lint を出さない** ことで false positive を避けつつ、ガイドラインで方向を示す。乱用が顕在化したら後付けで lint を入れるオプションを残す。
- **translate のオプトイン** で既存ユーザーへの影響をゼロにし、装飾構文の習熟期間を確保する。default 切り替えは運用実績を見てから別 Issue で議論。
- **`unknown-resource-operation` を装飾済みでは出さない** ことで、装飾を入れたユーザーへの「警告で報われる」体験を担保する。

## 却下した案

### `->` 構文（Option B）

`A -> B` のエッジ構文と意味階層が違うのに同じ記号を使うことになり、可読性が下がる。

### `[crud]` 構文（Option C）

`[external]` などのノードタグと表記が同じになり、意味階層が崩れる。

### 1 文字 CRUD shorthand（Option β）

装飾なし形式の語彙と割れる。1 文字 identifier は将来的なノード命名と衝突する余地がある。

### `string[]` のまま consumer 側で再 parse（Option I）

解釈ロジックが複数箇所に散らばり、バグの温床になる。型レベルで装飾あり/なしが見えない。

### `overdecorated-replace-as-create-delete` warning を入れる（Option L1）

false positive のリスクが大きく、ユーザーの意図表明を override する形になる。spec のガイドラインで足りる範囲。

### translate のデフォルトで自動装飾（Option T1）

既存ユーザーの `.krs` 出力フォーマットが変わり、無用な diff を生む。装飾構文の習熟前に default 化するのは早い。

## アクセプタンステスト候補（人間確認が必要なもののみ）

- 実装後、`examples/feature-samples/crud-matrix.krs` の `SearchOrders` の `operations read, list:read` を `karasu matrix --format=md` で確認し、`R?` ではなく `R` と表示される（unrecognized warning も出ない）ことを目視確認。
- `examples/feature-samples/crud-matrix.krs` に `replace:create,delete` を持つ usecase を追加し、matrix の Σ 集計で C と D の両方にカウントされることを目視確認。
- `karasu fmt` で装飾済み operations を整形し、フォーマットが安定する（reformat の差分ゼロ）ことを目視確認。
- `karasu translate openapi --emit-crud-decoration sample-openapi.yaml` を実行し、HTTP メソッドが装飾済み verb（`list:read`、`get:read` 等）として emit されることを確認。

> 自動テスト範囲（parser / `isWriteOperation` / matrix / fmt / translate / 各 diagnostic code）は Vitest で網羅。

## 確認事項（実装着手前にユーザー判断が欲しい）

- **構文（Q1）**: `verb:crud[,crud]`（Option A）でよいか。`->` / `[]` のどれかを優先したい場合は要相談。**推奨: A**。
- **1:N 解釈ルール（Q1.1）**: 「次の verb トークン or リスト末尾まで」が現 verb の CRUD リスト、というルールでよいか。**推奨: そのまま**。
- **右辺語彙（Q2）**: 識別子フル形式（`create` / `read` ...）。1 文字 shorthand は不採用。**推奨: そのまま**。
- **AST 変更（Q3）**: `ResourceNode.properties.operations` を `string[]` から `ResourceOperation[]` への breaking change で進めてよいか。OK なら同 PR で全 consumer を更新する。**推奨: そのまま**。
- **Lint（Q5）**: `overdecorated` warning は **入れない**方針でよいか。**推奨: 入れない**。
- **translate（Q6）**: `--emit-crud-decoration` opt-in flag のみ（v1）。default 切り替えは別 Issue。**推奨: そのまま**。
- **Diagnostic codes（Q7）**: 3 コード追加 + `unknown-resource-operation` の挙動変更（装飾済みは出さない）でよいか。**推奨: そのまま**。
- **fmt（Q8）**: 装飾右辺はスペースなし（`verb:c,d`）でよいか。**推奨: そのまま**。
- **examples**: `crud-matrix.krs` の `list` を装飾済み `list:read` に書き換え + 新規 `replace:create,delete` の usecase を追加する方針で OK か。
