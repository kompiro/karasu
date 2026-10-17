---
type: product
---

# AT: Worker と同じ名前の Durable Object がクラス名を失わない（#3183）

- **日付**: 2026-10-17
- **関連 Issue**: [#3183](https://github.com/kompiro/karasu/issues/3183)
- **関連 ADR**: [ADR-1935](../adr/1935-wrangler-translate-adapter.md)
- **対象ファイル**: `packages/core/src/translate/wrangler.ts`（`durableObjectService`）

> Durable Object のクラス名が Worker 名から作った id と同じだと、id が `<Name>2` に変えられ、クラス名がモデルから消えていた。役割で区別した `<Class>Object` にし、label にクラス名を残す。

## 受け入れ条件

### AC-1: 衝突したときは役割で区別し、クラス名を label に残す

- [x] AT-A: `name = "foo-mcp"` と `class_name = "FooMcp"` から、`service FooMcpObject [external] { label "FooMcp (Durable Object)" }` と `FooMcp -> FooMcpObject` が出る。`FooMcp2` は出ず、警告は改名先を名指す 1 件だけで、出力は parse エラーなしで通る

  > ✅ Automated — `packages/core/src/translate/wrangler.test.ts` › `WranglerTranslator` › `keeps a Durable Object named like its Worker readable, by role and label`

- [x] AT-B: `<Class>Object` も埋まっているときだけ数字を付ける（`FooMcpObject2`）。label は同じ

  > ✅ Automated — `packages/core/src/translate/wrangler.test.ts` › `WranglerTranslator` › `falls back to a numeric suffix when the role-suffixed id is taken too`

### AC-2: 衝突しない Durable Object は変わらない

- [x] AT-C: クラス名が空いている Durable Object は、従来どおりクラス名の id で label なしに出る

  > ✅ Automated — `packages/core/src/translate/wrangler.test.ts` › `WranglerTranslator` › `leaves a Durable Object whose class name is free unlabelled`

## 手動確認

N/A — 自動テストですべて覆っている
