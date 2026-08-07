# AT: 孤児になった preview デプロイを一括削除する

- **日付**: 2026-08-03（2026-08-05 改訂）
- **関連 Issue**: [#2307](https://github.com/kompiro/karasu/issues/2307), [#2357](https://github.com/kompiro/karasu/issues/2357)
- **対象ファイル**:
  - `.github/workflows/preview-janitor.yml`（`workflow_dispatch` のみ）
  - `.github/actions/purge-preview-deployments/action.yml`（`mode: orphans` / `dry-run` / 走査内容のログ）
- **前提**: [#2294](https://github.com/kompiro/karasu/issues/2294) — 以降の削除は各ブランチの cleanup が処理する。

> **この記録の位置づけが変わった。** 起票時の目的は「溜まった孤児の一括削除」だったが、
> 実行できるようになった時点で対象は 0 件だった（[#2357](https://github.com/kompiro/karasu/issues/2357)）。
> Cloudflare が古い preview デプロイを自前で消していくため、放置された孤児は残らない。
> したがって janitor は定期的な必要物ではなく、**retention 期間内に cleanup が失敗した
> ブランチを拾う安全網**である。以下の条件もその前提で読む。

## 受け入れ条件

- [ ] dry run（既定）が、走査内容を報告したうえで何も消さない
  > 🧑 Manual — `gh workflow run preview-janitor.yml` を実行し、ログに `page N: M deployment(s), oldest ...` / `Examined N ... across M page(s)` / ブランチ別件数が出ること、および実行後も既存 preview URL が生きていることを確認する。

- [ ] 走査が途中で切れていない
  > 🧑 Manual — 最終ページの件数が 0 であることを確認する。0 に到達せず `::warning::Stopped after 50 pages` が出ている場合は、走査が打ち切られており結果を信用してはならない。

- [ ] keep-list が生きているブランチと一致する
  > 🧑 Manual — `Keeping deployments for N branch(es)` の N が `git ls-remote --heads origin | wc -l` と一致し、ブランチ別件数に出た名前がすべてその中にあることを確認する。

- [ ] 孤児があるときだけ削除対象になる
  > 🧑 Manual — 削除対象に挙がったブランチ名が `git ls-remote --heads origin` に**無い**ことを 1 件ずつ確認してから `-f dry_run=false` を実行する。対象 0 件のときは `Nothing to delete (mode=orphans).` で終わる。

- [ ] 本実行後、対象の URL が 404 になる
  > 🧑 Manual — 削除した alias が **404 かつ `Deployment Not Found`** を返すことを確認する。ステータスだけでなく中身も見る（[TPL-2291](../test-perspectives/TPL-2291-mocked-transport-does-not-verify-the-remote-contract.md)）。

- [ ] 生きているブランチの preview と本番が無傷
  > 🧑 Manual — open PR の preview URL と `https://karasu.kompiro.dev/` が実行後も app を配信していることを確認する。janitor は `env=preview` しか列挙しないので本番は構造上対象外だが、破壊的操作なので毎回見る。

## 補足

- keep-list が空なら **削除せず異常終了する**。`git ls-remote` の失敗を「ブランチが 1 本も無い」と読むと全 preview を消すため、この 1 点だけは緑で通してはならない。ワークフロー側とアクション側の両方で検査している。
- 定期実行（`schedule:`）は入れていない。破壊的な定期ジョブは cleanup PR の副産物ではなく単独で判断すべきものとして見送った。
- 2026-08-05 の実測: preview デプロイは 13 件、最古 `2026-07-13`、全件が現存ブランチのもの。2 ページ目が 0 件なのでページングは正常。同日、`fix-legend-human-annotation` 等の旧 alias は `404 / Deployment Not Found` になっており、存在しない alias（対照）も同じ応答だった。つまり旧 preview は本番へフォールバックしていたのではなく、実際に消えている。
- モック API での検証範囲: orphans モードが keep-list 内を消さない / keep-list が空なら exit 1 / dry run は削除ゼロ / 未知の mode を拒否。実 API の挙動はこの AT の手動項目でしか確かめられない。
