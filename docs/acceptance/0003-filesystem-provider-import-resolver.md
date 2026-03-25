---
type: product
---

# AT-0003: FileSystemProvider と @import 解決

- **日付**: 2026-03-18
- **関連ADR**: なし
- **対象**: `packages/core/src/fs/` — FileSystemProvider interface、InMemoryFileSystemProvider、パスユーティリティ、ImportResolver、compileProject()

## 概要

環境非依存のファイルシステム抽象化（FileSystemProvider）と、`.krs` ファイルの `@import` / `import { } from` を再帰的に解決する ImportResolver を導入する。これにより複数ファイルで構成されるプロジェクトのコンパイルが可能になる。

## 受け入れ条件

すべての項目はテストコードで検証済み。人間による目視確認が必要な項目はない。

## 検証方法

```bash
npx vitest run packages/core/src/fs/   # 53テスト（path-utils: 23, in-memory-provider: 19, import-resolver: 11）
npx vitest run packages/core/          # 既存テスト含む全150テスト通過で後方互換を確認
npm run build                          # ビルド成功
```
