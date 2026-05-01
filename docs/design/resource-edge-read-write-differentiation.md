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

### Option D — Edge midpoint に R / W のテキストラベル

`view-extract.ts` の synthesized edge に **`label` を設定** し、edge の中点に "R" / "W" の短いテキストを描画する。既存の edge ラベル機構（`KrsEdge.label` を `label "..."` で書く構文や `delivers` で自動付与する仕組み）をそのまま再利用する。

```
[ Search products ] ──[R]──▶ ( Product table )
[ Register a product ] ──[W]──▶ ( Product table )
                          └──[W]──▶ ( Product images )
```

実装は `deriveUsecaseResourceNodes` で `label: isWrite ? "W" : "R"` を設定する 1 行追加。

**Pros**:
- **明示的**で読み手の学習が要らない（太さの差を「見比べて」判断する必要がない）
- 移行分析のユースケース（「DB X を切り出すと壊れる usecase はどれか」）には**確定的な情報**が乗る方が向いている
- 既存の `KrsEdge.label` 機構をそのまま使えるので AST 拡張不要
- 色覚多様性・拡大縮小に対して strokeWidth より頑健（ベクタテキストは縮小時も判読可能）
- `[external]`（dashed border）/ sync・async（dashed line）のいずれの軸とも独立

**Cons**:
- usecase が多くの resource を持つとき、エッジ密度の高い箇所で **label が他のラベルや node に重なる可能性**（既存の edge ラベルレイアウトに依存）
- "R"/"W" の文字に**慣習依存**がある。日本語圏のユーザーには CRUD 略字より「読/書」の方が直感的かもしれない（i18n 議論が発生）
- 全 edge に label が出ることで、既にユーザーが explicit edge に `label "..."` を書いている場合と区別がつきにくい
- 将来 v2 で `[create]/[update]/[delete]` の生 verb を表示したくなった時、ラベル文字列の長さが伸びてレイアウトを圧迫する

### Option E — A + D の併用（width + write-only label）

stroke-width で write/read を視覚的に区別しつつ、**write 側にだけ "W" ラベルを乗せる**。read 側はラベルなしで現状の見た目を保つ。

```
[ Search products ] ───────▶ ( Product table )           ← read = thin, no label
[ Register a product ] ══[W]══▶ ( Product table )        ← write = thick + W label
                          └══[W]══▶ ( Product images )
```

**Pros**:
- **冗長エンコーディング**で a11y / 可読性が最大（太さで気づき、ラベルで確証）
- read 側にラベルを出さないことで全体の文字密度を抑制
- 「危険な側（write）に注意マーカーが付く」という意味付けが直感的（移行影響＝ write を強調）
- 太さは `.krs.style` で、ラベルは AST 経由で、それぞれ独立に上書き可能

**Cons**:
- 実装箇所が 2 ヶ所になる（edge.tags 注入 + edge.label 設定）
- write の存在が「あえて目立つ」設計になり、read 中心の図ではラベル無しが大半になり、結果として表示としてはほぼ A と変わらないシーンも

### 視覚階層と width 値の選定

write/read の差を太さで表現する際、既存の cyclic edge（`stroke-width: 2.5`、red）との階層関係を意識する必要がある。

| 種類 | 意味 | 注意レベル | width |
|------|------|-----------|-------|
| read | 通常の参照（情報シグナル） | 低 | 1.5（既存） |
| write | 通常の書き込み（情報シグナル） | 中 | **2.0**（提案） |
| cyclic | アーキテクチャ問題（要修正） | 高 | 2.5（既存） |

cyclic は「直すべき問題」を表す警告シグナルで、write は「通常の操作」を表す意味付け。write を cyclic より太くすると階層が逆転する（通常書き込みが循環依存より深刻に見える）。Option E は label "W" が明示性を担うため、width 差は控えめでよい。`write + cyclic` の同時発生は cyclic スタイル（2.5 + red）が勝つ。

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

**Option E — A + D の併用（width + write-only label）** を採用する。

### 視覚エンコーディング

| edge | stroke-style | stroke-width | label |
|------|--------------|--------------|-------|
| sync + read | solid | 1.5 | (なし) |
| sync + write | solid | 2.0 | `W` |
| async + read | dashed | 1.5 | (なし) |
| async + write | dashed | 2.0 | `W` |

- **stroke-width**: 視覚的な「ぱっと見」の強弱を 1.5 / 3 px の 2 倍差で区別する（A の利点）
- **label "W"**: write 側にだけ明示的なテキストマーカーを乗せ、移行分析のような確証を求めるシーンで「太いだけかどうか曖昧」を排除する（D の利点）
- **read 側はラベル無し**で、現状の見た目をなるべく壊さない（クラッタを最小化）
- 軸が直交するので 4 通り全て区別可能

### 実装方針

1. **`packages/core/src/spec/operations.ts`** に純粋関数を追加:
   ```ts
   export function isWriteOperation(operations: readonly string[] | undefined): boolean {
     if (!operations) return false;
     return operations.some((op) => op === "create" || op === "update" || op === "delete");
   }
   ```

2. **`view-extract.ts` `deriveUsecaseResourceNodes`** を拡張:
   - target `resource.properties.operations` を `isWriteOperation` で判定
   - synthesized edge の `tags` に `"write"` または `"read"` を 1 個入れる
   - write の場合のみ `label: "W"` を設定（read は label 未設定）
   - `operations` 未指定は read 扱い（write の確証なし）

