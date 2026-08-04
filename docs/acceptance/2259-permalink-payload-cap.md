# AT: repo-backed permalink の unfurl payload 上限を resolver で強制する

- **日付**: 2026-08-02
- **関連 Issue**: [#2259](https://github.com/kompiro/karasu/issues/2259)（permalink layer epic [#1826](https://github.com/kompiro/karasu/issues/1826)）
- **設計**: [`docs/design/permalink-payload-cap.md`](../design/permalink-payload-cap.md)（上限超過時は degrade せず診断を返す。実装完了後 ADR-2259 に昇格）
- **前提 ADR**: [ADR-1801](../adr/1801-karasu-nest-ogp-share-page.md)（`MAX_UNFURL_PAYLOAD` を定義）／ [ADR-1828](../adr/1828-repo-backed-ref-pinned-permalink.md)（resolver）／ [ADR-2249](../adr/2249-permalink-generation-seam.md)（上限を permalink 面の天井として参照）
- **関連 TPL**: [TPL-2259](../test-perspectives/TPL-2259-shared-budget-enforced-at-every-producer.md)（本 PR で起票。共有予算は生成点すべてで強制する）／ [TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)（fragment degrade を却下した根拠）／ [TPL-2185](../test-perspectives/TPL-2185-drift-guard-distinguishes-declaration-from-mention.md)（ドリフトガードは宣言と言及を区別する）
- **対象ファイル**:
  - `packages/app/src/utils/inline-share.ts`（`fitsUnfurlPayload` — 共有される判定）
  - `packages/app/src/render/repo-permalink.ts`（`resolveRepoPermalink` — 413 で拒否）
  - `packages/app/src/utils/unfurl-budget.test.ts`（生成点の allowlist ドリフトガード）

> `MAX_UNFURL_PAYLOAD`（8000）は server-visible な `/s?s=` URL に載せてよい encoded 文字数の上限。
> `buildShareUrls` だけがこれを守っており、`resolveRepoPermalink` は無条件に payload を返していたため、
> 大きい repo に対して上限超過の `Location: /s?s=…` を発行しうる状態だった。判定を `fitsUnfurlPayload`
> として共有し、resolver は超過時に **413 + 原因と対処を名指しした診断**を返す（fragment への degrade は
> deep anchor を黙って落とすため却下）。

## 受け入れ条件

### AC-1: resolver が上限を強制する

- [x] AT-A: 上限を超えるモデルを持つ repo permalink は 302 ではなく **413** を返し、`encodedPayload` を返さない。

  > ✅ Automated — `packages/app/src/render/repo-permalink.test.ts` › `resolveRepoPermalink — unfurl payload cap` › `refuses an over-cap model with a diagnostic naming the cause (413)`

- [x] AT-B: 413 のメッセージが **実際の encoded サイズ・上限値・対処**（narrower entry `.krs` / split the model）を名指しする。

  > ✅ Automated — 同上（`Model too large for a permalink: o/r@sha` / `encodes to <n> characters` / `8000` / `narrower entry .krs` を検査）

- [x] AT-C: 受理と拒否が切り替わる点が **`MAX_UNFURL_PAYLOAD` そのもの**に一致する（早めに拒否していない）。上限ちょうどまでは 200 で、ノード 1 つ分超えると 413。

  > ✅ Automated — `repo-permalink.test.ts` › `resolveRepoPermalink — unfurl payload cap` › `accepts right up to the cap and refuses one node past it`（生成点が切り替わる要素数を二分探索し、受理側の payload が上限以下・拒否側が上限超であることを検査）

### AC-2: 判定が 1 か所に畳まれている

- [x] AT-D: `fitsUnfurlPayload` が上限ちょうどを受理し、1 文字超で拒否する。

  > ✅ Automated — `packages/app/src/utils/inline-share.test.ts` › `fitsUnfurlPayload` › `accepts exactly the cap and refuses one character past it`

- [x] AT-E: Share ダイアログ側の degrade（上限超過で `unfurlUrl` が `null`、fragment リンクは維持）が変わっていない（回帰）。

  > ✅ Automated — `inline-share.test.ts` › `drops the unfurl URL (oversize) but keeps the fragment URL when the payload is too large`

- [x] AT-F: `/s?s=` を組み立てるファイルがレビュー済みの一覧と一致する。新しい生成点が判定を通さずに増えたら落ちる。

  > ✅ Automated — `packages/app/src/utils/unfurl-budget.test.ts` › `unfurl payload budget — /s?s= builders` › `only known builders construct a server-visible share URL`

### AC-3: 本番での挙動

- [ ] AT-G: 🧑 Manual — 上限を超える `.krs` を commit した public repo を用意し、`https://karasu.kompiro.dev/r/<owner>/<repo>` を開く。壊れたリンク（414 / タイムアウト）ではなく、**413 と原因を名指しした本文**が表示されること。

  > 手順: flattened で 16 KB 程度以上の `.krs`（encoded ≒ raw × 0.52 なので目安）を public repo の `index.krs` に置く。`examples/ja/getting-started` が encoded 2,874（上限の 36%）なので、その 3 倍程度の規模が必要。
  > 到達先は本番 URL で確認する（preview URL は PR マージ後に 404 になる — TPL-2254）。
