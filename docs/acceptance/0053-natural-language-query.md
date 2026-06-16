# AT-364 — Natural Language Query over Architecture Model (Impact Analysis)

- **Date**: 2026-04-10
- **Issue**: [#364](https://github.com/kompiro/karasu/issues/364)
- **Prerequisite**: Chat UI (Phase 1 #418, Phase 2 #419) is available; a Claude API key is set in Settings

---

## Setup

Use `examples/ja/ec-platform/01-system.krs` (or any `.krs` file with multiple services and edges) as the test model.
Set a valid Claude API key in the Settings tab before running these tests.

---

## Test Cases

> 🟡 Partially automated — `packages/cli/src/translate/translate.e2e.test.ts` covers the underlying translate→query pipeline used by natural-language queries. Chat-UI integration (this AT's primary scope) stays manual; per-TC `[x]` flips deferred to phase B (#920).

### TC-1: Impact analysis — which services are affected by a change

**Steps**:

1. Open the Chat tab
2. Send: "Payment ドメインを変更したとき影響するサービスは？"

**Expected**:

- AI responds with a list of services that depend on `Payment` (derived from edges in the model)
- Each item includes the service id/label and the edge kind (sync/async)
- Response does not ask to edit the .krs file (read-only query)

> manual / visual review — Claude API への自然言語クエリ応答の妥当性は LLM 出力に依存し、Chat UI 上で目視確認する必要がある。

---

### TC-2: Usecase enumeration

**Steps**:

1. Open the Chat tab
2. Send: "OrderTable を操作するユースケースをすべて教えて"

**Expected**:

- AI returns all usecases under the service/domain that references `OrderTable`
- Results include node ids and labels

> manual / visual review — usecase 列挙の網羅性とラベル妥当性は LLM 応答内容を読んで判定する。

---

### TC-3: External dependency analysis

**Steps**:

1. Open the Chat tab
2. Send: "外部サービスへの依存が多いのはどれ？"

**Expected**:

- AI ranks services by the number of `[external]` edges
- Top entry is correctly identified

> manual / visual review — `[external]` エッジ数のランキングと top entry の正しさは LLM 応答を目視確認する。

---

### TC-4: Organisational query — teams depending on a service

**Steps**:

1. Declare teams that `owns` the services, with contact `link`s, in the test model:
   ```krs
   organization Corp {
     team ec {
       label "ECチーム"
       owns ECommerce
       link "https://slack.com/archives/C123" "ECチーム Slack"
     }
     team fintech {
       label "Fintechチーム"
       owns Payment
       link "https://notion.so/fintech"       "チームページ"
     }
   }
   ```
2. Open the Chat tab
3. Send: "Order サービスに依存している周辺チームを教えて"

**Expected**:

- AI lists teams of services that depend on Order
- Each entry includes the team name and the link URLs with their labels
- Links are shown as clickable references

> manual / visual review — チーム情報・リンクの整形・クリック可能性は Chat UI のレンダリング結果を目視確認する。

---

### TC-5: Onboarding query

**Steps**:

1. With team/link data present (from TC-4 setup)
2. Send: "オンボーディングで最初に把握すべきサービスは？"

**Expected**:

- AI identifies the services with the most edges (highest connectivity)
- Returns team name and contact links for each

> manual / visual review — オンボーディング向け推奨サービス選定は LLM の判断に依存し、応答内容を目視確認する。

---

### TC-6: Navigate to query result

**Steps**:

1. Send an impact analysis query (e.g. TC-1)
2. Follow up: "ECommerce のダイアグラムを見せて"

**Expected**:

- Diagram navigates to the ECommerce service scope
- BreadcrumbBar updates to reflect the new ViewPath

> manual / visual review — `navigate_view` ツール呼び出しと BreadcrumbBar 更新の連動は Chat UI とプレビューを並べて目視確認する。

---

### TC-7: Multi-file model (ProjectMode)

**Steps**:

1. Open a project that uses multiple `.krs` files with `import`
2. Open the Chat tab
3. Send: "全体のサービス一覧を教えて"

**Expected**:

- AI returns services from all imported files, not just the currently open file
- This verifies that `resolvedSystems` (compiled from all files) is passed to the chat

> manual / visual review — multi-file モデル全体が AI に渡っているかは Chat 応答の網羅性で判定するため目視確認が必要。

---

## Manual Verification Checklist

- [ ] TC-1: Impact analysis returns correct dependents
- [ ] TC-2: Usecase enumeration is complete
- [ ] TC-3: External dependency ranking is correct
- [ ] TC-4: Team + link data appears in organisational query response
- [ ] TC-5: Onboarding query identifies high-connectivity services
- [ ] TC-6: `navigate_view` tool navigates to the queried node
- [ ] TC-7: Multi-file model is fully visible to the AI
