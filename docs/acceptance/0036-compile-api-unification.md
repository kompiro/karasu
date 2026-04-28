---
id: "0036"
title: compile API unification
type: feature
issue: "#211"
date: 2026-04-01
---

# AT-0036: compile API unification

## Overview

`packages/core` の公開コンパイル API を統一する。
`compile()` / `compileOrgView()` を一本の `compile(src, options?)` に統合し、
`DiagramType` に `"org"` を追加。戻り値を判別共用体 `CompileResult` に変更する。

## 検証方法

```bash
pnpm --filter @karasu-tools/core test    # packages/core/src/index.test.ts
pnpm typecheck
pnpm run build --workspace=packages/core
```

## 受け入れ条件

以下はすべて `packages/core/src/index.test.ts` でカバーされる。

### AC-1: 新 API — 判別共用体の戻り値

- [x] `compile(src, { diagramType: "system" })` → `result.diagramType === "system"` かつ `nodeMetadata`, `hasDeployDiagram`, `deployBlocks` が存在する
> ✅ Automated — `packages/core/src/index.test.ts`（unit）

- [x] `compile(src, { diagramType: "deploy" })` → `result.diagramType === "deploy"` かつ `nodeMetadata`, `deployBlocks` が存在する
> ✅ Automated — `packages/core/src/index.test.ts`（unit）

- [x] `compile(src, { diagramType: "org" })` → `result.diagramType === "org"` かつ `nodePathIndex` が存在する
> ✅ Automated — `packages/core/src/index.test.ts`（unit）

- [x] `compileProject(entry, fs, { diagramType: "org", orgPath: [], displayMode: "icon" })` が正常に SVG を返す
> ✅ Automated — `packages/core/src/index.test.ts`（unit）

- [x] org モードで style-conflict 警告が出ない（builtin + icon theme の組み合わせ）
> ✅ Automated — `packages/core/src/index.test.ts`（unit）

### AC-2: 後方互換 — deprecated API

- [x] `compileProjectOrgView(entry, fs, [], "icon")` が引き続き動作し、`diagramType: "org"` フィールドを含む `OrgCompileResult` を返す
> ✅ Automated — `packages/core/src/index.test.ts`（unit）

## Manual Verification Checklist

### packages/app

1. `cd .worktrees/compile-unify && npm run dev` でアプリを起動する
2. System ビューでノードが正しく描画される
3. Deploy タブに切り替えてデプロイ図が描画される
4. Org タブに切り替えてorg図が描画される
5. 各タブのドリルダウン（パス移動）が正常に機能する

### packages/vscode

1. `packages/vscode` の Extension Development Host でプレビューパネルを開く
2. System / Deploy / Org タブが切り替わり、それぞれ SVG が表示される
