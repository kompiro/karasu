---
id: ADR-3169
title: 受け入れテストの手動項目は、マージ前に確かめられるものに限る
status: accepted
date: 2026-10-13
topic: testing
related_to: [ADR-2260, ADR-2348]
assumptions:
  - "grep: .claude/rules/acceptance.md :: 手動項目は、マージ前に確かめられるものだけ"
  - "grep: .claude/rules/acceptance.md :: 手動項目には入力と期待結果を書き、URL は書かない"
  - "file: docs/test-perspectives/TPL-2254-durable-record-points-at-durable-address.md"
---

# ADR-3169: 受け入れテストの手動項目は、マージ前に確かめられるものに限る

- **日付**: 2026-10-13
- **ステータス**: 決定済み
- **関連**:
  - Issue #3169（起点。#3153 の AT の手動項目が本番を指していたことから）
  - [ADR-2260](2260-docs-site-pr-preview.md)（docs-site の PR preview。「マージ前の確認を PR 本文側の責務として書き直すかどうか」を未解決として残していた。本 ADR がそれに答える）、[ADR-2348](2348-at-records-point-at-issues.md)（AT は設計根拠として Issue を指す）
  - TPL: [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録は記録より長生きするアドレスを指す。本 ADR に合わせて結論を改めた）
  - ルール: `.claude/rules/acceptance.md`

## 背景

`.claude/rules/acceptance.md` は「手動項目の到達先は本番 URL」と定め、AT の手動項目に `https://karasu.kompiro.dev/` などの本番 URL を書かせていた。根拠は TPL-2254 で、手動項目は後から何度も再実行されるので、記録より寿命の短いアドレス（ブランチ名入りの preview URL、ローカルの dev サーバ）を書いてはいけない、というものである。寿命の長いアドレスとして本番 URL が選ばれた。

ところが本番で確かめる手順は、マージした後にしか実行できない。マージ後に見つかった不具合はマージを止められないので、そのような手動項目は受け入れテストとして機能しない。実際にはメンテナーは「本番」を「PR の preview」と読み替え、マージ前に preview で確かめていた。記録の文言と運用が食い違っていた。

PR テンプレートは、すでに Manual Verification Checklist（その PR の preview かローカルの checkout で確かめられる項目）と Post-merge follow-ups（マージ後にしか確かめられない項目）を、同じ基準で分けている。AT の手動項目だけがこの基準の外にあった。

## 決定

**AT の手動項目は、その PR の preview かローカルの checkout で、マージ前に確かめられるものだけにする。** AT には入力と期待結果を書き、URL は書かない。

1. **基準は 1 つ**: その項目をマージ前に確かめられるかどうか。PR テンプレートの Manual Verification Checklist と Post-merge follow-ups の基準と同じ。
2. **本番にしか現れないもの**（デプロイ設定、OAuth、カスタムドメインなど）は AT に書かない。PR の Post-merge follow-ups に置き、Issue に載せて消化する。
3. **AT に書くのは何を開いて何を見るか**（埋めた `.krs`、操作、期待する見え方）まで。preview URL・本番 URL・ローカル dev サーバの起動コマンドは書かない。preview の URL は PR 本文の Preview URL 欄が持つ。
4. **AT は手動項目の定義を持ち、チェックは PR で入れる。** AT の `- [ ]` は常に未チェックのまま置き、その領域を変える PR が確かめる項目の一覧として読む。確かめた PR は、項目を Manual Verification Checklist に写してチェックする。

## 理由

- **受け入れテストは、マージを止められて初めて機能する。** マージ後にしか実行できない検査は、不具合を見つけても既にマージされている。
- **TPL-2254 の懸念は URL を書かないことで満たせる。** 記録が腐るのは、書いたアドレスが記録より先に消えるからである。URL を書かず入力と期待結果だけを書けば、記録は腐らない。到達先が本番である必要はなかった。
- **運用に文言を合わせる。** メンテナーはすでに preview で確かめていた。文言を直すだけで、運用は変わらない。
- **基準を PR テンプレートと 1 本にする。** 手動確認の置き場が AT と PR で別の基準を持つと、どちらに書くかの判断が場面ごとに割れる。

## 却下した案

### 本番 URL を残し、「マージ前は preview で読み替える」と注記する

文言と運用の食い違いを注記で埋める形。読み替えを知らない読み手は本番で確かめ、マージ後の検査になる。注記が要る時点で、記録が意図を表していない。

### AT に preview URL を書く

PR がマージされると 404 になる。TPL-2254 が禁じたとおりで、変わらない。

### AT の手動項目をマージ前に確かめたらチェック済みにする

1 度確かめた事実しか示さず、後の変更で回帰しうる。チェック状態は確かめた PR の Manual Verification Checklist に残し、AT は定義に留める。

## 影響

- 既存の AT のうち約 90 件が手動項目の到達先に本番 URL を書いている。中身はマージ前に preview で確かめられる項目なので、到達先の文言だけを書き換える。別 PR で機械的に行い、本当に本番にしか現れない項目があれば移さずに挙げる（#3169）。
- `docs/process.md` の spike preview の節は、参照先の節名を改めた。
