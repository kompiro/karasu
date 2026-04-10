# Domain-to-Domain Dependency Edges

- **日付**: 2026-04-10
- **ステータス**: 完了
- **関連**: Issue #445

## 背景・課題

現在の `.krs` 構文では、ドメイン間の依存関係を表現する手段がない。
Chat UI でアーキテクチャを AI に提案させたとき、「Billing は Contract に依存している」
といった関係が記述できないことが明らかになった。

ドメイン依存はサービス境界に依存しない本質的な関係であり、ドメインが別サービスに切り出されても
依存の事実は変わらない。この概念を一級市民として構文で表現すべきである。

### パーサーの現状

調査の結果、**パーサーはすでに `domain` ブロック内でのエッジ宣言をサポートしている**。
`parseBlockContentsWithProperties()` が全ノード種別で `->` / `-->` を受け入れるため、
構文上の変更は不要。

問題はビュー抽出（`view-extract.ts`）と描画段階で、ドメインレベルのエッジが処理されていない点にある。

## 制約・前提

- パーサー変更は不要（エッジ宣言はすでに `domain` ブロックで受け入れられる）
- `KrsEdge` の `from` / `to` はノード ID（変更不要）
- ドメイン ID はシステム内で一意でなければならない（`-> Contract` が曖昧にならないよう）
- 現在、クロスサービスでの同一ドメイン ID は warning — これを error に格上げする必要がある
- 既存の ghost エッジ概念（`ghost: true`、`GHOST_OPACITY`）は外部参照に使用済み

## 検討した選択肢

### A. ドメインエッジを固定色で描画する

クロスサービスのドメインエッジから派生したサービス間暗黙エッジを、
ハードコードした固定色（例: オレンジ `#F97316`）で描画する。

**メリット**
- 実装がシンプル
- ユーザーが覚えやすい視覚的慣例を確立できる

**デメリット**
- カスタマイズ不可
- `.krs.style` による上書きができない
- カラーテーマ変更への対応が難しい

---

### B. 自動タグ `[implicit]` を付与してスタイル解決に委ねる

派生した暗黙サービスエッジに `[implicit]` タグを自動付与し、
スタイル解決（`style-resolver.ts`）のデフォルトで区別色を当てる。
ユーザーは `.krs.style` で上書き可能。

```krs
// 自動生成される暗黙エッジのイメージ（内部表現）
ECommerce --> BillingService "implicit" [implicit]
```

```krs.style
// デフォルトスタイル（組み込み）
edge[implicit] {
  color: #F97316;
  stroke-style: dashed;
}

// ユーザーが上書き可能
edge[implicit] {
  color: purple;
}
```

**メリット**
- 既存のタグベーススタイル機構と一貫している
- カスタマイズ可能
- 将来的なスタイル拡張に対応しやすい
- `[implicit]` タグは他の派生エッジ（例: ghost edges）にも再利用できる

**デメリット**
- スタイル解決にデフォルト値の追加が必要
- タグが自動付与されることをドキュメントに記載する必要がある

---

### C. Ghost エッジとして描画する

既存の ghost 描画機能（`opacity: GHOST_OPACITY`）を流用し、
暗黙エッジを半透明で描画する。

**メリット**
- 既存インフラの再利用
- 実装量が少ない

**デメリット**
- Ghost の既存意味（「現在のビューの外にあるノードへの参照」）と混同される
- 視覚的に目立たず、暗黙依存が見落とされる可能性がある
- 意味的に不正確

---

## 比較

| 観点 | A. 固定色 | B. 自動タグ | C. Ghost |
|------|----------|-------------|----------|
| カスタマイズ性 | ✗ | ✓ | △ |
| 既存パターンとの一貫性 | △ | ✓ | △（意味が異なる） |
| 実装コスト | 低 | 中 | 低 |
| 意味の明確さ | ✓ | ✓ | ✗ |
| 将来の拡張性 | △ | ✓ | △ |

## 現時点の方針

**案B（自動タグ `[implicit]`）を採用する。**

理由:
- 既存のスタイル解決パイプラインと整合している
- ユーザーがスタイルを上書きできる柔軟性を持つ
- `[implicit]` タグは将来の他の派生エッジにも再利用できる

### 実装方針

#### 1. Domain ID 一意性の格上げ（`parser.ts`）

`buildNodePathIndex()` 内のクロスサービス重複チェックを `"warning"` から `"error"` に変更する。

```typescript
// Before
severity: "warning",
message: `Node id "${node.id}" appears in multiple locations; first path is used for navigation`,

// After
severity: "error",
message: `Domain id "${node.id}" must be unique within a system; found in multiple services`,
```

