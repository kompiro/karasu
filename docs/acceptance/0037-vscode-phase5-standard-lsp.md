---
type: acceptance-test
id: "0037"
title: "VSCode Phase 5 — Standard LSP Features"
issue: "#178"
date: 2026-04-01
---

# Acceptance Test: VSCode Phase 5 — Standard LSP Features

## Overview

Verify that the karasu VSCode extension provides standard LSP capabilities on top of the Minimum Viable LSP from Phase 2.

## Prerequisites

- VSCode with the karasu extension installed (built from `packages/vscode`)
- A `.krs` file open in the editor
- The LSP server running (extension activated)

## Test Cases

### AT-0037-1: Keyword Completion

**Steps:**

1. Open a `.krs` file
2. Type `sys` on a new line
3. Trigger completion (Ctrl+Space or auto-trigger)

**Expected:**

- The completion list includes `system` as a keyword item
- Other keywords appear: `service`, `domain`, `usecase`, `resource`, `user`, `deploy`, etc.

---

### AT-0037-2: Identifier Completion

**Steps:**

1. Open a `.krs` file containing:
   ```
   system ECPlatform {
     service Payment {}
   }
   ```
2. On a new line inside the system block, type `Pay`
3. Trigger completion

**Expected:**

- `Payment` appears in the completion list as a reference item

---

### AT-0037-3: Go to Definition — Same File

**Steps:**

1. Open a `.krs` file containing:
   ```
   system MySystem {
     service Auth {}
   }
   MySystem -> Auth "calls"
   ```
2. Place the cursor on `Auth` in the edge declaration (`MySystem -> Auth`)
3. Press F12 (Go to Definition)

**Expected:**

- Editor jumps to the `service Auth {}` declaration line

---

### AT-0037-4: Go to Definition — Cross-File

**Steps:**

1. Create `base.krs`:
   ```
   service SharedAuth {
     label "Shared Auth"
   }
   ```
2. Create `main.krs`:
   ```
   @import { SharedAuth } from "./base.krs"
   system Platform {
     SharedAuth -> Platform "authenticates"
   }
   ```
3. In `main.krs`, place the cursor on `SharedAuth`
4. Press F12

**Expected:**

- Editor opens `base.krs` and jumps to the `service SharedAuth` declaration

---

### AT-0037-5: Hover — Node Description

**Steps:**

1. Open a `.krs` file containing:
   ```
   system ECPlatform {
     description "EC platform for online shopping"
     service Payment {}
   }
   ```
2. Hover the cursor over `ECPlatform`

**Expected:**

- A hover tooltip appears showing `EC platform for online shopping`

---

### AT-0037-6: Hover — Node Without Description

**Steps:**

1. Open a `.krs` file containing a node with no `description` property
2. Hover over that node's identifier

**Expected:**

- No hover tooltip is shown (or the hover is empty)

---

### AT-0037-7: Outline View (Document Symbols)

**Steps:**

1. Open a `.krs` file containing:
   ```
   system ECPlatform {
     service ECommerce {
       domain Order {}
     }
   }
   deploy prod {
     jar ApiServer {}
   }
   ```
2. Open the Outline panel (View → Open View → Outline)

**Expected:**

- The Outline shows a hierarchy:
  - `ECPlatform` (Module)
    - `ECommerce` (Class)
      - `Order` (Namespace)
  - `prod` (Module)
    - `ApiServer` (Variable)

---

### AT-0037-8: No Regression — Diagnostics Still Work

**Steps:**

1. Open a `.krs` file
2. Introduce a syntax error (e.g., unclosed brace)

**Expected:**

- A red squiggly appears at the error location (Phase 2 behavior intact)

---

### AT-0037-9: No Regression — Bidirectional Jump Still Works

> **Coverage policy: automated** — the editor → SVG highlight direction is
> automated in
> [`packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts`](../../packages/vscode-e2e/tests/webview/at-0038-cmd-click-hint.test.ts)
> under the WebView E2E harness (see
> [AT-0074](./0074-vscode-webview-e2e-phase3-at-0037-9.md)).
>
> The "click an SVG node → jump the editor" direction expected here pre-dated
> the Phase 6 detail-panel work (#250). The current behaviour splits across
> two automated TCs:
>
> - **Cmd/Ctrl+Click on a node → editor jump** is covered by
>   [AT-0038 TC-03 / TC-04](./0038-vscode-phase4-5-cmd-click-hint.md).
> - **Plain click on a leaf → detail panel opens** is covered by
>   [AT-0039 TC-01](./0039-vscode-phase6-detail-panel.md).
>
> No part of AT-0037-9 still requires manual coverage.

**Steps:**

1. Open a `.krs` file and the karasu preview panel
2. Move the cursor to a node definition

**Expected:**

- Cursor movement highlights the corresponding SVG node (the
  `<g data-node-id="…">` element gains `class="karasu-highlighted"`)

---

### AT-0037-10: Resolver warnings surface in the editor (domain-dispersal as info)

> Added with #1413 — the LSP now publishes resolver-level warnings, not just
> parser diagnostics.

**Steps:**

1. Open a `.krs` file with the following content:

   ```krs
   system EC {
     service ECommerce { domain Order {} }
     service Legacy { domain Order {} }
   }
   ```

**Expected:**

- An **Information**-severity diagnostic (blue underline, not red) appears on
  the dispersed `domain Order`, sourced `karasu`. It does **not** block
  anything — there is no error squiggle (ADR-20260514-02: a dispersed domain
  is representable).
- Introducing a genuine resolver warning instead — e.g. a top-level
  `domain Orphan {}` with no owning service — shows a **Warning**-severity
  diagnostic.
