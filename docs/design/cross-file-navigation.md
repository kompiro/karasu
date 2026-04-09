# Cross-File Navigation in Multifile Projects

- **日付**: 2026-04-09
- **ステータス**: 提案
- **関連**:
  - Issue #429 — feat(app/lsp): cross-file navigation in multifile projects
  - [named-import-toplevel-service.md](named-import-toplevel-service.md) — マルチファイル名前付きインポート修正（#412）
  - `packages/core/src/fs/import-resolver.ts` — インポート解決
  - `packages/app/src/components/AppShell.tsx` — ブレッドクラム・コードジャンプ
  - `packages/lsp/src/server.ts` — LSP definition ハンドラ

## 背景・課題

マルチファイルプロジェクトで、ノード（service/domain など）が現在アクティブなファイルとは
別ファイルに定義されている場合、2つのナビゲーション機能が壊れる:

### 問題1: ドリルダウン時にブレッドクラムが更新されない

`breadcrumbItems` (AppShell.tsx:210) は `Parser.parse(fileContent)` でアクティブファイルのみを
再パースしており、`current.children.find((c) => c.id === viewPath[i])` でノードを探す。
インポートで取り込まれたファイルのノードはこのツリーに存在しないため、ループが途中で
break して途切れたブレッドクラムになる。

`orgBreadcrumbItems` も同様の問題を抱えている（再パース使用）。

### 問題2: コードジャンプが正しいファイルに飛ばない

`handleJumpToEditor` (AppShell.tsx:129) は `findNodeLine(parseResult.value, nodeId)` で
アクティブファイルのみを検索する。ノードが別ファイルに定義されていると見つからず、
ジャンプ自体が不発になる。

LSP definition ハンドラ (server.ts:153) は同一ファイル + 単一レベルの Named Import のみ対応
（`import { id } from "file.krs"` のみ）。ワイルドカードインポート・推移的インポートは
未対応のため、複雑なマルチファイル構成では正しいファイルに飛べない。

## 根本原因

| 問題 | 根本原因 |
|------|---------|
| ブレッドクラム途切れ | `breadcrumbItems` がアクティブファイルを再パースする — インポート解決済みの `systems` を使っていない |
| コードジャンプ不発（app） | `handleJumpToEditor` がアクティブファイルのみ検索 — どのファイルにノードが定義されているかを知らない |
| コードジャンプ不発（LSP） | definition ハンドラがワイルドカード・推移的インポートを辿らない |

## 制約・前提

- `SystemCompileResult` は現在 `nodePathIndex` を公開していない（内部で使われているが型定義に含まれない）
- `KrsFile` に `nodeFileIndex`（nodeId → ファイルパス）という概念は存在しない
- `ImportResolver.resolveKrsFromMap` はインポートマージ時にどのファイル由来かを記録しない
- `useSystemView` フックは `systems`（解決済みシステムツリー）を返さない
- `useOrgView` は `organizations` を返すが、`orgBreadcrumbItems` はそれを使わず再パースしている

## 検討した選択肢

### Phase 1: ブレッドクラム修正

#### 案A: `SystemCompileResult` に `systems` を追加し、再パースをやめる（採用）

`_compileProjectCore` 内で `resolved.krsFile.systems` は既に利用可能。
これを `SystemCompileResult.systems: SystemNode[]` として公開し、`useSystemView` 経由で
AppShell に渡す。`breadcrumbItems` は `Parser.parse(fileContent)` をやめ、解決済み `systems` を使う。

org ブレッドクラムは `useOrgView` が既に `organizations` を返しているため、
`orgBreadcrumbItems` を `fileContent` 再パースから `organizations` 使用に変更するだけ。

**メリット:**
- インポート解決済みのデータを使うため、クロスファイルノードのラベル・ツリーが正しく取得できる
- `systems` / `organizations` はコンパイル結果に既に存在し、追加コストなし
- ブレッドクラム計算が `fileContent` に依存しなくなる（`fileContent` は `null` になることがある）

