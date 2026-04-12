# ADR-0050: ProjectMode 初期コンテンツ — `examples/ec-platform` からの自動生成

- **日付**: 2026-04-08
- **ステータス**: 決定済み
- **関連**: `examples/ec-platform/`

## 背景

ProjectMode（OPFS モード）は初回起動時に "Getting Started" という空のプロジェクトを自動作成していただけで、新規ユーザーは何も表示されない状態から始まっていた。MemoryMode は `getReference()` のハードコードされた `sampleKrs` を表示して「すぐに動く状態」を提供していたが、ProjectMode には同等の体験がなく、プロジェクト切り替え・マルチファイル・import といった ProjectMode 固有の機能を初回から体験する機会もなかった。

## 決定

`packages/core/src/builtins/examples.ts` に `EC_PLATFORM_PROJECTS: ExampleProject[]` を定義し、`examples/ec-platform/` の各ステップを**別プロジェクトとして 7 つ自動作成**する。先頭の `01-system` を選択状態にする。

| プロジェクト名 | ファイル構成 | 元ファイル |
|---|---|---|
| `01-system` | `index.krs` | `01-system.krs` |
| `02-users` | `index.krs` | `02-users.krs` |
| `03-domains` | `index.krs` | `03-domains.krs` |
| `04-annotations` | `index.krs` | `04-annotations.krs` |
| `05-multifile` | `index.krs`, `ecommerce.krs`, `payment.krs` | `system.krs` → `index.krs` 他はそのまま |
| `06-deploy` | `index.krs`, `ecommerce.krs`, `payment.krs`, `deploy.krs` | 同上 |
| `07-cross-system` | `index.krs`, `ec-platform.krs`, `payment-gateway.krs` | `main.krs` → `index.krs` 他はそのまま |

`ProjectManager.createProject(name, files?)` にオプション引数 `files` を追加し、渡された場合はそのファイル群を書き込む（省略時は従来の `DEFAULT_KRS`）。

## 理由

- **段階的な学習体験**: `examples/ec-platform/` は段階的に学べるよう整備されており、これを別プロジェクトとして展開すると ProjectMode のプロジェクト切り替え UI をそのまま学習ナビゲーションとして使える
- **マルチファイル機能の体験**: `05-multifile` 以降は複数ファイル構成なので、サイドバーのファイルツリーと `import` が初回から動く状態で体験できる
- **`core` に配置する理由**: `app`/`cli`/`vscode` のすべてから参照できる。`packages/core/src/builtins/examples.ts` として TypeScript で管理すれば型を添えられ、`.claude/rules/examples-sync.md` で `examples/` との同期を強制できる
- **API の再利用**: `createProject(name, files?)` の signature は将来の「テンプレートから新規プロジェクト作成」UI でもそのまま流用できる

## 却下した案

### 案B: 単一 "Getting Started" プロジェクトにフラット展開

01〜04 を 1 プロジェクトに並べる案。プロジェクト切り替え体験ができないため採用しない。

### 案X: `?raw` import を直接使う

examples ファイルを Vite の `?raw` でインラインインポートする案。`core` から見えなくなり、`cli`/`vscode` からの再利用性が下がるため採用しない。

## 関連ルール

`examples/ec-platform/` の編集は `/update-examples` スキル経由で行い、`examples.ts` の同期まで含めてコミットする。`.claude/rules/examples-sync.md` に同期ルールを記載。
