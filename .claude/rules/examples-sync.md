---
paths:
  - "examples/**/*.krs"
  - "examples/**/*.krs.style"
---

# examples 変更時の同期ルール

**到達状態**: `examples/` 配下の登録済みファイルと
`packages/core/src/builtins/examples.ts` の対応エントリが byte 一致している。
検証は `packages/core/src/examples.test.ts` の drift ガードが行う —
examples を変更したら `pnpm --filter @karasu-tools/core test` が通る状態で、
`examples/` と `examples.ts` の両方を同一コミットに含める。

`examples/ja/ec-platform/`・`examples/en/ec-platform/`・`examples/en/feature-samples/`
の編集は `/update-examples` スキル経由で行う（スキルが `examples.ts` の同期と
コミットまで担う）。それ以外の登録済みディレクトリは下記「更新手順」で手動同期する。

## 登録済みディレクトリと examples.ts の対応

`examples.ts` は登録済みディレクトリの内容を文字列として保持し、ProjectMode の
初回起動時に使用される。ファイル単位の対応は各定数の `files[].path` から読み取れる。

| examples ディレクトリ | examples.ts の定数 |
|---|---|
| `ja/getting-started/` | `GETTING_STARTED_PROJECT` |
| `en/getting-started/` | `GETTING_STARTED_PROJECT_EN` |
| `en/client-mcp/` | `CLIENT_MCP_PROJECT` |
| `ja/facet-styling/` | `FACET_STYLING_PROJECT` |
| `en/facet-styling/` | `FACET_STYLING_PROJECT_EN` |
| `ja/ec-platform/` | `EC_PLATFORM_PROJECTS`（スキル管理） |
| `en/ec-platform/` | `EC_PLATFORM_PROJECTS_EN`（スキル管理） |
| `en/feature-samples/` | `FEATURE_SAMPLES_PROJECT`（スキル管理） |
| `ja/multi-file-system/` | `MULTI_FILE_SYSTEM_PROJECT` |
| `en/multi-file-system/` | `MULTI_FILE_SYSTEM_PROJECT_EN` |
| `ja/deploy-only/` | `DEPLOY_ONLY_PROJECT` |
| `en/deploy-only/` | `DEPLOY_ONLY_PROJECT_EN` |
| `ja/org-only/` | `ORG_ONLY_PROJECT` |
| `en/org-only/` | `ORG_ONLY_PROJECT_EN` |

登録されていないディレクトリ（`hr-tool/` など）は変更しても同期不要。

## 同期時の注意点（drift テストのエラーだけでは気づきにくいもの）

- multi-stage プロジェクト（ec-platform の `05-multifile/`・`06-deploy/`・
  `07-cross-system/`）は各ステージの先頭ファイル（`system.krs` / `main.krs`）が
  bundled 時に `index.krs` にリネームされる（#1777）
- `feature-samples/` に新サンプルを追加したら、カタログ役の `index.krs` にも
  1 行追記する（現在 14 個 → 追加のたびに増える）
- `facet-styling/` は **`.krs` と `.krs.style` を対で**バンドルする唯一の登録済み
  ディレクトリ。シートがサンプルの主題そのものなので、`.krs` だけ同期すると
  「開いても何も起きないプロジェクト」になる。drift ガードの file filter も
  `.krs.style` を含めてある
- `deploy-only/` / `org-only/` は Reference ウィンドウの Samples タブ（#1548）で
  参照され、en ロケールでは `*_EN` 変種、ja では `ja/` 版が表示される（#1642）。
  `multi-file-system/`・`ec-platform/` も同様に en/ja のロケール一致版が
  ProjectMode の seed に投入されるため、両ロケールを揃えて更新する

## 更新手順

### 登録済みファイルを変更する場合

1. 対象の `examples/` ファイルを変更する
2. `examples.ts` の対応する `content` フィールドを同内容に更新する
3. `pnpm --filter @karasu-tools/core test` で drift ガードが通ることを確認する
4. 両ファイルを同一コミットに含める

### 新しい examples ディレクトリを登録する場合

1. `examples/` にファイルを追加する
2. `examples.ts` に新しい `ExampleProject` エントリを追加する
3. `packages/core/src/examples.test.ts` に drift ガードを追加する
4. 上の対応表にも 1 行追記する
5. すべてを同一コミットに含める

> かつて本ファイルにはファイル単位の全対応表（60 行超）を置いていたが、
> `examples.ts` と drift テストから導出可能な重複で腐りやすいため、
> ディレクトリ単位の表に縮約した（#2134）。
