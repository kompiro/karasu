# Chat UI E2E: Anthropic transport mock fixture

- **日付**: 2026-04-28
- **ステータス**: 検討中
- **関連**:
  - Issue: [#864](https://github.com/kompiro/karasu/issues/864)（本 design doc 対象）
  - 親 Issue: [#597](https://github.com/kompiro/karasu/issues/597)（残り E2E トラッカー）
  - 受け入れテスト: [AT-0050 Chat UI Phase 2 — BYOK + AI](../acceptance/0050-chat-ui-phase2-byok-ai.md)
  - 既存 fixture: [`packages/e2e/fixtures/opfs.ts`](../../packages/e2e/fixtures/opfs.ts)（参考: 同じ拡張パターンで構築する）

## 背景・課題

`packages/app` の Chat UI（`ChatPane` + `useChatSession`）は、ブラウザから
直接 Anthropic SDK (`@anthropic-ai/sdk`) を呼び出す BYOK 構成になっている
（`dangerouslyAllowBrowser: true`）。実体は `client.messages.create({...})`
が `POST https://api.anthropic.com/v1/messages` を打つ非ストリーミング呼び出し。

AT-0050（`docs/acceptance/0050-chat-ui-phase2-byok-ai.md`）はこの
チャットフローの 15 個の AC をカバーするが、E2E で素直に走らせるには
以下が阻害要因になる:

- **本物の API キーが必要** — CI に secret を流し込むのは Dependabot や
  bot PR では不可（[ADR-20260427-04](../adr/20260427-04-skip-secret-gated-ci-on-bot-prs.md) 参照）。
- **応答が非決定的** — 自然言語応答や tool-use 選択がモデル次第で揺れる。
- **遅い・レート制限あり** — 1 spec で 10+ 回 round-trip すると現実的でない。
- **エラー系（401 / 429 / 500）が再現困難** — AC-13/14/15 は失敗系の挙動を
  検証する。本物の API でこれらを安定して引き起こせない。

`packages/e2e` は AT-0004（OPFS 系）以降、`opfs` fixture でブラウザ側の
永続層を seed する流儀が確立した。Chat UI もこのパターンに揃えて、
**Anthropic SDK の HTTP 呼び出しを Playwright route で乗っ取り、
スクリプトで応答を返す fixture** を導入する。

## 調査サマリー（現状の実装）

| 観点 | 現状 |
| ---- | ---- |
| SDK 呼び出し箇所 | `packages/app/src/hooks/useChatSession.ts` のみ。`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` を都度生成して `client.messages.create({...})` を呼ぶ |
| ストリーミング | 未使用（`messages.create` の非ストリーミング応答のみ） |
| tool 定義 | `navigate_view` と `apply_krs_patch` の 2 つ。SDK の `stop_reason: "tool_use"` 経由でハンドルされる |
| エラー処理 | SDK が投げる `APIError` を `useChatSession/errors.ts` でステータス別に分類して i18n エラーメッセージに変換 |
| API キー保管 | `karasu.ai.anthropic.apiKey` を `sessionStorage` または `localStorage` に保管。`karasu.ai.settings.persist` (`"session"` \| `"local"`) で切替（`packages/app/src/utils/api-key-storage.ts`）|
| 既存 fixture | `packages/e2e/fixtures/opfs.ts` が `test.extend` で `opfs` fixture を提供。OPFS と `localStorage` を seed → `gotoApp()` でリロード、というパターン |

## 検討した代替案

### 案 A. Playwright `page.route` で `api.anthropic.com` を mock（採用）

SDK の HTTP リクエストを `page.route("https://api.anthropic.com/**", ...)`
で intercept し、テストでスクリプトしたレスポンス JSON を返す。

- **Pros**:
  - `packages/app` 側に **テスト seam を一切入れない**（プロダクションコードに `if (test) ...` が漏れない）
  - 本物の SDK が走るため、`APIError` ベースの 401 / 429 / 500 ハンドリング（AC-13/14/15）を **そのまま検証できる**
  - request body を fixture 側で記録できるので「正しいツール定義を送っているか」を assert できる
  - 既存 `opfs` fixture と素直に compose できる（`test.extend` の merge）
- **Cons**:
  - SDK が叩く URL 形（`/v1/messages`）に依存する。SDK 更新で URL が変わる可能性は理論上あるが、`@anthropic-ai/sdk` の安定 API なので低リスク
  - tool-use の多ターン会話を script として書く必要がある（自動推論はしない）→ AT のシナリオは決定的なので問題にならない

### 案 B. アプリ側に "fake transport" を注入する仕組みを追加

`useChatSession` を改修し、`window.__karasuChatTransport` のような
グローバルテストフックがあればそれを使うように分岐させる。

- **Pros**: tool-use シナリオを TS の関数として書けるので柔軟性は高い
- **Cons**:
  - **プロダクションコードに test-only 分岐が常駐する**（コードの臭い）
  - SDK のエラー型変換層を **バイパスしてしまう**ため、AC-13/14/15 で「SDK が `APIError` を生成 → アプリが正しく i18n に変換」という経路を検証できない（mock が直接 error オブジェクトを返してしまうと、アプリ側のエラー分類コードは通らない）
  - 案 A と比べて検証範囲が狭い

→ **却下**: テスト seam がプロダクションに残る点と、エラー系検証が甘くなる点で Cons が上回る。

### 案 C. 録画して replay する（VCR 方式）

事前に本物の API を叩いて記録した JSON を replay する。

- **Pros**: 自然な応答が得られる
- **Cons**:
  - 初回録画にキーが必要（個人キーをコミットの近くに置く運用になりがち）
  - モデル更新で再録画が必要 → メンテ負債
  - tool-use の入力（例: `navigate_view` の引数）を制御できないので、AT-0050 の AC-7（特定の view path に飛ぶこと）を決定的に検証できない

→ **却下**: AT の決定性要件と相性が悪い。

## 決定

**案 A** を採用する。Anthropic API への HTTP 呼び出しを Playwright の
route handler で intercept する fixture (`packages/e2e/fixtures/anthropic.ts`)
を新設する。

### Fixture API（提案）

```ts
// packages/e2e/fixtures/anthropic.ts
import { test as base } from "@playwright/test";
import { test as opfsTest } from "./opfs";

type ScriptedTurn =
  | { kind: "text"; text: string; stopReason?: "end_turn" }
  | {
      kind: "tool_use";
      tool: "navigate_view" | "apply_krs_patch";
      input: Record<string, unknown>;
      // 直前/同時の text content（chain-of-thought 風の発話を script したい場合）
      precedingText?: string;
    };

type ScriptedError = {
  status: 401 | 429 | 500;
  // SDK が `APIError` のサブクラスに分類できるよう、Anthropic 標準のエラー JSON を返す
};

export interface AnthropicFixture {
  /** 次に来る `messages.create` 呼び出しから順に返すレスポンスを set。 */
  scriptTurns(turns: ReadonlyArray<ScriptedTurn>): Promise<void>;

  /** 1 回だけ HTTP エラーを返す（次回以降は空 script に戻る）。 */
  respondWithError(error: ScriptedError): Promise<void>;

  /** これまでに intercept した request の body 配列。assert に使う。 */
  readonly requests: ReadonlyArray<{
    body: { model: string; messages: unknown[]; tools?: unknown[]; system?: unknown };
  }>;

  /** sessionStorage / localStorage に API キーを seed する。 */
  seedApiKey(apiKey: string, options?: { persist?: "session" | "local" }): Promise<void>;

  /** API キーを clear する（AC-4 / AC-5 用）。 */
  clearApiKey(): Promise<void>;
}

export const test = opfsTest.extend<{ anthropic: AnthropicFixture }>({
  anthropic: async ({ page }, use) => {
    /* page.route('https://api.anthropic.com/**', ...) を立てて、
       script キューから順に応答する。空キューなら 500 を返してテストを fail させる。 */
  },
});
```

- `scriptTurns` は **キュー** として動く。1 つの script で複数ターンを
  順番に返せるので、AC-9（patch 提案 → Apply → AI follow-up）のような
  2 往復以上のシナリオを 1 つの配列で書ける。
- `seedApiKey` は `karasu.ai.anthropic.apiKey` と `karasu.ai.settings.persist`
  を直接書く（AT-0050 AC-2/AC-3 の保管先検証は別途 `opfs` 側の helper を使わず
  fixture 内の page evaluate で行う）。
- `requests` を expose することで「Apply 後の follow-up で `tool_result` ブロックが
  正しく送られているか」のような assert が書ける。

### 既存 fixture との関係

`opfs.ts` を拡張して `anthropic` も提供する形にする。`opfs` は既に
`test.extend` で組まれており、Chat シナリオは OPFS 上に project を seed
してから API key を seed → 会話を script、という流れになるため
**両方を同時に必要とするテストが大半**。テスト側は import を 1 本にできる:

```ts
// packages/e2e/tests/at-0050-...spec.ts
import { test, expect } from "../fixtures/anthropic";

test("Chat round-trip with navigate_view", async ({ page, opfs, anthropic }) => {
  await opfs.seed({ projects: [...], lastProjectId: "demo" });
  await anthropic.seedApiKey("sk-ant-test-fake");
  await anthropic.scriptTurns([
    { kind: "tool_use", tool: "navigate_view", input: { viewPath: ["systems", "ec"] } },
    { kind: "text", text: "EC service の詳細を表示しました。" },
  ]);
  await opfs.gotoApp();
  // ... interact with ChatPane, assert scope label updates
});
```

### 決定的化の追加事項

- **Chromium 限定** — `opfs` fixture と同じ理由（OPFS をどうせ使う）。`playwright.config.ts` も既に chromium-only。
- **i18n pin** — `localStorage["karasu-locale"] = "en"` を `seedApiKey` または `seed` で同時に設定（既存 spec と同じ）。AC-4/13/14/15 の "Settings で設定する" 等のラベルが `en` で安定するように。
- **`apiKey: "sk-ant-test-fake"`** — 本物に見える形だが、route で intercept されるので外に出ない。test 内で固定値を使う。

## 受け入れテスト（本 PR 自体）

本 PR は test infrastructure のみなので AT は新設せず、smoke spec を 1 本入れて
fixture が動くことを示す:

- `packages/e2e/tests/anthropic-fixture.smoke.spec.ts`
  - シナリオ 1: テキスト 1 ターン round-trip → user message と AI response が DOM に出る
  - シナリオ 2: `navigate_view` tool-use 1 ターン → scope indicator (`📍`) が更新される
  - シナリオ 3: `respondWithError({status: 401})` → AC-13 のエラーバナーが出る（SDK の `APIError` 経路が生きていることの確認）

AT-0050 本体（15 AC）は別 Issue / 別 PR で本 fixture を消費して書く（本 design doc の scope 外）。

## 実装メモ

- Anthropic SDK は `User-Agent: @anthropic-ai/sdk-...` を付けてくるので、`page.route` で `request.url()` の host だけで判定すれば十分。
- レスポンス JSON のスキーマは `@anthropic-ai/sdk` の `Messages.Message` 型に従う。`id` / `model` / `role: "assistant"` / `stop_reason` / `content[]` / `usage` を埋める。
- `tool_use` ターンを返す場合は `content` に `{ type: "tool_use", id, name, input }` を含め、`stop_reason: "tool_use"` にする。
- エラー応答時は `Content-Type: application/json` で `{ type: "error", error: { type: "...", message: "..." } }` を返す。SDK 側の `APIError` 分類ロジックがこの形を期待する。

## Out of scope

- AT-0050 本体の spec body（別 Issue で消費する）
- Phase 3 chat 機能（`#597` の方針通り、人手検証）
- Streaming レスポンスへの対応（現状 `useChatSession` は非ストリーミングのみ）
