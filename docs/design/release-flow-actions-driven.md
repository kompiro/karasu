# リリースを GitHub Actions 起動にする（dispatch → release PR → マージで publish）

- **日付**: 2026-06-19
- **ステータス**: 検討中
- **関連**:
  - 関連 ADR: [ADR-20260512-05](../adr/20260512-05-release-automation-changesets.md)（changesets 採用・publish-only）, [ADR-20260619-02](../adr/20260619-02-npm-trusted-publishing-oidc.md)（OIDC trusted publishing。本ドキュメントと同じ release.yml を扱う PR #1699 で導入中）
  - 関連 Issue: [#1370](https://github.com/kompiro/karasu/issues/1370)（Actions の PR 作成権限を OFF にした経緯）
  - コード: `.github/workflows/release.yml`, `package.json`（`version-packages` / `release` scripts）

## 背景・課題

現行のリリースは ADR-20260512-05 の **publish-only** 方式で、手順は「**メンテナがローカルで `pnpm changeset version` を実行** → `chore: release` PR を上げる → マージ → `main` push で `release.yml` が `changeset publish`」。

メンテナは **ローカルで `changeset version` を回したくない**。リリース作業は「**GitHub Actions をポチッと起動して始める**」フローにしたい。

加えて 2 つの状況が確定した:

1. **`release.yml` は OIDC trusted publishing 化済み**（PR #1699 / ADR-20260619-02）。publish 認証は token レス。
2. **default branch (`main`) が repository ruleset で保護された**（PR 必須・squash のみ・直 push 不可・force-push/削除禁止・必須チェック Check/Validate/Reference docs・bypass actors なし）。

この状況で「version bump をどう起こし、どこに着地させ、どう publish に繋ぐか」を決める。

## 現状（インベントリ）

| 観点 | 現状 |
| --- | --- |
| `release.yml` trigger | `push: branches:[main]` + `workflow_dispatch`。main push のたびにフルジョブ（全パッケージ build → `changeset publish`）が走り、リリース以外では no-op |
| publish 認証 | OIDC trusted publishing（#1699）。`NPM_TOKEN` 廃止。provenance 自動 |
| `package.json` scripts | `version-packages` = `changeset version && pnpm install --lockfile-only` / `release` = `pnpm build && changeset publish` |
| Actions の PR 作成 | **無効**（#1370。`can_approve_pull_request_reviews: false`）。既定 workflow token は read-only |
| main 保護 | ruleset "protect default branch"（active, bypass なし）。直 push 不可、PR + squash 必須 |
| 公開対象 | `karasu`（CLI）と `@karasu-tools/core`。`@karasu-tools/i18n` は private |

## 制約・前提

- **`main` への直接 push は不可**（ruleset, bypass actors なし）。workflow も例外ではない。
- **Actions は PR を作成できない**（#1370 の設定を OFF 維持したい）。
- **npm publish は不可逆**。誤リリースの巻き戻しは困難（unpublish 制限）。publish 前に「何が出るか（版番号・CHANGELOG）」を確認できる関門が望ましい。
- workflow がブランチを push するには `permissions: contents: write` が必要（既定は read-only）。**default branch 以外の作成・push は ruleset の対象外**なので可能。
- publish 認証（OIDC）は ADR-20260619-02 で決定済み。本ドキュメントは **trigger / version-bump の起こし方**に限定する（out of scope: 認証方式）。

## 検討した選択肢

### 案A: Prepare（dispatch）→ release ブランチ → PR → マージで publish（採用）

- `workflow_dispatch` の **"Release — Prepare"** workflow が `pnpm version-packages`（= `changeset version` + lockfile 更新）を実行し、`chore/release-<version>` ブランチを push する（`contents: write`）。
- メンテナがそのブランチから **PR を開き、版番号と CHANGELOG をレビューして squash マージ**。
- マージで `main` の `packages/**/CHANGELOG.md` が変わり、**publish workflow（`push: main` paths filter）が発火** → OIDC publish。

**メリット**

- ローカル `changeset version` が不要（要件を満たす）。
- 不可逆 publish の前に **レビュー関門**（版番号・CHANGELOG）が残る。
- **main 直 push 不可・Actions PR 作成 OFF の両制約に抵触しない**（push するのは default 以外のブランチ。PR 作成は人がワンクリック）。
- publish workflow は CHANGELOG 変更時のみ発火し、main push 毎のフルビルド浪費が消える。

**デメリット**

- メンテナ操作が 2 タッチ（① workflow 起動 ② PR を開いてマージ）。Actions が PR を自動で開けないため「Compare & pull request」を 1 クリック。

### 案B: 1 ボタンで version + publish

`workflow_dispatch` 一発で `changeset version` → `main` に直接 commit → `changeset publish`。

**デメリット（不採用理由）**

- **main 直 push が ruleset で不可能**（bypass なし）。技術的に成立しない。
- 仮に bypass を足しても、**publish 前のレビュー関門が消える**（溜まった changeset を無確認で publish）。不可逆操作に対して危うい。

### 案A': #1370 を ON にして `changesets/action`

Actions に PR 作成を許可し、標準の changesets ボットで "Version Packages" PR を自動生成 → マージで publish。

**デメリット（不採用理由）**

- 先に意図的に OFF にした #1370 の設定を ON に戻す必要がある（Actions に PR 作成・承認権限を与える攻撃面の拡大）。案A はこの設定を OFF のまま同等の体験を実現できる。

## 比較

| 観点 | 案A（Prepare→PR→publish） | 案B（1 ボタン） | 案A'（changesets/action） |
| --- | --- | --- | --- |
| ローカル changeset version 廃止 | ◎ | ◎ | ◎ |
| main 保護(ruleset)と両立 | ◎ | ✕ 直 push 不可 | ◎ |
| #1370 OFF 維持 | ◎ | ◎ | ✕ ON が必要 |
| publish 前レビュー関門 | ◎ | ✕ | ◎ |
| メンテナ操作数 | △ 2 タッチ | ◎ 1 タッチ | ○ 1.5（PR 自動・マージ手動） |

## Related TPLs

- [TPL-20260510-15](../test-perspectives/TPL-20260510-15-dev-vs-packaged-mode-parity.md): 配布物の dev/packaged parity。本件は CI のリリース配線が主題で直接の適用は薄いが、「CI でしか通らない経路（OIDC publish）はローカルで再現できない」という意味で隣接する。新規 proactive TPL を起こすほどの新原則は本ドキュメントには無いと判断（リリース配線は spec/concepts の規定ではないため）。

## 現時点の方針

**案A を採用する。** ローカル `changeset version` を廃して "Release — Prepare" の `workflow_dispatch` 起動に置き換えつつ、不可逆 publish の前に release PR のレビュー関門を残す。main 保護(ruleset)と #1370 OFF の両制約に抵触しないのは案A だけで、案B は ruleset により成立せず、案A' は OFF 維持の方針に反する。

### 実装の指針

1. **`.github/workflows/release.yml`（publish, 既存を改修）**
   - trigger を `push: branches:[main], paths: ["packages/**/CHANGELOG.md"]` + `workflow_dispatch`（再実行 fallback）に変更。`changeset version` は CHANGELOG.md を必ず書き換えるため release PR のマージ時のみ発火し、main push 毎の浪費を排除する。
   - publish 本体は #1699 の OIDC のまま（`npm i -g npm@latest` → `pnpm run release`）。
2. **`.github/workflows/release-prepare.yml`（新規, `workflow_dispatch`）**
   - `permissions: contents: write`。
   - checkout → pnpm/setup-node(22) → `pnpm install`（`@kompiro` GH Packages 取得のため `NODE_AUTH_TOKEN: GITHUB_TOKEN`）。
   - **ガード**: pending changeset が無ければ何もせず終了（`pnpm changeset status`、または `changeset version` 後に `git status --porcelain` が空なら push せず notice で終了）。
   - `pnpm version-packages` 実行 → `chore/release-<karasu version>` ブランチを作成・push。
   - 完了時に `::notice::` で「ブランチから PR を開いてマージすると publish される」旨を出す。
3. **`docs/process.md` 「リリースの流れ」更新**: 「ローカルで `changeset version`」を「"Release — Prepare" を `workflow_dispatch` で起動 → 生成された `chore/release-*` ブランチから PR を開きレビュー → squash マージ → publish 自動発火」に書き換える。
4. **AT**: `docs/acceptance/` に新規。TC は:
   - "Release — Prepare" 起動で pending changeset が消費され `chore/release-*` ブランチに版 bump + CHANGELOG が載る（人間確認 / dry-run）。
   - pending changeset が無いとき Prepare はブランチを作らず no-op で終わる。
   - release PR をマージすると CHANGELOG path filter で publish workflow が発火する（人間確認）。
5. **ADR 昇格**: 実装完了後、本フローを ADR 化する。trigger / prepare の決定は ADR-20260619-02（OIDC）と同じ `release.yml` を対象とするため、**ADR-20260619-02 に統合（追記）するか、`related_to` で新規 ADR を起こす**かは昇格時に判断。元 Design Doc は同 PR で削除する。

### 影響範囲・マイグレーション

- メンテナのリリース操作が「ローカル `changeset version`」→「Actions 起動 + PR マージ」に変わる。通常の feature 開発（`pnpm changeset` で changeset を足す）は不変。
- fork / 外部コントリビューターへの影響なし（Prepare は maintainer が起動）。
- 実装は PR #1699（OIDC）に畳み込む想定。#1699 マージ時に本 Design Doc を ADR に昇格して削除する。

## 未解決の問い / 決めないこと

- **必須レビュー承認数を 0 のままにするか**: 現 ruleset は `required_approving_review_count: 0`。ソロメンテナでは self-merge を可能にするため 0 が妥当だが、release PR だけでも目視確認を強制したいなら運用で「マージ前に必ず CHANGELOG を読む」をルール化する（承認強制は別アカウントが要るため見送り）。→ 現状維持（0）でよいか確認したい。
- **Prepare のブランチ命名**: `chore/release-<karasu version>` を基本とする。`karasu` と `@karasu-tools/core` の版が将来分岐した場合もブランチ名は karasu 版を代表とし、PR 本文で全 bump を示す（changeset 生成の CHANGELOG がそれを担う）。
- **Prepare 起動の同時実行**: `concurrency` で直列化し、未マージの release ブランチがある間の二重起動を避ける（実装時に `concurrency: release-prepare`）。
