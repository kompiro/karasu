# AT: `karasu fmt` が top-level 構文をすべて round-trip する

- **日付**: 2026-07-20
- **関連 Issue**: [#2076](https://github.com/kompiro/karasu/issues/2076)
- **対象ファイル**:
  - `packages/core/src/formatter/formatter.ts`
  - `packages/core/src/formatter/formatter-top-level-coverage.test.ts`（新規）
  - `packages/cli/src/fmt.test.ts`
- **関連**: ADR-2076（formatter の top-level 網羅を型と test で強制する）、ADR-438（`.krs` フォーマッター）、ADR-702（トップレベル infra ブロック）、TPL-20260510-02（round-trip 保証）

## 受け入れ条件

- [x] top-level `boundary` ブロックが `organization` の有無にかかわらず `fmt` 後も残る
  > ✅ Automated — `packages/core/src/formatter/formatter-top-level-coverage.test.ts` › `round-trips top-level boundaries through format()`、`packages/cli/src/fmt.test.ts` › `preserves a top-level boundary block when writing back (#2076)`

- [x] top-level `legend` ブロックが `fmt` 後も残る（scope / title / `swatch` / `ref` の各 target 種別を含む）
  > ✅ Automated — `round-trips top-level legends through format()`

- [x] top-level infra ブロック（`database` / `queue` / `storage`）と `client` が `fmt` 後も残る。infra だけのファイルが空にならない
  > ✅ Automated — `round-trips top-level databases / queues / storages / clients through format()`、`packages/cli/src/fmt.test.ts` › `does not empty a file made only of top-level infra blocks (#2076)`

- [x] `KrsFile` の **配列型 top-level キーすべて**に fixture が存在する（新しい top-level 構文を足したとき formatter への配線漏れが test で落ちる）
  > ✅ Automated — `has a fixture for every array-valued KrsFile key`（`createEmptyKrsFile()` から期待集合を導出）。型レベルでも fixture 表の `satisfies Record<ArrayKeys<KrsFile>, string>` で `pnpm typecheck` が落ちる（両ガードとも負のテストで空振りしないことを確認済み）

- [x] 各 top-level 構文で `parse(format(x))` が `parse(x)` と構造的に等価（loc を除く）
  > ✅ Automated — 各 fixture で `stripLocations` 比較（TPL-20260510-02 のチェックリスト）

- [x] 各 top-level 構文で `format(format(x)) === format(x)`（idempotency）
  > ✅ Automated — 各 fixture で二重適用を比較

- [x] top-level 構文が混在するファイルで宣言順が保存される
  > ✅ Automated — `preserves declaration order when top-level kinds are interleaved`

- [ ] reverse-architecture harness（ADR-1895）が生成した `boundary` 入り `.krs` に対して、SKILL.md 所定の `karasu fmt` ステップを実行しても boundary クラスタが残る
  > 🧑 Manual — harness の出力（spike #1991 の生成物など）に `karasu fmt --write` を実行し、`grep -c '^boundary '` が実行前後で変わらないことを確認する。自動テストは合成 fixture で塞いでいるため、実運用の生成物での確認のみ手動。

## 範囲外（follow-up）

- **`boundary` の label 位置**: parser は header 位置（`boundary g "G" {`）とプロパティ位置（`label "G"`）の両方を受理するが、formatter は後者に正規化する。AST は同一なので round-trip は保たれるが、header 位置で書いた author の diff は 1 行動く。header 位置を保持するには AST に記法の別を持たせる必要があり、本 Issue の範囲外。
- **`boundary` / `legend` ブロック内のコメント保持**: entry 間（`contains` 行の間、legend の `swatch` / `ref` 行の間）に置かれた leading comment は、**ファイル末尾に寄る**。`renderBoundaryBlock` / `renderLegendBlock` が entry 単位で `extractLeading` を呼ばないため、未回収のコメントが `remainingComments()` で最後にまとめて出力されるため。既存の `organization` / `team` の `owns` 行間でも同じ挙動になる先行の制限（ADR-438「プロパティ位置は AST に保持されない」）であり、本 PR で新たに生じたものではない。round-trip（構造等価）と idempotency は保たれる。
- **string value のエスケープ**: `label` / `description` / legend title 等の値に埋め込まれた `"` / `\` は emit 時にエスケープされず、round-trip が壊れる。既存の全 renderer に共通する先行バグで、本 PR の新 renderer も同じ pattern を踏襲している。[#2087](https://github.com/kompiro/karasu/issues/2087) で一括対応する。
