---
id: ADR-20260401-03
title: "`compile()` API 統一 — Discriminated Union による戻り値型"
status: accepted
date: 2026-04-01
topic: parser
scope:
  packages:
    - core
---

# ADR-20260401-03: `compile()` API 統一 — Discriminated Union による戻り値型

- **日付**: 2026-04-01
- **ステータス**: 決定済み
- **関連**: Issue #211

## 背景

`packages/core` の公開コンパイル API が非対称で、`DiagramType = "system" | "deploy"` には `"org"` が欠落しており、呼び出し元は図の種類で分岐してから別々の関数を呼ぶ必要があった：

| | 単一ファイル（同期） | 複数ファイル（非同期） |
|---|---|---|
| system / deploy | `compile(src, style?, viewPath?, diagramType?, deployId?, displayMode?)` | `compileProject(...)` |
| org | `compileOrgView(src, style?, orgPath?)` | `compileProjectOrgView(...)` |

`compile()` は 6 つの位置引数を持ち取り違えやすく、戻り値の型も 2 種類ある（`CompileResult` と `OrgCompileResult`）。この非対称のまま VSCode Phase 3 (#176) を実装すると後から修正コストが重複する。

## 決定

### 1. `CompileOptions` とシグネチャの統一

```typescript
type DiagramType = "system" | "deploy" | "org";

interface CompileOptions {
  diagramType?: DiagramType;      // default: "system"
  styleSource?: string;
  viewPath?: ViewPath;            // system のみ有効
  orgPath?: OrgViewPath;          // org のみ有効
  selectedDeployId?: string;      // deploy のみ有効
  displayMode?: DisplayMode;
}

function compile(krsSource: string, options?: CompileOptions): CompileResult;
async function compileProject(
  entryPath: string,
  fs: FileSystemProvider,
  options?: CompileOptions,
): Promise<CompileResult>;
```

### 2. Discriminated Union による戻り値型

```typescript
interface BaseCompileResult {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
}

interface SystemCompileResult extends BaseCompileResult {
  diagramType: "system";
  nodeMetadata: Map<string, NodeMetadata>;
  hasDeployDiagram: boolean;
  deployBlocks: DeployBlockInfo[];
}

interface DeployCompileResult extends BaseCompileResult {
  diagramType: "deploy";
  nodeMetadata: Map<string, NodeMetadata>;
  deployBlocks: DeployBlockInfo[];
}

interface OrgCompileResult extends BaseCompileResult {
  diagramType: "org";
  nodePathIndex: Map<string, string[]>;
}

type CompileResult = SystemCompileResult | DeployCompileResult | OrgCompileResult;
```

### 3. 旧 API の段階的廃止

旧 `compile()` / `compileOrgView()` / positional オーバーロード / `compileProjectOrgView()` は `@deprecated` JSDoc タグを付与して当面残す。完全削除は別 Issue で追跡する（全パッケージの移行と Phase 3 (#176) のスモークテスト通過後）。

### 4. `viewPath` / `orgPath` の並存

`state.viewPath` と `state.orgPath` が `app-reducer` で別フィールドなので、`CompileOptions` でも別フィールドとして並存させる。`viewPath` への一本化（deploy のドリルダウン対応含む）は Issue #216 で追跡。

### 5. `compileProject` の `entryPath` / `fs` は位置引数

`entryPath` と `fs` は常に必須なので位置引数として残し、残りは `options` オブジェクトに集約する。Node.js エコシステムで慣例化されている「`function(required1, required2, options?)`」パターンを踏襲する。

## 理由

- **判別共用体の型絞り込み**: `result.diagramType === "org"` で `nodePathIndex` が確実に参照できる。case 1（フラット + optional）は TypeScript の恩恵を半減させる
- **Phase 3 対応**: LSP 実装で diagramType ごとに診断・ナビゲーションを扱う場面が想定され、型が明確に絞り込めるメリットが大きい
- **移行コストは最小**: フックの修正は diagramType-specific なフィールドを参照している箇所のみで済む
- **旧 API の `@deprecated` 維持**: 外部利用者や将来の拡張実装者が段階的に移行でき、PR のコンテキストを分離できる
- **位置引数 = 必須、options = 省略可能**: 慣例に従うことで「どれが必須か」が自明になる。`compileProject({entryPath, fs})` のような冗長表現を避けられる

## 却下した案

### 案1: フラットなオプションオブジェクト + 任意フィールド

`nodeMetadata` / `nodePathIndex` を戻り値の optional フィールドにまとめる案。型上はすべての呼び出しで optional になり、呼び出し元で型ガードが冗長になる。実質的に実行時まで型が不確定で TypeScript の恩恵が半減する。

### 案3: 現状維持 + `compileAny()` 薄いラッパー

根本的な問題（`DiagramType` の欠落・positional params）が解決せず、API が増えて将来の廃止コストが重複する。

## サイレントバグの修正（関連）

調査中に `useDeployView` が `compileProject(..., "deploy", ..., viewPath, ...)` を呼んでいたが、deploy モード時は `viewPath` が完全に無視されていた問題を発見した。本 API 統一で `CompileOptions` の設計により解消される（`orgPath` / `viewPath` / `selectedDeployId` がフィールドとして分離）。

## フォローアップ Issue

- **旧 API の削除**: `chore(core): remove deprecated compile API`（実施条件: `packages/app` / `packages/vscode` の Phase 3 実装完了、全 CI 通過）
- **`viewPath` への一本化**: Issue #216
