# ADR-0030: CLI `karasu translate` コマンドと複数 realizes 対応

- **日付**: 2026-04-09
- **ステータス**: 決定済み
- **関連**: Issue #355, Issue #356, [ADR-0072](20260404-08-cli-render-command.md)

## 背景

karasu の deploy ダイアグラムは手動で `.krs` を記述する必要があるが、チームがすでに docker-compose や k8s マニフェストを持っている場合、物理構造を二重管理することになる。`karasu translate` コマンドによる既存インフラ定義からの `deploy.krs` スキャフォールド自動生成が求められた。

実装の過程で、1 つのデプロイ単位（例: モノリシック `app.jar`）が複数のサービスを実現するケースが実際によくあることが判明し、現行の `realizes?: string`（単数）では表現できないことが明らかになった。

## 決定

1. **`karasu translate --from <compose|k8s> <input>`** コマンドを追加する。出力は stdout デフォルト、`-o` で別ファイル指定可
2. **YAML パーサー**は `yaml`（by Eemeli Aro）を採用する
3. **Translator パターン**で `ComposeTranslator` / `K8sTranslator` を実装する（Strategy の軽量版、基底クラスなし）
4. **`realizes` 解決**は「k8s/compose ラベル → `karasu.map.yaml` → 命名規則ヒューリスティック → 未解決（warning + TODO コメント）」の 4 段階
5. **`karasu.map.yaml`** はインフラファイル（docker-compose.yml / k8s マニフェスト）を変更せずに `realizes` マッピングを管理するための分離レイヤーとして機能させる
6. **AST 変更**: `DeployNodeProperties.realizes` を `string` から `string[]` に変更し、複数 `realizes` 行の指定を許容する
7. **k8s 対象 Kind**: `Deployment` / `StatefulSet` / `DaemonSet` → `oci`、`Job` / `CronJob` → `job`。`Service` / `ConfigMap` / `Ingress` / `PVC` 等は対象外

## 理由

- **`yaml` ライブラリ**: アクティブにメンテされており YAML 1.2 準拠。k8s マニフェスト互換性が高く、将来 #356 の OpenAPI 拡張で Document モデルが役立つ
- **Translator インターフェース**: #356 で OpenAPI / DB schema 対応が予定されており、拡張性を確保しておく。ただし基底クラスを設けず軽量に保つ
- **`karasu.map.yaml` の分離**: k8s ラベルは本番 Pod に付与されてしまう、共有リポジトリのインフラファイルを変更したくない、といった現実的制約に対応する
- **複数 `realizes`**: 実際のアーキテクチャでモノリシックなデプロイ単位が複数サービスを担うケースは頻出する。単数のままでは translate 結果が不正確になる
- **k8s 対象 Kind の限定**: `Service` / `ConfigMap` などはインフラ設定でありサービスの実体ではないため、deploy view の単位として不適切

## 却下した案

### `js-yaml`

長期的に広く使われているが 2022 年以降リリースがなく、アクティビティが低下している。

### フォーマット別関数による実装（`translateFromCompose` / `translateFromK8s`）

シンプルだがフォーマット追加時に `translate.ts` が肥大化する。Translator パターンの方が Open/Closed の観点で好ましい。

### ディレクトリ一括処理のサポート

シェルのファイルグロブに委ねた方がユーザー側で柔軟に組み合わせられるため、CLI では単一ファイル処理に限定する。

### `realizes` 未解決時のエラー化

karasu の "warn, don't error" ポリシーに反する。TODO コメントと stderr 警告に留める。

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `packages/core/src/types/ast.ts` | `realizes?: string` → `realizes?: string[]` |
| `packages/core/src/parser/parser.ts` | `realizes` を配列で accumulate |
| `packages/core/src/view/deploy-view-extract.ts` | 複数 realizes を各サービスコンテナに描画 |
| `packages/cli/src/translate/` | 新設（`translator.ts`, `compose.ts`, `k8s.ts`, `realizes.ts`） |
