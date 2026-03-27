# i18n サポート（英語・日本語）

- **日付**: 2026-03-24
- **ステータス**: 実装待ち（設計確定済み）
- **関連**: [Issue #34](https://github.com/kompiro/karasu/issues/34)

## 背景・課題

アプリケーションの UI 表示言語として英語と日本語をサポートしたい。
現状は UI 文字列が英語・日本語混在であり、一貫性がない。

また、`packages/core`（Pure TS）が翻訳済みの文字列をそのまま生成しているため、
UI 層での言語切り替えができない構造になっている。

```
現状の問題:
  Diagnostic.message = `Expected ${type} but got ${token.type}` (英語・ハードコード)
  Warning.message     = `domain "${name}" が複数の service に分散しています` (日本語・ハードコード)
  Warning.details     = ["ドメインの凝集性を確認してください"] (日本語・ハードコード)
```

将来的には CLI による図の出力にも対応予定であり、CLI 層でも同じメッセージ翻訳機構を使えるようにする必要がある。

## 制約・前提

- `packages/core` は Pure TS であり、React や i18n ライブラリへの依存を持たせない
- `.krs` 構文（DSL）自体は翻訳対象外（言語非依存）
- `ReferencePanel` が持つ組み込みデータ（description フィールドなど）は今回翻訳しない
- 翻訳ファイルは TypeScript で記述し、キーの型安全を保証する

---

## 決定事項

### 1. 言語解決の優先順位とストレージ

```
localStorage['karasu-locale'] → navigator.language → 'en'（フォールバック）
```

- ブラウザ言語を自動検出しデフォルトとする
- ツールバーに言語セレクタを配置し、ユーザーが明示的に切り替えられる
- 選択結果は `localStorage` に永続化
- 翻訳キーが欠落している場合は英語（`'en'`）にフォールバック

```typescript
// packages/app/src/i18n/locale.ts
export type Locale = 'en' | 'ja';

export function resolveLocale(): Locale {
  const stored = localStorage.getItem('karasu-locale');
  if (stored === 'en' || stored === 'ja') return stored;
  return navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function setLocale(locale: Locale): void {
  localStorage.setItem('karasu-locale', locale);
}
```

---

### 2. 翻訳ライブラリ — 自前マップ（TypeScript 型安全）で開始

自前の `Translations` 型定義による型安全な翻訳マップを採用する。

**採用理由**:
- 現時点では複数形（pluralization）の要件がなく、自前マップで十分
- 依存追加なし、TypeScript の型チェックで関数シグネチャまで保証される

**将来方針**:
複数形が必要になった時点で `typesafe-i18n` への移行を評価し、ADR として記録する。
自前マップ→typesafe-i18n の移行は「翻訳ファイルの書き直し＋呼び出し箇所の変更」を伴うため、
その時点でコストを改めて見積もる。

```typescript
// 自前マップの型定義例
export type Translations = {
  // UI ラベル（文字列）
  'toolbar.newFile': string;
  'project.namePlaceholder': string;

  // パーサーエラー（パラメータあり → 関数）
  'diagnostic.expected-token': (params: { expected: string; got: string; value: string }) => string;

  // 警告
  'warning.domain-dispersal': (params: { domain: string }) => string;
};
```

---

### 3. packages/core のエラー・警告アーキテクチャ

**方針: `message` を完全に削除し、`code` + `params` のみを返す**

`packages/core` は翻訳済み文字列の生成責務を持たない。
`Diagnostic` および `Warning` からは `message`/`details` を完全に取り除き、
構造化されたコードとパラメータのみを返す。

```typescript
// packages/core/src/types/ast.ts
export type DiagnosticCode =
  // パーサー（parser.ts）
  | 'expected-token'               // params: { expected, got, value }
  | 'unexpected-token'             // params: { type, value }
  | 'unexpected-token-in-block'    // params: { type, value }
  | 'role-property-invalid-node'   // params: {}
  | 'team-property-invalid-node'   // params: {}
  | 'expected-string-after-description' // params: {}
  | 'expected-value-for-property'  // params: { prop }
  // import-resolver（import-resolver.ts）
  | 'import-not-found'             // params: { path }
  | 'import-id-not-found'          // params: { id, path }
  | 'circular-import'              // params: { path }
  | 'import-depth-exceeded'        // params: { path }

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: DiagnosticCode;
  params: Record<string, string>;
  loc?: SourceRange;
}

// packages/core/src/types/warnings.ts
export interface Warning {
  kind: WarningKind;               // 既存（翻訳キーとして流用）
  params: Record<string, string>;  // 新規追加
  loc?: SourceRange;
  // message, details は削除
}
```

`Warning.kind` は既に `"domain-dispersal"` 等の構造化キーであるため、翻訳キーとして直接流用できる。
`Warning.details`（可変な詳細行）は `params` 内に含める形で各 `WarningKind` ごとに定義する。

---

### 4. 翻訳ファイルの配置と CLI 共有戦略

翻訳マップ自体はブラウザ依存がなく Pure TS で記述できるため、将来の CLI でも再利用できる。

**現時点の配置**（app 内）:
```
packages/app/src/i18n/
  types.ts          ← Translations 型定義（唯一の真実の源）
  en.ts             ← 英語翻訳
  ja.ts             ← 日本語翻訳
  locale.ts         ← 言語解決ロジック（localStorage + navigator.language）
  index.ts          ← useTranslation hook + LocaleProvider（React 依存）
```

**CLI 実装時の対応**:
翻訳マップ（`types.ts`, `en.ts`, `ja.ts`）を `packages/i18n/` として独立パッケージに分離し、
`packages/app` と `packages/cli` の両方からインポートする。
ロケール解決ロジックは環境ごとに分ける（app: `localStorage` + `navigator.language`、CLI: `LANG` 環境変数等）。

```
将来構成:
packages/
  core/       ← code + params のみ返す
  i18n/       ← 翻訳マップ（Pure TS、環境非依存）
  app/        ← useTranslation hook（packages/i18n を使用）
  cli/        ← CLI 用ロケール解決 + メッセージ変換（packages/i18n を使用）
```

**`useTranslation` hook のシグネチャ**:

```typescript
const { t, locale, setLocale } = useTranslation();

t('toolbar.newFile')
// → 'New File' | '新規ファイル'

t('diagnostic.expected-token', { expected: 'IDENT', got: 'STRING', value: 'foo' })
// → 'Expected IDENT but got STRING ("foo")'
// → 'IDENT を期待しましたが STRING ("foo") が来ました'

// 翻訳キー欠落時は英語にフォールバック
t('some.missing-key')
// → en['some.missing-key']
```

---

## 方針まとめ

| 論点 | 決定 |
|------|------|
| 言語解決 | `localStorage` → `navigator.language` → `'en'` フォールバック |
| 翻訳欠落時 | 英語にフォールバック |
| 言語切替 UI | ツールバーに配置 |
| 翻訳ライブラリ | 自前マップ（TypeScript 型安全）で開始 |
| typesafe-i18n 移行 | 複数形が登場した時点で評価・ADR 化 |
| core のエラー型 | `message`/`details` を削除、`code` + `params` のみ |
| import-resolver エラー | `DiagnosticCode` の対象に含める |
| CLI 共有 | CLI 実装時に翻訳マップを `packages/i18n/` として独立化 |
| 翻訳ファイル配置 | 現時点は `packages/app/src/i18n/*.ts` |
