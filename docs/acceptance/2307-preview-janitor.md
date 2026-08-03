# AT: 孤児になった preview デプロイを一括削除する

- **日付**: 2026-08-03
- **関連 Issue**: [#2307](https://github.com/kompiro/karasu/issues/2307)
- **対象ファイル**:
  - `.github/workflows/preview-janitor.yml`（新規 — `workflow_dispatch` のみ）
  - `.github/actions/purge-preview-deployments/action.yml`（`mode: orphans` と `dry-run` を追加）
- **前提**: [#2294](https://github.com/kompiro/karasu/issues/2294) — これ以降の削除は各ブランチの cleanup が処理する。本 Issue が対象にするのは、それ以前に溜まった分。

## 受け入れ条件

- [ ] dry run（既定）が、削除対象を列挙するだけで何も消さない
  > 🧑 Manual — `gh workflow run preview-janitor.yml`（`dry_run` 既定 true）を実行し、ログに `Dry run — would delete N deployment(s)` と id 一覧が出ること、および実行後も既存の preview URL が生きていることを確認する。

- [ ] dry run の対象一覧に、**生きているブランチの preview が含まれない**
  > 🧑 Manual — dry run のログ冒頭に出る `Keeping deployments for N branch(es)` の N が `git ls-remote --heads origin | wc -l` と一致すること、および open PR のブランチ名の preview URL が一覧に含まれないことを確認する。実削除の前にここを見る。

- [ ] 本実行後、孤児 preview が 404 になる
  > 🧑 Manual — `gh workflow run preview-janitor.yml -f dry_run=false` の後、`https://fix-legend-human-annotation.karasu.pages.dev/` が **404 かつ `Deployment Not Found`** を返すことを確認する。ステータスだけでなく中身も見る（削除済みでもキャッシュが 200 を返すことがある — [TPL-2291](../test-perspectives/TPL-2291-mocked-transport-does-not-verify-the-remote-contract.md)）。

- [ ] 生きているブランチの preview は残る
  > 🧑 Manual — 本実行の時点で open だった PR の preview URL が、実行後も app を配信していることを確認する。

- [ ] 本番が無傷
  > 🧑 Manual — `https://karasu.kompiro.dev/` が実行後も app を配信していることを確認する（janitor は `env=preview` しか列挙しないので構造上対象外だが、破壊的操作なので毎回見る）。

## 補足

- keep-list が空なら **削除せず異常終了する**。`git ls-remote` の失敗を「ブランチが 1 本も無い」と読むと全 preview を消すため、この 1 点だけは緑で通してはならない。ワークフロー側とアクション側の両方で検査している。
- 定期実行（`schedule:`）は入れていない。破壊的な定期ジョブは cleanup PR の副産物ではなく、単独で判断すべきものとして見送った。各ブランチの cleanup が退行したときは、手で気付くのではなく `schedule:` を足す。
- モック API に対する検証内容: orphans モードが keep-list 内のブランチを消さないこと、keep-list が空なら exit 1、dry run が削除ゼロ、未知の mode を拒否すること。実 API での挙動はこの AT の手動項目でしか確かめられない。
