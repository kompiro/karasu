---
paths:
  - "examples/**/*.krs"
  - "examples/**/*.krs.style"
---

# examples 変更時の同期ルール

> **`examples/ec-platform/` と `examples/feature-samples/` の編集は必ず `/update-examples` スキル経由で行うこと。**
> スキルが `examples.ts` の同期とコミットまで担う。ユーザーによる直接編集は行わない前提。

`examples/` 配下のファイルを追加・変更・削除した場合は、必ず `packages/core/src/builtins/examples.ts` も合わせて更新すること。

## 対象ファイル

`packages/core/src/builtins/examples.ts` は `examples/` 配下のうち **`examples.ts` に登録済みのファイル**の内容を文字列として保持しており、ProjectMode の初回起動時に使用される。

現在 `examples.ts` に登録されているのは `examples/getting-started/`、`examples/getting-started-en/`、`examples/ec-platform/`、`examples/client-mcp/`、`examples/feature-samples/`。他のディレクトリ（`hr-tool/` など）は登録されていないため、それらを変更しても `examples.ts` の更新は不要。

`examples/feature-samples/` は ProjectMode で 1 プロジェクト（`FEATURE_SAMPLES_PROJECT`、name: `feature-samples`）として束ねられる。アプリは project 切替時に `index.krs` を自動で開くため、ディレクトリには 14 個の単機能サンプルに加えてカタログ役の `index.krs`（各サンプルへの索引コメント + 最小の `system`）が含まれる。**`examples/feature-samples/` のファイルは `examples.ts` の対応エントリと byte 単位で一致させること**（`packages/core/src/examples.test.ts` の drift ガードで検証）。新しいサンプルを追加したら 14 → 15... と `index.krs` のカタログにも 1 行追記する。

## 更新手順

### 登録済みファイルを変更する場合

1. 対象の `examples/` ファイルを変更する
2. `packages/core/src/builtins/examples.ts` の対応する `content` フィールドを同内容に更新する（下記マッピング表を参照）
3. 両ファイルを同一コミットに含める

### 新しい examples ディレクトリを `examples.ts` に追加する場合

1. `examples/` にファイルを追加する
2. `packages/core/src/builtins/examples.ts` に新しい `ExampleProject` エントリを追加する
3. このルールのマッピング表にも新しいエントリを追記する
4. すべてを同一コミットに含める

## ファイルマッピング

| examples のパス | examples.ts 内のエントリ |
|---|---|
| `getting-started/index.krs` | `GETTING_STARTED_PROJECT.files[0].content` |
| `getting-started/default.krs.style` | `GETTING_STARTED_PROJECT.files[1].content` |
| `getting-started-en/index.krs` | `GETTING_STARTED_PROJECT_EN.files[0].content` |
| `getting-started-en/default.krs.style` | `GETTING_STARTED_PROJECT_EN.files[1].content` |
| `client-mcp/index.krs` | `CLIENT_MCP_PROJECT.files[0].content` |
| `ec-platform/01-system.krs` | `EC_PLATFORM_PROJECTS[0].files[0].content` (name: `01-system`) |
| `ec-platform/02-users.krs` | `EC_PLATFORM_PROJECTS[1].files[0].content` (name: `02-users`) |
| `ec-platform/02.5-clients.krs` | `EC_PLATFORM_PROJECTS[2].files[0].content` (name: `02.5-clients`) |
| `ec-platform/03-domains.krs` | `EC_PLATFORM_PROJECTS[3].files[0].content` (name: `03-domains`) |
| `ec-platform/04-annotations.krs` | `EC_PLATFORM_PROJECTS[4].files[0].content` (name: `04-annotations`) |
| `ec-platform/05-multifile/system.krs` | `EC_PLATFORM_PROJECTS[5].files[0].content` (path: `index.krs`) |
| `ec-platform/05-multifile/ecommerce.krs` | `EC_PLATFORM_PROJECTS[5].files[1].content` |
| `ec-platform/05-multifile/payment.krs` | `EC_PLATFORM_PROJECTS[5].files[2].content` |
| `ec-platform/06-deploy/system.krs` | `EC_PLATFORM_PROJECTS[6].files[0].content` (path: `index.krs`) |
| `ec-platform/06-deploy/ecommerce.krs` | `EC_PLATFORM_PROJECTS[6].files[1].content` |
| `ec-platform/06-deploy/payment.krs` | `EC_PLATFORM_PROJECTS[6].files[2].content` |
| `ec-platform/06-deploy/deploy.krs` | `EC_PLATFORM_PROJECTS[6].files[3].content` |
| `ec-platform/07-cross-system/main.krs` | `EC_PLATFORM_PROJECTS[7].files[0].content` (path: `index.krs`) |
| `ec-platform/07-cross-system/ec-platform.krs` | `EC_PLATFORM_PROJECTS[7].files[1].content` |
| `ec-platform/07-cross-system/payment-gateway.krs` | `EC_PLATFORM_PROJECTS[7].files[2].content` |
| `feature-samples/index.krs` | `FEATURE_SAMPLES_PROJECT.files[0].content` (path: `index.krs`; catalog) |
| `feature-samples/annotations.krs` | `FEATURE_SAMPLES_PROJECT.files[1].content` |
| `feature-samples/bff-delivers.krs` | `FEATURE_SAMPLES_PROJECT.files[2].content` |
| `feature-samples/crud-matrix.krs` | `FEATURE_SAMPLES_PROJECT.files[3].content` |
| `feature-samples/deploy-all.krs` | `FEATURE_SAMPLES_PROJECT.files[4].content` |
| `feature-samples/domain-drift.krs` | `FEATURE_SAMPLES_PROJECT.files[5].content` |
| `feature-samples/domain-drill.krs` | `FEATURE_SAMPLES_PROJECT.files[6].content` |
| `feature-samples/edges.krs` | `FEATURE_SAMPLES_PROJECT.files[7].content` |
| `feature-samples/external-nodes.krs` | `FEATURE_SAMPLES_PROJECT.files[8].content` |
| `feature-samples/legend.krs` | `FEATURE_SAMPLES_PROJECT.files[9].content` |
| `feature-samples/minimal.krs` | `FEATURE_SAMPLES_PROJECT.files[10].content` |
| `feature-samples/parallel-edges.krs` | `FEATURE_SAMPLES_PROJECT.files[11].content` |
| `feature-samples/resource-operations.krs` | `FEATURE_SAMPLES_PROJECT.files[12].content` |
| `feature-samples/usecase-authorization.krs` | `FEATURE_SAMPLES_PROJECT.files[13].content` |
| `feature-samples/users.krs` | `FEATURE_SAMPLES_PROJECT.files[14].content` |
