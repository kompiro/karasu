# ADR-20260413-02: Implicit エッジにおける sync/async の視覚的区別

- **日付**: 2026-04-13
- **ステータス**: 決定済み
- **実装**: PR #606（`fix(core): preserve sync/async for implicit service edges`）
- **関連**:
  - Issue #510
  - ADR-20260410-01: Domain 間エッジと `[implicit]` 自動タグによる暗黙サービスエッジ
  - ADR-20260412-04: implicit edge source shorthand
  - `packages/core/src/view/view-extract.ts` — `deriveImplicitServiceEdges`
  - `packages/core/src/builtins/default-style.ts` — `edge[implicit]`
  - `docs/spec/tags-annotations.md`

## 背景・課題

ADR-20260410-01 で導入された「クロスサービスのドメインエッジから派生する暗黙サービスエッジ」は、現在 `tags: ["implicit"]` を付与され、デフォルトスタイル `edge[implicit] { color: #F59E0B; border-style: dashed; }` でアンバーの破線として描画される。

しかしこの実装には次の問題がある：

1. **sync (`->`) と async (`-->`) の視覚的区別が失われる** — `[implicit]` のスタイルが破線を強制するため、ドメインエッジが `->`（同期）であっても `-->`（非同期）であっても、システムビュー上では同じ「アンバー破線」として描画される。
2. **集約ロジックが kind を考慮しない** — `deriveImplicitServiceEdges` はサービスペア単位 (`from->to`) で集約しており、同一サービスペア間に sync と async の両方のドメインエッジがあっても 1 本のエッジに畳まれてしまう。最初に出現したエッジの `kind` が採用される（実装上は `...edge` の spread 順で決まる暗黙の挙動）。

### 再現例

```krs
system OrderSystem {
  service LegacyService {
    domain Contract {
      -> Billing          // sync
    }
  }
  service NewService {
    domain Contract {
      --> Notification    // async
    }
  }
  service BillingService { domain Billing {} }
  service NotificationService { domain Notification {} }
}
```

`Legacy → Billing` (sync) と `New → Notification` (async) はシステムビューで視覚的に区別できない。

### 影響

- 通信パターン（同期/非同期）は API 設計・障害伝搬・運用上の重要属性である。システムビューでこの情報が欠落すると、システム全体の依存関係を俯瞰する用途で誤解を招く。
- 明示的なサービスエッジ (`edge[async]`) はデフォルトスタイルで破線になっており、暗黙エッジだけが同期/非同期を区別しないのは一貫性を欠く。

## 制約・前提

- `edge[async]` のデフォルトスタイルは `border-style: dashed`（既存）。これは変更しない。
- `edge[implicit]` は ADR-20260410-01 で「クロスサービス派生」を表すマーカーとして導入された。色（アンバー）は維持したい — ユーザーが慣れている視覚記号である。
- `.krs.style` でユーザー上書きが可能であること。
- スタイル解決は `style-resolver.ts` で `edge.kind` から `async` / `sync` の自動タグを付与する仕組みが既にある（参考: `packages/core/src/resolver/style-resolver.ts:289`）。
- 集約ロジックの変更により「N domain edges」ラベルの意味が変わる可能性に注意する。

## 検討した選択肢

### 案 A: sync/async を保持する（推奨）

`edge[implicit]` から `border-style: dashed` を取り除き、**色（アンバー）だけで「派生」を表す**。線種（実線 / 破線）は既存の `edge[async]` ルールに任せる。

派生処理側（`deriveImplicitServiceEdges`）も変更し、集約キーを `${from}->${to}#${kind}` にして kind ごとに別エッジを生成する。同一サービスペアに sync と async の両方があれば 2 本の暗黙エッジが描画される。

**メリット**:
- 既存の「色 = 派生」「破線 = 非同期」という 2 軸の視覚記号がそのまま暗黙エッジにも適用され、明示エッジとの一貫性が高い。
- 実装変更が小さい（スタイル 1 行削除 + 集約キー変更 + テスト追加）。
- ユーザーが既に学習している視覚記号を再利用するため、追加のドキュメント学習コストが低い。

