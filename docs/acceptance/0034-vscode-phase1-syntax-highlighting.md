# Acceptance Test: VSCode Extension Phase 1 — Syntax Highlighting (#174)

## Summary

Verify that the `packages/vscode` extension scaffold correctly registers `.krs` and `.krs.style`
as language IDs and applies syntax highlighting when files are opened in VSCode.

---

## Prerequisites

- VSCode is installed
- The extension is installed locally via `vsce package` + `Extensions: Install from VSIX`, or by opening `packages/vscode` in VSCode and pressing F5 to launch the Extension Development Host

---

## Test Cases

### 1. Language registration — .krs

| Step | Action | Expected Result |
|------|--------|----------------|
| 1.1 | Create a file named `test.krs` | VSCode shows the language mode as "karasu" in the status bar |
| 1.2 | Open the file in the editor | No "unknown file type" indicator is shown |

### 2. Syntax highlighting — .krs keywords

| Step | Action | Expected Result |
|------|--------|----------------|
| 2.1 | Write `system MySystem { }` in `test.krs` | `system` is colored as a keyword |
| 2.2 | Write `service Auth { }` inside the system block | `service` is colored as a keyword |
| 2.3 | Write `domain Checkout { }` inside the service block | `domain` is colored as a keyword |
| 2.4 | Write `usecase PlaceOrder { }` inside the domain block | `usecase` is colored as a keyword |
| 2.5 | Write `user Customer [human] { }` | `user` is colored as a keyword; `[human]` is colored as a tag |
| 2.6 | Write `deploy MyDeploy { oci AuthContainer { } }` | `deploy` and `oci` are colored distinctly |

### 3. Syntax highlighting — .krs properties and annotations

| Step | Action | Expected Result |
|------|--------|----------------|
| 3.1 | Write `label "My Service"` inside a block | `label` is colored; the string is colored differently |
| 3.2 | Write `team "backend"` | `team` is colored as a property keyword |
| 3.3 | Write `service Ext @external { }` | `@external` is colored as an annotation/modifier |
| 3.4 | Write `@import "default.krs.style"` at the top | `@import` is colored as a control keyword |

### 4. Syntax highlighting — .krs edges and comments

| Step | Action | Expected Result |
|------|--------|----------------|
| 4.1 | Write `Auth -> Payment` | `->` is colored as an operator |
| 4.2 | Write `Auth --> ExternalGateway` | `-->` is colored as an operator |
| 4.3 | Write `// this is a comment` | The entire line is colored as a comment |
| 4.4 | Write `/* block comment */` | The block comment is colored as a comment |

### 5. Language registration — .krs.style

| Step | Action | Expected Result |
|------|--------|----------------|
| 5.1 | Create a file named `theme.krs.style` | VSCode shows the language mode as "karasu style" in the status bar |
| 5.2 | Open the file in the editor | No "unknown file type" indicator is shown |

### 6. Syntax highlighting — .krs.style

| Step | Action | Expected Result |
|------|--------|----------------|
| 6.1 | Write `service { background-color: #1D4ED8; }` | `service` is colored as a selector; `background-color` as a property name; `#1D4ED8` as a color value |
| 6.2 | Write `[external] { border-style: dashed; }` | `[external]` is colored as a tag selector; `dashed` as a value keyword |
| 6.3 | Write `#MyService { color: #fff; }` | `#MyService` is colored as an ID selector |
| 6.4 | Write `@deprecated { badge-color: #EF4444; }` | `@deprecated` is colored as an annotation selector |
| 6.5 | Write `// style comment` | The line is colored as a comment |

---

## Pass Criteria

All test cases above pass. Keywords, strings, annotations, tags, and comments are visually
distinguishable from plain identifiers in both `.krs` and `.krs.style` files.
