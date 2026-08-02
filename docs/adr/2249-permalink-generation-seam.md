---
id: ADR-2249
title: permalink 面と karasu-nest の境界 — 解決は本体、生成は nest、合流点は repo
status: accepted
date: 2026-08-02
topic: navigation
authors: [kompiro]
refines: [ADR-1990, ADR-1828]
related_to:
  - ADR-1783
  - ADR-1827
  - ADR-1829
  - ADR-1895
  - ADR-2077
  - ADR-9017
scope:
  packages: [app]
  concerns: [deployment, security]
assumptions:
  - "file: functions/r/[[path]].ts"
  - "file: packages/app/src/render/repo-permalink.ts"
  - "file: docs/guide/reverse-engineering-with-ai.md"
  - "symbol: packages/app/src/utils/inline-share.ts :: MAX_UNFURL_PAYLOAD"
  - "symbol: packages/app/src/render/repo-permalink.ts :: resolveRepoPermalink"
---

# ADR-2249: permalink 面と karasu-nest の境界 — 解決は本体、生成は nest、合流点は repo

- **日付**: 2026-08-02
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2249](https://github.com/kompiro/karasu/issues/2249)（親: [#1990](https://github.com/kompiro/karasu/issues/1990) nest ピボット epic）
  - [ADR-1990](1990-karasu-nest-pivot-server-reverse.md)（nest ピボット — GitHub App による server-side reverse。本 ADR はその decision 5 の適用範囲を具体化する）
  - [ADR-1828](1828-repo-backed-ref-pinned-permalink.md)（repo-backed permalink resolver。本 ADR はその「`.krs` が無いとき」の振る舞いを定める）
  - [ADR-1829](1829-adr-permalink-convention.md)（permalink は record ではなく pointer）、[ADR-1895](1895-reverse-architecture-harness.md) / [ADR-2077](2077-reverse-bc-granularity.md)（reverse harness と BC 粒度）、[ADR-9017](9017-cloudflare-deployment-and-byok-ai.md)（認証なし・BYOK）
  - 昇格元 design doc: `docs/design/permalink-generation-seam.md`（本 PR で削除。検討過程は [PR #2251](https://github.com/kompiro/karasu/pull/2251) の履歴で追える）
  - 後続: [#1961](https://github.com/kompiro/karasu/issues/1961)（bare route。本 ADR で unblock）、[#2262](https://github.com/kompiro/karasu/issues/2262)（nest 側の受付・通知）、[#2259](https://github.com/kompiro/karasu/issues/2259)（payload 上限の未チェック）
  - TPL: [TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)（解決に生成・パーソナライズを混ぜない）、[TPL-1961](../test-perspectives/TPL-1961-catch-all-route-inverts-default.md)、[TPL-1829](../test-perspectives/TPL-1829-adr-permalink-records-source.md)

## 背景

ADR-1828 の resolver は **repo に commit 済みの `.krs`** を要求する。ADR-1990 はまさにそれを、ピボットが壊しにいく 2 つの壁の 1 つとして名指した（「それを持つ repo は現実にはほぼ無い」）。そして ADR-1990 の子 Issue #2227 は scope に「repo URL → cached `.krs` if present, otherwise trigger the reverse pipeline」と書いた。

一方 #1961 は同じ `/<owner>/<repo>` を Pages app 側の route として実装しようとしており、その設計は `.krs` が無い miss を SPA に差し戻す前提だった。**2 つの面が同じ URL 名前空間を要求しているように見え、その境界を誰も持っていなかった。**

素朴に「miss したら生成する」と繋ぐと、3 つの緊張が permalink 面に流れ込む:

1. **課金先が居ない** — permalink を踏むのは認証も installation も持たない reader だが、ADR-1990 decision 3 の推論コストは installation 単位で計量される。App が入っていない repo の URL から生成を起動できるなら、そのコストの引き受け手が存在しない。quota の**水準**（#2226 / #1994）ではなく構造の問題である。
2. **determinism が壊れる** — 「利用者のリクエストを基に生成する」を permalink に載せると、同じ URL が読者ごとに違う内容を返す。ADR-1828 の immutability も ADR-1829 の pointer 論も、「URL → 内容」が関数であることに乗っている。
3. **12〜19 分は同期 HTTP に載らない** — ADR-1990 の gate spike 実測（85 ファイルの最小 repo）。302 の裏に隠せる時間ではなく、図を見に来ただけの reader に待たせる筋合いもない。

## 決定

**permalink 面と karasu-nest を役割で分け、実行時に結合させない。permalink 面は committed `.krs` の解決だけを行い、`.krs` が無い miss には案内ページを返して karasu-nest へ促す。2 つの面が合流するのは HTTP 境界ではなく repo である。**

- **#1961 / ADR-1828 の permalink 面は「repo に `.krs` が存在する前提のレンダリング機能」**である。resolution だけを行い、生成・受付・待ち・通知を一切持たない。
- **karasu-nest とは GitHub App そのもの**であり、読む・reverse する・生成するは全部そちらの責務である。
- 両者を service binding や zone route で繋がない（生成面の可用性が permalink の解決に影響しない）。
- **karasu-nest が生成した `.krs` を repo に PR し、merge されればそれは committed `.krs`** になる。permalink 面は何も変えずにそれを解決する。

`/<owner>/<repo>` の意味:

| 状態 | 応答 |
| --- | --- |
| committed `.krs` がある | 302 → `/s?s=…`（従来どおり） |
| `.krs` が無い | **200 案内ページ**（karasu-nest への導線 + ローカル reverse 手順） |
| 明示 `@<ref>` があって解決できない | エラー（permalink 意図が明示されているので診断を出す） |

## 理由

- **役割を言い切ると 3 つの緊張が permalink 面から消える。** 生成を起動しないので課金先問題が発生せず、resolution しかしないので determinism が保たれ、待たせる処理が無いので 12〜19 分が到達しない。緊張自体は消滅せず karasu-nest 側の設計課題として残るが、それは #2262 が引き取る。
- **合流点を repo に置くと HTTP 境界が要らない。** ADR-1990 decision 5（secret・state を Pages app に同居させない）に自明に適合し、permalink 面は state も secret も個人データも持たない。さらに ADR-1829 の record / pointer 分離（記録の正本は in-repo `.krs`、URL は pointer）と一致し、ADR-1990 decision 4 の human PR-back ラチェット（#2228）と同じ機構なので、**配達・通知・ラチェットが 1 つの仕組みで済む**。
- **軽さこそが permalink の価値だからである。** permalink（inline `#s=` / `/s?s=` / repo-backed）は認証・state・コストを何も持たずに成立し、だからこそ ADR に貼れる pointer として機能する。生成（コスト・state・認証・待ち時間）を載せた瞬間にその性質を失う。一方 karasu-nest がそれらを持つのは、扱える規模の壁を越えるための対価である。permalink 側の規模の天井は `MAX_UNFURL_PAYLOAD = 8000`（encoded 文字数、`packages/app/src/utils/inline-share.ts`）— 実測で flattened `.krs` およそ 15 KB 相当であり、ADR-1783 が実測した reverse 出力（encoded ~5k）は既にその 63% を使っている。**nest は permalink の代替ではなく、permalink に載る `.krs` を用意する上流**である。
- **#1961 が unblock される。** permalink 面が生成に関与しないので、karasu-nest の設計が固まるのを待つ必要がない。#1961 に残る変更は「deterministic-negative fallthrough の行き先を SPA ではなく案内ページにする」1 つだけで、nest にも #2227 にも依存しない。
- **今日から出せる。** karasu-nest はまだ無いが、案内ページの行き先として `docs/guide/reverse-engineering-with-ai.md`（ADR-1783 から引き継いだ BYO reverse 手順）が既にある。「自分の LLM で `.krs` を作る → repo に commit すればこの URL で開ける」と案内でき、新しいインフラは 1 つも要らない。karasu-nest ができたら同じページに導線を足す。
- **法務の負担が nest 側に閉じる。** permalink 面が個人データを持たないので、プライバシーポリシーの厚みは nest が何を預かるかにのみ従属する（#1996 で段階分けする）。ただし個人データがゼロでも**利用規約は要る** — 他者の repo から AI が導出した成果物を提供する以上、正確性の免責・取り下げ導線・派生物とライセンスの関係が personal data とは独立に発生する。

## 却下した案

- **Pages Function が service binding で nest Worker に委譲する** — 生成結果を同じ URL で返せるが、Pages app と nest のデプロイが結合して単独ロールバックがしにくくなり、permalink 面が生成面の可用性に依存する。そして permalink 面に「生成もしうる」責務が滲み、3 つの緊張が流れ込む。合流点を repo に置けば同じ結果が疎結合で得られる。
- **nest Worker が zone route で `/<owner>/<repo>` を先取りする** — 生成面が名前空間を完全に所有できるが、#1961 の実装が丸ごと無駄になり、`/s`・`/render`・SPA も Worker 経由になって今日動いている面のリスクが上がる。
- **miss を SPA へ差し戻す（#1961 の当初案）** — 実装ゼロだが、「この repo には `.krs` が無い」という有用な事実を握りつぶし、次の一手も示さない。ADR-1990 が壊しにいった壁の前で黙って引き返すことになる。
- **miss で即座に生成を起動する** — ゼロ設定に最も近いが、緊張 1・3 の両方を踏む。課金先の無い訪問者が 12 分の job を起動でき、abuse 面がそのまま開く。
- **permalink 面がリクエスト受付（カウンタ）を持つ** — 需要シグナルは取れるが、Pages app 側に KV を持つことになり ADR-1990 decision 5 への例外が要る。受付は nest の責務なので置き場所として筋が悪い（#2262 へ移した）。
- **リクエスト駆動の生成を permalink の応答に反映する** — 同じ URL が読者ごとに違う内容を返し、permalink が保証すべき唯一の性質を壊す。生成は resolution ではなく creation であり、採るなら別 URL を mint する（TPL-2249）。

## 未決（本 ADR の範囲外）

- **karasu-nest 側の受付・通知・リクエスト駆動**（#2262）— 特に「installation を持たない reader が生成を起動できるのか」は緊張 1 が残る場所で、答え次第でメールアドレス保管の要否も決まる。
- **案内ページの中身と i18n** — karasu-nest への導線と BYO 手順の並べ方。
- **生成物が PR として受け入れられなかったとき** の nest 側ホスト URL の形と、deep anchor 文法（ADR-1827）を共有するか。
- **karasu-nest のホスト名** — permalink 面と HTTP 結合しないので別 hostname でもサブパスでも成立する。
- **利用規約・プライバシーポリシーの文面**（#1996）— 本 ADR は「何を預かると何が発生するか」の段階分けまでを決める。法的助言ではなく、文面は専門家レビューを前提とする。
