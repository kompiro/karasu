# Dependabot トリアージ 2026-07-21

- **日付**: 2026-07-21
- **ステータス**: 検討中
- **関連**:
  - 引き金: Dependabot PR [#2101](https://github.com/kompiro/karasu/pull/2101) / [#2102](https://github.com/kompiro/karasu/pull/2102) / [#2103](https://github.com/kompiro/karasu/pull/2103)
  - コード: `.github/workflows/*.yml`, `packages/docs-site/package.json`, `pnpm-lock.yaml`

## 背景・課題

Dependabot が open にしている依存更新 PR を、bump 種別を問わず **全件 upstream まで
遡ってサプライチェーン観点でリスク分析**し、マージ可否をまとめる（`hane:dependabot`
skill の方針）。今回の対象は 3 件:

| PR | 依存 | エコシステム | from → to | 種別 |
| --- | --- | --- | --- | --- |
| [#2101](https://github.com/kompiro/karasu/pull/2101) | `actions/setup-node` | github_actions | 6.4.0 → 7.0.0 | major |
| [#2102](https://github.com/kompiro/karasu/pull/2102) | `astro` (docs-site dir) | npm_and_yarn | 6.4.7 → 7.1.0 | major |
| [#2103](https://github.com/kompiro/karasu/pull/2103) | `astro` (group / root) | npm_and_yarn | 6.4.7 → 7.1.0 | major |

## 一覧表（結論）

| PR | 依存 | 種別 | CI | リスク | 推奨アクション |
| --- | --- | --- | --- | --- | --- |
| #2101 | actions/setup-node 6.4.0→7.0.0 | major | ✅ 全通過 | **low** | **マージ推奨** |
| #2102 | astro 6.4.7→7.1.0（docs-site dir のみ） | major | ❌ `Check` fail | — | **却下（close）** — #2103 の壊れた重複 |
| #2103 | astro 6.4.7→7.1.0（lockfile 込み） | major | ✅（ただし後述の盲点あり） | **medium** | **保留（hold）** — starlight 0.41 と協調 bump が必要 |

## PR ごとのリスク分析詳細

### #2101 — actions/setup-node 6.4.0 → 7.0.0 【low / マージ推奨】

- **SHA pin の一致（強い integrity signal）**: 本 repo は setup-node を SHA pin
  している。PR は全 10 箇所を
  `48b55a0…dae4041e # v6.4.0` → `820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`
  に更新する。この新 SHA は **upstream `actions/setup-node` の `v7.0.0` タグが指す
  commit と完全一致**する（`gh api repos/actions/setup-node/git/refs/tags/v7.0.0`
  で検証）。SHA 差し替え・タグ改ざんの兆候なし。
- **リリースノート（v6…v7.0.0）**: ESM 化 + 依存更新、`cache-primary-key` /
  `cache-matched-key` の output 追加、`@actions/cache` 5.1.0、ダミー
  `NODE_AUTH_TOKEN` export の削除。破壊的なのは ESM 化（action ランタイム側の話で
  GitHub-hosted runner は対応済み）程度で、利用側 workflow への影響は小さい。
- **ダミー `NODE_AUTH_TOKEN` 削除について**: 本 repo の publish は OIDC tokenless
  （`project_npm_oidc_publishing`）で、この「ダミー export」は元々未使用のプレース
  ホルダー。OIDC publish には影響しない。
- **メンテナ / 所有権**: `actions/setup-node`（GitHub 公式）。移管・改名なし。
- **CI**: `gh pr checks 2101` で lint/build/test/Playwright/ExTester/Validate/
  gitleaks すべて pass。setup-node は全 workflow を横断するため PR CI で十分に
  exercise されている。
- **advisory**: 該当なし。

→ **low リスク。マージ推奨。**

### #2102 — astro 6.4.7 → 7.1.0（docs-site dir スコープ）【却下 = close】

- **#2103 の壊れた重複**。#2102 は `packages/docs-site/package.json` だけを書き換え、
  `pnpm-lock.yaml` を更新しない。このため CI の `Check` が
  `ERR_PNPM_OUTDATED_LOCKFILE`（`astro` lockfile `^6.4.7` vs manifest `^7.1.0`）で
  **fail** している。
- 同一 bump を lockfile 込みで正しく行う #2103 が存在する。#2102 を残す理由はない。

→ **却下（close）。** サプライチェーン評価は #2103 に集約する。

### #2103 — astro 6.4.7 → 7.1.0（group / lockfile 込み）【medium / 保留】

サプライチェーン観点は概ね良好だが、**互換性の落とし穴があり、しかも PR CI では
検出できない**。単独マージは非推奨。

**サプライチェーン（低リスク）**
- **メンテナ**: `astro` の npm maintainers は `fredkschott`, `matthewp`（Astro
  コアの既知メンバー）。所有権変化なし。
- **lifecycle スクリプト**: lock 差分に新規 `postinstall` / `preinstall` /
  `prepare` の追加なし。docs-site は `passthroughImageService()` で `sharp` の
  native build も回避済み（`astro.config.mjs`）。
- **publish 時期**: 7.1.0 は 2026-07-16 公開（≈5 日前）。established maintainer
  かつ dev-only 依存（静的ドキュメントサイトのビルド）で公開面への露出は小さい。
- **advisory（重要な文脈）**:
  - 対象の **7.1.0 は open advisory 圏外**（`GHSA-8mv7-9c27-98vc` /
    `GHSA-f48w-9m4c-m7f5` は `< 7.0.6` で fix 済み、`GHSA-7pw4-f3q4-r2p2` は
    `< 7.0.4`、いずれも 7.1.0 は範囲外）。
  - 一方 **現行 6.4.7 は HIGH `GHSA-vj59-8hwv-xxmv`（`>= 6.4.7, < 6.4.8`、fix は
    6.4.8）に該当**。→ astro を上げる動機自体は正当かつ急ぎ。

**互換性（medium リスク・ブロッカー）**
- docs-site は **`@astrojs/starlight@^0.40.0`** を使う。starlight `0.40.0` の
  `peerDependencies.astro` は **`^6.4.5`** で、**astro 7 を許容しない**。astro 7 を
  正式サポートするのは **starlight `^0.41`**（latest `0.41.3` の peer は
  `astro ^7.0.2`）。
- #2103 の lockfile は `@astrojs/starlight@0.40.0(astro@7.1.0…)` として **peer を
  無視して force-resolve** している。starlight は astro の内部 API と
  `@astrojs/markdown-satteri` に密結合しており、この組合せで `astro build` が通る
  保証はない（astro 7 は Rust コンパイラで HTML パースが厳格化、既定 Markdown
  processor が satteri に変更、など破壊的変更多数）。
- **PR CI はこれを検出できない**。docs-site の `astro build` を実行するのは
  `pages.yml` だけで、これは **push to main（`paths: docs/**`, `packages/docs-site/**`）
  でしか走らない**。root の `build` script は core/i18n/lsp/app/cli のみを filter し
  **docs-site を含まない**。ci.yml も docs-site を build しない。→ #2103 の緑 CI は
  「docs-site が astro 7 でビルドできる」ことを **一切保証していない**。マージすると
  次に docs 系を main に push した時点で Pages デプロイが壊れうる。

→ **medium リスク。単独マージは保留。**

## 現時点の方針

1. **#2101 をマージ**（low / SHA 検証済み / CI 全通過）。
2. **#2102 を close**（#2103 の壊れた重複）。今後の再オファーは #2103 側で扱うため
   `@dependabot ignore` は不要（重複解消のみ）。
3. **#2103 は保留**。astro 7 を入れるなら **starlight を 0.41.x へ同時に上げる協調
   bump**が必要。選択肢:
   - **案A（推奨）**: `astro 7.1.x + @astrojs/starlight 0.41.3` を 1 つの PR で
     協調更新し、その PR で **docs-site の `astro build`（+ `check-links`）を必ず
     ローカル/CI で実行**して検証する。現行 6.4.7 の HIGH advisory も同時に解消。
   - **案B（暫定の安全策）**: まず `astro 6.4.8`（starlight 0.40 と互換のまま）へ
     patch bump して HIGH advisory だけ先に潰し、7.x 移行は案A で別途行う。
     Dependabot は 7.1.0 を提示しているため、6.4.8 は手動 or ignore 設定が必要。

   → 6.4.7 の HIGH advisory があるため、**案A を優先し、難しければ案B で時間を稼ぐ**。

## 派生した follow-up（このトリアージの副産物）

- **docs-site の `astro build` が PR CI で走らない**のは、今回のような
  「dev 依存の major bump を CI が緑にしてしまう」盲点そのもの。docs-site の build
  検証を PR CI（少なくとも `packages/docs-site/**` 変更時）に含めるか、TPL 化を
  検討する価値がある（別 Issue 候補）。

## 未解決の問い / 決めないこと

- 案A（starlight 0.41 協調 bump）を本トリアージの範囲で実施するか、別 Issue/PR に
  切り出すかは、ユーザーの採否判断に委ねる。
- docs-site build を PR CI に組み込む follow-up の起票要否も同上。
