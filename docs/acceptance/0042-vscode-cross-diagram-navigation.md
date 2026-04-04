---
id: AT-0042
title: VSCode Cross-Diagram Navigation in Detail Panel
type: acceptance-test
status: draft
issue: "#254"
---

## Purpose

Verify that the VSCode Webview detail panel supports cross-diagram navigation (team → Org, service → Deploy) and that the runtime/realizes properties are displayed in a separate section from team/role/tags.

## Prerequisites

- A `.krs` project file with:
  - A service node that has a `team` property and `hasDeployContainer` (i.e., has a matching deploy block)
  - A service node that has `runtime` and `realizes` properties

## Test Cases

### AT-0042-1: Team navigation button appears in detail panel

1. Open a `.krs` file in VSCode with karasu extension active
2. In the System view, click the ⓘ button on a node that has a `team` property
3. Verify the detail panel shows a button like `👥 <team-name> →` (not plain text)
4. Click the button
5. **Expected**: View switches to Org diagram; the team node is highlighted/scrolled-into-view

### AT-0042-2: Deploy navigation button appears for nodes with deploy container

1. In the System view, click the ⓘ button on a service node that has a matching deploy block
2. Verify the detail panel shows a `🚀 Deploy 図で確認 →` button
3. Click the button
4. **Expected**: View switches to Deploy diagram; the service node is highlighted/scrolled-into-view

### AT-0042-3: Runtime/realizes in separate section

1. Open the detail panel for a node that has both `runtime`/`realizes` properties and `team`/`role`/`tags`
2. **Expected**: `runtime` and `realizes` appear in their own section above the team/role/tags section

### AT-0042-4: Static text for team when no org nav available

*(Not applicable — VSCode always provides the navigation button when team is set)*

### AT-0042-5: No deploy button when hasDeployContainer is false

1. Open the detail panel for a service node that does NOT have a deploy block
2. **Expected**: No `🚀 Deploy 図で確認 →` button is shown
