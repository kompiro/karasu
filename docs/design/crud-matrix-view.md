# CRUD matrix view (usecase × resource)

- **日付**: 2026-05-02
- **ステータス**: 検討中
- **関連**:
  - Issue: [#1062](https://github.com/kompiro/karasu/issues/1062)
  - 既存 ADR: [ADR-20260430-03](../adr/20260430-03-resource-crud-operations.md)（`operations` プロパティ導入）
  - 既存 ADR: [ADR-20260430-04](../adr/20260430-04-resource-edge-read-write-differentiation.md)（usecase view edge の read/write 差別化）
  - 関連 Issue: [#1061](https://github.com/kompiro/karasu/issues/1061)（in-place edge 差別化、補完的）
  - Follow-up: verb 装飾構文（後述「未起票の follow-up」セクション）— 本設計の `?` suffix を将来的に解消する依存タスク
  - 仕様: [docs/spec/syntax.md](../spec/syntax.md) §`operations property`
  - 既存実装: [`packages/core/src/view/`](../../packages/core/src/view/) — `view-extract.ts` / `deploy-view-extract.ts` / `org-view-extract.ts` の derived view パターン

## 背景・課題

ADR-20260430-03 で `usecase` 内の `resource` に CRUD verbs（`operations`）が乗るようになり、ADR-20260430-04 で usecase view の edge 描画に **write/read** の視覚軸が入った。

しかしどちらも **in-place reading**（usecase ビューを開いて目で追う）に最適化されている。実用上の主な動線である:

- 「resource X を別サービスに切り出すと、どの usecase が壊れるか／何個 read で済むか」（**列スキャン**）
- 「usecase Y は何種類の resource に触っているか」（**行スキャン**）
- 「create はあるが delete が無いリソース」「read だけで update が無い usecase」のような **CRUD カバレッジ穴**の発見

を満たすには、`usecase × resource` の **マトリクス（grid）として集約された表示** が要る。これが本設計の対象。

```
                 OrderTable   InventoryAPI   ProductTable   | ΣC ΣR ΣU ΣD
PlaceOrder       CR           R              R              | 1  3  0  0
SearchProducts   .            .              R              | 0  1  0  0
RegisterProduct  .            .              CRU            | 1  1  1  0
ManageStock      .            U              .              | 0  0  1  0
─────────────────────────────────────────────────────────────────────────
ΣC               1            0              1              |
ΣR               1            1              2              |
ΣU               0            1              1              |
ΣD               0            0              0              |
```

セルには `C` / `R` / `U` / `D` の組み合わせ、装飾無しの unrecognized verb がある場合は `?` suffix、関係はあるが `operations` 未宣言なら単独の `?`、空セルなら空白が入る。最右列・最下行に CRUD 別の集計セル（`ΣC / ΣR / ΣU / ΣD`）が出る。

## 制約・前提

- 入力は `.krs` の解析済み AST（`UsecaseNode.resources[*].properties.operations: string[] | undefined`）。
- **read-only**: マトリクス上の編集で `.krs` を書き換えるのは v1 スコープ外（Issue 本文の Out of scope に明記）。
- **single system per matrix**: クロスシステムマトリクスは v1 スコープ外。
- 認可表現（actor 軸）は別レーン（Issue #832）で扱う。
- usecase / resource の名前は同一システム内で一意とは限らない（`resource OrderTable` は usecase ごとに別ノード）。**resource の identity** は「インフラ宣言（`database` / `queue` / `storage` 配下）の resource ノードへの解決後の id」を使う（usecase view が現在 edge を貼る先と同じ解決ロジック — `view-extract.ts` の `deriveUsecaseResourceNodes` を再利用）。
- **未指定 `operations`** は「未決定の許容」方針（ADR-20260430-03）に従い、空セルではなく **`?` セル**として "関係はあるが verb 未宣言" を区別表示する（後述）。

## 設計の選択肢

### Q1. View kind か derived projection か

#### Option A — 新しい top-level view kind を追加（`matrix CRUDImpact { ... }` のような構文）

`.krs` で `view matrix Foo { type usecase-resource-crud; filters ... }` のように宣言する。

**Pros**:
- ユーザーが「このマトリクスをドキュメントの一部として保存したい」というユースケースに直接応える
- フィルタや並び順を `.krs` に固定化でき、レビュー対象になる

**Cons**:
- 構文追加のコストが大きい（パーサ・spec・LSP・スタイル全部に波及）
- 派生情報（`usecase × resource` の集約）はソースに対して 100% 自動導出可能で、宣言する必然性が薄い
- system / deploy / org の view kind はいずれも **AST に明示宣言が無い** derived view（`*-view-extract.ts` で AST から projection を作る）。本機能を view kind にすると一貫性が崩れる

#### Option B — Derived projection（採用）

既存の `view-extract.ts` / `deploy-view-extract.ts` 系列に揃え、`packages/core/src/view/crud-matrix-extract.ts` を追加して AST → `CrudMatrix` という純粋データを返す。CLI / app / panel はこのデータを各々レンダリングする。

**Pros**:
- 既存の derived view パターンに整合
- パーサ・spec・LSP に変更が要らない（`.krs` 文法は無変更）
- 「同じ AST から複数の見方を作る」という karasu のコアコンセプト（論理 vs 物理）と整合
- フィルタリングや並び順を **CLI フラグ / panel UI 側で制御** できる（再描画コストが低い）

**Cons**:
- ユーザーが「保存可能なマトリクス定義」を持てない（同じフィルタを毎回指定し直す）。ただしこれは CLI flag の preset / panel state 永続化で別途解決可能で、構文層の負担にする必要はない

### Q2. 出力形式

`karasu matrix [file] --format=md|csv|svg` をサポートし、**default は `md`**（terminal-friendly、grep もできる、PR/Issue にもそのまま貼れる）。

加えて、**`karasu render` で system 図を SVG エクスポートする際に CRUD matrix も同梱の SVG として一緒に書き出す**動線を提供する（`karasu render index.krs --include-matrix` のような flag、または出力ディレクトリに `matrix.svg` を併置）。これにより「アーキテクチャ図一式をレビュー用にエクスポート」する一連の流れで matrix も同梱される。

| format | 用途 | 備考 |
|--------|------|------|
| `md` | terminal / PR / Issue / docs | default |
| `csv` | spreadsheet / CI snapshot | 機械可読・diff 向き |
| `svg` | preview / 印刷 / `karasu render` 同梱 | grid SVG ビルダー |

### Q3. セル表示

CRUD verb を 1 セルにどう収めるか。

#### Option I — 個別 verb の頭文字を連結（`CRU`, `R`, `D` …）

短く、4 文字以内で収まる。慣習的（CRUD マトリクスの教科書表記）。

#### Option II — アイコン（`+` `👁` `✎` `✕`）

視覚的だが、印刷・色覚多様性・縮小表示でリスクがある。i18n フリーだが慣習が薄い。

#### Option III — 複数の小セルに分割（4 サブセル / cell）

4 列を C/R/U/D に固定し、ON/OFF を塗りつぶしで表現。情報密度が均一。

**採用**: **Option I（頭文字連結）** + ADR-20260430-04 の `R/W` 軸を **背景色** で重ねる（write を含むセルは ADR-04 と同じ width 階層に揃えた塗り、read のみは無色）。冗長エンコーディングで a11y を確保。

| セル内容 | 意味 | 表示 |
|---------|------|------|
| (空) | 関係なし | 空白 |
| `?` | 関係あり、`operations` 未宣言 | グレー `?` |
| `R` | read のみ | 無色 `R` |
| `CR` / `CRU` / etc. | recognized verb の集合 | 背景うす色 + 頭文字連結（write を含むなら強調背景） |
| `R?` / `CR?` | recognized + 装飾無し unrecognized 混在 | `?` suffix（後述 Q4） |

### Q4. Unrecognized verbs の扱い + verb 装飾構文 follow-up

ADR-20260430-03 は `list` / `search` / `execute` 等の認識外 verb を **AST に保持** する（warning は出すが捨てない）。マトリクスではどう見せるか。

#### 検討した案

- **(a)** matrix 表示で別グリフ（`*`）にまとめて表示、tooltip / 脚注で原文保持
- **(b)** matrix では完全に無視（recognized 4 verbs だけ集計）
- **(c)** matrix の cell に `?` で出して「ユーザーに CRUD verb で書き直して」と誘導

#### 採用方針: (c) + verb 装飾構文を follow-up Issue として並走

「リソースへの読み書きなので任意 verb でも CRUD に落とせるはず」という指摘を受け、**verb 装飾構文** を ADR-20260430-03 の syntax 拡張として別 Issue で起票する方針とする。本 matrix design doc では「装飾済み verb を消費する側」として進める。

##### verb 装飾構文（follow-up Issue で詳細議論）

`<verb>:<crud>` または `<verb>:<crud>,<crud>...` 形式で、ユーザー定義 verb がどの CRUD に寄るかを宣言する。**1:N マッピングをサポート**する。

```krs
usecase ListProducts {
  resource ProductTable {
    operations list:read, search:read
  }
}

usecase ProcessOrder {
  resource OrderQueue {
    operations enqueue:create, dequeue:delete
  }
}

usecase ReplaceCacheEntry {
  resource CacheStore {
    # delete-insert 系: 1 verb で C と D の両方を立てる
    operations replace:create,delete
  }
}
```

**1:N をサポートする理由**:
- 現実に delete-insert idiom はある（DB の `REPLACE INTO`、soft-delete + new row、Kafka compacted topic への tombstone + new key 等）
- syntax コストは小さい（カンマ区切りを許すだけ）
- matrix 集計は additive（`replace` を持つ usecase の cell には `C` と `D` の両方が立つ）
- tool 側で「これは update に丸めろ」と強制すると、設計者の意図情報が失われる

**乱用への抑制策**（follow-up Issue の本文に open question として記載）:
- **lint rule**: 「単一エンティティの in-place 書き換えに `:create,delete` を使うのは `update` を推奨」warning
- **doc / spec ガイドライン**: 「物理削除 + 物理挿入が伴う場合のみ `:create,delete` を使う。論理的に同一エンティティの書き換えなら `update`」

##### matrix 側の挙動

- 装飾された verb（`list:read`, `replace:create,delete`）→ 右辺の CRUD 成分を cell に加算
- 装飾無しの recognized verb（`create` 等の controlled 4 種）→ そのまま CRUD に加算
- 装飾無しの unrecognized verb → cell に `?` を suffix（`R?`, `CR?`）+ tooltip / 脚注で raw verb を提示
- verb 装飾構文が landed 後、ユーザーが装飾を入れれば `?` suffix は自然に消える

これにより matrix 設計は verb 装飾構文の実装を待たずに進められる。

### Q5. 行・列の並び替えとフィルタ

v1 で必要な最小フィルタ:

- **service フィルタ**: `service S { usecase ... }` の親 service で行を絞る（`--service Catalog`）
- **infra フィルタ**: 列側を `database` / `queue` / `storage` のいずれかに絞る（`--infra database`）
- **`[external]` フィルタ**: 列側で external resource のみ／除外（`--external` / `--no-external`）
- **read-only / write-only フィルタ**: ADR-20260430-04 の write-dominates 判定で行・列を絞る（`--writes-only`）

並び順:

- **行**: 親 service → usecase 名のアルファベット順（決定的順序）
- **列**: infra block → resource 名のアルファベット順
- 数値ソート（"列スキャンで write が多い順" 等）は v1 スコープ外（後続 issue）

### Q6. 空行・空列の扱い

システム移行の文脈では「未指定の要素がどれくらいあるか」を可視化することが進捗ドライバになる（CRUD 穴 + 未宣言要素の両方を見たい）。一方で大規模図ではフル grid が読めなくなるシーンもある。

**採用**: **default は全 format で show-empty（omit しない）**、`--omit-empty` flag で省略可能。

- format 別にデフォルトを変えるとユーザーが「md と csv で見え方が違う」と混乱するため、**format に依らず一貫した default** とする。
- 省略したい場合は `--omit-empty` を明示する。
- 「empty」の判定は「その行 / 列の全セルが空（`?` も無い）」。

### Q7. 集計セル（行・列の Σ）

「create はあるが delete が無い resource」「read しかしない usecase」のような **CRUD カバレッジ穴** を発見しやすくするため、**最右列に行集計（usecase が触る各 verb の発生数）**、**最下行に列集計（resource が受ける各 verb の発生数）** を出す。

| 表示 | 計算 |
|------|------|
| 行末 `ΣC ΣR ΣU ΣD` | その usecase の各 verb 発生回数（cell 横断） |
| 列末 `ΣC ΣR ΣU ΣD` | その resource への各 verb 発生回数（cell 縦断） |

- `ΣC=1, ΣD=0` のリソース → 「作成されるが削除されない」が一目でわかる
- `ΣR>0, ΣC=ΣU=ΣD=0` の usecase → read-only usecase
- 集計セルは md / csv / svg 全てで同じ形で出す
- `--no-totals` で省略可能（CSV を別ツールに食わせるとき邪魔になるケース向け）

## 決定（提案）

1. **Derived projection（Q1-B）として実装**。新しい view kind は導入しない。`packages/core/src/view/crud-matrix-extract.ts` に `extractCrudMatrix(system, options): CrudMatrix` を追加。
2. **CLI コマンド `karasu matrix`** を新規追加（`packages/cli/src/matrix.ts`）。`--format=md|csv|svg`、`--service` / `--infra` / `--external` / `--writes-only` / `--omit-empty` / `--no-totals` フラグ。default format は **`md`**。
3. **`karasu render` への統合**: `--include-matrix` flag を追加し、SVG エクスポート時に `matrix.svg` を同梱出力（system 図と一緒にレビュー用一式を吐き出す動線）。
4. **App panel** から「Open as CRUD matrix」アクションでこの projection を HTML table（Tailwind）でレンダリングして表示。v1 では filter UI は **service / infra の dropdown のみ**、`--writes-only` 等は CLI に寄せる。
5. **セル表示は Option I（頭文字連結）+ write の背景色**、装飾無し unrecognized verb は `?` suffix。`?` 単独は「未宣言」。
6. **verb 装飾構文（`<verb>:<crud>[,<crud>...]`、1:N マッピング）** を **別 Issue として起票** し、ADR-20260430-03 の syntax 拡張として並走。本 matrix design は装飾済み verb を消費する側として実装する。
7. **空行/空列は default 全 format で show（omit しない）**。`--omit-empty` で省略。
8. **行末・列末に CRUD 集計セル**（`ΣC ΣR ΣU ΣD`）を default 表示。`--no-totals` で省略。

### データ構造（提案）

```ts
// packages/core/src/view/crud-matrix-extract.ts
export interface CrudMatrix {
  rows: CrudMatrixRow[];      // usecase
  columns: CrudMatrixColumn[]; // resource
  cells: Map<string, CrudMatrixCell>; // key: `${rowId}::${columnId}`
  rowTotals: Map<string, CrudTally>;     // rowId -> ΣC/R/U/D
  columnTotals: Map<string, CrudTally>;  // columnId -> ΣC/R/U/D
  omitted: { rows: number; columns: number };
}

export interface CrudMatrixRow {
  usecaseId: string;
  label: string;
  serviceId: string | undefined;
}

export interface CrudMatrixColumn {
  resourceId: string;
  label: string;
  infraKind: "database" | "queue" | "storage" | undefined;
  external: boolean;
}

export interface CrudMatrixCell {
  recognized: ReadonlySet<"create" | "read" | "update" | "delete">;
  hasUnknown: boolean;                // 装飾無し unrecognized verb が含まれるか（`?` suffix 表示用）
  unknownVerbs: readonly string[];    // raw verbs preserved (for tooltip / footnote)
  declared: boolean;                   // false when usecase touches resource but no operations declared
  isWrite: boolean;                    // ADR-20260430-04 write-dominates
}

export interface CrudTally {
  create: number;
  read: number;
  update: number;
  delete: number;
}

export interface CrudMatrixOptions {
  serviceFilter?: string[];
  infraFilter?: ("database" | "queue" | "storage")[];
  externalOnly?: boolean;
  excludeExternal?: boolean;
  writesOnly?: boolean;
  omitEmpty?: boolean;       // default false
  showTotals?: boolean;      // default true
}
```

### 実装方針（順序）

1. **`crud-matrix-extract.ts`**: 純粋関数として AST + options から `CrudMatrix` を作る。`view-extract.ts` の `deriveUsecaseResourceNodes` の resource resolution ロジックを共有関数に切り出して再利用する。verb 装飾構文が未実装の段階では parser 側は raw `string[]` を返すので、extract 側は「`:` を含むか」で recognized/装飾済み/装飾無し unrecognized を判別する 1 関数だけ持つ（装飾構文 landing 後はその 1 関数を差し替える）。
2. **CLI `karasu matrix`**: `commander` で実装。format ごとの renderer は `formatMatrixAsCsv` / `formatMatrixAsMarkdown` / `renderMatrixAsSvg` の純関数。SVG renderer は v1 では既存の renderer は使わず、grid 専用の小さい SVG ビルダーを `packages/core/src/render/matrix-svg.ts` に切る（cell sizing は単純 grid）。
3. **`karasu render --include-matrix`**: 既存の render パイプラインで system 図を吐く際に `matrix.svg` を同じディレクトリに併置出力する。
4. **App panel**: `packages/app` に `CrudMatrixPanel` を追加。`extractCrudMatrix` を呼んで grid を React で描く（HTML table + Tailwind）。filter は service / infra dropdown のみ。
5. **examples の追加**: `examples/feature-samples/crud-matrix.krs` を新規作成し、`extractCrudMatrix` の動作確認用シナリオ（write/read 混在 + external + 装飾無し unrecognized verb）を含める。`packages/core/src/builtins/examples.ts` を `examples-sync` ルールに従って同期。
6. **getting-started 例の拡充**: `examples/getting-started/index.krs` と `examples/getting-started-en/index.krs` の各 usecase の resource に `operations` を追記し、初学者が `karasu matrix` を試したときに有意な grid が出る状態にする。
7. **spec への追記**: `docs/spec/syntax.md` には変更なし（構文追加なし）。`docs/spec/i18n.md` に `karasu matrix` の出力 string（`"omitted N rows"`、`"ΣC"` 等）を追記。

## 理由

- **Derived projection** にすることで `.krs` 文法を一切汚さない。同じ AST から「usecase view の edge 表示」「マトリクス」両方を作るのは karasu の core idea（論理 vs 物理の分離、複数 view）に合致。
- **CLI default を `md`** にする理由は、ターミナルで `karasu matrix system.krs | less` がそのまま読めて、ドキュメント PR にも貼り付けやすいから。CSV は spreadsheet 連携や CI snapshot 用途で必要。SVG は preview / 印刷 / `karasu render` 同梱向け。
- **`karasu render --include-matrix`** で「アーキテクチャ図一式をエクスポート」動線に matrix を組み込むことで、レビュー時に「system 図 + matrix」をセットで配布できる。
- **頭文字連結** は CRUD マトリクスの慣習表記で学習コストゼロ。アイコン化は色覚・印刷・縮小に弱く、karasu の SVG-first 方針と相性が悪い。
- **`?` セル / `?` suffix** で「関係はあるが verb 未宣言 / 装飾無し unrecognized」を空セルと区別することで、ADR-20260430-03 の「未決定の許容」方針をマトリクス UX にも引き継ぐ。verb 装飾構文 landed 後は装飾無し `?` suffix は自然に減る。
- **verb 装飾構文（1:N マッピング）の follow-up 切り出し** で matrix 設計のスコープ膨張を避け、parser / spec / LSP / translate adapter に波及する syntax 拡張を独立にレビュー可能にする。matrix 側は装飾の有無に依存しない（装飾あれば集計に寄せ、無ければ `?`）。
- **default show-empty** は移行分析の「未宣言の進捗を見たい」要求に応える。format に依らず一貫させることでユーザーがモード差を意識しないで済む。`--omit-empty` で大規模図にも対処可能。
- **行末・列末の Σ 集計** で「create はあるが delete が無い resource」「read しかしない usecase」のような CRUD カバレッジ穴を一目で発見できる。これは grid 表示単独では拾いづらい情報。
- **app panel の filter を最小限**にし、複雑な絞り込みは CLI に寄せる方針は karasu 全体の「UI は preview、本番作業は CLI」の住み分けと整合。

## 却下した案

### 新しい view kind として `.krs` 構文を追加

system / deploy / org のいずれも構文宣言を持たない derived view であることと整合せず、パーサ・LSP・spec の改修コストに見合わない。フィルタの保存ニーズは CLI flag の preset / panel state 永続化で個別に解決できる。

### SVG 出力のみ／CSV 出力のみに絞る

migration analysis は **grep する動線**（CSV/MD）と **眺める動線**（SVG）の両方が現実に必要で、片方だけだと運用で詰まる。実装コストは `CrudMatrix` 共有データから projection するだけで小さい。

### セルを 4 サブセル分割（C/R/U/D の格子）

情報密度は均一になるが、80% のセルは `R` のみで、サブセル分割は overkill。視覚的にも grid が密になりすぎる。

### Unrecognized verb を warning だけ出して捨てる

ADR-20260430-03 が AST に保持する決定を覆すことになる。translate アダプタの round-trip が壊れる。

### Unrecognized verb を tool 側で「自動的に CRUD に正規化」する

`list`→R は自然だが `execute`→? は曖昧で、karasu 側にマッピング辞書を持つと責務肥大 + 曖昧判断のオーナーシップ問題が出る。**verb 装飾構文でユーザーに宣言してもらう方針** に倒す。

### 認可（actor × resource）を同じマトリクスに混ぜる

CRUD は「何をしているか」、認可は「誰が許されているか」で別レイヤ。Issue #832 で別マトリクスとして扱う。

### マトリクスから `.krs` 編集（`operations` の追加・削除）

v1 スコープ外。読み取り専用の analysis surface に集中する。Issue 本文の Out of scope に明記済み。

### format 別にデフォルトを変える（CSV のみ show-empty、md/svg は omit）

ユーザーが「同じ system でも format により行数が違う」と混乱するため、**全 format で default 一致**とした。

## アクセプタンステスト候補（人間確認が必要なもののみ）

- `karasu matrix examples/getting-started/index.krs --format=md` を実行して、`OrderTable` 等の列を眺めたとき、書き込む usecase が `CRU` 等の verb 文字列で識別でき、read だけの usecase と一目で区別できること、行末・列末の Σ 集計が出ていることを目視確認する。
- `karasu matrix examples/feature-samples/crud-matrix.krs --format=svg -o /tmp/m.svg` を生成し、ブラウザで開いて grid layout が読めること、`?` suffix が装飾無し unrecognized verb のセルに出ていることを確認する。
- `karasu render examples/ec-platform/index.krs --include-matrix -o /tmp/out/` を実行し、`system.svg` と `matrix.svg` が同じディレクトリに出力されることを確認する。
- App preview で `examples/getting-started/index.krs` を開き、CRUD matrix panel で service / infra dropdown フィルタを切り替えると行・列が動的に絞られること、Σ 集計セルが描画されていることを目視確認する。
- `--omit-empty` を付けたときに未宣言行・列が消え、付けないとき（default）に未宣言行・列も出ることを `examples/ec-platform/index.krs` で目視比較する。

> 自動テスト範囲（`extractCrudMatrix` の純粋関数挙動、各フォーマッタの snapshot、CLI flag の組み合わせ、Σ 集計ロジック、show/omit-empty ロジック、`?` suffix 判定）は Vitest で保証する。

## 未起票の follow-up（本設計に伴って Issue 化が必要）

### verb 装飾構文 — 1:N CRUD マッピング

- **目的**: `list:read`, `enqueue:create`, `replace:create,delete` のように user-defined verb の CRUD への寄せ方を宣言可能にし、matrix 集計の精度を上げる
- **対象**: ADR-20260430-03 の syntax 拡張（parser / spec / LSP / translate adapter / matrix）
- **本設計との関係**: 本 matrix design はこの構文 **無しでも動く**（装飾無し unrecognized verb は `?` suffix で表示）。装飾構文 landed 後は `?` suffix が減り、matrix 集計が正確になる
- **open questions**:
  - 1:N の乱用を抑える lint rule（`update` で済むものに `:create,delete` を使うのを警告）
  - spec / docs での usage guideline（物理 delete-insert と論理 in-place 書き換えの線引き）
  - syntax: `verb:crud` か `verb -> crud` か `verb [crud]` か（既存の `:` 使用箇所との衝突確認）
  - controlled vocabulary の右辺（`create`/`read`/`update`/`delete`）の identifier 形式
  - translate adapter（OpenAPI / DB schema）が round-trip で装飾を保持するか・自動付与するか
- **本設計への影響範囲**: `crud-matrix-extract.ts` の verb 解析 1 関数を差し替え可能な形で実装しておく
