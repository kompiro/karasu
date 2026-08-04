---
id: ADR-2259
title: repo-backed permalink の payload 上限 — degrade せず診断を返す
status: accepted
date: 2026-08-04
topic: navigation
authors: [kompiro]
refines: [ADR-1801, ADR-1828]
related_to:
  - ADR-2249
  - ADR-1827
  - ADR-1783
scope:
  packages: [app]
  concerns: [deployment]
assumptions:
  - "symbol: packages/app/src/utils/inline-share.ts :: fitsUnfurlPayload"
  - "symbol: packages/app/src/utils/inline-share.ts :: MAX_UNFURL_PAYLOAD"
  - "symbol: packages/app/src/render/repo-permalink.ts :: resolveRepoPermalink"
  - "file: packages/app/src/utils/unfurl-budget.test.ts"
  - "file: functions/r/[[path]].ts"
---

# ADR-2259: repo-backed permalink の payload 上限 — degrade せず診断を返す

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - 引き金 Issue: [#2259](https://github.com/kompiro/karasu/issues/2259)（親エピック [#1826](https://github.com/kompiro/karasu/issues/1826) permalink layer）
  - 実装 PR: [#2277](https://github.com/kompiro/karasu/pull/2277)（Design Doc PR: [#2270](https://github.com/kompiro/karasu/pull/2270)）
  - [ADR-1801](1801-karasu-nest-ogp-share-page.md)（`MAX_UNFURL_PAYLOAD` を定義。oversize で fragment-only に退避すると決めたのは**クライアント側**の話）
  - [ADR-1828](1828-repo-backed-ref-pinned-permalink.md)（repo-backed resolver — 上限を検査していなかった側）
  - [ADR-2249](2249-permalink-generation-seam.md)（permalink 面の規模の天井として `MAX_UNFURL_PAYLOAD` を名指しした。本 ADR はその天井を実際に強制する）
  - [ADR-1827](1827-permalink-deep-element.md)（deep anchor — 案2 の却下理由）
  - TPL: [TPL-2259](../test-perspectives/TPL-2259-shared-budget-enforced-at-every-producer.md)（本件から起票）、[TPL-1827](../test-perspectives/TPL-1827-deep-link-anchor-cross-surface-parity.md)、[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)、[TPL-2185](../test-perspectives/TPL-2185-drift-guard-distinguishes-declaration-from-mention.md)
  - 受け入れ条件: `docs/acceptance/2259-permalink-payload-cap.md`
  - 昇格元 design doc: `docs/design/permalink-payload-cap.md`（本 PR で削除。検討過程は [PR #2270](https://github.com/kompiro/karasu/pull/2270) の履歴で追える）
  - 後続: [#1961](https://github.com/kompiro/karasu/issues/1961)（bare route — 404 と 413 を status で区別して案内ページを描き分けられる）、[#1960](https://github.com/kompiro/karasu/issues/1960)（private repo）

## 背景

`MAX_UNFURL_PAYLOAD`（8000 文字）は、**server-visible な URL に payload を載せてよい上限**として ADR-1801 が置いた定数である。`/s?s=<payload>` はリクエストラインに payload を積み、`/s` はそれを `/render?s=<payload>&…` の画像 URL にもう一度書き出すため、URL 長の制限に直接当たる。Cloudflare Workers の URL 上限は 16 KB で、8000 はその半分を余裕として残した値である。

クライアント側の `buildShareUrls` はこの上限を守っていた。超えたら unfurl URL を `null` にして fragment-only リンクに退避する。

一方 `resolveRepoPermalink` は同じ検査を持たなかった。`encodeShare(payload)` を無条件に返し、`functions/r/[[path]].ts` がそれをそのまま `Location: ${origin}/s?s=${encodedPayload}` に積む。**同じ `/s?s=` URL を組み立てる 2 つの生成点のうち、片方だけが予算を守っている**状態だった。`/s` にも `/render` にも長さの再検証は無いので、resolver が最後の関門である。

壊れ方は「リンクを踏むと 414、あるいはクローラがタイムアウトする」であって、原因が URL の長さだと分かる形では現れない。

実測（resolver が実際に通る経路 — entry ごとに `synthesizeSharePayload` で import を inline してから `encodeShare`）では、単一 entry で上限に届く committed example は存在しない。最大は `examples/ja/getting-started` の 2,874 文字で上限の 36%。圧縮率はおよそ 0.52 なので上限は flattened `.krs` で 15 KB 程度に相当し、ADR-1783 が実測した reverse 出力（encoded 約 5k）は既に上限の 63% を使っている。**latent な穴であり live breakage ではないが、repo-backed permalink がまさに狙う規模帯である。**

## 決定

**上限判定を 1 か所に畳み、`resolveRepoPermalink` は上限超過時に degrade せず、原因と対処を名指しした 413 を返す。**

- **定数ではなく判定を共有する** — `fitsUnfurlPayload(encoded)` を `inline-share.ts` に置き、`buildShareUrls` と `resolveRepoPermalink` の両方がこれを通る。定数だけを export すると比較が生成点の数だけコピーされ、それが今回のずれを生んだ。
- **上限超過は 413 + 診断** — encoded サイズ・上限・対処（entry `.krs` を絞る / モデルを分割する）をメッセージに含める。`encodedPayload` は返さないので、呼び出し側が `/s?s=` URL を組み立てられない。
- **`functions/r/[[path]].ts` は変更しない** — 非 200 は既に `status` + `message` をそのまま転送する。#1961 の案内ページが入ったら 404（`.krs` が無い）と 413（大きすぎる）を status で区別して描き分けられる。
- **生成点の allowlist ドリフトガードを置く** — `packages/app/src/utils/unfurl-budget.test.ts` が `packages/app/src` と `functions/` を走査し、`/s?s=` を組み立てているファイルをレビュー済みの一覧（producer / reflector の別と根拠つき）と突き合わせる。

`/r/<owner>/<repo>[@<ref>]` の応答:

| 状態 | 応答 |
| --- | --- |
| committed `.krs` があり上限内 | 302 → `/s?s=…`（従来どおり） |
| committed `.krs` があるが上限超過 | **413**（encoded サイズ・上限・対処を名指し） |
| `.krs` が無い | 404（#1961 で案内ページになる — ADR-2249） |

## 理由

- **黙って失われるものを作らない。** 案2（fragment へ degrade）の deep anchor 消失はエラーとして観測されない類の破れで、TPL-2249 が「壊れたことはエラーとして観測されない」と書いた失敗モードと同型である。読者は指定した要素ではないものを見せられ、誰も例外を見ない。payload サイズという本来無関係な条件で anchor の解決可否が変わるのは、TPL-1827 が守ろうとしている面をまたぐ parity の破れでもある。
- **天井を動かす判断を、天井を守る修正と混ぜない。** 案3（body 経由 bounce）は魅力的で将来やる価値があるが、ADR-2249 は `MAX_UNFURL_PAYLOAD` を permalink 面の定義的性質として使い、そこから nest との役割分担を導いている。その天井を消すのは面の性質を変える判断であり、#2259 が引き受けるべき範囲ではない。#2259 が引き受けるのは「定数が防ぐために存在する事象を、定数を持っているコードが素通ししている」という 1 点である。
- **強制すべきは生成であって受信ではない。** 上限を超えた URL が `/s` に届いた時点でリクエストラインは既に長い。受け側の検査は防御ではなく事後報告になる。
- **行き止まりであることを明示すれば #1961 に接続する。** 案1 の代償である「大きい repo が開けない」は、それ自体を明示する応答にすることで、`.krs` が無いときと同じ思想（explain, don't dead-end）の案内ページへ素直につながる。天井に当たったことが観測できるようになれば、案3 を採るかどうかを実データで判断できる。

## 却下した案

- **現状維持（何もしない）** — latent なので放置する。変更ゼロだが、定数が防ぐために存在する事象を定数を持っているコードが素通しし続ける。「片方だけ守っている」状態は次の生成点（#1961 / #1960）にそのままコピーされる。越えたときの症状（414 / クローラのタイムアウト）が原因を指さない。
- **fragment リンクへ degrade する（`Location: /#s=<payload>`）** — モデルは開き、実装も最小。しかし **deep anchor が黙って消える**: Location が fragment を持つため RFC 9110 §10.2.2 の継承が働かず、`#krs-…` が捨てられる（継承は Location 自身が fragment を持たないときだけ起きる）。OGP unfurl も黙って消え、呼び出し側に unfurl 可能なリンクかどうかを知る手段が無い。さらに ADR-2249 が明記した天井を実質的に引き上げることになる（fragment 経由なら上限が無いため）。
- **body 経由の bounce ページ** — 上限超過時に 200 HTML を返し、payload を URL ではなく**レスポンス body** に載せて `/s` と同じ inline script でブラウザに bounce させる。URL 長の制限を完全に回避し、ページ上の JS が `location.hash` を読めるので **deep anchor も保たれる**。サイズ天井が事実上消えるので #1961 の bare route が大きい repo でも成立する。却下理由は前述のとおり「permalink 面の性質を変える判断であって bug fix ではない」こと。加えて OGP は依然出せず（`/render?s=` に載せられない）、変更量が最大で、payload を HTML に埋めるため TPL-168 の trust boundary が 1 本増える。#1817（大きな図は読めない）も未解決のまま残る。
- **`/s` / `/render` 側に長さ検査を足す** — 上限を超えた URL がそこに届いた時点で手遅れで、防ぐべきは生成であって受信ではない。

## 補足（実装時に判明）

- **HTTP status に厳密な対応物が無い。** 413 と 414 はどちらも「リクエスト側が大きい」ケースの規定で、ここでの原因（こちらが渡す先の URL が長い）とは一致しない。監視ログで読んだときに原因が伝わる 413 を採り、ずれの理由をコードコメントに残した。
- **ドリフトガードの comment 除去は行頭アンカーのままにする。** 行末 `//` コメントまで除去しようとすると `https://` の `//` で行が切られ、`` `https://host/s?s=${x}` `` 形の生成点が検出漏れになる。誤検出（自己申告的で直しやすい）より検出漏れ（ガードが黙って無力化）のほうが悪いので、保守的な側に倒した。
- **境界テストは閾値を決め打ちしない。** resolver が受理と拒否を切り替える要素数を二分探索し、その切り替えが `MAX_UNFURL_PAYLOAD` そのものに一致することを検査する。上限より手前で拒否するバグも検出できる。

## 未決（本 ADR の範囲外）

- **非 200 応答をキャッシュするか** — immutable な `@<sha>` に対する 413 は決定的なのに、現在は `no-store` で毎回 GitHub raw の fetch と flatten と圧縮を払い直す。404 / 502 も巻き込む変更になるので分けた。
- **body 経由 bounce を将来採るか** — 採るなら ADR-2249 の「天井」の記述を改訂する PR とセットにする。判断材料は 413 が実際に何回出るか。
- **上限に近づいたときの警告** — 上限の 80% を超えた permalink に何か知らせるか。観測手段が無い状態では決められない。
- **`MAX_UNFURL_PAYLOAD` の値そのもの** — ADR-1801 の決定であり、16 KB 上限に対する余裕の取り方は本 ADR の議題ではない。
