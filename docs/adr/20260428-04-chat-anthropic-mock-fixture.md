---
id: ADR-20260428-04
title: Chat UI E2E は Playwright route で Anthropic API を mock する
status: accepted
date: 2026-04-28
topic: testing
related_to: [ADR-20260427-04]
---

# ADR-20260428-04: Chat UI E2E は Playwright route で Anthropic API を mock する

- **日付**: 2026-04-28
- **ステータス**: 決定済み
- **関連**:
  - Issue: [#864](https://github.com/kompiro/karasu/issues/864)（fixture 整備）
  - 親 Issue: [#597](https://github.com/kompiro/karasu/issues/597)（残り E2E トラッカー）
  - 受け入れテスト: [AT-0050 Chat UI Phase 2 — BYOK + AI](../acceptance/0050-chat-ui-phase2-byok-ai.md)
  - 実装 PR: [#915](https://github.com/kompiro/karasu/pull/915)
  - Design Doc: [#911](https://github.com/kompiro/karasu/pull/911)（本 ADR の前段）
  - 関連 ADR: [ADR-20260427-04](20260427-04-skip-secret-gated-ci-on-bot-prs.md)（bot PR で secret を流せない制約）

## 背景

`packages/app` の Chat UI（`ChatPane` + `useChatSession`）はブラウザから
直接 Anthropic SDK (`@anthropic-ai/sdk`) を呼び出す BYOK 構成
（`dangerouslyAllowBrowser: true`）。AT-0050 はこのチャットフローの
15 個の AC をカバーするが、E2E で素直に走らせるには次の阻害要因がある:

- **本物の API キーが必要** — bot PR では secret を流せない（ADR-20260427-04）
- **応答が非決定的** — モデルが返す自然言語と tool-use 選択が揺れる
- **遅い・レート制限あり** — 1 spec で 10+ 回 round-trip すると現実的でない
- **エラー系（401 / 429 / 500）が再現困難** — AC-13/14/15 の検証が安定しない

`packages/e2e` には AT-0004 以降、`opfs` fixture でブラウザ側の永続層を
seed する流儀が確立しているので、Chat UI も同じ層で intercept する
fixture を整備して横並びにする。

## 決定

Anthropic API への HTTP 呼び出しを Playwright `page.route` で intercept
する fixture (`packages/e2e/fixtures/anthropic.ts`) を導入する。
プロダクションコードへ test seam を加えず、`@anthropic-ai/sdk` および
`useChatSession/errors.ts` のエラー分類経路をそのまま検証できる構成にした。

## 理由

- **アプリ側にテスト seam を入れずに済む** — `if (test) ...` 分岐が常駐
  しないので長期メンテが軽い
- **SDK のエラー型変換層を保ったまま検証できる** — 401 / 429 / 500 の
  `APIError` 分類経路が活きる（AC-13/14/15 を本物のコードパスで検証）
- **request body を fixture 側で記録できる** — 「正しいツール定義を
  送っているか」「`tool_result` の構造が正しいか」などを assert 可能
- **既存 `opfs` fixture と素直に compose できる** — `test.extend` の
  merge で project 状態と API キー状態を 1 つの import で扱える
- **SDK が固定 URL（`https://api.anthropic.com/v1/messages`）を叩く** —
  非ストリーミング・URL 安定 API なので route glob でブリットルさは低い

実装上は次の振る舞いも合わせて決めた（実装中に判明した制約を反映）:

- **`respondWithError` は sticky** — `@anthropic-ai/sdk` は 429 / 5xx を
  自動リトライするため、one-shot mock だとリトライ後に別エラーへ化ける。
  キューが置き換わるまで同じエラーを返す
- **空キューは `500 fixture_exhausted`** — script を忘れた状態で API を
  叩くテストを早期に fail させる（hang 回避）
- **`seedApiKey` が `karasu-locale=en` を pin** — 既定で英語ラベル前提の
  selector を安定させる（`pinLocale: null` で opt-out 可）

## 却下した案

### アプリ側に "fake transport" を注入する仕組みを追加

`useChatSession` を改修し、グローバルテストフックがあればそれを優先する
分岐を入れる案。

- プロダクションコードに test-only 分岐が常駐する
- SDK のエラー型変換層をバイパスするため、AC-13/14/15 の分類経路を
  検証できなくなる

### 録画して replay する（VCR 方式）

事前に本物の API を叩いて記録した JSON を replay する案。

- 初回録画にキーが必要・モデル更新で再録画が必要
- tool-use の入力（例: `navigate_view` の引数）を制御できないため、
  AT-0050 AC-7（特定の view path に飛ぶこと）を決定的に検証できない
