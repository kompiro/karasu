# Organization 図（organization / team / member）

- **日付**: 2026-03-23
- **ステータス**: ドラフト
- **関連**: [Issue #14](https://github.com/kompiro/karasu/issues/14), [syntax.md](../spec/syntax.md), [ast-restructure.md](ast-restructure.md), [ui-toolbar-design.md](ui-toolbar-design.md)

## 背景・課題

現在 karasu は**論理図**（`system` / `service` / `domain` / `usecase` / `resource`）と**物理図**（`deploy`）の2種類のビューを持つ。
サービス・ドメインの**オーナーシップ**を表現する手段として、`service { team "文字列" }` というプロパティが存在するが、以下の問題がある。

- チームの**構造**（誰がいるか、何を担当しているか）を表現できない
- `team` は文字列であり、組織エンティティとして参照・検証できない
- チームビューとして独立した図が存在しないため、「誰がどのサービスを担当しているか」が一目でわからない

Issue #14 では組織構造を記述する**org 図**を3つ目の独立したビューとして追加する。

```
logical  → system / service / domain / usecase / resource
physical → deploy / war / oci / ...
org      → organization / team / member  ← 追加
```

## 制約・前提

- `packages/core` の変更は Pure TS（React/DOM に依存しない）
- 既存の logical / physical 図の動作・構文は変更しない
- `service { team "文字列" }` は**廃止予定**とし、移行期間中は deprecation warning を出す。即時削除はしない
- `@import` 構文は変更しない
- org 図のエッジ宣言（`->`）は最初のスコープには含めない
- スタイル適用は最初のスコープでは最小限（ノード色のみ）で十分

## 検討した選択肢

---

### A: `team` keyword を organization ブロック外でも使う

`organization` ブロックなしに `team` を論理図の中から直接宣言する。

```krs
team backend "バックエンドチーム" {
  owns ECommerce
  member alice "Alice" { ... }
}
```

- メリット: 記述が短い
- デメリット: 論理図・物理図・org 図の区別が構文上不明確になる。`deploy` ブロックに相当するトップレベルの境界がなく、ファイル構造が複雑になる

---

### B: `organization` ブロックを `deploy` と同様のトップレベルブロックとして追加（採用）

`deploy` が物理図の境界であるように、`organization` が org 図の境界となる。

```krs
organization "株式会社Example" {
  team backend "バックエンドチーム" { ... }
  team frontend "フロントエンドチーム" { ... }
}
```

- メリット: `deploy` ブロックと対称的で一貫性がある。ファイル内での論理/物理/org の分離が明確
- デメリット: 1 ファイルに `organization` が複数書ける場合の扱いを決める必要がある（最初のスコープでは先頭の 1 つのみ表示でよい）

---

### C: 専用ファイル形式（`.krs.org`）

org 図を別ファイルに分離する。

- メリット: 関心の分離が徹底される
- デメリット: ファイルが増える、`@import` との統合が複雑になる、MVP には過剰

---

**選定: 案B**
`deploy` との対称性が高く、既存のパーサー構造に自然に追加できる。

---

### org ビューの描画方式

#### 案X: 既存の `render(ViewSlice, ResolvedStyles)` を再利用

`ViewSlice` に org 用フィールドを追加して共通レンダラーに渡す。

- メリット: コードの再利用
- デメリット: `ViewSlice` の型が肥大化する。論理図向けの `ghostUsers` 等の概念が org 図に漏れる。`layout.ts` のアルゴリズムは階層構造を前提としており、org 図（フラットなチーム一覧）に不向き

#### 案Y: 専用レンダラー `renderOrgView()` を追加（採用）

```typescript
// packages/core/src/renderer/org-renderer.ts
export function renderOrgView(
  organizations: OrganizationBlock[],
  orgPath: OrgViewPath,
  styles: ResolvedStyles
): string
```

- メリット: org 図の描画ロジックを独立させられる。`ViewSlice` の型汚染なし
- デメリット: レンダラーが2つになる

**選定: 案Y**
org 図の構造（フラットなチーム一覧 → メンバー一覧）は論理図のネスト構造と根本的に異なる。専用レンダラーが適切。

---

### App のビュー切り替え

#### 案P: URL パラメータ / ルーティング

- デメリット: Vite の SPA 設定変更が必要。MVP には過剰

#### 案Q: State による切り替え（採用）

`viewKind: "logical" | "physical" | "org"` を追加し、ツールバーのボタンで切り替える。

```tsx
const [viewKind, setViewKind] = useState<"logical" | "physical" | "org">("logical");
```

- メリット: 既存の `viewPath` パターンと自然に統合できる
- ツールバーに「Logical」「Physical」「Org」ボタンを追加（アイコン+テキストラベル、`ui-toolbar-design.md` に従う）

---

### `team` プロパティの廃止方針

#### 案R: 即時削除

- デメリット: 既存の `.krs` ファイルが壊れる

#### 案S: Deprecation warning を出しつつパース継続（採用）

パーサーは引き続き `team "文字列"` を受け付けるが、`Diagnostic` に `warning` を追加する。

```
[warning] "team" property on service/domain is deprecated. Use organization block with "owns" instead.
```

将来のバージョンで削除する。

## 現時点の方針

### 1. AST 型の追加（`packages/core/src/types/ast.ts`）

```typescript
export interface MemberNode {
  id: string;
  label: string;
  properties: CommonProperties & {
    slack?: string;
    github?: string;
  };
  loc: SourceRange;
}

export interface TeamNode {
  id: string;
  label: string;
  properties: CommonProperties & {
    owns: string[];   // service/domain の ID を参照
  };
  members: MemberNode[];
  loc: SourceRange;
}

export interface OrganizationBlock {
  label: string;
  properties: CommonProperties;
  teams: TeamNode[];
  loc: SourceRange;
}
```

`KrsFile` に `organizations: OrganizationBlock[]` を追加する。

### 2. Lexer の変更（`packages/core/src/lexer/lexer.ts`）

新規追加するキーワードトークン:

| キーワード | TokenType |
|-----------|-----------|
| `organization` | `Organization` |
| `member` | `Member` |
| `owns` | `Owns` |
| `slack` | `Slack` |
| `github` | `Github` |

`team` は既存 `TokenType.Team` を流用。

### 3. Parser の変更（`packages/core/src/parser/parser.ts`）

`parseFile()` に `TokenType.Organization` の case を追加:

```typescript
case TokenType.Organization:
  file.organizations.push(this.parseOrganizationBlock());
  break;
```

新規メソッド:

- `parseOrganizationBlock()` → `OrganizationBlock`
- `parseTeamBlock()` → `TeamNode`
- `parseMemberBlock()` → `MemberNode`

`parseBlockContentsWithProperties()` の `team` 処理に deprecation warning を追加。

### 4. Org ビューパス型（`packages/core/src/view/org-view-extract.ts`）

```typescript
export type OrgViewPath = [] | [teamId: string];  // [] = team 一覧, [id] = メンバー一覧

export interface OrgViewSlice {
  organization: OrganizationBlock | null;
  teams: TeamNode[];
  focusedTeam: TeamNode | null;
}

export function extractOrgView(
  organizations: OrganizationBlock[],
  path: OrgViewPath
): OrgViewSlice
```

### 5. Org レンダラー（`packages/core/src/renderer/org-renderer.ts`）

- `path === []`: チームカードをフラットに並べる
  - カード内にチーム名・owns 先サービス名・メンバー数を表示
- `path === [teamId]`: メンバーカードを並べる
  - カード内にメンバー名・slack・github を表示

SVG の基本要素は既存の `svg-builder.ts` を再利用する。
レイアウトは `layout.ts` を使わず、単純なグリッド配置（行 × 列）で実装する。

### 6. `owns` バリデーション（`packages/core/src/resolver/warnings.ts`）

- `owns` で参照している ID が `KrsFile.systems` 内の service/domain に存在しない → warning
- 同一 ID を複数チームが `owns` している → warning

### 7. App 側の変更

**`MemoryModeApp.tsx` / `ProjectModeApp.tsx`**:

```tsx
const [viewKind, setViewKind] = useState<"logical" | "physical" | "org">("logical");
const [viewPath, setViewPath] = useState<string[]>([]);
const [orgPath, setOrgPath] = useState<OrgViewPath>([]);
```

**ツールバーボタン（`ui-toolbar-design.md` のルールに従う）**:

```
[≡ Logical]  [⬡ Physical]  [👥 Org]
```

各ボタンはアクティブ状態でハイライト表示する。

**BreadcrumbBar**:
- Logical: 既存の `viewPath` を使用
- Org: `orgPath` から `organization → team` のパンくずを生成

### 8. `useKarasu` フックの拡張方針

org 図専用の `useOrgView(source, orgPath)` フックを別途追加するか、`useKarasu` に統合するかを決める必要がある（未解決の問いを参照）。

## 未解決の問い

1. **`organization` が複数ある場合**: 最初のスコープでは先頭の 1 つだけ表示でよいか？複数切り替え UI が必要か？
2. **`team` ネストなし**: Issue #14 の設計方針通り team のネストはなし。将来的に sub-team が必要になったときの拡張性をどこまで考慮するか？
3. **org 図のスタイル**: `ResolvedStyles` を org 図にも適用するか？最初のスコープでは固定色で十分か？
4. **`useKarasu` 拡張 vs 新規フック**: `useOrgView` を独立させるか、`useKarasu` に統合するか。
5. **`owns` の逆引き表示**: 将来、logical 図のノードに「このサービスを owns しているチーム名」を表示する要望が来る可能性がある。AST に逆引きデータを持たせるか、描画時に都度計算するか？
