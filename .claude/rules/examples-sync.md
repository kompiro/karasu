---
paths:
  - "examples/**/*.krs"
  - "examples/**/*.krs.style"
---

# examples 変更時の同期ルール

> **`examples/ja/ec-platform/`・`examples/en/ec-platform/`・`examples/en/feature-samples/` の編集は必ず `/update-examples` スキル経由で行うこと。**
> スキルが `examples.ts` の同期とコミットまで担う。ユーザーによる直接編集は行わない前提。

`examples/` 配下のファイルを追加・変更・削除した場合は、必ず `packages/core/src/builtins/examples.ts` も合わせて更新すること。

## 対象ファイル

`packages/core/src/builtins/examples.ts` は `examples/` 配下のうち **`examples.ts` に登録済みのファイル**の内容を文字列として保持しており、ProjectMode の初回起動時に使用される。

現在 `examples.ts` に登録されているのは `examples/ja/getting-started/`、`examples/en/getting-started/`、`examples/ja/ec-platform/`、`examples/en/ec-platform/`、`examples/en/client-mcp/`、`examples/ja/multi-file-system/`、`examples/en/multi-file-system/`、`examples/en/feature-samples/`、`examples/ja/deploy-only/`、`examples/en/deploy-only/`、`examples/ja/org-only/`、`examples/en/org-only/`。他のディレクトリ（`hr-tool/` など）は登録されていないため、それらを変更しても `examples.ts` の更新は不要。

> `deploy-only/` と `org-only/` は Reference ウィンドウの Samples タブ（ビュー別サンプル, #1548）で参照される。en ロケールでは `*_EN` 変種（`examples/en/...`）が、`ja` では元の `examples/ja/...` が表示される（#1642）。drift は `packages/core/src/examples.test.ts` の byte 一致ガードで両ロケール分検証。
>
> `multi-file-system/` も同様に ProjectMode の seed で en/ja のロケール一致版が投入される（#1642）。`MULTI_FILE_SYSTEM_PROJECT`（ja）/ `MULTI_FILE_SYSTEM_PROJECT_EN`（en）の両方を `examples/<lang>/multi-file-system/` と byte 一致させること。
>
> `ec-platform/`（getting-started のフル drill-down）も ProjectMode の seed で en/ja のロケール一致版が投入される（#1777）。`EC_PLATFORM_PROJECTS`（ja）/ `EC_PLATFORM_PROJECTS_EN`（en）の両方を `examples/<lang>/ec-platform/` と byte 一致させること。各ステージの先頭ファイル（`05-multifile/system.krs`・`06-deploy/system.krs`・`07-cross-system/main.krs`）は bundled 時に `index.krs` にリネームされる点に注意。drift は `packages/core/src/examples.test.ts` の byte 一致ガードで両ロケール分検証。

