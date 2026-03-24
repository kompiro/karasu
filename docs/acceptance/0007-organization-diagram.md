# AT-0007: Organization Diagram

- **Date**: 2026-03-24
- **Related**: [Issue #14](https://github.com/kompiro/karasu/issues/14), [design doc](../design/organization-diagram.md)

## Overview

Verify that the organization diagram feature renders correctly, supports drill-down navigation, and produces appropriate warnings/errors.

## Prerequisites

- App running (`npm run dev`)
- Browser open at `http://localhost:5173`

## Test Cases

### TC-01: Basic Org Rendering

**Steps:**
1. Open the app (MemoryMode)
2. Replace the editor content with:
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
3. Click the **👥 Org** toolbar button

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
1. Add a sub-team to the editor content:
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
2. Click **👥 Org**
3. Click the **platform** card
4. Verify sub-teams are shown, click **infra**

**Expected:**
- Top level: platform card with "2 sub-teams" text
- After click: infra and security sub-team cards shown
- After clicking infra: Dave's member card shown

---

### TC-05: Invalid `owns` Warning

**Steps:**
1. Enter:
   ```krs
   organization Corp {
     team backend {
       owns NonExistentService
     }
   }
   ```
2. Click **👥 Org**

**Expected:**
- Warning panel shows: `team "backend" owns "NonExistentService" but no service or domain with that id exists`

---

### TC-06: Duplicate Team ID Error

**Steps:**
1. Enter:
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

### TC-07: Deprecated `team` Property Warning

**Steps:**
1. Switch back to **≡ Logical** view
2. Enter a service with the old `team` property:
   ```krs
   system Test {
     service ECommerce {
       team "EC開発チーム"
     }
   }
   ```

**Expected:**
- Diagnostic warning: `"team" property is deprecated; use an organization block with "owns" instead`
- Service still renders normally in logical view

---

### TC-08: Multiple Organizations

**Steps:**
1. Enter:
   ```krs
   organization OrgA {
     team teamA {}
   }
   organization OrgB {
     team teamB {}
   }
   ```
2. Click **👥 Org**

**Expected:**
- Both teamA and teamB shown in the same Org tab (flattened)

---

### TC-09: Logical View Unaffected

**Steps:**
1. Enter both a `system` block and an `organization` block
2. Switch between **≡ Logical** and **👥 Org** views

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
| Deprecation warning | `parser.test.ts` |
