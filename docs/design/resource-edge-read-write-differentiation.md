# Read/write differentiation for usecase resources

- **日付**: 2026-04-30
- **ステータス**: 検討中
- **関連**:
  - Issue: [#1061](https://github.com/kompiro/issues/1061)
  - 既存 ADR: [ADR-20260430-03](../adr/20260430-03-resource-crud-operations.md)（`operations` プロパティ導入）
  - 関連 Issue: [#1062](https://github.com/kompiro/karasu/issues/1062)（CRUD マトリクスビュー — 補完的・別レーン）
  - 仕様: [docs/spec/syntax.md](../spec/syntax.md) §`operations property`
  - スタイル: [`packages/core/src/builtins/default-style.ts`](../../packages/core/src/builtins/default-style.ts)

## 背景・課題

ADR-20260430-03 で `usecase` 内の `resource` に `operations` プロパティ（CRUD verbs）を持たせられるようになった。次のステップは、その情報を **usecase ビュー上で視覚化** すること。これは特にシステム移行で「DB X を別サービスに切り出すと、どの usecase が壊れるか／読むだけで済むか」を一目で判断できるようにするのが目的。

Issue #1061 起票時には "edge differentiation" と書いたが、実際の renderer を調査すると **usecase view では `resource` は `usecase` コンテナの **子カードとして nested 描画** されている。usecase→resource を結ぶエッジ（line / polyline）は存在しない**。したがって視覚化の主舞台はエッジ装飾ではなく **resource カード自身のスタイル** になる。

現状の usecase view（簡略表示）:

```
┌─ usecase PlaceOrder ────────────────────┐
│ ┌─ resource OrderTable ──┐  ┌─ resource InventoryAPI [external] ─ ┐
│ │  Order table           │  │  (border dashed for external)       │
│ └────────────────────────┘  └─────────────────────────────────────┘
└─────────────────────────────────────────┘
```

resource カードの上には既に **2 つの視覚的軸** が乗っている:

1. **配置（containment）** — どの usecase の子か = 「触るかどうか」
2. **`[external]` タグ → border-style: dashed** — 外部リソースかどうか

write/read の差別化を入れるには、これらと干渉しない第 3 の軸を選ぶ必要がある。

## 制約・前提

- 本設計は **usecase view（domain ドリルダウン以下）** のみを対象とする。system / deploy / org view では resource はそもそも非表示か集約表示なので関係ない。
- ADR-20260430-03 の **write-dominates ルール** を採用する。`create` / `update` / `delete` のいずれかが含まれていれば **write**、それ以外（`read` のみ、または `operations` 未指定）は **read** として扱う。
- `operations` 未指定の resource は **read として扱う**（新規追加の視覚信号が出ないように、最も保守的な側に倒す）。これは「未指定 = 読むだけ」と意味付けるのではなく、**「write の確証が無いものは write 扱いしない」** という解釈。
- 既存の user `.krs.style` を破壊しない。任意のユーザースタイルが `border-style` / `background-color` / `border-color` を上書きできる現状を維持する。
- v1 では SVG の視覚エンコーディングのみを扱う。`.krs.style` セレクタの拡張（`resource[write]` など）は v2 以降。

## 設計の選択肢

### Option A — Border width

`resource` のデフォルト `border-width` を read = `2`（既存値）, write = `4` に変える。

```css
resource           { border-width: 2; }   /* read（既存） */
/* renderer が write 判定で border-width を 4 にオーバーライド */
```

**Pros**:
- 既存スタイル軸（border-style: dashed for external、background-color）と干渉しない
- 「write は強い結合」という意味と「太い枠線」という視覚が直感的に対応
- 実装が最小（renderer 側で write 判定 → strokeWidth を上書きする 1 ヶ所変更で済む）
- 色覚多様性に依存しない

**Cons**:
- 1ステップの太さ違いはノートPC等の高 DPI で見落とされやすい（ただし read=2/write=4 なら 2倍差で十分視認可能）
- ユーザーが `.krs.style` で `border-width` を上書きすると writes/reads の区別も失われる（ただし**ユーザーの意図的上書きが優先される**のは現状仕様と一貫）

### Option B — Decorator badge on resource card

resource カードのコーナーに小さなテキストバッジ（`W` / `R`）を置く。`[external]` の dashed border と同様、**追加の視覚要素** として描画する。

```
┌─ resource OrderTable ──────[W]─┐
│  Order table                   │
└────────────────────────────────┘
```

**Pros**:
- スタイル軸の干渉ゼロ（独立した DOM 要素）
- 拡張性: 将来 v2 で「CR」「RUD」のように生 verb を表示する余地
- スクリーンリーダー対応が容易（`<title>`/`aria-label` を付けやすい）

**Cons**:
- 描画コードが増える（badge レイアウト計算、card 高さへの影響）
- 既存の `📦 client.resource` バッジ・`🔐 capability` バッジと**バッジの語彙が混雑**し始める
- テキスト主体なので i18n の論点が出る（`W`/`R` を使うか `✏️`/`👁️` を使うか）

### Option C — Synthesized usecase→resource edges

containment ではなく明示的なエッジを描き、エッジ自体を read/write でスタイル分け（width / arrowhead / dasharray）する。

**Pros**:
- 「edge differentiation」という当初の Issue 名に最も忠実
- service/system view で resource を表に出した時にも転用可能

**Cons**:
- レイアウトを大きく変える（既存の nested レイアウト前提を壊す）
- usecase が複数 resource を持つと内部にエッジが束になり、密度問題が現実化する
- 既存の sync (`->`) / async (`-->`) エッジ軸（dashed-vs-solid）と衝突する。エッジで read/write も dashed-vs-solid を使うと sync/async と競合
- v1 のスコープを大きく超える

## 決定（提案）

**Option A（border width）を採用する**。

実装方針:

1. **renderer**: usecase view の resource カード描画パスで、`resource.properties.operations` を見て write 判定し、SVG の `stroke-width` を read=2 / write=4 で出し分ける。
2. **判定ロジック**: `isWriteOperation(operations)` ヘルパを `packages/core/src/spec/operations.ts` に追加。`create` / `update` / `delete` のいずれかが含まれていれば true。`isRecognizedResourceOperation` と並んで recognized set 由来の純粋関数。
3. **default style**: `default-style.ts` は変更しない（`resource` のデフォルト `border-width: 2` のまま）。write 用の太さは renderer のハードコード定数として置く（v2 で `.krs.style` セレクタ化する際にカスケード化する余地を残す）。
4. **scope guard**: write の太さ上書きは usecase の **直接の子** resource にだけ適用する。`database` / `queue` / `storage` 配下の物理 resource（`table` / `queue-item` / `bucket`）は対象外。

### 細部の決定

- **read=2, write=4 の 2:1 比** を採用。視認性が確保でき、かつ既存の `border-width: 2` を壊さない。
- **`[external] + write` の場合は dashed border + width=4** を併用（軸が直交するので両方のスタイルが乗る）。
- **`operations` 未指定の resource** は read 扱い（width=2、現状と同じ見た目）。
- **i18n** は不要。視覚エンコーディングのみで、表示テキストは増えない。

## 理由

- Containment レイアウトに**自然に乗る視覚軸**（カードの border 属性）を選ぶことで、既存のレイアウト前提・カスケード仕様を壊さずに済む。
- `border-style`（external 用）/ `background-color`（テーマ・タグ用）/ `color`（テキスト）と独立した `border-width` は、本機能のために空いている数少ない直交軸。
- 太さは数値的・連続的な軸なので、v2 で「`list` / `search` 等の認識外 verb をどう表示するか」「strict-write / soft-write をどう区別するか」が出てきた際にも、`border-width` 値の段階を増やせば拡張できる（badge を増やすより素直）。
- Option B の badge は将来 CRUD verb の生表記を出したくなった時に有効だが、その用途はマトリクスビュー（Issue #1062）の方が遥かに適している。usecase view 上で badge を増やすのは情報密度を上げ過ぎる。

## 却下した案

### Option B — Decorator badge

スタイル干渉は無いが、既存の `📦` / `🔐` バッジと混在し、card のコーナーが賑やかになる。「W/R をひと目で」見えるという目的は border width で十分達成でき、badge の表現力を使い切るのは v2 でマトリクスを作るタイミングがふさわしい。

### Option C — Synthesized edges

レイアウト変更が大き過ぎる上、エッジ軸（sync/async）との衝突回避のために更にスタイル軸を設計する必要があり、スコープが膨らむ。usecase view を edge based に書き換えるのは別の大きな決定で、本 Issue の枠を超える。

### `[external]` を再利用して write/read を一緒に表す

`[external]` は所在（外部か内部か）の役割タグで、操作種別ではない。混ぜると `.krs.style` の `[external]` セレクタとの意味が壊れる。

### `border-color` で write を強調する

色は既にカテゴリ（resource 系統色 vs database 系統色）に使われており、tag セレクタや annotation で更に上書きされる可能性が高い。色覚多様性への配慮も必要になり、border width より複雑度が上がる。

## アクセプタンステスト候補（人間確認が必要なもののみ）

- 実装後、`examples/ec-platform/03-domains.krs` の usecase ドリルダウン view を `karasu render` または preview で開き、`PlaceOrder` 内の `OrderTable`（write）と `InventoryAPI`（read）が border の太さで明確に区別できることを目視確認する。
- `[external]` タグと write が両立する resource（例: 新規サンプルで `resource ExternalDB [external] { operations create }`）を作り、dashed + width=4 が両方適用されることを確認する。

> 自動テスト範囲（write 判定ロジック、SVG の `stroke-width` 値、recognized set との整合）は Vitest で保証する。

## 確認事項（実装着手前にユーザー判断が欲しい）

- **width 比**: `read=2 / write=4` でよいか、もう少し控えめな `read=2 / write=3` がよいか。**推奨: 2:4**。
- **default-style.ts の改変**: 触らずに renderer のハードコード定数で済ませる方針でよいか。**推奨: そのまま**（v2 でセレクタ化する余地を残す）。
- **examples の追加サンプル**: 専用サンプル（`feature-samples/resource-rw-edges.krs` など）を追加するか、既存 `examples/ec-platform/03-domains.krs` の手動確認だけで足りるか。**推奨: 既存サンプルで十分**（追加せず、AT に視認チェックの 1 行を残す）。
