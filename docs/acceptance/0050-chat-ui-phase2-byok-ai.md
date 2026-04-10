---
type: acceptance-test
issue: "#419"
feature: "Chat UI Phase 2 — BYOK + AI integration"
date: 2026-04-10
---

# AT-0050: Chat UI Phase 2 — BYOK + AI Integration

## Overview

Verify that the Chat UI can accept a Claude API key via the Settings pane,
call the Anthropic API, and correctly handle `navigate_view` and `apply_krs_patch` tool use.

## Prerequisites

- A valid Anthropic API key (`sk-ant-...`)
- A `.krs` file open in the editor

---

## AC-1: Settings pane shows BYOK security explanation

**Steps:**
1. Open the app
2. Click the **⚙ Settings** tab in the left pane

**Expected:**
- Settings pane is displayed
- Security warning section is visible with the heading "⚠ セキュリティについて"
- The text explains that the API key is stored only in the browser
- A link to `console.anthropic.com` is present
- An API key input field is visible
- A "セッションをまたいで保存する" checkbox is visible

---

## AC-2: API key stored in sessionStorage by default

**Steps:**
1. Open the Settings tab
2. Enter an API key in the input field
3. Leave the "セッションをまたいで保存する" checkbox unchecked
4. Click **💾 保存する**
5. Open DevTools → Application → Storage

**Expected:**
- `karasu.ai.anthropic.apiKey` is present in **sessionStorage**
- `karasu.ai.anthropic.apiKey` is **not** present in localStorage
- `karasu.ai.settings.persist` in localStorage is `"session"`

---

## AC-3: API key persisted in localStorage on opt-in

**Steps:**
1. Open the Settings tab
2. Enter an API key
3. Check the "セッションをまたいで保存する" checkbox
4. Click **💾 保存する**

**Expected:**
- `karasu.ai.anthropic.apiKey` is present in **localStorage**
- `karasu.ai.anthropic.apiKey` is **not** present in sessionStorage
- `karasu.ai.settings.persist` in localStorage is `"local"`

---

## AC-4: Chat tab shows ApiKeySetup when no key is stored

**Steps:**
1. Ensure no API key is stored (DevTools → clear both storages)
2. Click the **💬 Chat** tab

**Expected:**
- The "AI 機能を使うには Claude API キーが必要です。" message is displayed
- A **⚙ Settings で設定する** button is present (no message input)

---

## AC-5: ApiKeySetup button navigates to Settings tab

**Steps:**
1. With no API key stored, open the Chat tab
2. Click **⚙ Settings で設定する**

**Expected:**
- The Settings tab becomes active automatically

---

## AC-6: Sending a message calls the Anthropic API and displays the response

**Steps:**
1. Set a valid API key in Settings
2. Open the Chat tab
3. Type "このシステムを説明してください" in the input
4. Press **Cmd+Enter** (or Ctrl+Enter) or click **↑ Send**

**Expected:**
- The user message appears in the chat
- A loading indicator "AI が考えています…" is shown
- An AI response appears after a few seconds
- The input is cleared after sending

---

## AC-7: `navigate_view` tool call navigates the diagram

**Steps:**
1. Set a valid API key
2. Open the Chat tab with a multi-service `.krs` file
3. Ask the AI to "ECサービスの詳細を見せてください" (or equivalent for your file)

**Expected:**
- If the AI uses `navigate_view`, the diagram updates to reflect the new view path
- The chat scope indicator (📍) updates to reflect the new scope
- The AI's follow-up message appears in the chat

---

## AC-8: `apply_krs_patch` shows confirmation before applying

**Steps:**
1. Set a valid API key
2. Open the Chat tab
3. Ask the AI to add a new service or domain

**Expected:**
- The AI responds with a patch proposal showing the `.krs` snippet
- An **✓ Apply** and **✕ Reject** button appear below the patch
- The message input is disabled while waiting for confirmation

---

## AC-9: Clicking Apply applies the patch and gets AI follow-up

**Steps:**
1. Trigger a patch proposal (see AC-8)
2. Click **✓ Apply**

**Expected:**
- The `.krs` content in the editor is updated with the patch
- The diagram re-renders
- An AI follow-up message appears ("適用しました。" etc.)
- The message input becomes enabled again

---

## AC-10: Clicking Reject sends tool_result and gets AI follow-up

**Steps:**
1. Trigger a patch proposal
2. Click **✕ Reject**

**Expected:**
- The `.krs` content is NOT changed
- An AI follow-up message appears acknowledging the rejection
- The message input becomes enabled again

---

## AC-11: Apply button is disabled if file was edited after patch was proposed

**Steps:**
1. Trigger a patch proposal
2. Switch to the **Editor** tab and manually edit the `.krs` file
3. Switch back to **Chat** tab
4. Click **✓ Apply**

**Expected:**
- The patch is silently ignored (Apply does nothing when hash mismatch is detected)

---

## AC-12: New Session auto-rejects pending patch

**Steps:**
1. Trigger a patch proposal
2. Click **↺ New Session** while Apply/Reject buttons are shown

**Expected:**
- The chat history is cleared
- The session resets to idle state

---

## AC-13: 401 error shows inline message with Settings link

**Steps:**
1. Set an **invalid** API key in Settings (e.g. `sk-invalid`)
2. Open Chat tab and send a message

**Expected:**
- An error message appears: "⚠ APIキーが無効です。Settings で正しいキーを設定してください。"
- A **⚙ Settings を開く** button is present and navigates to Settings when clicked
- No retry button is shown

---

## AC-14: 429 error shows inline message with retry button

*(Requires rate-limiting scenario or mock)*

**Expected:**
- Error message: "⚠ リクエスト制限に達しました。しばらく待ってから再試行してください。"
- A **↺ 再試行** button is present

---

## AC-15: 500 error shows inline message with retry button

*(Requires server error scenario or mock)*

**Expected:**
- Error message: "⚠ Anthropic サーバーエラーです。しばらく待ってから再試行してください。"
- A **↺ 再試行** button is present
