# compile() / compileOrgView() インターフェース統一

- **日付**: 2026-04-01
- **ステータス**: 検討中
- **関連**: [Issue #211](https://github.com/kompiro/karasu/issues/211), [vscode-extension.md](./vscode-extension.md)

## 背景・課題

`packages/core` の公開コンパイル API が非対称になっている。

| | 単一ファイル（同期） | 複数ファイル（非同期） |
|--|--|--|
| system / deploy | `compile(src, style?, viewPath?, diagramType?, deployId?, displayMode?)` | `compileProject(...)` |
| org | `compileOrgView(src, style?, orgPath?)` | `compileProjectOrgView(...)` |

具体的な問題：

- `DiagramType = "system" | "deploy"` に `"org"` が欠落しており、呼び出し元は図の種類で分岐してから別々の関数を呼ぶ必要がある
- `compile()` は 6 つの位置引数を持ち、引数を取り違えやすい
- 戻り値の型が 2 種類ある（`CompileResult` と `OrgCompileResult`）。`CompileResult` は `nodeMetadata`, `hasDeployDiagram`, `deployBlocks` を持ち、`OrgCompileResult` は `nodePathIndex` を持つ
- 同じ非対称が非同期ペア（`compileProject` / `compileProjectOrgView`）にも繰り返されている

この非対称のまま VSCode Phase 3 (#176) を実装すると、後から修正コストが重複する。

## 制約・前提

- `packages/app` の `useSystemView`, `useDeployView`, `useOrgView` フックが内部的に使用しており、変更が波及する
- `packages/lsp` は `compile()` を直接呼ばず `Parser.parse()` のみ使用しているため、今回の影響はない
- `packages/cli` はコンパイルをブラウザ側（app）に委譲しており、直接影響はない
- TypeScript の型安全性を損なわないこと

## 検討した選択肢

### 案1: フラットなオプションオブジェクト＋任意フィールドで統一

```typescript
type DiagramType = "system" | "deploy" | "org";

interface CompileOptions {
  diagramType?: DiagramType;        // default: "system"
  styleSource?: string;
  viewPath?: ViewPath | OrgViewPath;
  selectedDeployId?: string;        // deploy のみ使用
  displayMode?: DisplayMode;
}

interface CompileResult {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  // system/deploy のみ（org では undefined）
  nodeMetadata?: Map<string, NodeMetadata>;
  hasDeployDiagram?: boolean;
  deployBlocks?: DeployBlockInfo[];
  // org のみ（system/deploy では undefined）
  nodePathIndex?: Map<string, string[]>;
}

function compile(krsSource: string, options?: CompileOptions): CompileResult;
async function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  options?: CompileOptions,
): Promise<CompileResult>;
```

**メリット:**
- 呼び出し元が `svg`, `diagnostics`, `warnings` だけ使う場合はシンプル
- 関数シグネチャが 2 つになり、4 つから半減する
- 段階的な移行が書きやすい（既存コードの改修量が少ない）

**デメリット:**
- `nodeMetadata` や `nodePathIndex` は実際には必ず存在するか undefined なのに、型上は全ての呼び出しで optional になる
- 呼び出し元が `if (result.nodeMetadata)` などを書く必要があり、型ガードが冗長になる可能性
- `viewPath` の型が `ViewPath | OrgViewPath` で、実態は同じ `string[]` だが意味論が混在する

### 案2: 判別共用体（Discriminated Union）で統一

```typescript
type DiagramType = "system" | "deploy" | "org";

interface SystemCompileResult {
  diagramType: "system";
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  deployBlocks: DeployBlockInfo[];
}

interface DeployCompileResult {
  diagramType: "deploy";
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
}

interface OrgCompileResult {
  diagramType: "org";
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  nodePathIndex: Map<string, string[]>;
}

type CompileResult = SystemCompileResult | DeployCompileResult | OrgCompileResult;

interface CompileOptions {
  diagramType?: DiagramType;
  styleSource?: string;
  viewPath?: ViewPath | OrgViewPath;
  selectedDeployId?: string;
  displayMode?: DisplayMode;
}

function compile(krsSource: string, options?: CompileOptions): CompileResult;
async function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  options?: CompileOptions,
): Promise<CompileResult>;
```

**メリット:**
- TypeScript の型絞り込みが自然に働く（`result.diagramType === "org"` で `nodePathIndex` が確実に参照できる）
- フィールドを optional にせず必須で定義できるため、実装の型安全性が高い
- 各ダイアグラム種別ごとに「必ず存在するフィールド」が明確

**デメリット:**
- `svg`, `diagnostics`, `warnings` だけが必要な共通処理でも、型ガードが必要になるか `CompileResult` 型として扱う必要がある
- 今後ダイアグラム種別が増えると共用体のメンバーも増える
- 既存の `useSystemView` などのフックが `SystemCompileResult` を想定した型アサーションを必要とするかもしれない

### 案3: 現状維持＋ `compileAny()` 薄いラッパー追加

既存 API を残したまま、統一ラッパーだけを新規追加する。

```typescript
function compileAny(krsSource: string, options?: CompileOptions): CompileResult | OrgCompileResult;
```

**メリット:** 既存コードへの影響がゼロ

**デメリット:**
- 根本的な問題（DiagramType の欠落・positional params）は解決しない
- API が増え、将来的な廃止コストが重複する
- Issue の意図に沿わない（統一ではなく追加）

## 比較

| 観点 | 案1（フラット） | 案2（判別共用体） | 案3（ラッパー追加） |
|--|--|--|--|
| 型安全性 | △ optional が多い | ◎ 型絞り込みが効く | × 解決しない |
| 呼び出し元の簡潔さ | ◎ 共通処理が簡単 | ○ 型ガード必要 | × 問題は残る |
| 移行コスト | ○ 比較的小 | ○ 比較的小 | ◎ ゼロ（ただし負債継続） |
| 将来の拡張性 | ○ 新フィールドの追加は容易 | ◎ 型が崩れにくい | × |
| LSP/Phase 3 親和性 | ○ | ◎ 図種別ごとの型が明確 | × |

## 現時点の方針

**案2（判別共用体）を採用する方向で検討**。

理由：
- Phase 3 の LSP 実装で、診断結果やナビゲーションを diagramType ごとに扱う場面が出てくることが想定される。その際に型が明確に絞り込めるメリットが大きい
- 案1 の「フラット + optional」は実質的に実行時まで型が不確定で、TypeScript の恩恵を半減させる
- 移行コストは案1 と案2 で大差ない（フックの修正は diagramType-specific なフィールドを参照している箇所のみ）

ただし、`svg`, `diagnostics`, `warnings` を横断的に扱うユーティリティ型として `BaseCompileResult` を共通化する：

```typescript
interface BaseCompileResult {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
}
```

## 論点の深掘り

### 1. `viewPath` と `orgPath` の分離

#### 調査結果

コードを調査した結果、`ViewPath` と `OrgViewPath` は構造的には同一（`string[]`）だが、**意味論が根本的に異なる**。

| 観点 | ViewPath | OrgViewPath |
|--|--|--|
| 走査する木構造 | system → service → domain → usecase → resource | org → team → sub-team |
| 空配列の意味 | システムビュー（全サービス表示） | 全トップレベルチーム表示 |
| 無効パスの挙動 | 空のスライス（フォールバックなし） | ルートチームにフォールバック |
| 利用する抽出関数 | `extractView()` | `extractOrgView()` |

さらに、**現行コードにサイレントバグが存在する**：
`useDeployView` が `viewPath` を `compileProject(..., "deploy", ...)` に渡しているが、
deploy モード時は `viewPath` が完全に無視される（`extractView()` が呼ばれない）。
型エラーは発生しないが、意図せず余分なパラメータを渡し続けている。

#### 結論：`viewPath` と `orgPath` を別フィールドとして並存させる（本 Issue のスコープ）

`viewPath` と `orgPath` は「階層のどこにいるか」という意味論が共通であり、
将来的には `viewPath` に一本化できる。ただしその統合は別 Issue で追跡する（後述）。
本 Issue では現状の状態モデル（`state.viewPath` / `state.orgPath`）に合わせて別フィールドとして並存させる。

```typescript
interface CompileOptions {
  diagramType?: DiagramType;      // default: "system"
  styleSource?: string;
  viewPath?: ViewPath;            // system のみ有効
  orgPath?: OrgViewPath;         // org のみ有効
  selectedDeployId?: string;     // deploy のみ有効
  displayMode?: DisplayMode;
}
```

**理由：**
- `state.viewPath` と `state.orgPath` が app-reducer で別フィールドのため、移行が自然
- `viewPath` への一本化（deploy のドリルダウン対応含む）は別スコープとして分離し、この PR を小さく保つ
- app-reducer の `SET_VIEW_PATH` / `SET_ORG_PATH` アクションとの 1:1 対応が明確

### 2. 旧 API の後方互換性（deprecated）

旧 `compile()` / `compileOrgView()` / `compileProject()` (positional) / `compileProjectOrgView()` は、
**実装完了後も `@deprecated` JSDoc タグを付与して一定期間残す**。

```typescript
/**
 * @deprecated Use `compile(krsSource, options)` instead.
 * Will be removed in a future release. See Issue #NNN.
 */
export function compileOrgView(
  krsSource: string,
  styleSource?: string,
  orgPath?: OrgViewPath,
): OrgCompileResult { ... }
```

**理由：**
- 外部利用者（もしくは将来の VSCode 拡張実装者）が段階的に移行できる
- 一括削除は別 Issue で追跡し、PR のコンテキストを分離する

**フォローアップ Issue：** 本 PR のマージ後、以下の内容で Issue を作成する：
> **Title:** `chore(core): remove deprecated compile API (compileOrgView, compileProjectOrgView, positional overloads)`
> **Body:** `Refs #211` — `@deprecated` タグを付与した旧 API を削除する。
> 削除対象: `compileOrgView`, `compileProjectOrgView`, `compile` の positional オーバーロード。
> 実施タイミング: 全パッケージの移行が完了し、Phase 3 (#176) のスモークテストが通過した後。

### 3. `compileProject` の位置引数 vs オプション

#### 調査結果

現在の `compileProject` 呼び出しパターン（`useSystemView`, `useDeployView`, `useOrgView`）を調査した結果：

- `entryPath` と `fs` は**常に必須**。`null` チェックはフック層で行われており、compile 関数に届く時点では必ず存在する
- 残りの引数（`viewPath`, `diagramType`, `selectedDeployId`, `displayMode`）は全て省略可能
- 6 つ中 2 つが必須、4 つが省略可能というシグネチャが「どれが必須か」を不明瞭にしている

#### 結論：`entryPath` と `fs` は位置引数として残す

```typescript
async function compileProject(
  entryPath: string,           // 必須：エントリーポイントのパス
  fs: FileSystemProvider,      // 必須：ファイルシステムプロバイダ
  options?: CompileOptions,    // 任意：全ての省略可能パラメータ
): Promise<CompileResult>;
```

**理由：**
- 位置引数 = 必須、オプションオブジェクト = 省略可能、という慣例に従う
- `entryPath` と `fs` を options に含めると `compileProject({entryPath, fs})` となり冗長
- TypeScript の `function(required1, required2, options?)` パターンは Node.js エコシステムで広く使われており直感的
- 既存の呼び出し元の変更は `positional args → options object` の機械的な書き換えで済む

## 未解決の問い

（現時点で未解決の論点はなし）

## フォローアップ Issue

本実装完了後に以下の 2 つの Issue を作成する（本 PR のスコープ外）：

### 1. 旧 API の削除

> **Title:** `chore(core): remove deprecated compile API`
> 削除対象: `compileOrgView`, `compileProjectOrgView`, `compile` positional オーバーロード
> 実施条件: `packages/app`, `packages/vscode` の Phase 3 実装が完了し、全 CI が通過済み

### 2. `viewPath` への一本化

Issue #216 として作成済み。
