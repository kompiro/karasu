# ADR-20260322-01: ビルトインスタイルの一元化と構造化リファレンス

- **日付**: 2026-03-22
- **ステータス**: 決定済み
- **関連**: Issue #8, [docs/spec/style.md](../spec/style.md), [docs/spec/syntax.md](../spec/syntax.md), [docs/spec/tags-annotations.md](../spec/tags-annotations.md)

## 背景

デフォルトスタイルの定義が 3 箇所に分散し内容に不整合があった：

| 場所 | 内容 |
|---|---|
| `style-resolver.ts` | `DEFAULT_NODE_STYLE`, `KIND_STYLE_OVERRIDES`, `RESOURCE_TAG_SHAPES`（TS 定数） |
| `project-manager.ts` | `DEFAULT_STYLE`（`.krs.style` 形式の文字列、プロジェクト作成時にコピー） |
| `docs/spec/style.md` | サンプル（ドキュメント） |

また、ユーザーが「何をカスタマイズできるか」を把握する手段がなく、サポートされているノード種別・タグ・アノテーション・スタイルプロパティはコードとドキュメントにしか存在しなかった。

## 決定

### 1. ビルトインスタイルの TypeScript 文字列定数化

`packages/core/src/builtins/default-style.ts` に `BUILTIN_STYLE_SOURCE: string` を定義し、`.krs.style` 形式の文字列として全種別・タグ・アノテーションのデフォルトを集約する。`getBuiltinStyleSheet()` が内部キャッシュ付きで `StyleSheet` を返す。

### 2. カスケード順序

```
ビルトインスタイルシート（最低優先度） → ユーザー @import スタイルシート（高優先度）
```

ユーザーが `@import` を書かなくてもビルトインが暗黙適用され、上書きしたい場合のみ自分の `.krs.style` を `@import` する。

### 3. `resolveStyles()` の変更

- `sourceIndex` をシート横断でグローバルに振り直す（各 `StyleSheet` パーサーは `ruleIndex` を 0 から開始するため、複数シート `flatMap` で重複するのを解消）
- `KIND_STYLE_OVERRIDES` / `RESOURCE_TAG_SHAPES` 定数と tag-shape ロジックを削除し、`resource[table] { shape: cylinder; }` 等のスタイルシートルールに置き換え
- `toResolvedNodeStyle()` から `kind` パラメータを削除
- `DEFAULT_NODE_STYLE` / `DEFAULT_EDGE_STYLE` は最小限のフォールバックとして残す（ルールが一切マッチしない場合のみ）

### 4. プロジェクト管理の変更

- `project-manager.ts`: `DEFAULT_STYLE` 定数削除、`DEFAULT_KRS` から `@import "default.krs.style"` 行を削除、`createProject()` で `default.krs.style` ファイルの作成を停止
- `MemoryModeApp.tsx`: `SAMPLE_STYLE` 定数削除、`SAMPLE_KRS` から `@import` 行を削除

### 5. マイグレーション対応

既存プロジェクトの `.krs` に `@import "default.krs.style"` が残っているが対応ファイルが存在しない場合、`ImportResolver` の diagnostic severity を `error` → `warning` に緩和する。描画は止まらずビルトインスタイルで表示される。既存プロジェクトが独自の `default.krs.style` を持っていればそのファイルがビルトインの上に適用される（後方互換）。

### 6. 構造化リファレンス

`packages/core/src/builtins/reference.ts` に `getReference(): KarasuReference` を追加。`nodeKinds` / `tags` / `annotations` / `styleProperties` / `shapes` / `builtinStyleSource` を構造化データとして返す。

`packages/app/src/components/ReferencePanel.tsx` をプレビュー領域オーバーレイのスライドアウトパネルとして実装し、ツールバーのアイコンボタンから開く。タブは Syntax / Styles / Tags & Annotations / Built-in Theme（Monaco 読み取り専用 + コピーボタン）。

## 理由

- **TypeScript 定数で管理**: `?raw` import のビルド設定が不要で、型安全・テストしやすい。`.krs.style` ファイルとして外部管理する案はビルド設定が必要で複雑化する
- **3 箇所の定義の一元化**: `style-resolver.ts` / `project-manager.ts` / `docs/spec/style.md` の不整合が解消される
- **カスケードによる暗黙適用**: 新規ユーザーが何も書かなくても動作し、上書きしたいときだけ追加の `@import` を書く、という期待通りの体験になる
- **`sourceIndex` のグローバル振り直し**: 複数シートの `flatMap` で `sourceIndex` が重複する問題を最低限の変更で解消でき、既存のカスケード機構（詳細度 + sourceIndex）をそのまま活用できる
- **`KarasuReference` の構造化**: 将来 Monaco IntelliSense 統合やドキュメント生成に再利用できる基盤になる

## 却下した案

### 案1: ビルトインスタイルを `.krs.style` ファイルとしてバンドル

ユーザーが直接読めるファイル形式になる利点はあるが、TypeScript の import で文字列として扱うには `?raw` 等のビルド設定が必要で複雑化する。

### 案3: JSON 形式で定義

プログラムからの操作は容易だが、`.krs.style` 構文と二重管理になり、ユーザーが読むには変換が必要。

## 決定済みの細部

- **ビルトインテーマ表示のシンタックスハイライト**: Monaco Editor 読み取り専用モードを使用
- **リファレンスデータの国際化**: 現時点は日本語固定。将来は英語をデフォルトとし切替可能にする
- **Monaco IntelliSense 統合**: 将来展開可能。`KarasuReference` がその基盤
