---
id: "0014"
title: Deploy node kinds integrated into style system
type: acceptance-test
status: draft
---

# Deploy Node Style Integration

## Scope

Deploy node kinds (`oci`, `lambda`, `jar`, `war`, `function`, `assets`, `job`, `artifact`) must
derive their visual styles from the built-in style sheet rather than hardcoded constants.

## Automated checks

| # | Check | Location |
|---|-------|----------|
| 1 | All 8 deploy kind rules exist in `BUILTIN_STYLE_SOURCE` | `default-style.test.ts` |
| 2 | `resolveStyles` resolves `oci` node to correct colors | `style-resolver.test.ts` |
| 3 | `resolveStyles` resolves `lambda` node to correct colors | `style-resolver.test.ts` |
| 4 | User stylesheet can override a deploy kind color | `style-resolver.test.ts` |
| 5 | `renderDeploy` produces valid SVG with kind badge labels | `deploy-renderer.test.ts` |

## Manual verification

- [ ] Open a `.krs` file with a deploy block containing `oci` and `lambda` units in the app
- [ ] Confirm the rendered SVG shows different background colors per kind (not all grey)
- [ ] Add a `.krs.style` file with `oci { background-color: #FF0000; }` and confirm the override applies
- [ ] Confirm kind badge labels (`oci`, `lambda`, etc.) appear on each node