**デメリット**:
- 同じサービスペアに sync と async の両方がある場合、線が 2 本描画されてレイアウトが少し混雑する可能性。
- 「`[implicit]` は無条件で破線」と理解しているユーザーには微妙な挙動変更（後方互換性の観点では既存テーマで `edge[implicit]` を上書きしているユーザーには影響しない）。

### 案 B: 現状維持 + ドキュメント明記

`[implicit]` は「派生」を意味するマーカーであり、視覚的には常にアンバー破線で sync/async を区別しないことを `docs/spec/tags-annotations.md` に明記する。kind 区別が必要な場合はドメインビューにドリルダウンする運用とする。

**メリット**:
- 実装変更ゼロ。
- システムビューがシンプルに保たれる（同一サービスペアは常に 1 本）。

**デメリット**:
- ユーザーが「同期/非同期はシステムビューでは見えない」ことを学習しなければならない。
- ドメインビューに必ず降りないと通信パターンが分からないのは、システムビューの「俯瞰」目的を弱める。
- 明示エッジとの非対称性が残る。

### 案 C: 別の視覚記号を導入

破線ではなく、ラベル先頭にグリフ（例: `⇄ sync` / `≈ async`）を付ける、または小さなバッジを描く。これにより色は「派生」、線種は他の用途に温存できる。

**メリット**:
- 視覚情報量を増やせる（将来 `[ghost]` など別の派生種別が増えたときに線種を割り当て可能）。
- 集約された「N domain edges」のラベルにも組み込みやすい。

**デメリット**:
- レンダラーに新しい記号描画の責務を追加する必要があり、変更範囲が広い。
- グリフの可読性検証（PNG エクスポート、小サイズ表示）が必要。
- 既存の `edge[async]` の視覚記号（破線）と二重表現になり、明示エッジと暗黙エッジで通信パターンの表現方法が異なる不整合が生じる。

## 比較

| 観点                           | 案 A（推奨）       | 案 B（現状維持）   | 案 C（別記号）     |
| ------------------------------ | ------------------ | ------------------ | ------------------ |
| sync/async 区別                | ○                  | ×                  | ○                  |
| 明示エッジとの一貫性           | ○                  | △                  | ×                  |
| 実装コスト                     | 小                 | ゼロ               | 中〜大             |
| ドキュメント学習コスト         | 低                 | 中                 | 中                 |
| システムビューの簡潔さ         | △（最大 2 本/ペア）| ○（1 本/ペア）    | ○                  |
| 将来の派生種別追加への拡張性   | 中                 | 中                 | ○                  |

## 現時点の方針

**案 A を採用する**。理由:

1. 明示エッジと暗黙エッジで「色 = 種別、線種 = 通信パターン」という視覚モデルが統一される。
2. 実装変更が局所的で、既存の `edge[async]` スタイル機構をそのまま活用できる。
3. システムビューの俯瞰目的において、通信パターンは欠かせない情報である。

### 実装方針

1. `packages/core/src/builtins/default-style.ts`
   - `edge[implicit]` から `border-style: dashed` を削除し、`color: #F59E0B` のみとする。
2. `packages/core/src/view/view-extract.ts` (`deriveImplicitServiceEdges`)
   - 集約キーを `${service.id}->${targetServiceId}#${edge.kind}` に変更し、sync と async を別の派生エッジとして生成する。
   - `count` ラベル（`"N domain edges"`）は kind ごとに集計される（例: 2 sync + 1 async → "2 domain edges" の sync 線 + "1 domain edge" の async 線）。
3. `packages/core/src/view/view-extract.test.ts`
   - 同一サービスペアに sync と async の両方がある場合、2 本の implicit エッジが派生し、それぞれ正しい `kind` を持つことを検証するテストを追加する。
4. `docs/spec/tags-annotations.md`
   - `[implicit]` セクションを更新: 「色 = 派生マーカー、線種は元の `edge.kind` に従う」と明記。
5. `docs/acceptance/`
   - `->` と `-->` のクロスサービスドメインエッジがシステムビューで視覚的に区別できることを検証する手動 AT を追加。
