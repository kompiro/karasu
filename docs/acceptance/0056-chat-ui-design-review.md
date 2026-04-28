---
type: acceptance-test
issue: "#363"
feature: "Chat UI — AI Design Review"
date: 2026-04-13
---

# AT-0056: Chat UI — AI Design Review

## Overview

Verify that the Chat UI provides on-demand AI design review triggered by a button or natural
language input. The AI analyses the current `.krs` scope and returns structured findings
categorised by severity.

## Prerequisites

- A valid Anthropic API key (`sk-ant-...`) stored via Settings
- A `.krs` file loaded that defines at least one system with services and domains

---

## AC-1: "Start Review" button appears in the Chat empty state

**Steps:**

1. Open the app with a `.krs` file loaded
2. Set a valid API key in Settings
3. Click the **Chat** tab

**Expected:**

- The empty state shows two side-by-side buttons: **▶ Start Interview** and **🔍 Start Review**
- The hint text below reads: `または自由に入力してください（例: "このモデルをレビューして"）`

---

## AC-2: Clicking "Start Review" triggers an AI review with severity icons

**Steps:**

1. Open the Chat tab (empty state)
2. Click **🔍 Start Review**

**Expected:**

- A loading indicator `AI が考えています…` is shown
- The AI's response appears with structured findings using severity icons:
  - 🔴 for critical issues (e.g. god service, unassigned domain)
  - 🟡 for warnings (e.g. missing label, missing team)
  - ✅ for positive findings or when no issues are detected
- No user message is displayed (the trigger is hidden, same as Start Interview)

---

## AC-3: Asking for review via natural language starts a review

**Steps:**

1. Open the Chat tab
2. Type `このモデルをレビューして` in the input
3. Press **Cmd+Enter** (or Ctrl+Enter)

**Expected:**

- The user message appears in the chat
- The AI responds with structured review findings using severity icons (same format as AC-2)

---

## AC-4: Review scope follows the current ViewPath

**Steps:**

1. Open the app at the system level (no drill-down)
2. Click **🔍 Start Review**
3. Observe the scope of the review findings

**Expected:**

- The AI reviews services, users, external systems and relationships at the system level
- The scope indicator shows the system-level label (e.g. `📍 ECPlatform`)

**Repeat with a drilled-down scope:** 4. Drill into a service node in the diagram 5. Click **↺ New Session** in the Chat tab, then click **🔍 Start Review**

**Expected:**

- The AI review focuses on the service's domains and their structure

---

## AC-5: After review, AI proposes a patch on request

**Steps:**

1. Click **🔍 Start Review** — AI returns review findings
2. Ask: `OrderService の分割案を .krs で見せて`

**Expected:**

- The AI responds with a patch proposal
- An **✓ Apply** and **✕ Reject** button appear below the patch
- Clicking **✓ Apply** updates the `.krs` content in the editor

---

## AC-6: Review on a minimal model with no issues returns only positive findings

**Steps:**

1. Open a `.krs` file with a well-structured model (all edges labelled, all services with team,
   no service has more than 4 domains)
2. Click **🔍 Start Review**

**Expected:**

- The AI response contains only ✅ entries
- No 🔴 or 🟡 issues are reported
