# Deep permalink anchors

> **English**（this file） · [日本語](permalink.ja.md)

A **deep permalink** addresses a *specific structural element or view* inside a
karasu model, so a reader who follows the link lands drilled/focused on exactly
that element — not on the whole model. This page is the authoritative contract
for the **fragment anchor** that both deep-link surfaces share.

Two surfaces resolve the same anchor:

| Surface | How it consumes the anchor |
| --- | --- |
| **Static rendered SVG** (`buildDrillDownSvg` / all-views export) | Pure CSS `:target` + `:has()`. Opening `<svg-url>#krs-system-Payment` shows that level — no JavaScript. |
| **nest/app SPA** (`useHistoryNavigation`) | Parses the `#krs-…` hash on mount / `popstate` and drills + focuses through the node-path index. |

Because both surfaces use the **same grammar**, one anchor is portable: the
fragment you copy from a rendered SVG resolves in the app, and vice versa.

## Anchor grammar

```
#krs-<view>-<id>[:<highlight>]
```

- **`<view>`** — one of `system` · `deploy` · `org` · `matrix` (the app's
  `ActiveView`; mirrored by `ShareTargetView` in `@karasu-tools/core`).
- **`<id>`** — the **author-given `id`** of the element to drill to, passed
  through `sanitizeId` (non-`[A-Za-z0-9_-]` → `_`). The literal `root` denotes
  the view's top level. Identity is always the `id`, never a `label` or any
  translated/display string.
- **`:<highlight>`** *(SPA only)* — an optional `id` to focus-highlight on
  arrival. The static SVG has no highlight channel (CSS `:target` selects one
  element only), so this suffix is dropped there.

The single source of the grammar is `anchorId(viewPrefix, id)` in
`@karasu-tools/core` (`packages/core/src/renderer/svg-renderer.ts`). Every
producer — the static SVG (`drill-down-svg.ts`) and the SPA hash builder
(`buildHash` in `packages/app`) — MUST route through `anchorId` /
`sanitizeId`, so the two surfaces can never drift.

## Carrying an anchor in a share URL

The nest inline-share URL (`#s=<payload>` / `/s?s=<payload>`) carries the deep
target **inside** the encoded `SharePayload` as an optional `target`:

```ts
target?: { view: ShareTargetView; node?: string; highlight?: string; orgTree?: boolean }
```

A single opaque token therefore deep-links identically across the private
fragment URL, the server-visible `/s?s=` unfurl URL, and any shortened form.
`node` is the **leaf** id of the drilled-to element (the full drill path is
reconstructed from the leaf via the app's node-path index, exactly as the
`#krs-<view>-<node>` hash already resolves); absent `target` opens the whole
model at its root. On open, the app normalizes the URL to the canonical
`#krs-…` anchor above before the history hook mounts. An unrecognized or
renamed target degrades to a whole-model / nearest-resolvable open — it never
throws.

## Stability caveat

An anchor pins an element by `id`. **Renaming the element's `id` breaks the
anchor** (a stale `#krs-…` falls back to the view root). This is inherent to
addressing by stable identity; validating ADR → karasu permalinks against
renames is tracked separately (the `adr:check-assumptions` extension, #1830).
Do not work around it by anchoring on `label` — labels are display/i18n strings
and are explicitly not identity.

> Related TPLs: [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md) — the static-SVG and SPA-hash anchors must stay one id-based grammar; a divergence makes a permalink resolve on one surface but not the other.
