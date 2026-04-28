# VS Code extension host test harness

- **日付**: 2026-04-27
- **ステータス**: 検討中
- **関連**:
  - Issue: [#863](https://github.com/kompiro/karasu/issues/863)
  - 親 Issue: [#597](https://github.com/kompiro/karasu/issues/597)
  - 依存する AT 群:
    - [AT-0037 — VS Code Phase 5 standard LSP features](../acceptance/0037-vscode-phase5-standard-lsp.md)（[#867](https://github.com/kompiro/karasu/issues/867)）
    - [AT-0038 — VS Code Cmd/Ctrl+Click hint](../acceptance/0038-vscode-phase4-5-cmd-click-hint.md)
    - [AT-0039 — VS Code Phase 6 detail panel](../acceptance/0039-vscode-phase6-detail-panel.md)
    - [AT-0042 — VS Code cross-diagram navigation](../acceptance/0042-vscode-cross-diagram-navigation.md)

## 背景・課題

VS Code 拡張（`packages/vscode`）の AT は、エディタ内で発生する操作
（補完、ホバー、F12、Cmd/Ctrl+Click、Outline、プレビュー連携）に依存しており、
ブラウザでは検証できない。これらは現在すべて手動テストで、回帰検出が機能していない:

- Phase 5 標準 LSP（補完・定義ジャンプ・ホバー・Outline）— AT-0037
- Phase 4.5 Cmd/Ctrl+Click ヒント — AT-0038
- Phase 6 詳細パネル — AT-0039
- クロス図ナビゲーション — AT-0042

LSP サーバー側の単体テストは `packages/lsp` に書けるが、
**拡張のアクティベーション・コマンド登録・LSP クライアント起動・WebView との往復**は
拡張ホスト（Electron）上で実拡張を動かさないと検証できない。

#597 が指摘する通り、これは横断的なインフラ課題であり、
個別 AT の実装より先に harness を確立すべき。

## 制約・前提

- VS Code 拡張は `vscode-languageclient/node` を使うため Node 環境（Electron）が必須。
  ブラウザだけで動く Playwright では拡張ホスト相当を再現できない。
- 既存の Playwright e2e（`packages/e2e`）は `packages/app` 用。**別ランナーで構わない。**
- karasu の VS Code 拡張は `pnpm --filter karasu-vscode build`（esbuild）で
  `packages/vscode/out/extension.js` に bundle 済み。LSP も同様に `packages/lsp` で build される。
- CI ランタイムは「label gated」運用（`packages/e2e` の Playwright 同様）で許容できる。
  毎 PR で必須にはしない（VS Code 本体ダウンロード＋起動で 3〜5 分かかる前提）。
- AT 本体（AT-0037ff）の実装は **out of scope**。本設計は smoke test 1 本で着地させる。

## 調査サマリー（候補ランナー）

| ランナー                                | 仕組み                                                                                                | 実績                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| `@vscode/test-electron`                 | 指定バージョンの VS Code をダウンロードし、拡張ホスト内で Mocha スイートを実行（公式リファレンス）    | VS Code 公式拡張群、ESLint, etc. |
| `@vscode/test-cli` (`vscode-test`)      | `@vscode/test-electron` の上に被せた CLI ラッパ。`.vscode-test.mjs` 設定 + `vscode-test` コマンドで起動 | 比較的新しめ、推奨方向            |
| Playwright + Electron                   | Electron アプリとして VS Code を起動し DOM を操作                                                     | 一部存在するが maintain コスト大 |
| `wdio-vscode-service` (WebdriverIO)     | WebdriverIO 上で VS Code Electron を駆動                                                              | 少数                              |

→ **`@vscode/test-cli` を採用**。`@vscode/test-electron` を直接使うより設定が宣言的で、
将来的な VS Code 公式の進化に追従しやすい。Mocha 上で書くことになるが、
LSP/UI 系の検証には十分。

## 検討した選択肢: パッケージ配置

### 案A: `packages/e2e` に同居

`packages/e2e/tests/vscode/` 配下に置き、別 npm script (`test:vscode`) で起動。

- 利点: 新パッケージ不要。`packages/e2e` を「E2E のハブ」と見なせる。
- 欠点: Playwright ランナーと Mocha ランナーが同パッケージに混在し、
  `playwright.config.ts` と `.vscode-test.mjs` が並ぶ。`pnpm test` のセマンティクスがブレる。
  依存関係（`@vscode/test-cli`, `mocha`, `@types/mocha`, `glob`）が
  `packages/e2e` に流れ込むのも筋が悪い。

### 案B: `packages/vscode` に co-locate（`packages/vscode/test/`）

VS Code 拡張プロジェクトでよくある構成。`packages/vscode/.vscode-test.mjs`。

- 利点: 公式テンプレートに最も近い。拡張のリリース成果物と test 設定が同居して把握が容易。
- 欠点: 拡張パッケージの devDependencies が肥大化（Mocha + test-cli + Playwright-相当インフラ）。
  公開 vsix のメタデータを汚染しないよう `.vscodeignore` の整備が必要。

### 案C: 新規パッケージ `packages/vscode-e2e`（採用案）

Playwright 用の `packages/e2e` と並ぶ独立パッケージ。`@karasu-tools/vscode-e2e`。

- 利点: ランナーごとに 1 パッケージという既存規約に揃う。`packages/vscode` の
  publish 成果物を汚さない。CI workflow も `paths: packages/vscode-e2e/**` で
  独立に gating できる。
- 欠点: パッケージが 1 つ増える。ただし内訳は `package.json` + `.vscode-test.mjs` +
  `tests/` だけで、規模は小さい。

## 比較

| 観点                       | 案A: e2e 同居 | 案B: vscode 同居 | **案C: 新規パッケージ**     |
| -------------------------- | ------------- | ---------------- | --------------------------- |
| 公式テンプレへの近さ       | △            | ◎               | ○                           |
| 拡張 vsix の汚染回避       | ○            | △（要対策）      | ◎                           |
| 既存パッケージ規約との整合 | △            | △               | ◎                           |
| ランナー混在の回避         | ✗            | ◎               | ◎                           |
| CI gating の独立性         | ○            | △               | ◎                           |

→ **案C を採用**。

## 採用案: `packages/vscode-e2e`

### パッケージ構成

```
packages/vscode-e2e/
├── package.json           # @karasu-tools/vscode-e2e（private）
├── .vscode-test.mjs       # extension/test/workspace パスを指定
├── tsconfig.json
├── tests/
│   ├── runTest.ts         # （test-cli 内部で実行）
│   └── suite/
│       ├── index.ts       # Mocha runner エントリ（glob で *.test.ts を拾う）
│       └── activation.test.ts   # 唯一の smoke test（本 PR スコープ）
├── fixtures/
│   └── workspace/
│       └── sample.krs
└── README.md
```

主要 devDependencies:

- `@vscode/test-cli`
- `@vscode/test-electron`（test-cli が peer 的に要求）
- `mocha` / `@types/mocha`
- `glob`
- `@types/vscode`（既に vscode パッケージにあるバージョンに合わせる）

### `.vscode-test.mjs`（概念）

```js
import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  label: "karasu-vscode-smoke",
  files: "tests/suite/**/*.test.{js,ts}",
  workspaceFolder: "./fixtures/workspace",
  extensionDevelopmentPath: "../vscode",
  mocha: { ui: "bdd", timeout: 60_000 },
  // Pin to a known-good VS Code version to keep CI deterministic
  version: "stable",
});
```

### Smoke test（本 PR の到達点）

**シナリオ**: karasu 拡張がアクティベートされ、LSP クライアントが起動する。

```ts
import * as assert from "node:assert";
import * as vscode from "vscode";

suite("karasu activation", () => {
  test("activates on opening a .krs file and registers the preview command", async () => {
    const ext = vscode.extensions.getExtension("karasu.karasu-vscode")!;
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, "sample.krs"),
    );
    await vscode.window.showTextDocument(doc);
    await ext.activate();

    assert.ok(ext.isActive, "extension should activate");
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes("karasu.openPreview"), "openPreview command should be registered");
  });
});
```

これで「ビルドが壊れていない」「アクティベーションパスで例外を投げない」
「拡張 manifest が壊れていない」までを担保できる。

LSP リクエスト（補完・F12 など）の検証は AT-0037 以降で追加する。

### ビルドオーケストレーション

`pnpm --filter @karasu-tools/vscode-e2e test` の前段で
`packages/vscode` と `packages/lsp` をビルドする必要がある。
pnpm の `dependsOn` を素直に使い、`package.json` の dependencies に
`@karasu-tools/lsp`（型用）と `karasu-vscode`（workspace ref）を入れて、
`prepare` または npm script の `pretest` で build を駆動する。

```json
{
  "scripts": {
    "pretest": "pnpm --filter karasu-vscode build && pnpm --filter @karasu-tools/lsp build",
    "test": "vscode-test"
  }
}
```

> 既に `karasu-vscode` のビルド成果物がある CI なら冪等で速い。

### CI

新規 workflow `.github/workflows/vscode-e2e.yml`:

- トリガー: `pull_request`（`labeled`, `synchronize`, `opened`, `reopened`）
- gating: `if: contains(github.event.pull_request.labels.*.name, 'vscode-e2e')`
- paths（hint 用、gating は label）: `packages/vscode/**`, `packages/lsp/**`, `packages/vscode-e2e/**`
- ステップ:
  1. checkout / setup-pnpm / setup-node
  2. `pnpm install --frozen-lockfile`
  3. `xvfb-run -a pnpm --filter @karasu-tools/vscode-e2e test`（Linux ヘッドレス）
  4. テスト失敗時の VS Code ログをアーティファクトに上げる

> Playwright ワークフロー (`e2e.yml`) と同じ「label-gated」運用に揃え、
> 必要な PR にだけ動かす。Nightly については本設計のスコープ外
> （AT が増えてから判断）。

### コスト見積もり

- VS Code stable のダウンロード: 〜90 MB / 30 s（GitHub runner キャッシュ可）
- 起動 + smoke 実行: 〜30 s
- 合計: **1 回あたり 1.5〜2 分**（キャッシュヒット時）

`actions/cache` で `~/.vscode-test/` をキャッシュすれば 2 回目以降は実行のみ。

## 未解決の問い

なし（議論はすべて反映済み）。

## 受け入れテスト

CI 上で:

- [x] `vscode-e2e` ラベルなし PR では本 workflow が起動しない
- [x] `vscode-e2e` ラベル付き PR で smoke test が green になる
- [x] `packages/vscode/src/extension.ts` の `activate` で例外が投げられるよう改変すると red になる（自己検証）

ローカル:

- [x] `pnpm --filter @karasu-tools/vscode-e2e test` で smoke test が green
- [x] `xvfb-run` を要するのは Linux のみ。macOS/Windows ローカルは素で通る

## 後続作業（本 PR の対象外）

- AT-0037 の自動化（#867）— `tests/suite/lsp-features.test.ts` を追加
- AT-0038 / AT-0039 / AT-0042-vscode の自動化
- 安定したらスケジュール実行（毎日 nightly に組み込み）の検討
