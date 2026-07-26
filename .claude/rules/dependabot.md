---
paths:
  - ".github/dependabot.yml"
  - "docs/adr/*dependabot*.md"
  - "docs/adr/*update-dependencies*.md"
---

# Dependabot Operational Rules

Dependabot 設定・依存更新 ADR を編集するとき、または Dependabot PR を
レビュー・トリアージするときに従う運用ルール。

このファイルには 2 つの入口がある:

- **設定・ADR 編集時** — frontmatter の `paths:` にマッチして自動で読み込まれる
- **Dependabot PR のトリアージ時** — ファイル編集を伴わないため自動では読み込まれ
  ない。トリアージ（`/hane:dependabot` スキル実行を含む）を開始したら、最初に
  本ファイルを明示的に読むこと

正本は `docs/process.md`「Dependabot 運用ルール」セクションと
`ADR-128`（採用判断）、`ADR-784`（cooldown 7 日）、
`ADR-1038`（security update 重複 PR の処理）。本ファイルは要点の
ショートカットで、矛盾があれば process.md と ADR が優先する。

## スケジュールと cooldown

- npm / github-actions ともに weekly / Monday、cooldown は全 semver レベル
  **7 日**で統一（supply-chain 対策）。設定変更は ADR を伴う。

## Security update の即時起票

Dependabot security update は GHSA 検知時に即時起票され、
**`schedule` も `cooldown` も `updates:` の設定も参照しない**。

月曜以外に Dependabot PR が出ていたら、まず security update か weekly
バッチかを判別する。判別は以下で行う:

- `gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[]|select(.state=="open")'`
  で対応する alert があれば security update。
- PR タイトルが `bump <pkg> in / ...` と `bump <pkg> in /packages/<x>` の
  両方ある場合、ほぼ確実に security update（同一 advisory に対する
  manifest 別の重複起票）。

## 重複 PR の処理（pnpm workspace 制約）

同一 advisory に対して 2 本以上の Dependabot PR が起票された場合:

1. **`pnpm-lock.yaml` を含む root スコープ PR を merge する**
   （`bump <pkg> in /` のもの。`package.json` + `pnpm-lock.yaml` 両方更新、
   CI green が期待値）
2. **`packages/<name>/package.json` のみを書き換える PR は close する**
   （構造上 CI を通せない — workspace ルートの lockfile が更新されない
   ため `pnpm install --frozen-lockfile` が `ERR_PNPM_OUTDATED_LOCKFILE`
   で必ず落ちる。`@dependabot recreate` でも直らない）

`.github/dependabot.yml` の編集で抑制してはいけない。security update は
`updates:` を参照しないため設定で止められず、`directory: "/packages/..."`
を追加すると version update も同様に壊れる。

詳細経緯は `ADR-1038` 参照。再発時は ADR を増やさず本ルールで処理。

## override 付き直接依存の security update PR（別の失敗モード）

**root `pnpm.overrides` に載っているパッケージが、同時に
`packages/<name>/package.json` の直接依存でもある**場合、その security
update PR は上記とは別の理由で構造的に CI を通せない:

- Dependabot は宣言と `pnpm-lock.yaml`（`overrides:` スナップショットを含む）
  を修正版に更新する
- 一方で **root `package.json` の `pnpm.overrides` は書き換えない**
  （Dependabot は override 機構を認識しない）
- 結果、manifest の override だけが古いまま残り、
  `pnpm install --frozen-lockfile` が **`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`**
  で必ず落ちる（`ERR_PNPM_OUTDATED_LOCKFILE` ではない）

`@dependabot recreate` でも直らない。bot ブランチに人手で override 合わせの
コミットを足しても次の recreate で失われるため、**PR は close し、当該 bump は
人手の PR に畳み込む**（override とセットで 1 コミットにする）。

判別のポイント: エラーが `LOCKFILE_CONFIG_MISMATCH` なら override 起因、
`OUTDATED_LOCKFILE` なら lockfile 未更新起因。

詳細経緯は `ADR-2115` 参照（実例: PR #2114 の `dompurify`）。

## 依存更新バッチの ADR 化

月曜バッチで複数 PR が出て、特殊な判断（major / cooldown 違反観測 / bot
PR を close → 人間 PR で再提出 など）を行った場合は、その回の判断を
`<n>-update-dependencies-YYYYMMDD.md` として残す（`<n>` は triage Issue 番号、無ければその ADR を書いた PR 番号 — 定期 triage 記録は Issue を持たないことが多い）。

通常通りマージするだけのバッチは ADR 不要。判断ログが必要なケースだけ
書く（直近例: `ADR-909`）。
