# AT: spike ブランチを PR なしで preview にデプロイする

- **日付**: 2026-08-02
- **関連 Issue**: [#2276](https://github.com/kompiro/karasu/issues/2276)
- **対象ファイル**:
  - `.github/actions/purge-preview-deployments/action.yml`（cleanup 実体 — `preview.yml` と共有）
  - `.github/workflows/spike-preview.yml`（新規 — `push: spike/**` / `delete` トリガー、Preview URL の Summary 出力、ページング付きクリーンアップ）
  - `docs/process.md`（「spike を PR なしで preview で動かす」節）
  - `CLAUDE.md`（ブランチ命名規則に `spike/` を追加）
- **非対象**: `.github/workflows/preview.yml`（PR preview は無変更）

## 受け入れ条件

- [ ] `spike/` で始まるブランチを push すると、PR を作らずに Spike Preview ワークフローが起動し、Cloudflare Pages にデプロイされる
  > 🧑 Manual — `origin/main` から `spike/<name>` を切って push し、`gh run list --workflow=spike-preview.yml --branch=spike/<name>` で run が作成され success で終わることを確認する。

- [ ] デプロイ後、その run の Summary に "Spike preview deployed" 表が出て、ブランチ alias URL が実際に開ける
  > 🧑 Manual — `gh run view <run-id>`（または Actions UI）に表示された Branch alias URL をブラウザで開き、spike の変更が反映された app が表示されることを確認する。ブランチ名から URL を推測せず、表示された URL を使う（Cloudflare が slug 化・切り詰めるため）。

- [ ] `spike/**` の push では `paths:` フィルタが掛からない — `packages/app` / `packages/core` を触らない commit だけの push でもデプロイされる
  > 🧑 Manual — spike ブランチで `docs/` のみを変更した commit を push し、Spike Preview ワークフローが skip されずに走ることを確認する。

- [ ] spike ブランチを削除すると、その preview デプロイが消える
  > 🧑 Manual — `git push origin --delete spike/<name>` の後、`Delete Spike Preview Deployments` ジョブが **success** で終わること、および直前に開けた Branch alias URL が 404 になることを確認する。ジョブが緑であることだけでなく URL が実際に落ちることまで見る（#2291 はジョブ失敗で気付けたが、API が 200 を返しつつ対象を取りこぼす失敗はジョブの色に出ない）。

- [ ] PR preview の挙動が変わらない — PR を開くと従来どおり preview がデプロイされ、PR を閉じると掃除される
  > 🧑 Manual — `packages/app` を触る PR を 1 件開き、Preview がデプロイされて PR に Preview URL が付くこと、close 後に `Delete Preview Deployments` が走ることを確認する。`preview.yml` は本 PR で変更していないので、差分としては no-op であることの確認。

- [ ] `spike/**` 以外のブランチを削除しても Spike Preview のクリーンアップは動かない
  > 🧑 Manual — PR をマージしてブランチが自動削除された後、`Spike Preview` の run で `Delete Spike Preview Deployments` が skipped になっていることを確認する（PR preview の掃除は `preview.yml` 側が担当し、二重に走らせない）。

## 補足

- クリーンアップは Cloudflare の deployments API を `page` のみ変えて最大 50 ページ辿り、空ページで停止する。spike ブランチは push ごとに deployment が 1 件積まれるため、1 ページ目だけを見ると古い deployment が消え残る。
- **削除は `force=true` を付ける。** ブランチ alias が指すデプロイ（= URL で到達できる唯一のもの）は、これがないと Cloudflare に拒否される。しかも初版は削除の応答を `-o /dev/null` で捨てていたため、拒否されてもジョブは緑で「Deleting deployment X」と出ていた（[#2294](https://github.com/kompiro/karasu/issues/2294)）。削除の応答も HTTP status と `.success` で検査する。
- **`per_page` は送らない。** 初版は `per_page=100` を送って実 API に 400 で弾かれ、cleanup が丸ごと失敗した（[#2291](https://github.com/kompiro/karasu/issues/2291)）。モック API に対するテストは緑だった — モックはクエリを見ずに応答していたため。観点は [TPL-2291](../test-perspectives/TPL-2291-mocked-transport-does-not-verify-the-remote-contract.md)。
- 非 200 のときはレスポンスボディをログに出してから失敗する。初版は `body=$(curl --fail-with-body ...)` でボディをコマンド置換に飲まれ、ログに `curl: (22)` しか残らなかった。
- `delete` イベントはブランチ名で `on:` フィルタできないため、ジョブ側で `startsWith(github.event.ref, 'spike/')` を条件にしている。対象は `env=preview` かつブランチ名一致のデプロイのみで、production（main）のデプロイには触れない。
- `push` イベントのワークフロー定義は push されたブランチ自身のものが使われるため、`spike-preview.yml` が main に入る前に切られたブランチでは発火しない。既存 spike ブランチの救済は行わない方針（`origin/main` から切り直す）。
- ここで得られる preview URL はブランチ削除で失効するため、AT やドキュメントの到達先としては書かない（`.claude/rules/acceptance.md`「手動項目の到達先は本番 URL」/ [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)）。
