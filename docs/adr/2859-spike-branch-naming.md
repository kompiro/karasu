---
id: ADR-2859
title: spike ブランチは答える Issue 番号で名付け、その Issue が open なあいだ残す
status: accepted
date: 2026-09-20
topic: project
related_to: [ADR-2419]
assumptions:
  - "file: .github/workflows/spike-preview.yml"
  - "grep: docs/process.md :: ### spike の名前と寿命"
---

# ADR-2859: spike ブランチは答える Issue 番号で名付け、その Issue が open なあいだ残す

- **日付**: 2026-09-20
- **ステータス**: 決定済み
- **関連**:
  - Issue #2859
  - [ADR-2419](2419-poc-report-directory.md)（PoC のレポートは `reports/` に置く）
  - [TPL-2254](../test-perspectives/TPL-2254-durable-record-points-at-durable-address.md)（記録は記録より長生きするアドレスを指す）
  - `docs/process.md`「spike の名前と寿命」

## 背景

spike は「マージを前提としない PoC」として導入され、後始末はブランチ削除と決めてあった
（`.github/workflows/spike-preview.yml` の `delete` イベントが preview も畳む）。
`reports/` 配下の計測結果はマージされないので、**証拠はその spike ブランチにしか無い**。

この前提は、spike が答える問いが片付いたあとなら正しい。片付いていないときに壊れる。

実際に壊れた。ルーチンの `[gone]` ブランチ掃除で、未 push の spike が 3 本まとめて
消えた。うち 2 本は open な Issue が待っている証拠 — スクリーンショット、計測ハーネス、
`reports/` の成果物 — を抱えており、remote に控えが無かった。復元できたのは、削除時の
sha がたまたま作業ログに残っていたからにすぎない。

| ブランチ | Issue | 当時の状態 |
| --- | --- | --- |
| `spike/deploy-edge-hover` | #2632 | OPEN |
| `spike/width-budget-ladder` | #2761 | OPEN |
| `spike/routing-obstacle-index` | #2790 | CLOSED（完了） |

正当な削除は 3 本目だけだった。名前からはその区別がつかない。

## 決定

spike ブランチは `spike/<issue>-<何を測ったか>` と名付け、**その Issue が open な
あいだは push して残し、Issue が閉じたときに削除する**。

## 理由

- **判断基準が 1 つになる。** 「その spike が答える問いの Issue がまだ open か」だけで
  残す / 消すが決まり、掃除する側はブランチ名の先頭の番号を引くだけで判定できる。
  番号が無いと、コミットを読むまで開いた問いと片付いた問いを区別できない。
- **証拠がローカル 1 本だけの状態を作らない。** 未 push の spike は、誰の目にも
  「ローカルの scratch ブランチ」と区別がつかない。push してあれば、掃除で消しても
  remote に残る。
- **preview が open な Issue のあいだ触れるのは目的であって漏れではない。** 既存の
  注意書き「spike を残したまま放置すると preview も残る」は、放置を前提にしていた。
  Issue に紐づけば、preview の寿命は問いの寿命と一致する。
- **スラッグが「何を測ったか」を名乗ると、同じ Issue の 2 本目が自然に区別される。**
  2 本目を立てるのは別の問いを測るときだからである。同じ問いの再測定は、別ブランチを
  作らず同じブランチを使い回す方が正しい。

## 却下した案

- **日付を入れる（`spike/2632-20260919-deploy-edge-hover`）** — 時系列に並ぶ利点はあるが、
  日付は git が既に持っている情報で、名前に重複して持たせる理由が無い。Cloudflare の
  branch alias は slug 化と長さ切り詰めが入るため、名前が伸びるほど preview の
  ホスト名が読めなくなる。
- **通し番号を入れる（`spike/2632-1-...`）** — 番号を振る前に `git ls-remote` で既存を
  数える手順が必須になる。順序が分かる利点は、スラッグが問いを名乗っていれば要らない。
- **セッション名を入れる** — 並行作業の見分けには効くが、記録は記録より長生きする
  アドレスを指すべきで（TPL-2254）、セッションは数時間で消える。半年後にブランチを
  見た人にとって意味を持つのは Issue 番号と問いの名前だけである。並行セッションの
  見分けは、Issue の status ラベルと `git worktree list` が担う。
