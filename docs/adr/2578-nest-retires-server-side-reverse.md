---
id: ADR-2578
title: karasu-nest は server-side reverse をやめ、投稿を預かるギャラリーになる
status: accepted
date: 2026-08-22
topic: project
authors: [kompiro]
supersedes: [ADR-1990, ADR-1994]
related_to:
  - ADR-1783
  - ADR-1996
  - ADR-2249
  - ADR-2262
  - ADR-1994
  - ADR-1995
scope:
  packages: [nest]
  concerns: [deployment, security]
assumptions:
  - "grep: docs/design/nest-as-a-gallery.md :: 決めたこと"
  - "reverse/pipeline.ts（survey → decompose → synthesise → repair）が本 ADR の廃止対象だった。#2590 が削除したので現存しない — 不在が決定の実行を示す"
  - "file: packages/nest/wrangler.toml"
---

# ADR-2578: karasu-nest は server-side reverse をやめ、投稿を預かるギャラリーになる

- **日付**: 2026-08-22
- **ステータス**: 決定済み
- **関連**:
  - Issue [#2578](https://github.com/kompiro/karasu/issues/2578)（再評価）／設計 PR [#2584](https://github.com/kompiro/karasu/pull/2584)
  - [ADR-1990](1990-karasu-nest-pivot-server-reverse.md) — **本 ADR が supersede する**。ただし決定 5 は引き継ぐ（下記）
  - [ADR-1783](1783-karasu-nest-hosted-preview.md)（statelessness の根拠 — ギャラリーはこれを手放す）
  - [ADR-1994](1994-karasu-nest-free-tier-quota.md) — **本 ADR が supersede する**。推論費をサービスが負担しなくなり、枠を置く対象が消えた
  - [ADR-1996](1996-karasu-nest-data-trust.md)（未了 6 件のうち 2 件が不要になる。依存先を本 ADR に付け替えた）
  - [ADR-2249](2249-permalink-generation-seam.md)（2 つの面の合流点）、[ADR-2262](2262-nest-intake-and-completion.md)（起動権限と完了通知）
  - 構築の詳細は `docs/design/nest-as-a-gallery.md` に残す（部分昇格。全体の昇格は [#2592](https://github.com/kompiro/karasu/issues/2592)）

## 背景

ADR-1990 は server-side reverse を決め、「ゼロ設定（App を入れる → 図が出る）が最大の差別化」と位置づけた。ピボットから 3 週間で、その手段のコストが推定ではなく実測になった。

- **1 ラン $3.15**（[#2226](https://github.com/kompiro/karasu/issues/2226)、入力 465,627 / 出力 32,692 トークン）。失敗しても同額で、[ADR-1994](1994-karasu-nest-free-tier-quota.md) の枠を 1 消費する
- [ADR-1996](1996-karasu-nest-data-trust.md) の未了 6 件は**すべて法務**で、すべてブロッカー。ADR-1990 自身が「技術ではなくここが solo 運用の重り」と書いている
- 最初の 1 回が通るまでに 5 回以上の失敗を要し、[#2374](https://github.com/kompiro/karasu/issues/2374) / [#2379](https://github.com/kompiro/karasu/issues/2379) を起票した

そして再評価で分かったのは、**ADR-1990 が挙げたピボットの動機 2 つは、どちらも server-side 生成を必要としない**ことである。

| 動機 | server-side 生成での解 | 投稿での解 |
| --- | --- | --- |
| private repo が開けない（[#1960](https://github.com/kompiro/karasu/issues/1960)） | installation token で fetch する | **問題が発生しない** — サービスはソースを見ない |
| repo に `.krs` が commit されていない | サービスが生成する | 投稿を受け付ける（commit 不要） |

**server-side 生成は目的ではなく手段として選ばれていた。**

## 決定

**karasu-nest は reverse を行わない。ユーザーが自分の環境で reverse した `.krs` を投稿として預かり、保存・配信・共有するギャラリーになる。**

- **推論をサービスから外す。** `reverse/` `generate/` `quota/` `meter/` `deliver/` および `github/` の大半を削除する。残るのは保存と配信で、`packages/nest` の約半分になる
- **投稿は GitHub repository に紐づけない。** 任意の `.krs` を投稿でき、GitHub は**投稿者の認証にだけ**使う。push 権限の証明には使わない
- **投稿物は独立した id 空間に置く。** `owner/repo` は再利用しない
- **保証するのは parse と structure-only 検査だけ。** 分解の質は投稿者のものであり、サービスは請け合わない

## 理由

- **ブロッカーの性質が違う。** ゼロ設定は**未検証の差別化**（運用者以外の利用実績がまだ無い）で、法務 6 件は**運用者が自力で片付けられない既知の停止条件**である。未検証の利点と既知の停止条件を交換する判断になる。決め手は「いま出せるか」で、ギャラリーも需要は未検証だが**法務待ちが無い**
- **却下理由の前提が変わった。** ADR-1990 は BYO reverse を「導入時の摩擦がサービスの価値そのものを削る」として却下し、[#1960](https://github.com/kompiro/karasu/issues/1960) は「実質ローカルツールに収束する」と批判した。当時それは正しかったが、いまローカル reverse は `.claude/skills/reverse-architecture/SKILL.md` と `karasu` CLI で**コマンド 1 つ**である。却下理由が前提にしていた摩擦の大きさが変わった
- **解決が決定的なまま保たれる。** 投稿物を別名前空間に置くので、`owner/repo` は従来どおり commit された `.krs` だけを指す（app の permalink 面）。同じアドレスが 2 つのものを指さない（[TPL-2249](../test-perspectives/TPL-2249-resolution-stays-deterministic.md)）
- **維持面が縮む。** solo 運用で、推論パイプライン・Workflow・quota・計測を保守し続ける理由が、実測の後では弱い

## ADR-1990 から引き継ぐ決定

supersede するのは決定 1（server-side reverse）・2（LLM 送信前の redact）・3（service-paid + quota）・4（全ビュー + confidence マーク、domain 分析への投資）である。以下は撤回しない。

- **決定 5 — 別 Workers サービスとして作る。** state・secret・セッションを静的 Pages app に同居させない。ギャラリーはこれをむしろ強く必要とする（コンソールが nest 側にセッションを持つため）
- **決定 6 — データ信頼を成立条件として課す。** 対象が「他人の private コード」から「投稿物と投稿者の識別子」に変わるが、**成立条件であるという位置づけは変わらない**。内訳の変化は [ADR-1996](1996-karasu-nest-data-trust.md) への追記として [#2591](https://github.com/kompiro/karasu/issues/2591) で扱う

## 連鎖する ADR

- **[ADR-1994](1994-karasu-nest-free-tier-quota.md)（free-tier quota）も supersede する。** 月 3 回という水準は「サービスが推論費を負担し、複数の installation が使う」前提から導かれていた。推論が無くなれば枠を置く対象が無い。同時実行スロット（`MAX_CONCURRENT_RUNS`）も同じ前提の上にあり、投稿の受付にレート制限が要るかは別問題として、必要になった時点で決める
- **[ADR-1996](1996-karasu-nest-data-trust.md) は有効なまま、依存先を本 ADR に付け替えた。** 「データ信頼は成立条件である」という位置づけは決定 6 として引き継がれているので、依存の向き先が変わるだけで内容は生きている

## 帰結

### 判断が不要になった論点

前提が消えたので、次は答えを出す必要がなくなった。閉じるときは本 ADR を理由として参照する。

| Issue | 消えた前提 |
| --- | --- |
| [#2398](https://github.com/kompiro/karasu/issues/2398) モデル層を測定で決める | モデルを呼ばない |
| [#2400](https://github.com/kompiro/karasu/issues/2400) 配送先パスが resolver の候補に無い | PR で配送しない |
| [#2403](https://github.com/kompiro/karasu/issues/2403) リクエスト時に配送を選ぶ | 同上 |
| [#2382](https://github.com/kompiro/karasu/issues/2382) quota の適用条件 | サービスが推論費を払わない |
| [#2228](https://github.com/kompiro/karasu/issues/2228) PR 還元ラチェットの検証 | 還元する PR が無い（投稿者が自分で直して投稿し直す） |

### 効かなくなる観点

- [TPL-1995](../test-perspectives/TPL-1995-generated-content-is-marked-at-its-seams.md) — `@draft` の**供給源**が消える。投稿物は誰が何で作ったか分からない。記法（[ADR-1995](1995-draft-confidence-annotation.md)）は `.krs` の語彙として残るので、ADR 自体は有効なまま
- [TPL-2288](../test-perspectives/TPL-2288-background-work-platform-ceiling.md) — 分単位の背景処理が無くなるので、この面では適用対象が消える
- [ADR-2249](2249-permalink-generation-seam.md) の合流点 — 2 つの面は repo で合流していたが、ギャラリーは**第 3 の面**として独立する。ADR-2249 自体（permalink 面は commit された `.krs` だけを解決する）は有効

### 新しく背負うもの

[ADR-1783](1783-karasu-nest-hosted-preview.md) は inline share をステートレスにした理由を「**DB・保存型 paste・モデレーション面を持たず**、運用負荷ゼロ」と書いた。ギャラリーはこの 3 つを持つ。**法務の重りは消えるのではなく形が変わる** — data processor の義務から、公開プラットフォームの義務へ。

## 却下した案

- **現状維持（server-side 生成）** — ゼロ設定を守れるが、法務 6 件が片付くまで運用者自身の repo に限定されたままで、1 ラン $3.15 を負担し続ける。片付ける手段が運用者の側に無い
- **公開 repo への読み取りサービス化**（[#2378](https://github.com/kompiro/karasu/pull/2378)、close 済み） — 生成を維持したまま公開範囲を広げる案。法務は軽くなるが消えず（public でも ToS と privacy policy は要る）、推論費はリクエスト増でむしろ伸びる
- **段階案（ギャラリーを土台に生成を後付け）** — 移行は滑らかだが**両方の重りを背負う**。ADR-1996 の 6 件は 1 件も減らず、モデレーション面が加わる。「ゼロ設定が売り」と「投稿してもらう」が同居し、サービスの説明が 2 つになる
- **匿名投稿を許す** — 摩擦は最小だが、取り下げ請求に応じる相手も荒らしを止める手段も存在しない。GitHub ログインが与えるのは権限の証明ではなく**責任の所在**（凍結できるハンドル）である
