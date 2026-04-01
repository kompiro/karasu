# Acceptance Test: VSCode Extension Phase 3 — SVG Preview Webview (#176)

## Summary

Verify that the `packages/vscode` extension displays a live SVG preview of `.krs` files
in a Webview panel, updates in real time on edit, and supports view switching.

---

## Prerequisites

- The extension is loaded in VSCode Extension Development Host (F5 from `packages/vscode`)
- A `.krs` file with valid content is open in the editor (e.g., the sample below)

```krs
system MySystem {
  service Auth {
    domain Login {}
  }
  service Payment {}
  Auth -> Payment
}
deploy MyDeploy {
  oci AuthContainer {}
}
```

---

## Test Cases

### 1. Open preview panel

| Step | Action | Expected Result |
|------|--------|----------------|
| 1.1 | Open a `.krs` file in the editor | File is recognized as "karasu" language |
| 1.2 | Open the Command Palette and run `karasu: Open Preview` | A Webview panel opens beside the editor |
| 1.3 | Observe the panel | The rendered SVG diagram is displayed |
| 1.4 | Observe the panel toolbar | Three buttons are visible: **System**, **Deploy**, **Org** |
| 1.5 | Observe the active button style | **System** button appears highlighted (active state) |

### 2. Real-time update on edit

| Step | Action | Expected Result |
|------|--------|----------------|
| 2.1 | With the preview open, add a new service to the `.krs` file: `service Notification {}` | The preview updates automatically without any manual action |
| 2.2 | Delete the service you just added | The preview reverts to the previous state |
| 2.3 | Introduce a syntax error (e.g., remove a closing `}`) | The preview shows an error message instead of crashing |
| 2.4 | Fix the syntax error | The preview recovers and shows the diagram again |

### 3. View switching

| Step | Action | Expected Result |
|------|--------|----------------|
| 3.1 | Click the **Deploy** button | The deploy diagram is displayed; **Deploy** button appears active |
| 3.2 | Click the **Org** button | The org diagram is displayed (may be empty if no `org` block exists); **Org** button appears active |
| 3.3 | Click the **System** button | The system diagram is restored; **System** button appears active |
| 3.4 | While on the Deploy view, edit the `.krs` file | The preview updates and stays on the Deploy view |

### 4. Active editor tracking

| Step | Action | Expected Result |
|------|--------|----------------|
| 4.1 | Open a second `.krs` file with different content | The preview updates to show the newly active file |
| 4.2 | Switch back to the first `.krs` file | The preview updates to show the first file again |
| 4.3 | Switch to a non-`.krs` file | The preview does not change (retains the last `.krs` content) |

### 5. Panel persistence

| Step | Action | Expected Result |
|------|--------|----------------|
| 5.1 | Close the preview panel | Panel closes without errors |
| 5.2 | Run `karasu: Open Preview` again | A new preview panel opens and shows the current `.krs` file |

---

## Pass Criteria

All test cases above pass. The preview renders SVG diagrams correctly, updates in real time,
and view switching works without errors.
