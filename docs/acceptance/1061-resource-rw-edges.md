---
type: product
---

# AT-1061: Read/write differentiation on usecase→resource edges

- **日付**: 2026-04-30
- **関連 Issue**: [#1061](https://github.com/kompiro/karasu/issues/1061)
- **対象ファイル**:
  - `packages/core/src/spec/operations.ts`
  - `packages/core/src/spec/operations.test.ts`
  - `packages/core/src/view/view-extract.ts`
  - `packages/core/src/view/view-extract.test.ts`
  - `packages/core/src/builtins/default-style.ts`
  - `docs/spec/tags-annotations.md`
  - `examples/getting-started/index.krs`, `examples/getting-started-en/index.krs`
  - `examples/feature-samples/resource-operations.krs`, `packages/core/src/builtins/examples.ts`
- **関連 Design Doc**: [resource-edge-read-write-differentiation.md](../design/resource-edge-read-write-differentiation.md)
- **関連 ADR**: [ADR-20260430-03](../adr/20260430-03-resource-crud-operations.md)（`operations` 構文）

## 受け入れ条件

- [x] AT-A: `isWriteOperation` が `create` / `update` / `delete` のいずれかで true、それ以外（`read` のみ・空・undefined・unknown verb）で false を返す
  > ✅ Automated — `packages/core/src/spec/operations.test.ts` › `isWriteOperation`

- [x] AT-B: `view-extract.ts` `deriveUsecaseResourceNodes` が write 系 verb を含む resource への synthesized edge に `[write]` タグと `label: "W"` を付与する
  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `tags synthetic usecase→resource edges as write and labels them W when operations include create/update/delete`

- [x] AT-C: `operations` 未指定または read のみの resource への synthesized edge に `[read]` タグと `label: "R"` を付与する
  > ✅ Automated — `packages/core/src/view/view-extract.test.ts` › `tags synthetic usecase→resource edges as read by default and labels them R`

- [x] AT-D: `default-style.ts` に `edge[write] { stroke-width: 2; }` が含まれ、`edge[cyclic]` の `stroke-width: 2.5` よりも細く、デフォルト edge の `stroke-width: 1.5` よりも太い（width 階層 `read < write < cyclic`）
  > ✅ Automated — `packages/core/src/builtins/default-style.test.ts` の既存スタイル解決スモーク + `view-extract.test.ts` の AT-B/C で生成タグを検証

- [x] AT-E: `examples/getting-started/index.krs` および `examples/getting-started-en/index.krs` が diagnostics ゼロで parse でき、bundled `examples.ts` の内容と一致している
  > ✅ Automated — `packages/core/src/builtins/examples.test.ts`

- [x] AT-F: `examples/feature-samples/resource-operations.krs` が write / read / 多行 operations / `[external]` 併用 / 省略形 の各ケースを含み、diagnostics ゼロで parse できる
  > ✅ Automated — examples スモーク

- [ ] AT-G（manual）: Preview で `examples/getting-started/index.krs` を開き、`PlaceOrder` の usecase view ドリルダウンで `OrderEvents.OrderPlaced`（write）と `InventoryAPI`（read）に向かう edge が太さ + ラベル "W" / "R" で区別できる
  > 🧑 Manual — Preview で目視確認。`R` / `W` のラベルが edge midpoint に出ること、write が read より太いこと、cyclic edge（仮にあれば）が write よりさらに太いこと（または別色）を確認

- [ ] AT-H（manual）: Preview で `RegisterProduct`（write 中心）と `SearchProducts`（read 中心）の usecase view を比較し、レイアウト崩れ・ラベル重なりが許容範囲内であることを目視確認する
  > 🧑 Manual — 1 usecase あたり 2〜4 resource の典型的シーンでラベルが他の要素と重ならないことを確認

- [ ] AT-I（manual）: ユーザー `.krs.style` で `edge[write] { stroke-width: 4; color: #f87171; }` のような上書きが効くことを確認（カスケードに乗っている確証）
  > 🧑 Manual — Preview に追加スタイルを差し込んで上書きが反映される様子を観察。仮の `.krs.style` で 1 度確認できれば十分

## 補足

`[write]` / `[read]` は **synthesized usecase→resource edge にのみ付く pseudo-tag** で、ユーザーが explicit edge に書くものではない（`docs/spec/tags-annotations.md` §Automatic tags on edges に明記）。renderer は `edge.tags` と `edge.label` を見るだけの純粋な責務分離を維持し、判定ロジックは `view-extract.ts` で集約されている。
