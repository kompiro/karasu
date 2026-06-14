---
type: product
---

# AT-0007: Organization Diagram

- **Date**: 2026-03-24
- **Related**: [Issue #14](https://github.com/kompiro/karasu/issues/14), [ADR-20260323-03](../adr/20260323-03-organization-diagram.md)

## Overview

Verify that the organization diagram feature renders correctly, supports drill-down navigation, and produces appropriate warnings/errors.

## Prerequisites

- App running (`npm run dev`)
- Browser open at `http://localhost:5173`
- A project is selected (e.g., Getting Started)

## Test Cases

### TC-01: Basic Org Rendering

**Steps:**
1. Open the app (ProjectMode — default)
2. Replace the `index.krs` content in the editor with:
   ```krs
   organization ExampleCorp {
     team backend "バックエンドチーム" {
       owns ECommerce
       member alice "Alice" {
         slack "@alice"
         github "alice-dev"
       }
       member bob "Bob" {
         description "SRE担当"
       }
     }
     team frontend "フロントエンドチーム" {
       owns WebApp
       member carol "Carol" {
         github "carol-fe"
       }
     }
   }
   ```
3. Click the **👥 Org** tab in the diagram tab bar

**Expected:**
- Preview renders two team cards (backend, frontend)
- Each card shows team label, owns targets, and member count
- Cards use green color scheme (from builtin `team` style)

---

### TC-02: Drill-Down into Team

**Steps:**
1. With TC-01 content active and Org view selected
2. Click the **backend** team card

**Expected:**
- Preview shows member cards (Alice, Bob)
- Alice's card shows "@alice · alice-dev"
- Bob's card shows "SRE担当" description
- Breadcrumb updates to show `Org > backend`
- Member cards use the member node color scheme

---

### TC-03: Breadcrumb Navigation Back

**Steps:**
1. After drilling into backend (TC-02)
2. Click **Org** in the breadcrumb

**Expected:**
- Returns to top-level team list
- Both backend and frontend cards visible again

---

### TC-04: Sub-Team Nesting

**Steps:**
1. Replace `index.krs` content with:
   ```krs
   organization Corp {
     team platform "プラットフォーム" {
       team infra "インフラ" {
         member dave "Dave" {}
       }
       team security "セキュリティ" {}
     }
   }
   ```
2. Click the **👥 Org** tab in the diagram tab bar
3. Click the **platform** card
4. Verify sub-teams are shown, click **infra**

**Expected:**
- Top level: platform card with "2 sub-teams" text
- After click: infra and security sub-team cards shown
- After clicking infra: Dave's member card shown

---

### TC-05: Invalid `owns` Warning

**Steps:**
1. Replace `index.krs` content with:
   ```krs
   organization Corp {
     team backend {
       owns NonExistentService
     }
   }
   ```
2. Click the **👥 Org** tab in the diagram tab bar

**Expected:**
- Warning panel shows: `team "backend" owns "NonExistentService" but no service or domain with that id exists`

---

### TC-06: Duplicate Team ID Error

**Steps:**
1. Replace `index.krs` content with:
   ```krs
   organization Corp {
     team alpha {}
     team alpha {}
   }
   ```

**Expected:**
- Diagnostic error shown: `Duplicate team id "alpha"`
- SVG still renders (error doesn't crash the preview)

---

### TC-07: Removed `team` Property Error

**Steps:**
1. Click the **⬡ System** tab in the diagram tab bar to switch to logical view
2. Replace `index.krs` content with:
   ```krs
   system Test {
     service ECommerce {
       team "EC開発チーム"
     }
   }
   ```

**Expected:**
- Diagnostic error: `"team" property has been removed; declare ownership with an organization block and "owns"`
- Service still renders in logical view (the removed property is ignored)

---

### TC-08: Multiple Organizations

**Steps:**
1. Replace `index.krs` content with:
   ```krs
   organization OrgA {
     team teamA {}
   }
   organization OrgB {
     team teamB {}
   }
   ```
2. Click the **👥 Org** tab in the diagram tab bar

**Expected:**
- Both teamA and teamB shown in the same Org tab (flattened)

---

### TC-09: Logical View Unaffected

**Steps:**
1. Replace `index.krs` content with both a `system` block and an `organization` block
2. Switch between **⬡ System** tab and **👥 Org** tab in the diagram tab bar

**Expected:**
- Logical view shows the system diagram as before
- Org view shows the org diagram
- No cross-contamination between views

---

## Automated Coverage

| Area | Test File |
|------|-----------|
| Parser (org/team/member/owns) | `packages/core/src/parser/parser.test.ts` |
| OrgViewExtract drill-down | `packages/core/src/view/org-view-extract.test.ts` |
| Duplicate ID error | `parser.test.ts` |
| Duplicate owns error | `parser.test.ts` |
| Removed-property error | `parser.test.ts` |
| Invalid owns warning | `packages/core/src/resolver/warnings.test.ts` |
