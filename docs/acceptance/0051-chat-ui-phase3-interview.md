---
type: acceptance-test
issue: "#420"
feature: "Chat UI Phase 3 — Structured Interview Prompts"
date: 2026-04-11
---

# AT-0051: Chat UI Phase 3 — Structured Interview Prompts

## Overview

Verify that the Chat UI conducts a context-aware structured interview based on the current
drill-down scope, and that switching scope changes the interview context accordingly.

## Prerequisites

- A valid Anthropic API key (`sk-ant-...`) stored via Settings
- A `.krs` file that defines at least one system with services, domains, and usecases

---

## AC-1: Opening Chat at system level prompts about services / users / external systems

**Steps:**
1. Open the app with a `.krs` file loaded
2. Ensure the diagram is at the root / system level (no drill-down)
3. Click the **Chat** tab in the left pane

**Expected:**
- The Chat tab opens and immediately shows an AI opening message (no user message visible)
- The AI's question is about one or more of: services, users, external systems, or relationships
- The scope indicator shows the system-level label (e.g., "📍 ECPlatform")

---

## AC-2: Drilling into a service prompts about domains and team ownership

**Steps:**
1. From the system-level diagram, click on a service node to drill into it
2. Click the **Chat** tab (or open a New Session if Chat was already open)

**Expected:**
- The AI's opening question asks about domains within the service and/or team ownership
- The scope indicator reflects the service name (e.g., "📍 ECPlatform > ECommerce")

---

## AC-3: Drilling into a domain prompts about usecases

**Steps:**
1. Drill down to a service, then into a domain node
2. Open the Chat tab (or start a New Session)

**Expected:**
- The AI's opening question asks about usecases within the domain
- The scope indicator reflects the domain path (e.g., "📍 ECPlatform > ECommerce > Order")

---

## AC-4: Drilling into a usecase prompts about resources

**Steps:**
1. Drill down to a usecase node
2. Open the Chat tab (or start a New Session)

**Expected:**
- The AI's opening question asks about resources (dot-notation references) related to the usecase
- The scope indicator reflects the usecase path

---

## AC-5: AI infers `id` in PascalCase and asks for confirmation when ambiguous

**Steps:**
1. Open Chat at any scope
2. In response to the AI's question, describe a concept without specifying an `id`
   (e.g., "注文管理ドメインを追加したい")

**Expected:**
- The AI proposes an `id` in English PascalCase (e.g., `OrderManagement`)
- If the name could map to multiple IDs, the AI asks for confirmation before proposing a patch

---

## AC-6: Switching Editor tab, editing `.krs`, then returning to Chat resumes from updated state

**Steps:**
1. Open Chat at system level — AI asks about services
2. Switch to the **Editor** tab
3. Add a new service block to the `.krs` file manually
4. Switch back to the **Chat** tab (same session — do NOT click New Session)
5. Send a message (e.g., "他にサービスはありますか？")

**Expected:**
- The AI's response reflects the newly added service from step 3
- The AI does not suggest adding the service that was just added manually