**デメリット:**
- `SystemCompileResult` の型が広がる（`systems: SystemNode[]` 追加）

#### 案B: `nodeMetadata` だけからラベルを取得する

`nodeMetadata` には `label` が含まれるが、現在のビュースライスに含まれるノードのみ。
深い階層のブレッドクラムに必要な上位ノードが含まれていない場合があり、不完全。

**デメリット:** 現在のビューに応じて情報が変化するため、ブレッドクラム全体を組み立てられない。

---

### Phase 2: コードジャンプ修正（app レイヤー）

クロスファイルコードジャンプには「このノードはどのファイルに定義されているか」という情報が必要。
現状 `nodePathIndex` はドリルダウンパスのみ保持し、ファイルパスを持たない。

#### 案C: `KrsFile` に `nodeFileIndex: Map<string, string>` を追加（採用）

- `nodeFileIndex`: nodeId → 定義元ファイルの絶対パス
- パーサーはパース時点でファイルパスを知らないため、`ImportResolver` が解決時に構築する
- `resolveKrsFromMap` でノードをマージする際、各ノードの定義元ファイルパスを記録する
- `SystemCompileResult` に `nodeFileIndex` を追加して公開
- `useSystemView` 経由でフックが返す
- `handleJumpToEditor` が `nodeFileIndex.get(nodeId)` でファイルパスを取得し、
  そのファイルを Monaco で開いてから対象行にジャンプする

```
nodeFileIndex: Map<string, string>
  "EC" → "/project/ecommerce.krs"
  "Payment" → "/project/payment.krs"
```

**メリット:**
- `nodePathIndex` と並列の概念で既存設計と一貫性がある
- `ImportResolver` 内の `mergeWildcardResolved` / `mergeNamedImport` でマージ時に構築可能
- app 側の変更が局所的（`handleJumpToEditor` のみ）
- 将来の LSP 統合にも再利用できる

**デメリット:**
- `KrsFile`・`ImportResolver`・`SystemCompileResult`・`useSystemView`・`AppShell` の連鎖変更が必要
- ファイルパス（絶対パス）はコア層がファイルシステムを知ることを意味する
  （ただし既に `ImportResolver` はファイルシステムを扱っている）

#### 案D: LSP のみで解決し、app 側のジャンプを廃止

app の `handleJumpToEditor` を LSP の `textDocument/definition` コマンドに委譲する。
app はノード ID を LSP に送り、LSP が Location を返す。

**メリット:** クロスファイル解決ロジックを1箇所（LSP）に集約

**デメリット:** app が Monaco + LSP 連携の仕組みを必要とする（現状は直接 Monaco を操作している）。
実装コストが大きく、LSP が使えない環境（ブラウザ単体モード）でジャンプが効かなくなる。

---

### Phase 3: LSP definition ハンドラの拡張

LSP ハンドラはワイルドカードインポートと推移的インポートに未対応。

#### 案E: ハンドラ内でワイルドカードと推移的インポートを再帰処理（採用）

現在の Named Import 処理に加えて:
1. ワイルドカード (`import "file.krs"`) の場合、そのファイル全体を検索
2. 1レベルで見つからない場合、そのファイルのインポートを再帰的に辿る
3. 循環インポート防止のために `visited: Set<string>` を使用

ただし LSP はファイルシステムへの同期アクセスが必要（`fs.readFileSync` 使用中）。

**メリット:** 既存の LSP ハンドラ構造を維持しつつ、カバレッジを拡大
**デメリット:** ファイル数が多いプロジェクトでは definition の応答が遅くなる可能性

#### 案F: `ImportResolver` を LSP ハンドラ内で使う

`ImportResolver.resolve(entryPath)` で全ファイルを解決済み `KrsFile` にマージし、
`nodeFileIndex` から定義ファイルを特定する。

