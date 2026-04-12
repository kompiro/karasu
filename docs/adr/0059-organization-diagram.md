# ADR-0059: Organization 図（organization / team / member）の追加

- **日付**: 2026-03-23
- **ステータス**: 決定済み
- **関連**: Issue #14, [docs/spec/syntax.md](../spec/syntax.md), [ADR-0007](0007-toolbar-icon-label.md)

## 背景

従来の karasu は**論理図**（`system` / `service` / `domain` / `usecase` / `resource`）と**物理図**（`deploy`）の 2 種類のビューを持ち、サービス・ドメインのオーナーシップは `service { team "文字列" }` で表現していた。しかしこの方式には：

- チームの**構造**（誰がいるか、何を担当しているか）を表現できない
- `team` は文字列であり、組織エンティティとして参照・検証できない
- チームビューとして独立した図がなく「誰がどのサービスを担当しているか」が一目でわからない

という課題があった。Issue #14 では組織構造を記述する **org 図** を 3 つ目の独立したビューとして追加する。

## 決定

### 1. `organization` ブロックをトップレベルノードに追加

`deploy` と対称的に、`organization` を org 図の境界とする：

```krs
organization "株式会社Example" {
  team backend "バックエンドチーム" {
    owns ECommerce
    member alice "Alice" { slack "..."; github "..." }
    team "subTeam" { ... }  // sub-team（ネスト可）
  }
}
```

### 2. AST 型

```typescript
interface MemberNode { id, label, properties: CommonProperties & { slack?, github? }, loc }
interface TeamNode { id, label, properties: CommonProperties & { owns: string[] }, members, teams, loc }
interface OrganizationBlock { label, properties, teams, loc }

interface KrsFile {
  organizations: OrganizationBlock[];
  ownerIndex: Map<string, string>;  // serviceId/domainId → teamId
}
```

`ownerIndex` はパース時に構築し、logical 図のレンダラーが「このサービスを owns しているチーム名」を O(1) で参照できるようにする。

### 3. Parser の拡張

- 新規キーワード: `organization` / `member` / `owns` / `slack` / `github`（`team` は既存）
- `parseOrganizationBlock()` / `parseTeamBlock()`（sub-team 再帰） / `parseMemberBlock()` を追加
- `parseBlockContentsWithProperties()` の `team` 処理に deprecation warning を追加（`service { team "..." }` は段階的廃止）

### 4. 専用レンダラー `renderOrgView()`

`packages/core/src/renderer/org-renderer.ts` に専用レンダラーを作成。`ViewSlice` とは独立した `OrgViewSlice` / `OrgViewPath` 型を使う：

- `path === []` → 全 org のチームをフラットに結合したチームカードグリッド表示
- `path.length > 0` → `focusedTeam` のメンバー一覧 + sub-team 一覧
- レイアウトは `layout.ts` を使わず単純なグリッド配置

### 5. App の 3 ビューモデル

`viewKind: "logical" | "physical" | "org"` で切り替え、ツールバーボタン（ADR-0007 に従いアイコン + ラベル）を追加。`useOrgView` フックを `useKarasu` と並列に呼び出す。

### 6. バリデーション

| ケース | 重要度 |
|---|---|
| `owns` で参照している ID が system 階層に存在しない | warning |
| 同一 ID を複数チームが `owns` | warning |
| 同一 `organization` 内での `team id` 重複（sub-team を含む全階層） | **error**（AST 構築は続行） |

### 7. `team` プロパティの廃止方針

即時削除ではなく、deprecation warning を出しつつパースを継続する（案S）。将来のバージョンで削除する。

## 理由

- **`deploy` との対称性**: `organization` をトップレベルブロックにすることで、ファイル内の論理/物理/org の境界が明確になる
- **専用レンダラー**: org 図の構造（フラットなチーム一覧 → メンバー一覧）は論理図のネスト構造と根本的に異なる。`ViewSlice` に org 用フィールドを混ぜると型が肥大化し、`layout.ts` のアルゴリズムも不向き
- **`ownerIndex` のパース時構築**: `@karasu/core` が「サービスを owns しているチーム」を O(1) で返せるようになり、logical 図レンダラーがチーム名を簡単に参照できる
- **`team "文字列"` の段階的廃止**: 即時削除だと既存 `.krs` ファイルが壊れる。deprecation warning で次期リリースに向けて移行を促す
- **ビュー切替の State 管理**: Vite の SPA 設定変更が必要になる URL ルーティング案より、`viewKind` state で切り替える方が実装コストが低く `viewPath` パターンとも整合する

## 却下した案

### 案A: `team` キーワードを organization ブロック外でも使う

論理図・物理図・org 図の区別が構文上不明確になり、`deploy` ブロックに相当するトップレベル境界がない。

### 案C: 専用ファイル形式 `.krs.org`

関心の分離は徹底されるが、ファイルが増え `@import` 統合が複雑になる。MVP には過剰。

### 案X: 既存の `render(ViewSlice, ResolvedStyles)` を再利用

`ViewSlice` の型が肥大化し、論理図向けの `ghostUsers` 等の概念が org 図に漏れる。`layout.ts` も階層構造前提で不向き。

## 未実装の拡張

- org 図のエッジ宣言（`->`）は初期スコープ外
- スタイル適用は初期スコープではノード色のみ
- エッジクリックによる System 図ドリルダウン（ADR-0055 で Phase 1 として対応）
