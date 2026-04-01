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

**Steps:**

1. Open a `.krs` file and the karasu preview panel
2. Move the cursor to a node definition
3. Click a node in the SVG preview

**Expected:**

- Cursor movement highlights the corresponding SVG node (Phase 4 behavior intact)
- Clicking the SVG node jumps the editor cursor to the definition (Phase 4 behavior intact)
