# ビルトインスタイル & シンタックスリファレンス

- **日付**: 2026-03-22
- **ステータス**: ドラフト
- **関連**: [Issue #8](https://github.com/kompiro/karasu/issues/8), [style.md](../spec/style.md), [syntax.md](../spec/syntax.md), [tags-annotations.md](../spec/tags-annotations.md)

## 背景・課題

デフォルトスタイルの定義が以下の3箇所に分散しており、内容に不整合がある。

| 場所 | 内容 |
|------|------|
| `style-resolver.ts` | `DEFAULT_NODE_STYLE`, `KIND_STYLE_OVERRIDES`, `RESOURCE_TAG_SHAPES`（TypeScript 定数） |
| `project-manager.ts` | `DEFAULT_STYLE`（`.krs.style` 形式の文字列定数、プロジェクト作成時にコピー） |
| `docs/spec/style.md` | サンプルスタイル（ドキュメント） |

また、ユーザーが「何をカスタマイズできるか」を把握する手段がない。
サポートされているノード種別・タグ・アノテーション・スタイルプロパティはコードとドキュメントにしか存在しない。

## 制約・前提

- ビルトインスタイルは `packages/core` に置く（app に依存しない）
- 既存プロジェクトとの後方互換性を維持する
- スタイルカスケードの仕組み（詳細度 + sourceIndex）は変更しない
- UI はデスクトップ向け（MemoryMode / ProjectMode 両対応）

## 検討した選択肢

### 案1: ビルトインスタイルを `.krs.style` ファイルとしてバンドル

実際の `.krs.style` ファイルを `packages/core/src/builtins/` に配置し、ビルド時にバンドルする。

- メリット: ユーザーが直接読めるファイル形式
- デメリット: TypeScript のインポートで文字列として扱うにはビルド設定（raw import）が必要

### 案2: TypeScript の文字列定数としてバンドル（採用）

`.krs.style` 形式の文字列を TypeScript ファイル内に定義し、エクスポートする。

- メリット: ビルド設定不要、型安全、テストしやすい
- デメリット: ファイル内の文字列なので直接エディタで `.krs.style` として編集はできない

**選定理由**: 現状の TypeScript ベースのパイプラインに最も自然に統合でき、追加のビルド設定が不要。

### 案3: JSON 形式で定義

構造化データとしてスタイルを定義する。

- メリット: プログラムからの操作が容易
- デメリット: `.krs.style` 構文と二重管理になる、ユーザーが読むには変換が必要

## 現時点の方針

### A. ビルトインスタイルの一元化

#### 新規ファイル: `packages/core/src/builtins/default-style.ts`

```typescript
export const BUILTIN_STYLE_SOURCE: string = `/* karasu built-in default theme */

/* ── ノード種別 ── */
user {
  background-color: #1D4ED8;
  color: #FFFFFF;
  border-color: #1E40AF;
  border-width: 2;
  shape: user;
  font-weight: bold;
  font-size: 13;
}

service {
  background-color: #0369A1;
  color: #FFFFFF;
  border-color: #075985;
  border-width: 2;
  shape: box;
  font-weight: bold;
  font-size: 13;
}

domain {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 1;
  shape: box;
  font-size: 12;
}

usecase {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 1;
  shape: box;
  font-size: 12;
}

resource {
  background-color: #1E3A5F;
  color: #E0F2FE;
  border-color: #0C4A6E;
  border-width: 2;
  font-size: 12;
}

/* ── リソースタグ → シェイプ ── */
resource[table]   { shape: cylinder; }
resource[queue]   { shape: queue; }
resource[api]     { shape: hexagon; }
resource[storage] { shape: cloud; }

/* ── タグ ── */
[external] {
  background-color: #1F2937;
  border-style: dashed;
}

/* ── アノテーション ── */
@deprecated {
  badge-color: #EF4444;
  badge-icon: "⚠";
  badge-label: "非推奨";
  opacity: 0.6;
}

@new {
  badge-color: #10B981;
  badge-icon: "✦";
  badge-label: "NEW";
}

@experimental {
  badge-color: #F59E0B;
  badge-icon: "⚗";
  badge-label: "実験的";
}

@migration-target {
  badge-color: #3B82F6;
  badge-icon: "→";
  badge-label: "移行先";
}

/* ── エッジ ── */
edge {
  color: #94A3B8;
  stroke-width: 1.5;
  font-size: 11;
}

edge[async] {
  border-style: dashed;
}
`;

let _cachedSheet: StyleSheet | null = null;

export function getBuiltinStyleSheet(): StyleSheet {
  if (!_cachedSheet) {
    _cachedSheet = StyleParser.parse(BUILTIN_STYLE_SOURCE).value;
  }
  return _cachedSheet;
}
```

#### 統合対象

現在 `style-resolver.ts` に分散している以下の定数を、上記ビルトインスタイルシートに統合する。

| 現在の定数 | 統合先 |
|-----------|--------|
| `DEFAULT_NODE_STYLE`（bg: #374151, shape: box 等） | 最小限のフォールバックとして残す（ルールが一切マッチしない場合のみ） |
| `KIND_STYLE_OVERRIDES`（resource → bg:#1E3A5F, user → shape:user） | `resource { ... }`, `user { ... }` ルール |
| `RESOURCE_TAG_SHAPES`（table→cylinder, queue→queue 等） | `resource[table] { shape: cylinder; }` 等のルール |
| `DEFAULT_EDGE_STYLE`（color: #94A3B8 等） | `edge { ... }` ルール |
| async エッジの dashed 処理 | `edge[async] { border-style: dashed; }` ルール |

### B. カスケード変更

#### 新しいカスケード順序

```
ビルトインスタイルシート（最低優先度） → ユーザー @import スタイルシート（高優先度）
```

ユーザーが `@import` を一切書かなくても、ビルトインスタイルが暗黙的に適用される。
ユーザーがスタイルを上書きしたい場合のみ、自分の `.krs.style` を `@import` する。

#### `resolveStyles()` の変更

1. `sourceIndex` をシート横断でグローバルに振り直す

   各 `StyleSheet` のパーサーは `ruleIndex` を 0 から始めるため、複数シートの `flatMap` で `sourceIndex` が重複する。
   `resolveStyles()` 内で sheets を順に走査し、グローバルに連番を付け直す。

   ```typescript
   let globalIndex = 0;
   for (const sheet of sheets) {
     for (const rule of sheet.rules) {
       rule.sourceIndex = globalIndex++;
     }
   }
   ```

2. `KIND_STYLE_OVERRIDES`, `RESOURCE_TAG_SHAPES` 定数と tag-shape ロジック（L102-110）を削除
3. `toResolvedNodeStyle()` から `kind` パラメータを削除（kind ベースの上書きはスタイルシートが担当）
4. `DEFAULT_NODE_STYLE` / `DEFAULT_EDGE_STYLE` は最小限のフォールバックとして残す

#### `compile()` / `compileProject()` の変更

```typescript
// compile()
const sheets: StyleSheet[] = [getBuiltinStyleSheet()];
if (styleSource) {
  sheets.push(StyleParser.parse(styleSource).value);
}

// compileProject()
const sheets = [getBuiltinStyleSheet(), ...resolved.styleSheets];
```

### C. プロジェクト管理の変更

#### `project-manager.ts`

- `DEFAULT_STYLE` 定数を削除
- `DEFAULT_KRS` から `@import "default.krs.style"` 行を削除
- `createProject()` で `default.krs.style` ファイルの作成を停止

#### `MemoryModeApp.tsx`

- `SAMPLE_STYLE` 定数を削除
- `SAMPLE_KRS` から `@import "default.krs.style"` 行を削除
- `useKarasu` に `styleSource` を渡さなくても描画される

### D. マイグレーション対応

既存プロジェクトの `.krs` ファイルに `@import "default.krs.style"` が残っているが、
対応する `default.krs.style` ファイルが存在しない場合の対応。

| 現在の挙動 | 変更後 |
|-----------|--------|
| `ImportResolver` が severity `"error"` の diagnostic を出す | severity `"warning"` に緩和 |

描画は止まらず、ビルトインスタイルで表示される。
ユーザーが独自に `default.krs.style` を持つ既存プロジェクトは、そのファイルがビルトインの上に適用される（後方互換）。

### E. リファレンスパネル

#### E.1 構造化リファレンスデータ（core）

新規ファイル: `packages/core/src/builtins/reference.ts`

```typescript
export interface KarasuReference {
  nodeKinds: NodeKindInfo[];
  tags: TagInfo[];
  annotations: AnnotationInfo[];
  styleProperties: StylePropertyInfo[];
  shapes: ShapeInfo[];
  builtinStyleSource: string;
}

export interface NodeKindInfo {
  kind: string;          // "system" | "service" | ...
  description: string;   // 説明
  canContain: string[];  // 含むことができる種別
  properties: string[];  // 使用可能なプロパティ
}

export interface TagInfo {
  name: string;          // "external"
  appliesTo: string;     // "nodes" | "edges" | "user"
  description: string;
}

export interface AnnotationInfo {
  name: string;          // "deprecated"
  description: string;
  defaultBadge: { color: string; icon: string; label: string };
}

export interface StylePropertyInfo {
  name: string;          // "background-color"
  appliesTo: "node" | "edge" | "both";
  valueType: string;     // "color" | "number" | "keyword"
  keywords?: string[];   // border-style: ["solid", "dashed", "dotted"]
  description: string;
}

export interface ShapeInfo {
  name: string;          // "box"
  description: string;   // "角丸長方形"
  defaultFor?: string;   // "service, domain"
}

export function getReference(): KarasuReference { ... }
```

`getReference()` は `docs/spec/` の内容を構造化データとして返す。
`builtinStyleSource` フィールドで `BUILTIN_STYLE_SOURCE` を再エクスポートする。

#### E.2 UI コンポーネント

新規: `packages/app/src/components/ReferencePanel.tsx`

- **表示形式**: プレビュー領域にオーバーレイするスライドアウトパネル
- **トリガー**: ツールバーのアイコンボタン（本 or ? アイコン）
- **対応モード**: MemoryMode・ProjectMode 両方

**セクション構成**:

| タブ | 内容 |
|------|------|
| Syntax | ノード種別一覧（種別、含有関係、プロパティ）、エッジ構文、import 構文 |
| Styles | セレクタ構文、詳細度ルール、スタイルプロパティ一覧、シェイプキーワード |
| Tags & Annotations | タグ一覧、アノテーション一覧（デフォルトバッジのプレビュー付き） |
| Built-in Theme | ビルトインスタイルシートのソース（読み取り専用、コピーボタン付き） |

## 実装フェーズ

| フェーズ | 内容 | 変更対象 |
|---------|------|---------|
| 1 | Core: ビルトインスタイル | `builtins/default-style.ts`（新規）, `style-resolver.ts`, `index.ts`, `import-resolver.ts` |
| 2 | App: 冗長なデフォルト削除 | `project-manager.ts`, `MemoryModeApp.tsx` |
| 3 | Core: リファレンスメタデータ | `builtins/reference.ts`（新規）, `index.ts` |
| 4 | App: リファレンスパネル | `ReferencePanel.tsx`（新規）, `MemoryModeApp.tsx`, `ProjectModeApp.tsx`, `app.css` |

## 決定済みの問い

- **ビルトインテーマ表示のシンタックスハイライト**: 付ける。Monaco Editor の読み取り専用モードを使用する
- **リファレンスデータの国際化**: 現時点では日本語固定。将来的には英語をデフォルトとし、日本語に切り替え可能にする
- **Monaco IntelliSense 統合**: 将来的に発展させる。リファレンスデータの構造化（`KarasuReference`）はその基盤となる
