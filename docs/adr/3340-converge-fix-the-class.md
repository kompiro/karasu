---
id: ADR-3340
title: converge のラウンドでは指摘を種類として直し、push の前にそのラウンドの修正分だけへ CLI を 1 回当てる
status: accepted
date: 2026-10-25
topic: build
authors: [kompiro]
refines:
  - ADR-3326
related_to:
  - ADR-2716
  - ADR-3342
scope:
  packages: []
  concerns:
    - ci
assumptions:
  - "grep: .claude/skills/coderabbit-converge/SKILL.md :: このラウンドの修正分だけへ CodeRabbit CLI を 1 回当てる"
  - "grep: .claude/skills/coderabbit-converge/SKILL.md :: 指摘を\\*\\*種類\\*\\*として 1 文で言い表す"
---

# ADR-3340: converge のラウンドでは指摘を種類として直し、push の前にそのラウンドの修正分だけへ CLI を 1 回当てる

- **日付**: 2026-10-25
- **ステータス**: 決定済み
- **関連**:
  - Issue [#3340](https://github.com/kompiro/karasu/issues/3340)
  - [ADR-3326](3326-coderabbit-cli-once-before-ready.md): ready の前に CLI を 1 回だけ当て、ラウンド中は回さないと決めた。本 ADR はラウンド中の扱いを補う
  - [ADR-2716](2716-coderabbit-request-changes-workflow.md): CodeRabbit の approve までラウンドを回す運用
  - [ADR-3342](3342-ready-gate-local-review.md): ready の前のローカルレビューを機械的な前提条件にした
  - `.claude/skills/coderabbit-converge/SKILL.md`, `docs/process.md`

## 背景

#3336 は CodeRabbit のレビューを 6 回使った。最小なら 2 回で済んだはずで、余分な回のうち 3 回は、
1 つの種類の問題（テストの一時 repo が呼び出し側の git 環境を受け継ぐ）を 1 か所ずつ直したものだった。
ローカルのレビューで `commit.gpgsign` を直し、PR のレビューで `core.hooksPath`、次に `GIT_DIR` を
指摘された。push のたびに、他の repo とも共有する review 枠を 1 回使い（当時は 1 時間に 2 回）、
4 回続けて push すると CodeRabbit が自動レビューを止めた（Reviews paused）。

「push の前に同じ種類まで掃く」は、エージェント用のメモにしか無く、守られなかった。ラウンドを回す
手順を持つのは `/coderabbit-converge` なので、そこに書く。

#3343 でも同じ形が繰り返された。コマンド文字列を解析する方式では、CodeRabbit が毎ラウンド別の角度から
解析の穴を見つけた。種類ごと塞ぐには、方式そのもの（実行時の引数を見る）を替える必要があった。

## 決定

**converge のラウンドでは、指摘を種類として言い表して PR の差分全体で直し、push の前にそのラウンドの
修正分だけへ CodeRabbit CLI を 1 回当て、同じ種類の指摘がその種類を直した後にまた出たらラウンドを止める。**

## 手順への反映

- 直す: 種類を 1 文で言い表し、差分の中で同じ種類の箇所をすべて直す。返信には種類と直した範囲を書く
- push の前: `coderabbit review --agent --deep --base-commit <このラウンドの修正を始める前の HEAD> --committed`
  を 1 回。出た指摘は同じ判定で直し、CLI は回し直さない。CLI が使えないときは飛ばす
- 打ち切り: 同じ種類の指摘が、その種類を直した後にまた出たら止める。通知には、その種類を構造ごと無くす
  別の方式があれば提案を添える

## 理由

- **ラウンドの数は、直し漏れた同じ種類の数だけ増える。** 1 か所ずつ直すと、CodeRabbit は次のラウンドで
  同じ種類の別の箇所を指摘する。種類として直せば、そのラウンドで終わる
- **修正分だけへの CLI は、PR のラウンドより安い。** CLI の枠は PR の review 枠とは別（1 時間に 10 回）で、
  待ちは数分で済む。PR のラウンドは枠を 1 回使い、rate limit に当たると 40 分前後待つ（#3334・#3336・#3343）
- **ADR-3326 が避けた待ちは生まない。** ADR-3326 が却下したのは、同じ差分へ指摘 0 件になるまで CLI を
  回し続けることだった。ここで当てるのはラウンドの修正分へ 1 回だけで、回し直さない
- **種類が戻ってくるのは、直し方が噛み合っていない合図。** 続けても、同じ種類の別の穴を見つけ続けられる

## 却下した案

- **ラウンド中は CLI を回さない（ADR-3326 のまま）**: #3336 では、修正のたびに PR のラウンドで
  次の 1 か所を見つけてもらう形になった
- **ラウンドの修正分へ、指摘 0 件まで CLI を回す**: ADR-3326 と同じ理由で、ready の前に移したのと
  同じ待ちを、ラウンドの中に作る
- **種類として直すことをメモに残す**: 既にメモにあったが、守られなかった
