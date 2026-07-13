# アーキテクチャリバースハーネス v1 — 実装設計（CLI primitive + Skill）

- **日付**: 2026-07-13
- **ステータス**: 検討中
- **関連**:
  - 引き金 Issue: [#1895](https://github.com/kompiro/karasu/issues/1895)
  - 上位（方向性）Design Doc: [repo-reverse-engineer-harness.md](./repo-reverse-engineer-harness.md)（PR #1914）
  - 関連 TPL: [TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)（round-trip）、[TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md)（暗黙フィルタ）、[TPL-20260510-16](../test-perspectives/TPL-20260510-16-convenience-vs-principled-api.md)（principled API）、[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)（id 同一性）、[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)（CLI↔docs 同期）
  - コード: `packages/core/src/index.ts`（`compileProject`）、`packages/core/src/view/crud-matrix-extract.ts`（集計の雛形）、`packages/core/src/formatter/formatter.ts`（`serializeKrsFile`）、`packages/cli/src/index.ts`（command 登録）

## 背景・課題

方向性 Design Doc（[repo-reverse-engineer-harness.md](./repo-reverse-engineer-harness.md)）で、実 repo を均一な深さで `.krs` 化する
**アーキテクチャリバースハーネス**の設計方向に合意した（論理 domain primary / 新規 `karasu coverage` / epic 分割）。
本ドキュメントはその v1 を**どう作るか**の実装設計 — 2 つの CLI primitive（`subtree` / `coverage`）と Skill の具体仕様を固める。

痛点の再掲: 単一エージェントは top-level を復元できても domain interior（usecase / entity / resource）が薄くなる。
**domain ごとに subagent を fan-out**して per-slice の attention budget を確保し、**大規模モデルでは分割統治を必須**とする。
CLI primitive は、その分割統治を**大規模でも測定可能・コンテキスト効率よく**回すための構造層の支援。

## 現状（インベントリ）

モデル API 調査で判明した事実（実装はこの signature に対して書く）:

| 観点 | 事実 | 参照 |
| --- | --- | --- |
| コンパイル | `compileProject(entryPath, fs, {diagramType:"system"})` → `SystemCompileResult`。narrow して `.systems: SystemNode[]` が解決済み論理ツリー（import merged、orphan は `__unassigned__` system に wrap） | `packages/core/src/index.ts:410-435` |
| ノード共通 | 全ノードが `BaseNodeFields`: `id`（必須・author-given）/ `label?`（表示）/ `children: KrsNode[]` / `edges: KrsEdge[]` / `tags` / `annotations` | `packages/core/src/types/ast.ts:56-76` |
| domain | `DomainNode.kind==="domain"`。usecase / entity は専用配列でなく `children` に混在（kind で filter） | `ast.ts:113-116` |
| usecase | `UsecaseNode.kind==="usecase"`。触る resource は `children.filter(kind==="resource")` | `ast.ts:118-121`, `crud-matrix-extract.ts:86` |
| entity | `EntityNode.kind==="entity"`。関連は `edges`。属性なし（設計どおり）。物理対応は `tableRef?` | `ast.ts:132-142` |
| resource | `ResourceNode.kind==="resource"`。CRUD は `properties.operations?`。dot 参照は `ref?` | `ast.ts:144-173` |
| 集計の前例 | `extractCrudMatrix(systems, opts)` が DFS で usecase↔resource を集計（service context を継承しながら walk）。coverage の雛形 | `crud-matrix-extract.ts:146` |
| 再シリアライズ | `serializeKrsFile(file: KrsFile): string`。**per-node serializer は非公開** — 単一ノードは `KrsFile` に wrap して呼ぶ。top-level は systems/services/domains/deploys/organizations のみ（usecase/entity/resource は wrap 必須） | `formatter.ts:58,114-119` |
| command 登録 | `program.command("matrix <file>").option(...).action(...)`。`export { program }` 直前に追加。test は `packages/cli/src/*.test.ts`（`matrix.test.ts` 雛形） | `packages/cli/src/index.ts:464-514` |

## 制約・前提

- **principled API 経由**（[TPL-20260510-16](../test-perspectives/TPL-20260510-16-convenience-vs-principled-api.md)）: `compileProject` / `serializeKrsFile` / core 集計関数を使い、parser 内部を直接叩かない。集計ロジックは **core（`packages/core/src/view/`）に置き、CLI は薄い wrapper**（`matrix` と同構造）。
- **round-trip 保証**（[TPL-20260510-02](../test-perspectives/TPL-20260510-02-round-trip-guarantee.md)）: `subtree` が吐く `.krs` は `compileProject` で**parse し戻せる**こと（wrap した合成 domain/system 込みで valid）。test で `parse(subtree(x))` が成功することを検証。
- **id で同一性**（[TPL-20260510-20](../test-perspectives/TPL-20260510-20-id-not-label-for-identity.md)）: `subtree` のノード検索・`coverage` の domain キーは `id`。`label` は使わない。
- **暗黙フィルタ回避**（[TPL-20260510-05](../test-perspectives/TPL-20260510-05-implicit-data-filtering.md)）: `coverage` は**全 domain を出力**し、薄いものを黙って落とさない（`thin` フラグで surface、除外はしない）。`__unassigned__` orphan も 1 行として出す。
- **CLI↔docs 同期**（[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md)）: 新 command は `docs/spec/` / CLI reference に追記し、smoke test の対象に含める。
- **v1 syntax freeze**（ADR-20260616-06）: 新 `.krs` 構文は導入しない。
- **out of scope**: `subtree` の source-repo スライス（v1 は `.krs` モデルの sub-tree のみ。source ファイル群の切り出しは skill 側がファイル読みで対応）、coverage の閾値自動学習（固定 + オプション上書き）。

## 検討した選択肢

### 論点 1: `coverage` の「薄さ」判定

- **案 1a: 絶対数閾値**。usecase 数 < N を薄いとする。
- **案 1b: domain 間の相対密度**。全 domain の中央値/平均に対する比で薄さを見る。
- **案 1c: 複合スコア**。usecase / entity / resource-ref / edge を重み付き合成し、相対で判定。

**トレードオフ**: 1a は単純だが repo 規模で N が変わり普遍閾値が無い。1b は規模非依存だが 1 指標では entity だけ薄い等を見逃す。
→ **推奨: 1c を 1b で正規化**。domain ごとに `{usecases, entities, resourceRefs, edges}` を出し、
各指標を全 domain 分布で正規化した複合スコアで相対的な薄さを判定。`--threshold`（既定=中央値の一定割合）で上書き可能。
**絶対数も併記**して人間が解釈できるようにする（暗黙に丸めない）。

### 論点 2: `subtree` の wrap 方針

- **案 2a: 見つかったノードだけを最小 wrap**。usecase なら合成 domain で 1 段 wrap。
- **案 2b: 祖先パスを保って wrap**。system > domain > usecase の入れ子を復元して出す。

**トレードオフ**: 2a は最小だが文脈（どの system/domain 配下か）が落ちる。2b は文脈が残るが「slice だけ渡す」目的に対しては過剰。
→ **推奨: 2a を既定、`--with-ancestors` で 2b**。既定は「その domain の中身だけ」を渡したい repair ループ用途に合わせ最小 wrap。
合成 wrapper の id は元ノードの祖先 id を使い（例 `domain Order` 配下の usecase なら wrapper domain id=`Order`）、round-trip 可能にする。

### 論点 3: Skill の subagent 起動単位

- **案 3a: domain ごとに 1 subagent**（方向性ドキュメントの想定・ユーザー合意）。
- **案 3b: service/container ごと**。

→ **採用: 3a（domain ごと）**。各 subagent は自 domain の source slice を読み、usecase/entity/resource を `.krs` fragment に書く。
これがユーザーの想定（「発見されたドメインごとに分析するサブエージェント」）であり、分割統治の単位。

## 現時点の方針

**CLI primitive 2 つ（core 集計 + 薄い CLI wrapper）+ `.claude/skills/reverse-architecture/` を実装する。**
coverage は複合スコア×相対正規化（論点 1c/1b）、subtree は最小 wrap 既定（論点 2a）、skill は domain ごと fan-out（論点 3a）。

### 実装の指針

**① `karasu coverage <file>`**
1. core: `packages/core/src/view/coverage-extract.ts` に `extractCoverage(systems: readonly SystemNode[], opts?): CoverageReport`。
   `collectUsecases`（`crud-matrix-extract.ts:81-96`）と同じ DFS で domain を列挙し、domain ごとに
   `{ id, label, usecases, entities, resourceRefs(distinct), edges, score, thin }` を積む。`__unassigned__` も 1 行。
2. CLI: `packages/cli/src/coverage.ts`（`matrix.ts` の `NodeFileSystemProvider` を再利用）。
   options: `--format md|json`（既定 md、json は skill 用）/ `--threshold <n>` / `--output <file>`。
3. test: `packages/cli/src/coverage.test.ts` + `packages/core/src/view/coverage-extract.test.ts`。

**② `karasu subtree <node-id> <file>`**
1. CLI: `packages/cli/src/subtree.ts`。`compileProject` → `systems` を DFS で `id===nodeId` を収集。
   0 件 → stderr + exit 1。複数 → 各 match の親パスを列挙して exit 1（曖昧回避）。
2. 見つかったノードを `KrsFile` に wrap（top-level 化。usecase/entity/resource は合成 domain/system で包む。祖先 id を wrapper に使う）→ `serializeKrsFile` → stdout / `--output`。`--with-ancestors` で祖先込み。
3. test: `packages/cli/src/subtree.test.ts`。**round-trip test 必須**: `compileProject(subtreeOutput)` が成功する。

**③ Skill `.claude/skills/reverse-architecture/SKILL.md`**（frontmatter + 日本語 4-phase 本文）
- trigger: 「アーキテクチャをリバース」「リポジトリを karasu 化」「reverse architecture」「reverse-engineer repo into karasu」等。
- Phase 1 Scout: top-level 把握 → `karasu translate --from compose/k8s/openapi/db` で物理 spine → 論理 domain 列挙（物理・dir tree を seam ヒント）→ canonical id 採番 → `skeleton.krs` + domain work-list。
- Phase 2 Fan-out: domain ごとに subagent（Task）起動。自 slice のみ読み usecase/entity/resource を fragment に。各自 `karasu lint-style` で検証。
- Phase 3 Synthesis: fragment を merge。cross-domain edge は両側report → `(src,dst,kind)` で dedup。identity は `id`。resource は物理宣言が正準・論理は参照。
- Phase 4 Validate/repair: `karasu coverage` で薄い domain 検出 → `karasu render` で描画確認 → 薄い domain を再 dive（`karasu subtree` で現状 slice を渡す）→ coverage 目標到達で停止。notation gap は #1816/#1818 へ。
- 規約: id 英語 PascalCase / label ユーザー言語 / `.krs` が source of truth / 物理層は translate で hallucination 回避。

**④ AT**: `docs/acceptance/` に手動 AT 1 件 — `examples/` の既存 repo か小規模 fixture に skill を回し、coverage が薄い domain を検出→再 dive で解消、を人間確認。CLI primitive 単体は上記 vitest（`packages/cli` 内、e2e には置かない）。

**⑤ ADR 昇格**: 実装完了後、方向性ドキュメントと本実装設計をまとめて `docs/adr/` に昇格し、両 Design Doc を同 PR で削除。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: **なし**（新 command 追加のみ、既存挙動不変）。
- ドキュメント更新: `docs/spec/`（CLI reference）に `subtree` / `coverage` を追記（[TPL-20260511-02](../test-perspectives/TPL-20260511-02-spec-doc-reference-data-sync.md) の smoke test 対象）。skill の使い方 guide。
- テスト・examples への影響: eval fixture は repo 外または `examples/` 外。生成レポートは commit しない。

## 未解決の問い / 決めないこと

- **coverage スコアの具体式**: 各指標（usecase/entity/resourceRef/edge）の重みと正規化方法、`thin` の既定閾値 — 実装時に fixture で調整（core test で固定）。
- **subtree の複数マッチ挙動**: exit 1 で曖昧提示にするか、`--path` で親指定して選ばせるか — v1 は前者、必要なら後者を追加。
- **skill の停止条件**: coverage「目標到達」の具体値（全 domain が thin でない / スコア分散が閾値以下 等）— 実装時に定める。