**メリット:** 既存の解決ロジックを再利用
**デメリット:** LSP ハンドラでは entryPath が不明（どのファイルがエントリーポイントかわからない）。
単一ファイル編集中のリクエストには適用しにくい。

## 比較

| 観点 | 案A（systems公開） | 案C（nodeFileIndex） | 案E（LSP再帰） |
|------|:---:|:---:|:---:|
| ブレッドクラム修正 | ✅ | — | — |
| app コードジャンプ修正 | — | ✅ | — |
| LSP コードジャンプ修正 | — | — | ✅ |
| 変更範囲 | 小（型+フック+コンポーネント） | 中（コア〜app 横断） | 小（LSP のみ） |
| 新概念の導入 | なし | `nodeFileIndex` | なし |
| 推移的インポート対応 | — | ✅（マージ時に構築） | ✅（再帰処理） |

## 決定方針

3つの案を組み合わせて実装する:

**Phase 1（ブレッドクラム）**: 案A を採用  
**Phase 2（app コードジャンプ）**: 案C を採用  
**Phase 3（LSP コードジャンプ）**: 案E を採用

### 変更ファイル

#### Phase 1: ブレッドクラム修正

| ファイル | 変更内容 |
|---------|---------|
| `packages/core/src/index.ts` | `SystemCompileResult` に `systems: SystemNode[]` を追加して公開 |
| `packages/app/src/hooks/useSystemView.ts` | `systems` を状態・戻り値に追加 |
| `packages/app/src/components/AppShell.tsx` | `breadcrumbItems` を解決済み `systems` から構築、`orgBreadcrumbItems` を `organizations` から構築 |

#### Phase 2: app コードジャンプ修正

| ファイル | 変更内容 |
|---------|---------|
| `packages/core/src/types/ast.ts` | `KrsFile` に `nodeFileIndex: Map<string, string>` を追加 |
| `packages/core/src/fs/import-resolver.ts` | `resolveKrsFromMap` でマージ時に `nodeFileIndex` を構築、`mergeWildcardResolved` / `mergeNamedImport` も対応 |
| `packages/core/src/parser/parser.ts` | `KrsFile` 初期化時に `nodeFileIndex: new Map()` を追加 |
| `packages/core/src/index.ts` | `SystemCompileResult` に `nodeFileIndex` を追加して公開 |
| `packages/app/src/hooks/useSystemView.ts` | `nodeFileIndex` を状態・戻り値に追加 |
| `packages/app/src/components/AppShell.tsx` | `handleJumpToEditor` を `nodeFileIndex` でクロスファイル対応 |

#### Phase 3: LSP definition ハンドラ拡張

| ファイル | 変更内容 |
|---------|---------|
| `packages/lsp/src/server.ts` | definition ハンドラにワイルドカードと推移的インポートの再帰検索を追加 |

## 実装の進め方

Phase 1 → Phase 2 → Phase 3 の順で実装する。各 Phase は独立してテスト・検証可能。

### アクセプタンステスト

- **Phase 1**: マルチファイルプロジェクトでクロスファイルノードにドリルダウンした際、
  ブレッドクラムが正しいパス（全ラベル）を表示する
- **Phase 2**: マルチファイルプロジェクトで Preview の「コードジャンプ」をクリックすると、
  ノードが定義されているファイルが Monaco で開き、定義行にカーソルが移動する
- **Phase 3**: VS Code でクロスファイルノードに対して「定義へ移動」を実行すると、
  定義元ファイルの正しい行に遷移する

## 未解決の問い

- `nodeFileIndex` のキーはノード ID のみで十分か？同一 ID が複数ファイルに存在する場合は
  後勝ちになるが、それは既存の `nodePathIndex` と同じ挙動であり許容範囲と判断
- `handleJumpToEditor` でクロスファイルジャンプする際、Monaco の `model.uri` に基づいて
  エディタのアクティブファイルを切り替える手段が必要（現状エディタは1ファイル固定か確認要）
