# VS Code 拡張の Marketplace 公開準備と `vsce publish` 自動化

- **日付**: 2026-06-16
- **ステータス**: 検討中
- **PR**: [#1664](https://github.com/kompiro/karasu/pull/1664)
- **関連**:
  - 引き金 Issue: [#1316](https://github.com/kompiro/karasu/issues/1316)（OSS launch Phase 2 — Marketplace publish under publisher `karasu-tools`）
  - 親 Issue: [#1302](https://github.com/kompiro/karasu/issues/1302)（OSS 化ブレインストーミング）, [#1317](https://github.com/kompiro/karasu/issues/1317)（hard launch）
  - 関連 ADR: [ADR-20260512-05](../adr/20260512-05-release-automation-changesets.md)（changesets を採用、当面 `karasu`(CLI) のみ npm 公開。`karasu-vscode` の version 管理と Marketplace publish は **#1316 に委譲**と明記）, [ADR-20260330-05](../adr/20260330-05-vscode-extension-lsp-first.md)（LSP server を esbuild バンドルする先例）
  - 関連 TPL: [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md)（dev tree のパスに依存する成果物は packaged/installed モードでも動くか確認）, [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md)（成果物 A↔B の整合チェックは両側の変更で起動させる）
  - コード: `packages/vscode/package.json`, `packages/vscode/scripts/assert-server-bundled.mjs`, `.github/workflows/release.yml`, `README.md`

## 背景・課題

hard launch（#1317）で karasu が discoverable になるよう、`packages/vscode` 拡張を
VS Code Marketplace に publisher **`karasu-tools`** で掲載したい（#1316）。
publisher ID `karasu` は取得済みだったため、フォールバックとして `karasu-tools` を登録した
（#1316 のフォールバック方針。`kompiro` よりプロジェクト名に近く `@karasu-tools/*` の npm
scope とも揃う）。Marketplace 上の拡張 ID は `<publisher>.<name>` ＝ **`karasu-tools.karasu-vscode`**。

#1316 のタスクのうち、**publisher の作成・Azure DevOps PAT の発行・実 publish・
publisher ID の空き確認・スクリーンショット撮影**は marketplace.visualstudio.com
上の人手作業であり、リポジトリ側では完結しない。本 Design Doc は **リポジトリ側で今
やれる準備**と、**`vsce publish` の自動化をどう配線するか**の設計判断を扱う。

ADR-20260512-05 は changesets による npm 公開を `karasu`(CLI) のみに絞り、
`karasu-vscode` を `.changeset/config.json` の `ignore` に入れたうえで「version 管理と
Marketplace publish は #1316 に委ねる」と明記している。つまり **vscode のリリース配線を
決めるのは本 Issue が正式な置き場所**であり、npm の changesets フローとは独立に設計する。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `publisher` | `package.json` は `"publisher": "karasu"`。`karasu` は取得済みだったため publisher は **`karasu-tools`** で登録済み → 実装 PR で `package.json` の `publisher` を `karasu-tools` に変更する。拡張 ID は `karasu-tools.karasu-vscode` |
| `version` | `0.1.0`（CLI の `0.0.0` プレースホルダとは異なり実バージョン） |
| Marketplace README | **存在しない**。Marketplace は GitHub/npm とは別の README をレンダリングするため専用ファイルが要る |
| discoverability metadata | `categories: ["Programming Languages"]` のみ。`keywords` / `repository` / `homepage` / `bugs` / `galleryBanner` が無い。Acceptance が要求する "karasu" / "C4" / "architecture diagram" 検索に必要 |
| `.vscodeignore` | **存在しない**。これが無いと `vsce` が `src/` `node_modules` `tsconfig.json` `vitest.config.ts` `scripts/` まで `.vsix` に同梱する |
| バンドル | `out/extension.js`（esbuild、`--external:vscode`）に `marked` / `vscode-languageclient` / `@karasu-tools/core` を内包。`out/server.js` は LSP server を `cpSync` で同梱。`assert-server-bundled.mjs` が postbuild で検証（#1272 / TPL-20260510-15） |
| `vsce` | `@vscode/vsce` への依存が無い。package / publish コマンドも未定義 |
| changesets | `.changeset/config.json` の `ignore` に `karasu-vscode`。CLI のみ公開対象 |
| release workflow | `.github/workflows/release.yml` は npm 専用。`NPM_TOKEN` secret が無ければ publish step を skip する guard を持つ（pre-launch 想定の先例） |
| icon | `icon.png`（128×128 相当、`icon` フィールド設定済み）, `images/karasu-{light,dark}.svg`（コマンド用） |
| LICENSE | パッケージ直下に LICENSE 無し（root に Apache-2.0、`license` フィールドは設定済み） |
| 親 ADR | ADR-20260512-05 が vscode publish を #1316 に委譲。release.yml の secret-guard が踏襲できる先例 |

## 制約・前提

- **changesets フローに `karasu-vscode` を戻さない**（ADR-20260512-05 の決定。npm CLI 公開とは
  cadence・配布先・認証が全く異なるため独立配線にする）。
- **実 publish は人手の前提条件にゲートされる**: publisher `karasu-tools` は登録済みだが、
  `VSCE_PAT` secret の設定が済むまで publish は実行できない。workflow は secret 不在で安全に
  no-op すること（release.yml の `NPM_TOKEN` guard と同じ思想）。
- **packaged/installed モード parity**（TPL-20260510-15）: `.vsix` に同梱されない / dev tree の
  相対パスに依存するコードは installed 環境で壊れる。README・icon・`out/server.js` が
  `.vsix` に確実に入り、`src/` 等の不要物が入らないことを保証する。
- **out of scope（人手 / 別 Issue）**: publisher 登録（`karasu-tools` で完了済み）、Azure DevOps
  PAT 発行、`VSCE_PAT` secret 登録、実 publish、スクリーンショット撮影、launch 告知（#1317）。
  本 PR では「人手（PAT + secret）が揃えば動く」状態まで配線する。

## 検討した選択肢

設計判断は 2 軸に分かれる。**(A) リポジトリ側の準備**はほぼ一意なので（README 追加・
metadata 追加・`.vscodeignore` 追加・root README cross-link）、論点は **(B) `vsce publish`
をどう trigger するか**に集約される。

### 案1: `workflow_dispatch` 手動トリガ + secret guard

専用 workflow `.github/workflows/vscode-release.yml` を追加し、トリガは
`workflow_dispatch` のみ。実行時に拡張を build → `vsce package` → `vsce publish` する。
`VSCE_PAT` secret が無ければ publish step を skip（release.yml の guard と同型）。
version は `packages/vscode/package.json` の `version` を正典にする。

**メリット**

- main への push では一切走らない。初回 publish（soft visibility）は意図的に手動で行う
  という #1316 の方針（"Publish initial version (can be pre-launch)"）に合致。
- 前提条件（publisher / PAT）が人手で未整備な現状でも、誤発火で CI が赤くならない。
- 実装が最小。release.yml の guard パターンをそのまま流用でき、レビューしやすい。

**デメリット**

- 「自動化」としては手動起動が残る。version bump と publish を毎回人が回す。

### 案2: tag-triggered（`vscode-v*` tag push で publish）

`vscode-v0.1.0` のような tag push を trigger にして publish する。

**メリット**

- tag を切れば publish される宣言的フロー。リリース履歴が tag に残る。

**デメリット**

- tag 命名規約を新設する必要があり、CLI（changesets が管理）と二重の version 体系になる。
- 初回 publish 前（publisher 未作成）に誤って tag を切ると失敗する。前提条件が揃う前に
  仕組みだけ入れる本 Issue のフェーズには重い。
- 案1 から後で移行可能（trigger を足すだけ）。最初から入れる必要はない。

### 案3: changesets フローへ統合（`karasu-vscode` を ignore から外す）

release.yml に相乗りさせる。

**メリット**

- リリース口が 1 つにまとまる。

**デメリット**

- **ADR-20260512-05 の決定に反する**。npm registry と Marketplace は配布先・認証
  （`NPM_TOKEN` vs `VSCE_PAT`）・成果物（tarball vs `.vsix`）が異なり、無理に同じ
  `changeset publish` に載せると分岐が増える。却下。

## 比較

| 観点 | 案1 dispatch | 案2 tag | 案3 changesets |
| --- | --- | --- | --- |
| 実装コスト | 小 | 中 | 中〜大 |
| ADR-20260512-05 整合 | ◎ | ◎ | ✗（決定に反する） |
| 誤発火耐性（前提未整備時） | ◎（手動のみ + guard） | △（tag 誤切りで失敗） | △ |
| #1316 フェーズ適合（soft 初回 publish） | ◎ | △ | △ |
| 将来の拡張余地 | tag/自動 trigger を後で追加可 | — | — |

## 現時点の方針

**案1（`workflow_dispatch` + `VSCE_PAT` guard）を採用する。** 前提条件（publisher 作成・
PAT 発行・secret 登録）が人手で未整備な本フェーズでは、誤発火しない手動トリガが最も
安全で、release.yml の既存 guard パターンと一貫する。tag-triggered（案2）への移行は
trigger を 1 つ足すだけなので、publish cadence が固まってからの follow-up で足りる。

あわせて **リポジトリ側の Marketplace 準備**（案 A）を同 PR で行う:
Marketplace README・discoverability metadata・`.vscodeignore`・root README cross-link。

> **認証方式の更新（2026-06-17）**: 当初は `VSCE_PAT` secret guard を想定していたが、
> Azure DevOps の長期 PAT が **2026-12-01 に廃止**されるため、認証を **Microsoft Entra ID +
> GitHub OIDC** に切り替える。workflow は `azure/login`（federated credential、stored secret
> なし）で Entra token を取得し、`vsce publish --azure-credential`（vsce >= 2.26.1; 本 repo は
> 3.9.1）で publish する。guard は `VSCE_PAT` secret の有無ではなく **`AZURE_CLIENT_ID`
> variable** の有無で行う（identifier は secret ではないので repo variable に置く）。前提条件は
> Entra app registration + federated credential（issuer `token.actions.githubusercontent.com`、
> subject `repo:kompiro/karasu:ref:refs/heads/main`）と、その service principal を `karasu-tools`
> publisher の member（Contributor）に追加すること。比較節の「`VSCE_PAT`」「secret guard」は
> 当時の検討の記録として残すが、確定方針は本注記が優先する。

### 実装の指針

1. **Marketplace README**: `packages/vscode/README.md` を新規作成。VS Code ユーザー視点
   （インストール → `.krs` を開く → preview を見る）で書く。GitHub/npm README とは別物。
   `images/` のスクリーンショットは人手で後から差し込む前提のプレースホルダ節を置く。
2. **discoverability metadata**: `packages/vscode/package.json` に追加
   - `keywords`: `["krs", "C4", "architecture", "architecture diagram", "diagram", "modeling", "karasu"]`（Acceptance の検索語を満たす）
   - `repository`（`type: git`, `url`, `directory: packages/vscode`）/ `homepage` / `bugs`
   - `galleryBanner`（`color` + `theme`）/ 必要なら `qna`
   - `categories` に `"Visualization"` を追加（現状 `Programming Languages` のみ）
3. **`.vscodeignore`**: `src/`, `node_modules/`, `tsconfig.json`, `vitest.config.ts`,
   `scripts/`, `.vscode/`, `*.ts` 等を除外。`out/`・`icon.png`・`images/`・`syntaxes/`・
   `language-configuration.json`・`README.md`・`THIRD_PARTY_NOTICES.md` は同梱されること。
   TPL-20260510-15 に従い、`vsce ls`（または `vsce package` 後の `.vsix` 内容）で
   `out/server.js` と README が入る／`src/` が入らないことを AT で固定する。
4. **`@vscode/vsce` 依存と scripts**: `packages/vscode` の devDependency に `@vscode/vsce` を
   追加し、`package`（`vsce package`）/ `publish`（`vsce publish`）script を定義。build →
   package の順序を保つ（`out/server.js` が無いと `assert-server-bundled` で失敗する）。
5. **`.github/workflows/vscode-release.yml`**: `workflow_dispatch` トリガ。pnpm install →
   workspace build → package → 認証（下記「認証方式」参照）→ publish step は
   `if: AZURE_CLIENT_ID variable が空でない` で gate。未設定時は `::notice::` を出して skip
   （build/package は実行され bundling と `.vscodeignore` を検証する。release.yml の
   `NPM_TOKEN` guard を踏襲）。**初回は stable チャネルに publish する**（#1316 の "soft
   visibility" は「ひっそり stable publish」の意であり pre-release ではない）。ただし将来の
   ために `workflow_dispatch` の `inputs.pre_release`（boolean, default false）を用意し、true
   なら `vsce publish --pre-release` とする（hard launch 前のテスト配布などで使える）。
6. **root README cross-link**: `README.md` の「VS Code extension」節に Marketplace install
   リンク（`code --install-extension karasu-tools.karasu-vscode` と Marketplace URL
   `itemName=karasu-tools.karasu-vscode`）を **今 追記する**。publisher は登録済みだが listing
   は実 publish まで live でないため、「launch 時に有効化される（coming soon）」旨を 1 行添える。
   拡張 ID は確定（`karasu-tools.karasu-vscode`）なので先に置く。
7. **AT**: `docs/acceptance/` に新規ファイル。TC は:
   - `package.json` に `keywords`/`repository`/`galleryBanner` があり、`publisher` が `karasu-tools`
   - `.vsix`（または `vsce ls`）に `out/extension.js` / `out/server.js` / `README.md` /
     `icon.png` が含まれ、`src/` / `node_modules/` / `*.test.ts` が含まれない（TPL-20260510-15）
   - `vscode-release.yml` が Entra OIDC（`id-token: write` + `azure/login` + `--azure-credential`、PAT 不使用）で認証し、publish path が `AZURE_CLIENT_ID` variable に gate されている（TPL-20260520-02：
     guard が片側に偏らず、secret 不在で no-op する）
8. **ADR 昇格**: 実装完了後（実装 PR の cleanup 時）に
   `docs/adr/1316-vscode-marketplace-publish.md` 等として昇格し、本 Design Doc は同 PR で削除する。
   ADR-20260512-05 から本 ADR への related_to リンクを張る。

### 影響範囲・マイグレーション

- 既存ユーザーへの影響: なし（拡張の挙動は変えず、配布 metadata と CI 配線のみ追加）。
- ドキュメント更新: `README.md`（VS Code extension 節）, `packages/vscode/README.md`（新規）。
- テスト・examples への影響: なし。AT を 1 件追加するのみ。
- CI: `vscode-release.yml` は `workflow_dispatch` のみなので通常の push/PR では走らない。

## Related TPLs

- [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md) —
  `.vsix` に必要物が入り dev tree のパス依存が installed モードで壊れないことを `.vscodeignore`
  と AT で固定する。
- [TPL-20260520-02](../test-perspectives/TPL-20260520-02-consistency-check-triggers-on-both-sides.md) —
  publish の secret guard を片側に偏らせず、`VSCE_PAT` 不在で安全に no-op させる。

## 決めたこと（旧 未解決の問い）

- **publisher ID**: `karasu` は取得済みのため **`karasu-tools`** で登録。実装 PR で
  `package.json` の `publisher` を `karasu-tools` に変更する（拡張 ID `karasu-tools.karasu-vscode`）。
- **root README の Marketplace リンク**: 今 追記する。拡張 ID は確定（`karasu-tools.karasu-vscode`）
  なので先に置き、「launch 時に有効化（coming soon）」を 1 行明記する。
- **publish チャネル**: 初回は **stable**。`workflow_dispatch.inputs.pre_release` は将来用に
  用意しておくが default は false。

## 意図的に決めないこと

- スクリーンショットの調達は人手。README にプレースホルダ節だけ置き、実画像は別途差し込む。
