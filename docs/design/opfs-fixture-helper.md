# OPFS fixture helper for Playwright E2E

- **日付**: 2026-04-27
- **ステータス**: 検討中
- **関連**:
  - Issue: [#862](https://github.com/kompiro/karasu/issues/862)
  - 親 Issue: [#597](https://github.com/kompiro/karasu/issues/597)
  - ADR: [20260412-05-playwright-with-ai-visual-review.md](../adr/20260412-05-playwright-with-ai-visual-review.md)
  - 依存先: [AT-0004](../acceptance/0004-project-management-opfs.md), [AT-0014-memory-project-mode-unification](../acceptance/0014-memory-project-mode-unification.md)

## 背景・課題

`packages/e2e` の Playwright スイートはアプリのプレビュー UI に対する
受け入れテストを多数自動化してきたが、OPFS 状態を前提にしたテストは
書けていない。具体的に止まっている AT は次の 2 つ:

- **AT-0004 — プロジェクト管理と OPFS**:
  ProjectSelector / FileTree / 初回起動時の 7 プロジェクト自動シードなど、
  すべて OPFS の中身に依存する。
- **AT-0014 — MemoryModeApp / ProjectModeApp の統一**:
  同じシナリオを **OPFS モード**と **InMemory モード**の両方で回したい
  （AC-1〜AC-3 が memory、AC-4 が opfs、AC-5 が両方）。

現在の `packages/e2e/playwright.config.ts` は Chromium 1 プロジェクトで
OPFS を素のまま使っており、テストごとに状態が混ざる・初回シード処理を
踏んでしまうため、これらの AT を書こうとすると **(a) OPFS を空にする**
**(b) 任意のファイルを置く** **(c) memory モードと opfs モードの両方で
同じテストを回す** という 3 点が必要になる。

本 Design Doc は `packages/e2e` で再利用できる **OPFS fixture** を導入し、
これら 3 点を提供することを目的とする。AT-0004 / AT-0014 のテスト本体は
別 Issue（#865 / #866）で扱うため、本 PR の範疇は fixture と smoke テスト
までに閉じる。

## 調査サマリー（現状の実装）

| 観点 | 現状 |
| --- | --- |
| OPFS 検出 | `packages/app/src/fs/detect-storage-mode.ts` — `?mode=memory` URL パラメータで強制的に memory モードに切り替えできる |
| OPFS プロバイダ | `packages/app/src/fs/opfs-provider.ts` が `navigator.storage.getDirectory()` をラップ |
| 初回シード | `useProjectInitialization.ts` がプロジェクト 0 件のとき `01-system`〜`07-cross-system` を自動作成。テスト的には「`localStorage` に何もなく、OPFS ルートが空」だと毎回シードが走る |
| 永続化 | `localStorage` キー `LAST_PROJECT_KEY` に直近のプロジェクト ID を保持 |
| Playwright config | Chromium 1 プロジェクト、`webServer` で vite dev / preview を起動、`baseURL` 固定 |

→ アプリ側の改修は不要。OPFS と localStorage を**テスト前に決定論的に
セットする手段**だけ用意すればよい。

## 制約・前提

- Chromium のみを対象とする（Playwright config が既に chromium-only）。
  Firefox / WebKit は OPFS の挙動が異なるため将来課題。
- セキュリティ的に OPFS は origin に閉じる。`baseURL` が固定なので、
  テスト間の origin 共有は問題にならない。
- 既存の AT-0005〜AT-0057 のテスト群は OPFS の状態を仮定していない
  （初回シードに任せている）。fixture を導入しても **opt-in** にして
  既存テストの挙動を変えない。
- `addInitScript` は **`page.goto` より前**に登録する必要がある。fixture の
  公開 API はこの順序を呼び出し側に強制する。

## 決定

### 1. ファイル配置

新規 `packages/e2e/fixtures/opfs.ts` に Playwright fixture を実装し、
そこから `test` / `expect` を再エクスポートする。
テスト側は `import { test, expect } from "../fixtures/opfs"` で読み込む。

```
packages/e2e/
├── fixtures/
│   ├── opfs.ts          ← 本 PR で追加
│   └── README.md        ← 使い方
├── tests/
│   ├── fixtures/
│   │   └── opfs.smoke.spec.ts   ← 本 PR で追加（fixture 自体の smoke）
│   └── at-XXXX-*.spec.ts        ← 既存テスト（変更なし）
```

### 2. fixture API

```ts
import { test, expect } from "../fixtures/opfs";

test("seeded project shows in ProjectSelector", async ({ page, opfs }) => {
  await opfs.seed({
    files: {
      "my-project/index.krs": "system \"My System\"\n",
    },
    lastProjectId: "my-project",
  });
  await page.goto("/");

  await expect(page.locator(".project-selector select")).toHaveValue("my-project");
});
```

公開メソッド:

| メソッド | 役割 |
| --- | --- |
| `opfs.seed({ files, lastProjectId? })` | OPFS ルートを wipe したうえで `files` を書き、必要なら `localStorage[LAST_PROJECT_KEY]` を設定する。`page.goto` より前に呼ぶ |
| `opfs.reset()` | OPFS ルートと `localStorage` を空にする（seed なしで素のメモリモード相当を作る用途） |
| `opfs.read(path)` | テスト本体から OPFS の内容を読みたいとき用。`page.evaluate` で `navigator.storage.getDirectory()` を叩く |

`seed` と `reset` の実態は `page.addInitScript` を 1 回登録するだけ。
スクリプト内で `navigator.storage.getDirectory()` を取得し、`removeEntry`
で全エントリを削除してから `getFileHandle({ create: true })` でファイルを
書き込む。`addInitScript` は新規ドキュメントロード前に毎回走るので、
`page.goto` 後の SPA 内遷移にも追従する。

#### ファイル指定形式

`files` は path → string のフラットマップにする:

```ts
opfs.seed({
  files: {
    "proj-a/index.krs": "...",
    "proj-a/sub/other.krs": "...",
    "proj-b/index.krs": "...",
  },
});
```

ディレクトリは path から自動で推論し、`getDirectoryHandle({ create: true })`
で再帰的に作る（`opfs-provider.ts` の `mkdir` と同じ流儀）。これによりテスト
側に「ディレクトリを先に作る」みたいな手続きを書かせない。

### 3. リセット戦略 — `addInitScript` のみ

候補は 2 つあった:

- **(A) `addInitScript` で wipe + seed**: ロード前にスクリプトを差し込む。
  確実だが、テスト本体から `opfs.seed()` を呼ぶ必要がある。
- **(B) global `beforeEach` で常に wipe**: 既存テストにも影響する。

→ **(A) を採用**。理由:

- 既存テスト（OPFS の自動シードに依存）を壊さない。
- 「seed したテストだけ決定論的」というスコープが明確。
- (B) のように常時 wipe すると、初回シード経路が走る回数が変わってしまい、
  AT-0004 の AC-3「初回起動時に 7 プロジェクトが自動作成される」を
  そのまま検証できなくなる（その AT では逆に「空 OPFS」を seed する）。

### 4. 二環境ハーネス（AT-0014 用）

`playwright.config.ts` に Playwright プロジェクトを 2 つ宣言し、
`process.env.KARASU_E2E_MODE` か Playwright の `project.name` で
分岐させる。アプリ側は既に `?mode=memory` を解釈するので、
fixture が `baseURL` への遷移時にクエリを付与すればよい。

```ts
// playwright.config.ts（抜粋）
projects: [
  { name: "chromium-opfs",   use: { ...devices["Desktop Chrome"] } },
  { name: "chromium-memory", use: { ...devices["Desktop Chrome"], baseURL: `${BASE_URL}?mode=memory` } },
],
```

ただし、**全テストを 2 プロジェクトで回すのは過剰**(既存スイートのほとんど
は OPFS 前提でも memory 前提でもなく、初回シードに乗っている)。そこで:

- デフォルトの run は `chromium-opfs` 1 プロジェクトのまま（既存挙動を維持）。
- AT-0014 のように両環境で回したいテストは `test.describe.parallel("...", () => { ... })`
  の中で `[ "opfs", "memory" ] as const` を `for...of` で回し、各反復で
  `opfs.seed({ ..., mode })` を呼んで `mode === "memory"` なら fixture が
  `?mode=memory` を付けて goto する、という運用にする。

→ Playwright 公式の「同じテストを 2 プロジェクトで回す」機能ではなく、
**fixture 引数で切り替える**形を取る。理由:

- CI 全体のテスト数を 2 倍にせずに済む（既存の高 tier AT は 1 環境で十分）。
- どのテストが「両環境必須」かがコード上で明示される。
- AT-0014 だけ二回し、他の AT は OPFS 一回し、という細やかなスコープが取れる。

代わりに将来 memory 専用の AT が増えたら `playwright.config.ts` の
`projects:` を拡張する逃げ道は残しておく（fixture API が `mode` を
受け取る形にしておけば、上位を差し替えるだけで対応できる）。

### 5. Smoke テスト

`tests/fixtures/opfs.smoke.spec.ts` で fixture そのものの動作を担保する:

1. `opfs.reset()` → goto `/` → ProjectSelector に既定 7 プロジェクトが
   並ぶ（初回シード経路が走る）。
2. `opfs.seed({ files: { "fixture-only/index.krs": "system \"X\"\n" }, lastProjectId: "fixture-only" })`
   → goto `/` → ProjectSelector で `fixture-only` が選択状態になる。
3. `opfs.seed({ ..., mode: "memory" })` → goto `/` → MemoryModeApp が
   表示される（`.memory-mode-app` などの目印が出る）。

これらが緑なら下位の AT-0004 / AT-0014 を書く土台ができたとみなす。

## 却下した代替案

### A. `Origin Trial` / `chrome.fileSystem` 系で OS 上にディレクトリをマウント

`@playwright/test` から OS のファイルシステムを差し込む方法は存在するが、
アプリは `navigator.storage.getDirectory()` 経由でしか OPFS を見ないため、
OS 側に置いても無関係。却下。

### B. アプリ側にテスト専用の seed エンドポイント / フックを足す

「`window.__seedOpfs()` のようなテストフック」を `packages/app` に
入れる案。プロダクションコードへ test-only な経路が漏れること、
fixture を Playwright 標準の `addInitScript` で書ける限りは不要なこと
から却下。

### C. すべてのテストで `beforeEach` に wipe を入れる

既存テスト群（とくに `at-0050-filetree-collapse-scope` のような、
初回シード結果に依存しているもの）が壊れる。スコープ拡大しすぎるため却下。

### D. Playwright `projects:` で OPFS / memory を全テスト 2 回しする

CI コストが倍になり、ほとんどのテストにとっては memory モード分が冗長。
opt-in にする本決定の方が経済的。将来必要になったら拡張する。

## 影響範囲

- **新規**: `packages/e2e/fixtures/opfs.ts`, `packages/e2e/fixtures/README.md`,
  `packages/e2e/tests/fixtures/opfs.smoke.spec.ts`
- **改修**: `packages/e2e/playwright.config.ts` — `chromium-memory` プロジェクト
  を追加（デフォルト run には含めない設定）
- **アプリ側**: 変更なし
- **CI**: 既存の `e2e` ラベルゲート / nightly run に変更なし。デフォルトの
  Playwright プロジェクトのみ走るので smoke テスト 1 件分の追加で済む

## やらないこと（このスコープでは扱わない）

- AT-0004 / AT-0014 のテスト本体（別 Issue: #865 / #866）。
- VS Code 拡張ホストハーネス（別 Issue: #863）。
- Chat UI のモック / BYOK 対応（別 Issue: #864）。
- Cross-browser での OPFS（Firefox / WebKit）。
- `pnpm cli render` 経由など、ブラウザ外からの OPFS 操作。

## アクセプタンステスト

本 PR で人間確認が必要な項目はない（自動 smoke テストが受け入れの全て）。
- `packages/e2e/tests/fixtures/opfs.smoke.spec.ts` が CI で緑になること。
- 既存の `at-*.spec.ts` 群が引き続き緑であること（リグレッションがない）。
