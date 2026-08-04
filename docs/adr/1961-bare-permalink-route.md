---
id: ADR-1961
title: permalink を bare `/<owner>/<repo>` で配信し、`/r/` prefix を廃止する
status: accepted
date: 2026-08-04
topic: navigation
authors: [kompiro]
refines: [ADR-1828]
related_to:
  - ADR-2249
  - ADR-1801
  - ADR-1827
  - ADR-1990
scope:
  packages: [app]
  concerns: [deployment, performance]
assumptions:
  - "file: functions/[[path]].ts"
  - "file: functions/r/[[path]].ts"
  - "file: packages/app/public/_routes.json"
  - "symbol: packages/app/src/routes.ts :: RESERVED_TOP_SEGMENTS"
  - "symbol: packages/app/src/render/bare-route.ts :: matchBarePermalink"
  - "symbol: packages/app/src/render/bare-route.ts :: classifyResolveOutcome"
  - "symbol: packages/app/src/render/no-krs-page.ts :: buildNoKrsPage"
---

# ADR-1961: permalink を bare `/<owner>/<repo>` で配信し、`/r/` prefix を廃止する

- **日付**: 2026-08-04
- **ステータス**: 決定済み
- **関連**:
  - Issue [#1961](https://github.com/kompiro/karasu/issues/1961)（親 [#1828](https://github.com/kompiro/karasu/issues/1828) permalink layer / epic [#1826](https://github.com/kompiro/karasu/issues/1826)）／実装 PR [#2273](https://github.com/kompiro/karasu/pull/2273)
  - [ADR-1828](1828-repo-backed-ref-pinned-permalink.md)（repo-backed resolver。URL 形を `/r/…` と定め、bare 形を「#1961 で別途検討」として後続化していた。本 ADR がその論点を決着させる）
  - [ADR-2249](2249-permalink-generation-seam.md)（`.krs` が無い miss の振る舞い — 案内ページ。本 ADR はその permalink 面側の実装）
  - [ADR-1801](1801-karasu-nest-ogp-share-page.md)（unit-tested builder + 薄い Function アダプタという分割）、[ADR-1827](1827-permalink-deep-element.md)（deep anchor 文法）、[ADR-1990](1990-karasu-nest-pivot-server-reverse.md)（生成は karasu-nest の責務）
  - 昇格元 design doc: `docs/design/bare-permalink-route.md`（本 PR で削除。PoC の実測値と選択肢比較は [PR #2242](https://github.com/kompiro/karasu/pull/2242) の履歴で追える）
  - AT: [`docs/acceptance/1961-bare-permalink-route.md`](../acceptance/1961-bare-permalink-route.md)
  - TPL: [TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)（proactive — catch-all が既定を反転させる罠）、[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)、[TPL-168](../test-perspectives/TPL-168-trust-boundary-input-validation.md)
  - 後続: [#2259](https://github.com/kompiro/karasu/issues/2259)（`MAX_UNFURL_PAYLOAD` 未チェック — 本 ADR の範囲外、既存の gap）

## 背景

ADR-1828 が定めた repo-backed permalink の URL 形は `…/r/<owner>/<repo>[/<path>][@<ref>]` だった。`/r/` prefix は設計上望ましいものではなく、実装時（PR #1945）の判断である: Cloudflare Pages では root の catch-all Function が静的アセットより**先に**走るため、bare な 2 セグメント catch-all は `/s`・`/render`・SPA ルートを丸ごと shadow してしまう、と考えられた。ADR-1828 はこれを「#1961 で別途検討」と明示的に後続化していた。

#1961 が取りに行くのは URL の美観ではなく、**host 差し替えだけで GitHub URL が karasu URL になる**という到達性である。DeepWiki がこれを "URL trick" として前面に出している（`github.com` を `deepwiki.com` に置き換えるだけ）。覚えるのは「ホスト名を差し替える」ことだけで、アドレスバーで直接編集でき、口頭でもチャットでも導線が伝わる。`/r/` はこの変換を壊す — bare 形を作るには host 差し替えに加えて「`/r/` を挿す」という karasu 固有の知識が要る。

同時に、**ref 省略が第一級**であることも要件である。SHA を要求する形は「決定時点の構造を指す」ADR permalink には正しいが、人が手で打つ discovery の導線としては使えない。

## 決定

**permalink を bare `/<owner>/<repo>[/<path>][@<ref>]` で配信し、`/r/` prefix は 301 リダイレクトに縮退させて廃止する。** root catch-all Function は permalink 形でないものをすべて `context.next()` で静的アセット / SPA に差し戻し、`_routes.json` で Function に到達する経路を限定する。

- **ref 省略が既定**: `…/<owner>/<repo>` は default branch HEAD を解決する。`@<ref>` は任意の pin 手段。
- **`/r/` は廃止**: `functions/r/[[path]].ts` は resolver を持たず、`/r/<rest>` → `/<rest>` の 301 のみを返す。canonical からは外し、ドキュメントからも `/r/` 形を消す。
- **resolver の結果を 4 つに分岐する**（`classifyResolveOutcome`）:

| resolver の結果 | `@<ref>` なし | `@<ref>` あり |
| --- | --- | --- |
| 200 | 302 → `/s?s=…` | 同左 |
| 404（repo を見て `.krs` が無い） | **案内ページ**（ADR-2249） | エラー |
| 400（そもそも permalink 形でない） | **SPA へ差し戻す** | エラー |
| 502 / 500（upstream 障害） | エラー | エラー |

- **予約セグメントを単一の出所に置く**: `packages/app/src/routes.ts` が SPA ルート・兄弟 Function・静的ディレクトリの先頭セグメントを持ち、`useProjectNavigation` の `/projects/<id>` もそこから導出する。`_routes.json` の `exclude` との整合は `routes-config.test.ts` が検証する。

## 理由

- **catch-all は SPA を全滅させない（実測）**。ADR-1828 時点で未検証だった前提を PoC で確かめた: root catch-all の中で `context.next()` を返すと静的アセットがそのまま返り、存在しないパスは `_redirects` の SPA fallback に落ちる。GitHub への fetch を await した後でも機能する。兄弟 Function（`/s`・`/render`）も root catch-all に勝つ。
- **手書き `_routes.json` は honor され、コスト面で必須**。置かないと ~190 のアセット chunk すべてが Worker invocation を消費する。`include: ["/*"]` にしておけば新しい Function を足しても include 漏れが起きず、メンテ対象は `exclude` 側だけに閉じる。
- **400 と 404 を分けないと間違ったページが出る**。404 は「repo を探して `.krs` が無かった」で案内ページの前提だが、400 は「そもそも permalink として parse できなかった」（`/docs/getting-started/intro` は `.krs` で終わらない）。これを案内ページにすると、URL から repository を捏造して「この repo には構造モデルがありません」と言うことになる。この 2 つは PoC 中の実測で分離が必要と判明した。
- **transient な失敗を案内ページに飲ませない**。502 / 500 を「モデルが無い」と表示すると、障害が「何も起きない」という症状に化けて切り分けが遅れる。
- **`@<ref>` は必須要件ではなく意図のシグナル**。明示 pin がある訪問者は permalink を意図しているので診断を出し、無い訪問者は案内ページか SPA に着く。これで ref 省略を第一級に保ったまま、誤爆時の情報量を確保できる。
- **案内ページは repo の実在を主張しない**。GitHub raw は「repo が無い」と「`.krs` が無い」を同じ 404 で返し、区別には ADR-1828 が hot path から排除した API hop が要る。したがってページは karasu が実際に知っていること（ここにモデルが見つからない）だけを述べ、両方の読みを併記する。
- **`/r/` を残すこと自体がコストである**。正準形が 2 つあると「`/r/` は要るのか」を説明し続けることになり、「覚えることは 1 つ」という性質が薄まる。調査の結果、**repo 内に `/r/` permalink を貼っている ADR は 0 件**で、守るべき公開済みリンクは存在しなかった（ADR-1828 自身が「まだ誰も貼っていない規約」と書いていたとおり）。repo 外の stray link は観測できないので 301 を残すが、canonical からは外す。
- **予約リストは機械チェックが要る**。抜けても 404 にはならず、静かに GitHub 往復が増えるだけ（実測で 2 セグメントの未知パスは 110–430 ms、exclude 済みは 3–6 ms）。症状が遠く原因に辿り着きにくいので、記憶ではなく落ちるテストに置く（TPL-1961）。

## 却下した案

- **`@<ref>` を必須にする**: `@` が判別子になり SPA ルートと構造的に排他になるが、読者に commit SHA を調べさせることになり、手打ち・口頭伝達の discovery 導線として成立しない。要件不成立。
- **現状維持（`/r/` のみ）**: 追加コストはゼロだが、host 差し替えで届かないという要件不成立。「`/r/` で用は足りている」という評価は、目的を URL の美観と見た場合にのみ成り立つ。
- **素の shape guard（400 も案内ページにする）**: 未知の 2 セグメントパスが SPA fallback ではなく GitHub 404 になり、「未知パス = SPA」という既定が反転する。予約リストの完全性に正しさが依存し、漏れたときの症状が「新ルートだけ 404」という遠い場所での失敗になる。
- **bare を受けて `/r/…` へ 301**: 301 → 302 → `/s` の 3 hop になる。resolver の共有は本案でも実現できるので hop を払う理由がない。判別の問題も解決しない。
- **`/r/` を即削除する**: repo 外の stray link（チャット・記事・短縮 URL）は観測できない。301 は薄い Function 1 つで済み、canonical から外せば「`/r/` という形」はドキュメント上消えるので、廃止の目的は達成される。

## 実装状況

PR [#2273](https://github.com/kompiro/karasu/pull/2273) で実装済み。ルーティング判断は unit-test 済みの `packages/app/src/render/bare-route.ts` に集約し、Function は薄いアダプタに留めた（ADR-1801 の分割）。`wrangler pages dev`（実 workerd）と preview deployment の両方で 17 経路を実測し、変わってはいけない経路（静的・`/s`・`/render`・`/projects/<id>` のリロード・未知パス・不正 percent-encoding）が不変であることを確認している。

`_redirects` の SPA fallback は `wrangler pages dev` が "Infinite loop detected" として無視するため local と本番で経路が異なる。preview deployment で本番でも効くことを確認済み（AT-Q）。
