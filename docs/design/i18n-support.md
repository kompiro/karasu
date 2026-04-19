# i18n サポート（英語・日本語）

- **日付**: 2026-03-24（初版） / 2026-04-19（現状反映・ロードマップ更新）
- **ステータス**: 実装中（locale 解決 = 実装済み / Translations マップ以降 = 未実装）
- **関連**:
  - [Issue #34](https://github.com/kompiro/karasu/issues/34) — 本 i18n 全体
  - [Issue #639 / PR #686](https://github.com/kompiro/karasu/pull/686) — Chat system prompt i18n（locale 解決を先行実装）
  - [ADR-20260418-01](../adr/20260418-01-chat-prompt-i18n.md) — Chat prompt i18n の決定記録（#34 との接続計画を含む）

## 背景・課題

アプリケーションの UI 表示言語として英語と日本語をサポートしたい。
現状は UI 文字列が英語・日本語混在であり、一貫性がない。

また、`packages/core`（Pure TS）が翻訳済みの文字列をそのまま生成しているため、UI 層での言語切り替えができない構造になっている。

```
現状の問題:
  Diagnostic.message = `Expected ${type} but got ${token.type}` (英語・ハードコード)
  Warning.message     = `domain "${name}" が複数の service に分散しています` (日本語・ハードコード)
  Warning.details     = ["ドメインの凝集性を確認してください"] (日本語・ハードコード)
```

将来的には CLI による図の出力にも対応予定であり、CLI 層でも同じメッセージ翻訳機構を使えるようにする必要がある。

---

## 現状（2026-04-19 時点）

PR #686（Chat system prompt i18n）で一部が先行実装されている。全体像は次の通り:

| 項目 | 状態 | 備考 |
|------|------|------|
| `packages/app/src/i18n/locale.ts`（`Locale` 型、`resolveLocale()`、`setLocale()`） | ✅ 実装済み | PR #686 |
| Chat system prompt の Ja/En 切り替え | ✅ 実装済み | PR #686、`buildSystemPrompt*` を並列に保持 |
| `Translations` 型定義 | ❌ 未実装 | 本 doc 決定事項 2 |
| `useTranslation` hook / `LocaleProvider` | ❌ 未実装 | 本 doc 決定事項 4 |
| `en.ts` / `ja.ts` 翻訳ファイル | ❌ 未実装 | |
| UI 言語セレクタ（Settings ページ） | ❌ 未実装 | `setLocale()` は公開されているが UI から呼び出されていない |
| `packages/core` の `Diagnostic` / `Warning` 再構成（`code + params`） | ❌ 未実装 | 本 doc 決定事項 3 |
| UI コンポーネントのハードコード文字列の抽出 | ❌ 未実装 | 少なくとも 25+ 箇所の日本語文字列が散在 |
| Chat tool 定義（`TOOLS` の `description`）の i18n | ❌ 未実装 | #639 のスコープ外として意図的に残している |
| Chat セッションの locale 変更追従 | ❌ 未実装 | セッション init 時に 1 回だけ解決する設計。#34 の UI セレクタ実装時に要対応（[#34 コメント](https://github.com/kompiro/karasu/issues/34#issuecomment-4273984323)） |

**先行実装（PR #686）で固まった前提**:
- `Locale = 'en' | 'ja'`
- `localStorage['karasu-locale']` → `navigator.language` → `'en'` の解決順序
- `packages/app/src/i18n/` という配置（#34 着地時に `packages/i18n/` への移動を想定）

これらは本 doc の決定事項 1 の通りに実装されており、以降の作業も同じ前提の上に乗る。

---

## 制約・前提

- `packages/core` は Pure TS であり、React や i18n ライブラリへの依存を持たせない
- `.krs` 構文（DSL）自体は翻訳対象外（言語非依存）
- `ReferencePanel` が持つ組み込みデータ（description フィールドなど）は今回翻訳しない
- 翻訳ファイルは TypeScript で記述し、キーの型安全を保証する
- 先行実装された `packages/app/src/i18n/locale.ts` の API は変更せず、Translations 基盤と統合する

---

## 決定事項

### 1. 言語解決の優先順位とストレージ ✅ 実装済み（PR #686）

```
localStorage['karasu-locale'] → navigator.language → 'en'（フォールバック）
```

- ブラウザ言語を自動検出しデフォルトとする
- Settings ページに言語セレクタを配置し、ユーザーが明示的に切り替えられる（UI はまだ）。
  API キー管理等と同じく「たまに触る設定」に分類されるため、目立つツールバー位置ではなく Settings に置く
- 選択結果は `localStorage` に永続化
- 翻訳キーが欠落している場合は英語（`'en'`）にフォールバック

```typescript
// packages/app/src/i18n/locale.ts（PR #686 で実装済み）
export type Locale = 'en' | 'ja';
export function resolveLocale(): Locale { /* 実装済み */ }
export function setLocale(locale: Locale): void { /* 実装済み */ }
```

---

### 2. 翻訳ライブラリ — 自前マップ（TypeScript 型安全）で開始

自前の `Translations` 型定義による型安全な翻訳マップを採用する。

**採用理由**:
- 現時点では複数形（pluralization）の要件がなく、自前マップで十分
- 依存追加なし、TypeScript の型チェックで関数シグネチャまで保証される
- PR #686 の system prompt のように「補間が複雑で Translations に収まらない」ものは、個別に関数を並列に持つ方針でよい（key/value 形に無理に押し込まない）

**将来方針**:
複数形が必要になった時点で `typesafe-i18n` への移行を評価し、ADR として記録する。

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
`Diagnostic` および `Warning` からは `message`/`details` を完全に取り除き、構造化されたコードとパラメータのみを返す。

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

**未実装の状況（2026-04-19）**:
- `Diagnostic` は `message: string` のまま
- `Warning` は `message` + `details` を保持
- `resolver/warnings.ts` で日本語と英語が混在したまま生成されている

この再構成は本 doc で最も大きな変更で、影響範囲は `packages/core` 内の次のファイル群:
- `src/types/ast.ts`（`Diagnostic` 型）
- `src/types/warnings.ts`（`Warning` 型）
- `src/parser/*.ts`（`Diagnostic` を発行する全箇所）
- `src/resolver/*.ts`（特に `resolver/warnings.ts`、396 行の大物）
- `src/import-resolver.ts`（import 系の `Diagnostic`）
- 既存のテストで `expect(warning.message).toBe('...')` のような assertion があれば `expect(warning.kind).toBe('...')` + `params` チェックへ全面的に書き換え

後述の「ロードマップ」で独立 PR として切り出す。

---

### 4. 翻訳ファイルの配置と CLI 共有戦略

翻訳マップ自体はブラウザ依存がなく Pure TS で記述できるため、将来の CLI でも再利用できる。

**現時点の配置**（app 内、PR #686 で先行実装されたディレクトリを拡張する）:
```
packages/app/src/i18n/
  locale.ts         ← 言語解決ロジック ✅ PR #686 で実装済み
  locale.test.ts    ← ✅ 実装済み
  types.ts          ← Translations 型定義（新規・唯一の真実の源）
  en.ts             ← 英語翻訳（新規）
  ja.ts             ← 日本語翻訳（新規）
  index.ts          ← useTranslation hook + LocaleProvider（新規・React 依存）
```

**CLI 実装時の対応**:
翻訳マップ（`types.ts`, `en.ts`, `ja.ts`）を `packages/i18n/` として独立パッケージに分離し、`packages/app` と `packages/cli` の両方からインポートする。ロケール解決ロジックは環境ごとに分ける（app: `localStorage` + `navigator.language`、CLI: `LANG` 環境変数等）。

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

### 5. Locale 変更時の反応（PR #686 からの follow-up）

PR #686 では `useChatSession` が初期化時に `useState(() => resolveLocale())` で 1 回だけ locale を解決している。これはセッション中の挙動ドリフトを避けるための意図的な設計だが、**UI セレクタで切り替えた時に即座に反映されない** という副作用がある。

本 doc の範囲で以下を実装する（詳細は [#34 へのコメント](https://github.com/kompiro/karasu/issues/34#issuecomment-4273984323)）:

- `setLocale()` は localStorage への書き込みに加えて、**グローバル store / React context を更新** する
- UI コンポーネントは `useTranslation()` 経由で現在の locale を購読し、変更時に再レンダリングされる
- `useChatSession` は locale 変更を観測して **セッションをリセット** する（新しい言語で新規会話を開始する UX）
  - 代替案: 変更時に「新しい会話を開始しますか？」と確認ダイアログを出す
  - 採用案: **自動リセット** とする。Chat は各ターンが独立した問答なので、途中で言語が変わる違和感のほうが大きい

この決定は PR #686 で入れた `useState(() => resolveLocale())` を、`useTranslation()` 経由の購読 + `useEffect` でのリセットに置き換える作業を伴う。

---

### 6. Tool definitions の i18n（#639 のスコープ外分）

PR #686 では `packages/app/src/hooks/useChatSession/prompt.ts` の `TOOLS` 配列（`navigate_view`, `apply_krs_patch` の description）は日本語ハードコードのまま残した（Claude は両言語で解釈できるため実害なしと判断）。

本 doc の範囲では **tool description も locale 連動にする**:
- `TOOLS` を関数化し、`buildTools(locale)` が locale に応じて description を差し替える
- `useChatSession` の `runTurn` は `buildTools(locale)` の戻り値を渡す
- tool **名前**（`navigate_view`, `apply_krs_patch`）は固定（プロトコル互換性のため）

これは `Translations` マップの一部として扱う（`'tool.navigate_view.description': string` 等）。

---

## ロードマップ（フェーズ分解）

全体を 1 つの PR にまとめるとレビュー不能の規模になるため、次の順で分割する。各フェーズは独立してマージ可能で、ユーザー体験上の劣化を生まない。

### Phase A — Translations 基盤を app に導入（UI は未変更）

**目的**: `useTranslation` hook と空に近い翻訳マップを整備し、次フェーズ以降で使える土台を作る。

**含むもの**:
- `packages/app/src/i18n/types.ts`（`Translations` 型、最初は数キーだけ）
- `packages/app/src/i18n/en.ts` / `ja.ts`（最初は数キーだけ）
- `packages/app/src/i18n/index.ts`（`LocaleProvider`, `useTranslation` hook, フォールバックロジック）
- **反応性の確立**: `LocaleProvider` の state を `setLocale()` から更新できる経路を通す
- テスト: `useTranslation` の単体テスト、欠落キーの fallback、`setLocale()` → 再レンダリング

**含まないもの**: 既存コンポーネントの翻訳（すべて次フェーズ以降）

---

### Phase B — `packages/core` の `Diagnostic` / `Warning` を構造化

**目的**: core が string ではなく `code + params` を返すようにする。UI は影響を受けない（app 側で既存文字列を一時的に再生成し続ける）。

**含むもの**:
- `Diagnostic.message` を削除、`DiagnosticCode` union + `params` を追加
- `Warning.message` / `details` を削除、`params` を追加
- すべての発行箇所の書き換え（`parser/`, `resolver/`, `import-resolver.ts`）
- 既存テストの assertion を `code` + `params` ベースに書き換え
- **互換ブリッジ**: app 側で `formatDiagnostic(d)` / `formatWarning(w)` のような一時ヘルパーを置き、既存の UI 表示に合わせて日本語文字列を生成する（Phase D で `useTranslation` 経由に置き換える）

**狙い**: core と app の分離を早い段階で確定させ、Phase D 以降のキー移行で core を触らなくて済むようにする。

---

### Phase C — UI コンポーネントの翻訳キー抽出（1〜2 セクションずつ）

**目的**: ハードコード日本語を `Translations` 経由の呼び出しに置き換える。

**サブ PR 候補**（独立してマージ可能）:
- C1: **Settings pane の言語セレクタ**（Phase A の 3 キーを実際に消費し、UI からの locale 切り替えを可能にする）。Settings pane の他の文字列（API キー説明文等）の翻訳は C2 で扱う
- C2: Settings pane の残りの UI 文字列
- C3: Project selector / ダイアログ類（confirm, rename, delete）
- C4: Chat pane（system prompt は #639 で分離済み、UI ラベルのみ）
- C5: NodeDetailPanel, ReferencePanel, DiagramTabBar
- C6: ApiKeySetup, その他小物コンポーネント

各サブ PR は `ja.ts` / `en.ts` に対応する翻訳を追加しつつ、該当コンポーネントの JSX を `t('...')` に差し替える。

---

### Phase D — Diagnostic / Warning の翻訳キー移行

**目的**: Phase B で置いた互換ブリッジ（`formatDiagnostic` / `formatWarning`）を正式な `useTranslation` ベースに置き換える。

**含むもの**:
- `Translations` に `diagnostic.*` / `warning.*` キー群を追加（`en.ts` / `ja.ts`）
- `formatDiagnostic` / `formatWarning` の中身を `t(\`diagnostic.\${d.code}\`, d.params)` に置換
- app 内の diagnostic / warning 表示箇所すべてが `useTranslation` を通るように

---

### Phase E — Chat system prompt の統合（#686 の技術負債返済）

**目的**: PR #686 で入れた `useState(() => resolveLocale())` を Phase A の `useTranslation()` 経由に置き換え、locale 変更時にチャットセッションが自動リセットされるようにする（決定事項 5）。

**含むもの**:
- `useChatSession` を `useTranslation()` 経由の locale 購読に切り替え
- locale 変更を検知した際の session reset（`messages = []`, `phase = 'idle'`）
- `TOOLS` を `buildTools(locale)` に関数化（決定事項 6）
- Chat pane の UI ラベル（Phase C4 と統合する可能性あり）

---

### Phase F — CLI 実装時の切り出し（将来）

CLI が実装される段階で、翻訳マップを `packages/i18n/` として独立パッケージに移動する。本 doc では詳細は決めず、CLI の設計着手時に改めて設計ドキュメントを作成する。

---

## 方針まとめ

| 論点 | 決定 | 状態 |
|------|------|------|
| 言語解決 | `localStorage` → `navigator.language` → `'en'` フォールバック | ✅ 実装済み |
| 翻訳欠落時 | 英語にフォールバック | Phase A で実装 |
| 言語切替 UI | Settings ページに配置（たまに触る設定として扱う） | Phase C1 |
| 翻訳ライブラリ | 自前マップ（TypeScript 型安全）で開始 | Phase A |
| typesafe-i18n 移行 | 複数形が登場した時点で評価・ADR 化 | 将来 |
| core のエラー型 | `message`/`details` を削除、`code` + `params` のみ | Phase B |
| import-resolver エラー | `DiagnosticCode` の対象に含める | Phase B |
| CLI 共有 | CLI 実装時に翻訳マップを `packages/i18n/` として独立化 | Phase F |
| 翻訳ファイル配置 | 現時点は `packages/app/src/i18n/*.ts` | ✅ ディレクトリ実在、Phase A で拡張 |
| Chat tool description | locale 連動（`buildTools(locale)`） | Phase E |
| Chat セッション locale 変更 | 変更時に自動 session reset | Phase E |

---

## ADR 化の予定

実装が一定段階まで進んだ時点で ADR に昇格する。昇格のタイミング案:

- **Phase A 完了時**: i18n 基盤そのものの決定を ADR 化（翻訳ライブラリ、ファイル配置、hook シグネチャ）
- **Phase B 完了時**: `Diagnostic` / `Warning` の code + params 再構成を ADR 化（影響範囲が大きく、独立の判断として記録する価値が高い）

各 ADR のファイル名案: `YYYYMMDD-NN-i18n-foundation.md` / `YYYYMMDD-NN-diagnostic-code-params.md`。
