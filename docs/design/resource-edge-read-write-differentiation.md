# Read/write differentiation for usecase→resource edges

- **日付**: 2026-04-30
- **ステータス**: 検討中
- **関連**:
  - Issue: [#1061](https://github.com/kompiro/karasu/issues/1061)
  - 既存 ADR: [ADR-20260430-03](../adr/20260430-03-resource-crud-operations.md)（`operations` プロパティ導入）
  - 関連 Issue: [#1062](https://github.com/kompiro/karasu/issues/1062)（CRUD マトリクスビュー — 補完的・別レーン）
  - 仕様: [docs/spec/syntax.md](../spec/syntax.md) §`operations property`
  - 既存実装: [`packages/core/src/view/view-extract.ts`](../../packages/core/src/view/view-extract.ts) — synthetic usecase→resource edges
  - スタイル: [`packages/core/src/builtins/default-style.ts`](../../packages/core/src/builtins/default-style.ts), [`packages/core/src/resolver/style-resolver.ts`](../../packages/core/src/resolver/style-resolver.ts)

## 背景・課題

ADR-20260430-03 で `usecase` 内の `resource` に `operations` プロパティ（CRUD verbs）を持たせられるようになった。次のステップは、その情報を **usecase ビュー上で視覚化** すること。これは特にシステム移行で「DB X を別サービスに切り出すと、どの usecase が壊れるか／読むだけで済むか」を一目で判断できるようにするのが目的。

usecase view では `view-extract.ts` の `deriveUsecaseResourceNodes` が **`usecase -> resource` の synthetic edges** を生成し、`kind: "sync"` として描画している（実例は Issue #1061 添付の "Search products → Product table" などの矢印）。したがって視覚化は **edge 装飾** で行うのが自然。

```
[ usecase Search products ] ─────▶ ( Product table )
[ usecase Register a product ] ──▶ ( Product table )
                              └──▶ ( Product images )
```

エッジ上に乗っている既存の視覚軸:

1. **kind: sync / async** → `stroke-style: solid / dashed`（builtins/default-style 経由、style-resolver が `edge[sync]` / `edge[async]` 疑似タグを注入）
2. **cyclic flag** → `class="krs-edge--cyclic"`（循環依存マーカー）
3. **arrowhead marker** → `marker-end`

write/read の差別化を入れるには、これらと**直交する第 3 の軸**が要る。`stroke-style` は sync/async に取られているので、空いているのは:

- `stroke-width`（数値、現在 1.5 がデフォルト）
- `stroke color`（テーマ色や cyclic で使われている）
- arrowhead 形状（変更コスト大、累積する装飾と衝突）
- edge label / badge（既存 label と同居して情報密度が上がる）

**`stroke-width` が最も軸の干渉が少ない**。ユーザーご指摘の通り、点線/実線は sync/async に既に取られているため、太さ調整で表現するのが妥当。

## 制約・前提

- 本設計は **usecase view のみ** を対象とする（`deriveUsecaseResourceNodes` が edge を生成するレベル）。
- ADR-20260430-03 の **write-dominates ルール** を採用。`create` / `update` / `delete` のいずれかが含まれていれば **write**、それ以外（`read` のみ、`operations` 未指定）は **read**。
- 既存の sync/async dashed 表現を変更しない。write/read 軸は**stroke-style ではなく stroke-width** で表現する。
- 既存の `.krs.style` カスケード（ユーザーが `edge[async] { color: ... }` のように上書きできる仕組み）と整合させ、新軸も同じ手段で上書きできるようにする。
- `[external]` タグ（resource ノード側）の dashed border 表現は edge 軸とは独立した別レーンなので干渉しない。

## 設計の選択肢

### Option A — Pseudo-tag injection（推奨）

`style-resolver.ts` で既に `edge.kind === "async"` から `[async]` 疑似タグを注入している仕組みを **拡張** し、`view-extract.ts` で生成する usecase→resource edge に対しても、target resource の `operations` を見て **`[write]` / `[read]` 疑似タグを注入** する。`default-style.ts` に `edge[write] { stroke-width: 3; }` を追加する。

- **edge の生成側**: `deriveUsecaseResourceNodes` で edge.tags に `"write"` / `"read"` を埋め込む（write-dominates 判定）
- **style-resolver**: 既存の `[async]`/`[sync]` 注入と並んで、edge.tags の `write`/`read` をそのまま selector マッチングに使う（追加コードはほぼゼロ）
- **default-style**: `edge[write] { stroke-width: 3; }` の 1 ルールを追加。read は既存デフォルト（1.5）のまま
- **ユーザー上書き**: `.krs.style` で `edge[write] { stroke-width: 4; color: #f87171; }` のように自由に上書き可能

**Pros**:
- 既存メカニズムをそのまま再利用、追加コード最小
- `.krs.style` カスケードに最初から乗るので、書き換えたいユーザーの上書き手段が用意されている
- write/read だけでなく将来 `[create]` / `[update]` / `[delete]` の生 verb tag を edge に注入する余地もある（が v1 では write/read 集約のみ）
- 既存 `[async]` / `[cyclic]` と同じ語彙ルールで読み手が学習しなくて済む

**Cons**:
- edge.tags に "write"/"read" という pseudo-tag が混ざるので、ユーザーが自分のタグとして "write"/"read" を edge に書いた場合に意味が二重化する（ただしユーザーが手書きで edge にタグを書く構文は限定的なので実害は少ない）
- "write"/"read" という単語が `tags-annotations.md` の reserved 語彙に増える（要記載）

### Option B — 専用フィールドを edge AST に追加

`KrsEdge` に `operations?: { write: boolean }` のような専用フィールドを生やし、renderer / style-resolver で参照する。

**Pros**:
- pseudo-tag namespace を汚さない
- 型レベルで意味が明確

**Cons**:
- AST 拡張・型変更・複数の参照箇所修正で **コストが大きい割に得られる便益が小さい**
- `.krs.style` セレクタとの紐付けで結局疑似タグ注入相当の処理が必要になる
- 将来 v2 で `[create]` 等の生 verb を出したくなったとき、また AST フィールドを追加することになる

### Option C — Renderer 側でのハードコード上書き

`view-extract.ts` 側は触らず、renderer の edge 描画箇所で resource を逆引きし、write 判定して `stroke-width` を直接上書きする。

**Pros**:
- 最少修正

**Cons**:
- ユーザーが `.krs.style` で上書きできない（renderer が後勝ちで上書きするため）
- 「カスケードで決まったスタイルを renderer がオーバーライドする」のは既存設計と整合しない（cyclic edge も同じ理由で `class` 経由で CSS 上書きしている）
- 将来の verb 別表示拡張パスが閉じる

## 決定（提案）

**Option A — pseudo-tag injection**。実装方針:

1. **`view-extract.ts` `deriveUsecaseResourceNodes`** を拡張:
   - target `resource.properties.operations` を見て、`isWriteOperation(ops)` で write 判定
   - synthesized edge の `tags` に `"write"` または `"read"` を 1 個入れる
   - `operations` 未指定なら `"read"` を入れる（保守的に「write の確証無し」扱い）

2. **`packages/core/src/spec/operations.ts`** に純粋関数を追加:
   ```ts
   export function isWriteOperation(operations: readonly string[] | undefined): boolean {
     if (!operations) return false;
     return operations.some((op) => op === "create" || op === "update" || op === "delete");
   }
   ```

3. **`style-resolver.ts`** は **無変更**。`edgeSelectorMatches` は既に `edge.tags` を見ているので、write/read pseudo-tag が edge.tags に入っていれば自動でセレクタにマッチする。

4. **`default-style.ts`** に `edge[write] { stroke-width: 3; }` を 1 行追加。read は既存デフォルト（`strokeWidth: 1.5`）のまま。

5. **`docs/spec/tags-annotations.md`** に reserved edge tag の項目として `write` / `read` を追記。usecase view で自動付与される旨を明記し、ユーザーが手で書く想定ではないと示す。

6. **ユーザー上書き可能性**: `edge[write] { stroke-width: 4; color: #f87171; }` のような `.krs.style` ルールでカスタマイズ可能。上書きなしでも default-style で write が太く描画される。

### Edge tag に write/read を入れる影響範囲

`edgeSelectorMatches` が `edge.tags` を `[async]`/`[sync]`/`[cyclic]` に拡張して扱っているのと同じ階層で `write`/`read` も働くので、追加コードは **edge 生成側 1 ヶ所 + style 1 ルール** で済む。

### 太さ比

`read = 1.5`（既存）/ `write = 3`（2 倍）を採用。視認性が確保でき、かつ既存の sync edge 太さを変えない。

### sync/async と write/read の組み合わせ表

| edge | stroke-style | stroke-width |
|------|--------------|--------------|
| sync + read | solid | 1.5 |
| sync + write | solid | 3 |
| async + read | dashed | 1.5 |
| async + write | dashed | 3 |

軸が完全に直交するので、4 通り全てが視覚的に区別可能。

## 理由

- **既存の pseudo-tag 仕組み（`[async]`/`[sync]`/`[cyclic]`）の自然な拡張**になる。新しい設計概念を導入せず、追加コードもほぼゼロ。
- **`.krs.style` カスケードに最初から乗る**ので、ユーザーが「もっと太く」「色も変えたい」「v2 で生 verb を見せたい」となったときに、コード変更なしで `.krs.style` で対応できる。
- `stroke-width` は sync/async（stroke-style）と完全に直交する軸で、視覚的にも 1.5px と 3px の差は十分に判別可能。
- 太さは数値的・連続的な軸なので、v2 で「`list` や `subscribe` のような認識外 verb を中間レベルで表す」「`delete` だけ更に太くする」等のグラデーションを足したくなった時にも、追加ルールで素直に拡張できる。
- write-dominates 判定を **`view-extract.ts` で edge 生成時に集約** することで、renderer や resolver は「edge.tags を見るだけ」の純粋な責務分離を維持できる。

## 却下した案

### Option B — AST に専用フィールドを追加

`KrsEdge` の AST 変更は影響範囲が大きく、得られるのは型安全性のみ。pseudo-tag 注入は AST 変更ゼロで同じ機能を提供でき、`.krs.style` カスケードとの統合も自然。型安全性が必要になったら別途リファクタで導入できる。

### Option C — renderer でハードコード上書き

ユーザーが `.krs.style` で write 軸を再定義できなくなり、karasu のスタイル設計（カスケード優先）と矛盾する。`cyclic` ですら CSS class 経由で上書き可能にしている前例があるため、ハードコード上書きは採らない。

### `stroke-style: dotted` 等の第 3 の dasharray を使う

現状 `[async]` が `8 4` の dashed を使っている。dotted (`2 2`) を read/write に割り当てると、3 種類の dash パターンが並んで見分けがつきにくくなる。視覚軸を分離するべきで、dasharray 軸を共有してはいけない。

### 色（color）を使う

既存の cyclic edge が色（赤系）を使っており、theme やユーザー `.krs.style` で edge color を上書きするケースもある。色覚多様性への配慮も必要なので、第 1 軸として色を使うのは避ける（v1 default-style では color 変更はしない。ユーザーが `edge[write] { color: ... }` で上書きするのは自由）。

### `[external]` resource の dashed border を流用

`[external]` は所在を表す resource 側のタグで、edge の軸ではない。混ぜると意味の階層が壊れる。

## アクセプタンステスト候補（人間確認が必要なもののみ）

- 実装後、`examples/ec-platform/03-domains.krs` の usecase ドリルダウン view を `karasu render` または preview で開き、`PlaceOrder` の `OrderTable`（write）と `InventoryAPI`（read）に向かう edge が太さで明確に区別できることを目視確認する。
- `[external]` タグと write が両立する resource（例: `examples/feature-samples/resource-operations.krs` に追加 or 既存の `InventoryAPI [external]` で write 系 verb を持たせる）を作り、async + write の組み合わせ（dashed + thick）が正しく重なることを確認する。

> 自動テスト範囲（`isWriteOperation` 純粋関数、edge.tags への注入、style-resolver の selector マッチング、SVG の `stroke-width` 値）は Vitest で保証する。

## 確認事項（実装着手前にユーザー判断が欲しい）

- **width 比**: `read=1.5 / write=3` でよいか、もう少し控えめな `read=1.5 / write=2.5` がよいか。**推奨: 1.5/3**（2 倍差で視認性が高い）。
- **default-style.ts の改変**: `edge[write] { stroke-width: 3; }` を builtin に入れる方針でよいか、それとも renderer 側のフォールバック値で持つか。**推奨: builtin に入れる**（カスケードの一級市民として扱い、ユーザー上書きを自然にする）。
- **examples の追加**: 既存 `feature-samples/resource-operations.krs` を編集して write 系 verb のバラエティを増やすか、新規サンプルを足すか。**推奨: 既存サンプルを増強**（feature 1 件あたり 1 ファイルの方が `legend.krs` 等の慣例とも一貫）。
- **`tags-annotations.md` への記載**: `write`/`read` を reserved edge tag として明記する範囲。**推奨: 短めに**（usecase view で自動付与される旨と、ユーザーが edge に手書きしないでくださいの 1 行のみ）。
