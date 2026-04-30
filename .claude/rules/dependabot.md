---
paths:
  - ".github/dependabot.yml"
  - "docs/adr/*dependabot*.md"
  - "docs/adr/*update-dependencies*.md"
---

# Dependabot Operational Rules

Dependabot 設定・依存更新 ADR を編集するとき、または Dependabot PR を
レビュー・トリアージするときに従う運用ルール。

正本は `docs/process.md`「Dependabot 運用ルール」セクションと
`ADR-20260329-01`（採用判断）、`ADR-20260422-01`（cooldown 7 日）、
`ADR-20260429-08`（security update 重複 PR の処理）。本ファイルは要点の
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

詳細経緯は `ADR-20260429-08` 参照。再発時は ADR を増やさず本ルールで処理。

## 依存更新バッチの ADR 化

月曜バッチで複数 PR が出て、特殊な判断（major / cooldown 違反観測 / bot
PR を close → 人間 PR で再提出 など）を行った場合は、その回の判断を
`ADR-YYYYMMDD-NN-update-dependencies-YYYYMMDD.md` として残す。

通常通りマージするだけのバッチは ADR 不要。判断ログが必要なケースだけ
書く（直近例: `ADR-20260428-02`）。