3. **`style-resolver.ts`** は **無変更**。`edgeSelectorMatches` は既に `edge.tags` を見ているので、`[write]` / `[read]` pseudo-tag は自動でセレクタに乗る。

4. **`default-style.ts`** に `edge[write] { stroke-width: 2; }` を 1 行追加。read は既存デフォルト（`strokeWidth: 1.5`）のまま。

   width の階層は意図的に `read (1.5) < write (2) < cyclic (2.5)` に設計する。cyclic は「架構問題」を表す警告シグナルで、通常操作である write より太い／赤い側に置く。`write + cyclic` が同時に発生する edge は cyclic スタイル（`stroke-width: 2.5; color: #EF4444`）が後勝ちで上書きする — これは cyclic の方が優先度の高い注意喚起だから。

5. **`docs/spec/tags-annotations.md`** に reserved edge tag として `write` / `read` を追記。usecase view で自動付与される旨を明記し、ユーザーが手で書く想定ではないと示す。

6. **ユーザー上書き可能性**:
   - `.krs.style` で `edge[write] { stroke-width: 4; color: #f87171; }` のように太さ・色を上書き可能
   - label 文字列は v1 では `"W"` 固定（read/write は日本語環境でも通じる慣用語彙）。カスタマイズは後続 issue で扱う

### Edge tag に write/read を入れる影響範囲

`edgeSelectorMatches` が `edge.tags` を `[async]`/`[sync]`/`[cyclic]` に拡張して扱っているのと同じ階層で `write`/`read` も働くので、追加コードは **edge 生成側 1 ヶ所 + style 1 ルール + label 1 行** で済む。

## 理由

- **冗長エンコーディング** で a11y / 可読性が高まる。stroke-width で「ぱっと見の強弱」、label "W" で「write の確証」を独立に提供する
- **read 側にラベルを乗せない**ので、純粋に read だけの図（参照系の usecase が多い場合）は現状の見た目を壊さない。クラッタが入るのは write が含まれる時だけ
- 「移行で危険な側（write）を強調する」という意味付けは、Issue #1061 の主目的（移行影響の可視化）と直結する
- **既存の pseudo-tag 仕組み（`[async]` / `[sync]` / `[cyclic]`）の自然な拡張**になる。stroke-width は `.krs.style` カスケードに乗り、ユーザーが「もっと太く」「色も変えたい」をコード変更なしで対応できる
- write-dominates 判定を **`view-extract.ts` で edge 生成時に集約** することで、renderer や resolver は「edge.tags / edge.label を見るだけ」の純粋な責務分離を維持
- v2 で `[create]` / `[update]` / `[delete]` の生 verb を表示したくなった時も、label 文字列を `"CR"` / `"RUD"` のように差し替えれば対応できる（拡張パスが開いている）

## 却下した案

### Option A 単独（width のみ、label なし）

太さの差だけだと「他の太い edge（cyclic edge は 2.5、user 上書きで太くなっている edge も別途あり得る）」と混同するリスクがあり、移行分析で確証が必要なシーンで弱い。`W` ラベルが乗ることで「太い理由は write だ」と一意に決まる。冗長エンコーディングのコストは v1 では低いので、片方だけにする理由が薄い。

### Option D 単独（label のみ、width 一定）

ラベルだけでは小さい縮小表示で見落とすリスクがある。**遠目から書き込み多発箇所を探す** という migration 分析の典型動線では、太さで先に絞り込んで、label で確証する 2 段階が効く。stroke-width の追加コストはほぼゼロなので、外す理由が無い。

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

- **エンコーディング**: A+D 併用（width + write-only label）でよいか、A 単独（width のみ）／D 単独（label のみ）に絞りたいか。**推奨: A+D 併用**（移行分析の確証性を優先）。
- **label 文字列**: `"W"` / `(空)` で進めてよいか、`"R"` も明示的に出すか。**確定: `"W"` のみ固定**（read/write は日本語環境でも通じる慣用語彙のため i18n は不要）。
- **width 値**: `read=1.5 / write=2.0` で `read < write < cyclic(2.5)` の階層を保つ案でよいか。控えめ過ぎなら `write=2.25`、もう少し write を強めたいなら `write=2.5` で cyclic と同じ太さ（区別は color/label に任せる）も選択肢。**推奨: 1.5 / 2.0**（cyclic を依然として最も注意喚起する側に保つ）。
- **default-style.ts の改変**: `edge[write] { stroke-width: 3; }` を builtin に入れる方針でよいか、それとも renderer 側のフォールバック値で持つか。**推奨: builtin に入れる**（カスケードの一級市民として扱い、ユーザー上書きを自然にする）。
- **examples の追加**: 以下 3 ファイルを更新する。
  - `examples/feature-samples/resource-operations.krs` — write 系 verb のバラエティを増やし、`[external]` + write の併用ケースを含める
  - `examples/getting-started/index.krs` — `SearchProducts` / `RegisterProduct` / `PlaceOrder` / `Register` の各 usecase の resource に `operations` を追記し、初学者が usecase view ドリルダウンで read/write の違いを目視できるようにする
  - `examples/getting-started-en/index.krs` — 同上（英語版チュートリアルでも体験できるよう揃える）
  - 同 PR で `packages/core/src/builtins/examples.ts` を `examples-sync` ルールに従って同期更新する
- **`tags-annotations.md` への記載**: `write` / `read` を reserved edge tag として明記する範囲。**推奨: 短めに**（usecase view で自動付与される旨と、ユーザーが edge に手書きしないでくださいの 1 行のみ）。
