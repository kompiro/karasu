# AT-364 — Natural Language Query over Architecture Model (Impact Analysis)

- **Date**: 2026-04-10
- **Issue**: [#364](https://github.com/kompiro/karasu/issues/364)
- **Prerequisite**: Chat UI (Phase 1 #418, Phase 2 #419) is available; a Claude API key is set in Settings

---

## Setup

Use `examples/ec-platform/01-system.krs` (or any `.krs` file with multiple services and edges) as the test model.
Set a valid Claude API key in the Settings tab before running these tests.

---

## Test Cases

### TC-1: Impact analysis — which services are affected by a change

**Steps**:
1. Open the Chat tab
2. Send: "Payment ドメインを変更したとき影響するサービスは？"

**Expected**:
- AI responds with a list of services that depend on `Payment` (derived from edges in the model)
- Each item includes the service id/label and the edge kind (sync/async)
- Response does not ask to edit the .krs file (read-only query)

---

### TC-2: Usecase enumeration

**Steps**:
1. Open the Chat tab
2. Send: "OrderTable を操作するユースケースをすべて教えて"

**Expected**:
- AI returns all usecases under the service/domain that references `OrderTable`
- Results include node ids and labels

---

### TC-3: External dependency analysis

**Steps**:
1. Open the Chat tab
2. Send: "外部サービスへの依存が多いのはどれ？"

**Expected**:
- AI ranks services by the number of `[external]` edges
- Top entry is correctly identified

---

### TC-4: Organisational query — teams depending on a service

**Steps**:
1. Add `team` and `link` properties to services in the test model:
   ```krs
   service ECommerce {
     team "ECチーム"
     link "https://slack.com/archives/C123" "ECチーム Slack"
   }
   service Payment {
     team "Fintechチーム"
     link "https://notion.so/fintech"       "チームページ"
   }
   ```
2. Open the Chat tab
3. Send: "Order サービスに依存している周辺チームを教えて"

**Expected**:
- AI lists teams of services that depend on Order
- Each entry includes the team name and the link URLs with their labels
- Links are shown as clickable references

---

### TC-5: Onboarding query

**Steps**:
1. With team/link data present (from TC-4 setup)
2. Send: "オンボーディングで最初に把握すべきサービスは？"

**Expected**:
- AI identifies the services with the most edges (highest connectivity)
- Returns team name and contact links for each

---

### TC-6: Navigate to query result

**Steps**:
1. Send an impact analysis query (e.g. TC-1)
2. Follow up: "ECommerce のダイアグラムを見せて"

**Expected**:
- Diagram navigates to the ECommerce service scope
- BreadcrumbBar updates to reflect the new ViewPath

---

### TC-7: Multi-file model (ProjectMode)

**Steps**:
1. Open a project that uses multiple `.krs` files with `import`
2. Open the Chat tab
3. Send: "全体のサービス一覧を教えて"

**Expected**:
- AI returns services from all imported files, not just the currently open file
- This verifies that `resolvedSystems` (compiled from all files) is passed to the chat

---

## Manual Verification Checklist

- [ ] TC-1: Impact analysis returns correct dependents
- [ ] TC-2: Usecase enumeration is complete
- [ ] TC-3: External dependency ranking is correct
- [ ] TC-4: Team + link data appears in organisational query response
- [ ] TC-5: Onboarding query identifies high-connectivity services
- [ ] TC-6: `navigate_view` tool navigates to the queried node
- [ ] TC-7: Multi-file model is fully visible to the AI
