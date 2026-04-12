# ADR-0066: マルチファイルプロジェクトでのクロスファイルナビゲーション

- **日付**: 2026-04-09
- **ステータス**: 決定済み
- **関連**: Issue #429, [ADR-0065](0065-named-import-toplevel-service.md), [ADR-0062](0062-compile-api-unification.md)

## 背景

マルチファイルプロジェクトで、ノード（service/domain など）が現在アクティブなファイルとは別ファイルに定義されている場合、2 つのナビゲーション機能が壊れていた：

1. **ブレッドクラムが途切れる** — `breadcrumbItems` が `Parser.parse(fileContent)` でアクティブファイルのみを再パースしており、インポートで取り込まれたノードが見つからずループが break する
2. **コードジャンプが不発** — `handleJumpToEditor` が `findNodeLine(parseResult.value, nodeId)` でアクティブファイルのみ検索するため、別ファイルに定義されたノードは見つからない
3. **LSP definition の制限** — ハンドラが同一ファイル + 単一レベルの Named Import のみ対応で、ワイルドカードインポート・推移的インポートは未対応

## 決定

3 つの案を組み合わせた **3 フェーズ実装** を採用する。

### Phase 1（案A）: `SystemCompileResult.systems` を公開してブレッドクラムを修正

`_compileProjectCore` 内で既に利用可能な `resolved.krsFile.systems` を `SystemCompileResult.systems: SystemNode[]` として公開する。`useSystemView` 経由で `AppShell` に渡し、`breadcrumbItems` は `Parser.parse(fileContent)` をやめて解決済み `systems` を使う。

org ブレッドクラムは `useOrgView` が既に `organizations` を返しているため、`orgBreadcrumbItems` を `fileContent` 再パースから `organizations` 使用に変更するだけで修正できる。

### Phase 2（案C）: `KrsFile.nodeFileIndex` でコードジャンプを修正

`KrsFile` に `nodeFileIndex: Map<string, string>`（nodeId → 定義元ファイルの絶対パス）を追加する。`ImportResolver` の `resolveKrsFromMap` / `mergeWildcardResolved` / `mergeNamedImport` でノードをマージする際、各ノードの定義元ファイルパスを記録する。`SystemCompileResult` に公開して `useSystemView` から返し、`handleJumpToEditor` が `nodeFileIndex.get(nodeId)` でファイルパスを取得 → そのファイルを Monaco で開いてから対象行にジャンプする。

### Phase 3（案E）: LSP definition ハンドラの再帰検索

LSP の `textDocument/definition` ハンドラに以下を追加：

1. ワイルドカード（`import "file.krs"`）の場合、そのファイル全体を検索
2. 1 レベルで見つからない場合、そのファイルのインポートを再帰的に辿る
3. 循環インポート防止のため `visited: Set<string>` を使用

## 理由

- **Phase 1 は既存データの公開だけ**: `_compileProjectCore` は既に解決済み `systems` を持っており、追加の計算コストなしでブレッドクラム問題を解決できる。`fileContent` が `null` のケースにも強くなる
- **`nodeFileIndex` は `nodePathIndex` と並列の概念**: 既存設計と一貫性があり、`ImportResolver` 内のマージロジックで自然に構築できる。将来の LSP 統合にも再利用できる
- **案D（app のジャンプを LSP に委譲）不採用**: LSP が使えない環境（ブラウザ単体モード）でジャンプが効かなくなる。app 側の Monaco 操作を LSP 連携に置き換えるコストも大きい
- **案F（LSP 内で `ImportResolver` を使う）不採用**: LSP ハンドラでは entryPath が不明（どのファイルがエントリポイントかわからない）で、単一ファイル編集中のリクエストには適用しにくい
- **各 Phase は独立してテスト可能**: Phase 1 だけでもブレッドクラムが直り、Phase 2 だけでも app のコードジャンプが直る段階的実装

## 却下した案

### 案B: `nodeMetadata` だけからラベルを取得する

`nodeMetadata` は現在のビュースライスに含まれるノードのみで、深い階層のブレッドクラムに必要な上位ノードが含まれていないケースがある。現在のビューに応じて情報が変化するため、ブレッドクラム全体を組み立てられない。

### 案D: app 側のコードジャンプを LSP に完全委譲

LSP が使えない環境でジャンプが効かなくなり、app 側に Monaco + LSP 連携の仕組みを新設する必要がある。実装コストが大きい。

### 案F: LSP ハンドラ内で `ImportResolver` を使う

LSP ハンドラでは entryPath が不明で、単一ファイル編集中のリクエストに適用しにくい。

## 残課題

- `nodeFileIndex` のキーは nodeId のみ。同一 ID が複数ファイルに存在する場合は後勝ちになるが、これは既存の `nodePathIndex` と同じ挙動で許容範囲
- `handleJumpToEditor` でクロスファイルジャンプする際、Monaco の `model.uri` 切替による複数ファイル対応が必要（エディタが 1 ファイル固定かどうか確認要）
