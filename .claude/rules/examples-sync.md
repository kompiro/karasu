---
paths:
  - "examples/**/*.krs"
  - "examples/**/*.krs.style"
---

# examples 変更時の同期ルール

> **`examples/ec-platform/` の編集は必ず `/update-examples` スキル経由で行うこと。**
> スキルが `examples.ts` の同期とコミットまで担う。ユーザーによる直接編集は行わない前提。

`examples/` 配下のファイルを追加・変更・削除した場合は、必ず `packages/core/src/builtins/examples.ts` も合わせて更新すること。

## 対象ファイル

`packages/core/src/builtins/examples.ts` は `examples/` 配下のうち **`examples.ts` に登録済みのファイル**の内容を文字列として保持しており、ProjectMode の初回起動時に使用される。

現在 `examples.ts` に登録されているのは `examples/getting-started/` と `examples/ec-platform/`。他のディレクトリ（`hr-tool/` など）は登録されていないため、それらを変更しても `examples.ts` の更新は不要。

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
| `ec-platform/01-system.krs` | `EC_PLATFORM_PROJECTS[0].files[0].content` (name: `01-system`) |
| `ec-platform/02-users.krs` | `EC_PLATFORM_PROJECTS[1].files[0].content` (name: `02-users`) |
| `ec-platform/03-domains.krs` | `EC_PLATFORM_PROJECTS[2].files[0].content` (name: `03-domains`) |
| `ec-platform/04-annotations.krs` | `EC_PLATFORM_PROJECTS[3].files[0].content` (name: `04-annotations`) |
| `ec-platform/05-multifile/system.krs` | `EC_PLATFORM_PROJECTS[4].files[0].content` (path: `index.krs`) |
| `ec-platform/05-multifile/ecommerce.krs` | `EC_PLATFORM_PROJECTS[4].files[1].content` |
| `ec-platform/05-multifile/payment.krs` | `EC_PLATFORM_PROJECTS[4].files[2].content` |
| `ec-platform/06-deploy/system.krs` | `EC_PLATFORM_PROJECTS[5].files[0].content` (path: `index.krs`) |
| `ec-platform/06-deploy/ecommerce.krs` | `EC_PLATFORM_PROJECTS[5].files[1].content` |
| `ec-platform/06-deploy/payment.krs` | `EC_PLATFORM_PROJECTS[5].files[2].content` |
| `ec-platform/06-deploy/deploy.krs` | `EC_PLATFORM_PROJECTS[5].files[3].content` |
| `ec-platform/07-cross-system/main.krs` | `EC_PLATFORM_PROJECTS[6].files[0].content` (path: `index.krs`) |
| `ec-platform/07-cross-system/ec-platform.krs` | `EC_PLATFORM_PROJECTS[6].files[1].content` |
| `ec-platform/07-cross-system/payment-gateway.krs` | `EC_PLATFORM_PROJECTS[6].files[2].content` |
