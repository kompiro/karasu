# AT: spike ブランチを PR なしで preview にデプロイする

- **日付**: 2026-08-02
- **関連 Issue**: [#2276](https://github.com/kompiro/karasu/issues/2276)
- **対象ファイル**:
  - `.github/workflows/preview.yml`（`push: spike/**` / `delete` トリガー、Preview URL の Summary 出力）
  - `docs/process.md`（「spike を PR なしで preview で動かす」節）
  - `CLAUDE.md`（ブランチ命名規則に `spike/` を追加）

## 受け入れ条件

- [ ] `spike/` で始まるブランチを push すると、PR を作らずに Preview ワークフローが起動し、Cloudflare Pages にデプロイされる
  > 🧑 Manual — 任意の `spike/<name>` ブランチを push し、`gh run list --workflow=preview.yml --branch=spike/<name>` で run が作成され success で終わることを確認する。

- [ ] デプロイ後、その run の Summary に "Preview deployed" 表が出て、ブランチ alias URL が実際に開ける
  > 🧑 Manual — `gh run view <run-id>` の Summary（または Actions UI）に表示された Branch alias URL をブラウザで開き、spike の変更が反映された app が表示されることを確認する。ブランチ名から URL を推測せず、表示された URL を使う（Cloudflare が slug 化・切り詰めるため）。

- [ ] `spike/**` の push では `paths:` フィルタが掛からない — `packages/app` / `packages/core` を触らない commit だけの push でもデプロイされる
  > 🧑 Manual — spike ブランチで `docs/` のみを変更した commit を push し、Preview ワークフローが skip されずに走ることを確認する。

- [ ] spike ブランチを削除すると、その preview デプロイが消える
  > 🧑 Manual — `git push origin --delete spike/<name>` の後、`Delete Preview Deployments` ジョブが走ること、および直前に開けた Branch alias URL が 404 になることを確認する。

- [ ] 既存の PR preview の挙動が変わらない — PR を開くと従来どおり preview がデプロイされ、PR を閉じると掃除される
  > 🧑 Manual — `packages/app` を触る PR を 1 件開き、Preview がデプロイされて PR に Preview URL が付くこと、close 後に `Delete Preview Deployments` が走ることを確認する。

- [ ] `spike/**` 以外のブランチへの push では Preview ワークフローが起動しない
  > 🧑 Manual — `chore/` 等のブランチを push し、`gh run list --workflow=preview.yml --branch=<name>` に push 起因の run が現れないことを確認する（PR を開いた場合の run は対象外）。

## 補足

- `delete` イベントはブランチ名でフィルタできないため、cleanup ジョブは spike に限らず全てのブランチ削除で起動する。対象は `env=preview` かつブランチ名一致のデプロイのみで、production（main）のデプロイには触れない。該当なしの場合は何もせず exit 0 する。
- ここで得られる preview URL はブランチ削除で失効するため、AT やドキュメントの到達先としては書かない（`docs/process.md`「手動確認の到達先は本番 URL で書く」/ [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)）。