`examples/en/feature-samples/` は ProjectMode で 1 プロジェクト（`FEATURE_SAMPLES_PROJECT`、name: `feature-samples`）として束ねられる。アプリは project 切替時に `index.krs` を自動で開くため、ディレクトリには 14 個の単機能サンプルに加えてカタログ役の `index.krs`（各サンプルへの索引コメント + 最小の `system`）が含まれる。**`examples/en/feature-samples/` のファイルは `examples.ts` の対応エントリと byte 単位で一致させること**（`packages/core/src/examples.test.ts` の drift ガードで検証）。新しいサンプルを追加したら 14 → 15... と `index.krs` のカタログにも 1 行追記する。

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
| `ja/getting-started/index.krs` | `GETTING_STARTED_PROJECT.files[0].content` |
| `ja/getting-started/default.krs.style` | `GETTING_STARTED_PROJECT.files[1].content` |
| `en/getting-started/index.krs` | `GETTING_STARTED_PROJECT_EN.files[0].content` |
| `en/getting-started/default.krs.style` | `GETTING_STARTED_PROJECT_EN.files[1].content` |
| `en/client-mcp/index.krs` | `CLIENT_MCP_PROJECT.files[0].content` |
| `ja/deploy-only/index.krs` | `DEPLOY_ONLY_PROJECT.files[0].content` |
| `en/deploy-only/index.krs` | `DEPLOY_ONLY_PROJECT_EN.files[0].content` |
| `ja/org-only/index.krs` | `ORG_ONLY_PROJECT.files[0].content` |
| `en/org-only/index.krs` | `ORG_ONLY_PROJECT_EN.files[0].content` |
| `ja/ec-platform/01-system.krs` | `EC_PLATFORM_PROJECTS[0].files[0].content` (name: `01-system`) |
| `ja/ec-platform/02-users.krs` | `EC_PLATFORM_PROJECTS[1].files[0].content` (name: `02-users`) |
| `ja/ec-platform/02.5-clients.krs` | `EC_PLATFORM_PROJECTS[2].files[0].content` (name: `02.5-clients`) |
| `ja/ec-platform/03-domains.krs` | `EC_PLATFORM_PROJECTS[3].files[0].content` (name: `03-domains`) |
| `ja/ec-platform/04-annotations.krs` | `EC_PLATFORM_PROJECTS[4].files[0].content` (name: `04-annotations`) |
| `ja/ec-platform/05-multifile/system.krs` | `EC_PLATFORM_PROJECTS[5].files[0].content` (path: `index.krs`) |
| `ja/ec-platform/05-multifile/ecommerce.krs` | `EC_PLATFORM_PROJECTS[5].files[1].content` |
| `ja/ec-platform/05-multifile/payment.krs` | `EC_PLATFORM_PROJECTS[5].files[2].content` |
| `ja/ec-platform/06-deploy/system.krs` | `EC_PLATFORM_PROJECTS[6].files[0].content` (path: `index.krs`) |
| `ja/ec-platform/06-deploy/ecommerce.krs` | `EC_PLATFORM_PROJECTS[6].files[1].content` |
| `ja/ec-platform/06-deploy/payment.krs` | `EC_PLATFORM_PROJECTS[6].files[2].content` |
| `ja/ec-platform/06-deploy/deploy.krs` | `EC_PLATFORM_PROJECTS[6].files[3].content` |
| `ja/ec-platform/07-cross-system/main.krs` | `EC_PLATFORM_PROJECTS[7].files[0].content` (path: `index.krs`) |
| `ja/ec-platform/07-cross-system/ec-platform.krs` | `EC_PLATFORM_PROJECTS[7].files[1].content` |
| `ja/ec-platform/07-cross-system/payment-gateway.krs` | `EC_PLATFORM_PROJECTS[7].files[2].content` |
| `en/ec-platform/01-system.krs` | `EC_PLATFORM_PROJECTS_EN[0].files[0].content` (name: `01-system`) |
| `en/ec-platform/02-users.krs` | `EC_PLATFORM_PROJECTS_EN[1].files[0].content` (name: `02-users`) |
| `en/ec-platform/02.5-clients.krs` | `EC_PLATFORM_PROJECTS_EN[2].files[0].content` (name: `02.5-clients`) |
| `en/ec-platform/03-domains.krs` | `EC_PLATFORM_PROJECTS_EN[3].files[0].content` (name: `03-domains`) |
| `en/ec-platform/04-annotations.krs` | `EC_PLATFORM_PROJECTS_EN[4].files[0].content` (name: `04-annotations`) |
| `en/ec-platform/05-multifile/system.krs` | `EC_PLATFORM_PROJECTS_EN[5].files[0].content` (path: `index.krs`) |
| `en/ec-platform/05-multifile/ecommerce.krs` | `EC_PLATFORM_PROJECTS_EN[5].files[1].content` |
| `en/ec-platform/05-multifile/payment.krs` | `EC_PLATFORM_PROJECTS_EN[5].files[2].content` |
| `en/ec-platform/06-deploy/system.krs` | `EC_PLATFORM_PROJECTS_EN[6].files[0].content` (path: `index.krs`) |
| `en/ec-platform/06-deploy/ecommerce.krs` | `EC_PLATFORM_PROJECTS_EN[6].files[1].content` |
| `en/ec-platform/06-deploy/payment.krs` | `EC_PLATFORM_PROJECTS_EN[6].files[2].content` |
| `en/ec-platform/06-deploy/deploy.krs` | `EC_PLATFORM_PROJECTS_EN[6].files[3].content` |
| `en/ec-platform/07-cross-system/main.krs` | `EC_PLATFORM_PROJECTS_EN[7].files[0].content` (path: `index.krs`) |
| `en/ec-platform/07-cross-system/ec-platform.krs` | `EC_PLATFORM_PROJECTS_EN[7].files[1].content` |
| `en/ec-platform/07-cross-system/payment-gateway.krs` | `EC_PLATFORM_PROJECTS_EN[7].files[2].content` |
| `en/feature-samples/index.krs` | `FEATURE_SAMPLES_PROJECT.files[0].content` (path: `index.krs`; catalog) |
| `en/feature-samples/annotations.krs` | `FEATURE_SAMPLES_PROJECT.files[1].content` |
| `en/feature-samples/bff-delivers.krs` | `FEATURE_SAMPLES_PROJECT.files[2].content` |
| `en/feature-samples/crud-matrix.krs` | `FEATURE_SAMPLES_PROJECT.files[3].content` |
| `en/feature-samples/deploy-all.krs` | `FEATURE_SAMPLES_PROJECT.files[4].content` |
| `en/feature-samples/domain-drift.krs` | `FEATURE_SAMPLES_PROJECT.files[5].content` |
| `en/feature-samples/domain-drill.krs` | `FEATURE_SAMPLES_PROJECT.files[6].content` |
| `en/feature-samples/edges.krs` | `FEATURE_SAMPLES_PROJECT.files[7].content` |
| `en/feature-samples/external-nodes.krs` | `FEATURE_SAMPLES_PROJECT.files[8].content` |
| `en/feature-samples/legend.krs` | `FEATURE_SAMPLES_PROJECT.files[9].content` |
| `en/feature-samples/minimal.krs` | `FEATURE_SAMPLES_PROJECT.files[10].content` |
| `en/feature-samples/parallel-edges.krs` | `FEATURE_SAMPLES_PROJECT.files[11].content` |
| `en/feature-samples/resource-operations.krs` | `FEATURE_SAMPLES_PROJECT.files[12].content` |
| `en/feature-samples/usecase-authorization.krs` | `FEATURE_SAMPLES_PROJECT.files[13].content` |
| `en/feature-samples/users.krs` | `FEATURE_SAMPLES_PROJECT.files[14].content` |
| `ja/multi-file-system/index.krs` | `MULTI_FILE_SYSTEM_PROJECT.files[0].content` |
| `ja/multi-file-system/reader.krs` | `MULTI_FILE_SYSTEM_PROJECT.files[1].content` |
| `ja/multi-file-system/editor.krs` | `MULTI_FILE_SYSTEM_PROJECT.files[2].content` |
| `ja/multi-file-system/moderation.krs` | `MULTI_FILE_SYSTEM_PROJECT.files[3].content` |
| `ja/multi-file-system/infra.krs` | `MULTI_FILE_SYSTEM_PROJECT.files[4].content` |
| `en/multi-file-system/index.krs` | `MULTI_FILE_SYSTEM_PROJECT_EN.files[0].content` |
| `en/multi-file-system/reader.krs` | `MULTI_FILE_SYSTEM_PROJECT_EN.files[1].content` |
| `en/multi-file-system/editor.krs` | `MULTI_FILE_SYSTEM_PROJECT_EN.files[2].content` |
| `en/multi-file-system/moderation.krs` | `MULTI_FILE_SYSTEM_PROJECT_EN.files[3].content` |
| `en/multi-file-system/infra.krs` | `MULTI_FILE_SYSTEM_PROJECT_EN.files[4].content` |
