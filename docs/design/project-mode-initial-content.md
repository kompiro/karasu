# ProjectMode 初期コンテンツ — examples/ec-platform からの自動生成

- **日付**: 2026-04-08
- **ステータス**: 検討中
- **関連**: なし

## 背景・課題

ProjectMode（OPFS モード）は初回起動時に "Getting Started" という名前のプロジェクトを自動作成するが、`index.krs` の中身が空のため、新規ユーザーは何も表示されない状態から始まる。

一方、MemoryMode は `packages/core/src/builtins/reference.ts` にハードコードされた `sampleKrs` を表示しており、すぐに動く状態を体験できる。

ProjectMode でも同様に「最初から動くサンプルが表示される」体験を提供したい。また、`examples/ec-platform/` は段階的な学習コンテンツとして整備されており、これを活用することで ProjectMode 固有のマルチファイル・プロジェクト切り替え機能も初回から体験できる。

## 制約・前提

- ProjectMode のエントリポイントは `index.krs` 固定（`ProjectModeApp.tsx`）
- OPFS（ブラウザの仮想ファイルシステム）にファイルを書き込む形で初期化する
- 初回起動判定は既存の `projectList.length === 0` を流用する
- `examples/` は `packages/app/` の外にあるため、バンドル時に文字列として取り込む必要がある
- バンドルサイズへの影響は軽微（ec-platform 全体で約 13.5KB）

## 検討した選択肢

### 案A（採用）: ec-platform の各ステップを別プロジェクトとして初期化

初回起動時に以下の 7 プロジェクトを自動作成し、先頭（`01-system`）を選択状態にする。

| プロジェクト名 | ファイル構成 | 元ファイル |
|---|---|---|
| `01-system` | `index.krs` | `01-system.krs` |
| `02-users` | `index.krs` | `02-users.krs` |
| `03-domains` | `index.krs` | `03-domains.krs` |
| `04-annotations` | `index.krs` | `04-annotations.krs` |
| `05-multifile` | `index.krs`, `ecommerce.krs`, `payment.krs` | `system.krs` → `index.krs`、他はそのまま |
| `06-deploy` | `index.krs`, `ecommerce.krs`, `payment.krs`, `deploy.krs` | `system.krs` → `index.krs`、他はそのまま |
| `07-cross-system` | `index.krs`, `ec-platform.krs`, `payment-gateway.krs` | `main.krs` → `index.krs`、他はそのまま |

**05〜07 の index.krs 方針**: 元の `system.krs` / `main.krs` の内容を `index.krs` としてコピーする。他ファイルはファイル名を変えずに配置するため、`import { X } from "./ecommerce.krs"` などの相対パスはそのまま動作する。

メリット:
- ProjectMode のプロジェクト切り替えを初回から体験できる
- マルチファイル・import 機能を段階的に体験できる
- サイドバーのファイルツリーが活用される

デメリット:
- 初回起動時に 7 プロジェクト分の OPFS 書き込みが走る（非同期なので UX への影響は軽微）

### 案B（却下）: 単一 "Getting Started" プロジェクトにフラット展開

01〜04 を 1 プロジェクトに並べる案。プロジェクト切り替え体験ができないため却下。

## バンドル実装方針

### `packages/core/src/builtins/examples.ts` を新設する

`?raw` import を使う案（案X）も検討したが、以下の理由で TypeScript ファイルとして管理する案（案Y）を採用する。

- `core` に置くことで `app` / `cli` / `vscode` 全てから参照できる
- examples ファイルの更新時に同期を強制できる（→ `.claude/rules/` でルール化）
- 型定義を添えられる（`ExampleFile[]` など）

```ts
// packages/core/src/builtins/examples.ts（イメージ）
export type ExampleProject = {
  name: string;
  files: { path: string; content: string }[];
};

export const EC_PLATFORM_PROJECTS: ExampleProject[] = [
  {
    name: "01-system",
    files: [{ path: "index.krs", content: `...` }],
  },
  {
    name: "05-multifile",
    files: [
      { path: "index.krs", content: `...` },      // system.krs の内容
      { path: "ecommerce.krs", content: `...` },
      { path: "payment.krs", content: `...` },
    ],
  },
  // ...
];
```

### examples 更新時の同期ルール

`examples/ec-platform/` を変更した際は `packages/core/src/builtins/examples.ts` も合わせて更新する必要がある。この制約を `.claude/rules/examples-sync.md` に記載し、Claude が examples を編集する際に自動的に参照できるようにする。

## 現時点の方針

案A + 案Y で実装を進める。

実装ステップ:
1. `packages/core/src/builtins/examples.ts` を新設し、ec-platform 全ファイルを文字列として格納
2. `.claude/rules/examples-sync.md` を追加（examples 変更時の同期ルール）
3. `packages/app/src/ProjectModeApp.tsx` の初期化処理を修正し、`EC_PLATFORM_PROJECTS` を使って 7 プロジェクトを作成
4. `ProjectManager.createProject()` にファイル群を受け取るオプションを追加（または初期化専用ユーティリティを新設）

## 未解決の問い

- `ProjectManager.createProject()` を拡張するか、初期化専用の関数を別途用意するか
- 将来的に「テンプレートから新規プロジェクト作成」機能に発展させるか（今回はスコープ外）
- `examples.ts` の更新を自動化（ビルドスクリプト化）するか、手動管理 + rules で担保するか