#### 2. ドメインエッジの view 抽出（`view-extract.ts`）

**サービスビュー（サービス内ドメイン表示）**

サービスのビューを構築する際、その配下の domain ノードが持つエッジのうち、
両端点がそのサービスの直接子ドメインである「イントラサービスドメインエッジ」を収集し、描画対象に加える。

**システムビュー（サービス間暗黙エッジの派生）**

システムビューを構築する際、各サービスの domain ノードを再帰的に走査し、
`to` が別サービス配下のドメインを指すエッジを「クロスサービスドメインエッジ」として検出する。

該当エッジに対して:
1. 送信元ドメインの親サービス → 受信側ドメインの親サービス という形でサービス間エッジを派生させる
2. 既存の明示的サービス間エッジ（`system.edges`）と重複する場合は派生エッジを追加しない
3. 重複しない場合、`tags: ["implicit"]` を付与した `KrsEdge` を合成してビューに加える

```typescript
// 疑似コード
function deriveImplicitServiceEdges(system: KrsNode, serviceMap: Map<string, KrsNode>): KrsEdge[] {
  const implicitEdges: KrsEdge[] = [];
  for (const service of system.children.filter(c => c.kind === "service")) {
    for (const domain of service.children.filter(c => c.kind === "domain")) {
      for (const edge of domain.edges) {
        const targetService = findServiceForDomain(edge.to, serviceMap);
        if (targetService && targetService.id !== service.id) {
          const key = `${service.id}->${targetService.id}`;
          if (!explicitKeys.has(key)) {
            implicitEdges.push({
              from: service.id,
              to: targetService.id,
              label: edge.label,
              kind: edge.kind,
              tags: [...edge.tags, "implicit"],
              loc: edge.loc,
            });
          }
        }
      }
    }
  }
  return implicitEdges;
}
```

#### 3. デフォルトスタイル（`style-resolver.ts` / builtin styles）

`[implicit]` タグを持つエッジのデフォルトスタイルを組み込みスタイルに追加する。
色はアンバー `#F59E0B` とする（ダーク背景での視認性を考慮）:

```
edge[implicit] {
  color: #F59E0B;      /* amber-400: ダーク背景で視認しやすい */
  stroke-style: dashed;
}
```

#### 4. 暗黙エッジのラベル表示

複数のドメインエッジが同一サービスペアに集約される場合、
各エッジの責務は異なるため、複数の意味を1本の線で表現するとコンテキストが失われる。

- **線のラベル**: `"N domain edges"` 形式の件数を表示（例: `"2 domain edges"`）
- **クリックで詳細**: クリック時に各ドメインエッジ（from → to、label）の一覧をパネルやツールチップで表示
- **複数線描画**（将来課題）: 同一ペアを複数の平行線で描画する案は、エッジ交差ルーティングの複雑さから現フェーズでは対象外

ドメインエッジが1本のみの場合はそのラベルをそのまま表示する。

#### 5. ドキュメントの更新

**`docs/spec/tags-annotations.md`**
「自動付与タグ（System-assigned tags）」セクションを新設し、`[implicit]` を記載する。
ユーザーが宣言するタグと区別するため、セクションを分ける。

**`docs/spec/syntax.md`**
`domain` ブロック内でのエッジ宣言を説明する箇所に以下の注記を追加する:

> タグ（`[implicit]` など）の詳細は `docs/spec/tags-annotations.md` を参照。

### 描画フロー（サマリー）

```
.krs ファイル
  └─ domain Billing { -> Contract "契約から作成"; -> Order "受注から請求" }
        │
        ▼ view-extract.ts
  [サービスビュー]            [システムビュー]
  ドメイン間エッジとして        暗黙サービスエッジとして派生
  そのまま描画                 tags: ["implicit"] 付与
                               edge[implicit] スタイル適用
                               → アンバー破線で描画
                               ラベル: "2 domain edges"
                               クリック → 各エッジの詳細表示
```

## 未解決の問い（解決済み）

| 問い | 決定 | 理由 |
|------|------|------|
| デフォルト色 | アンバー `#F59E0B` | ダーク背景での視認性 |
| ラベルの扱い | 件数表示 + クリックで詳細 | 複数エッジの責務の違いを保持。複数線描画は将来課題 |
| `[implicit]` のドキュメント | `tags-annotations.md` に自動付与タグセクションを新設。`syntax.md` には同ファイルへの誘導注記を追加 | タグ情報の集約と発見しやすさの両立 |
