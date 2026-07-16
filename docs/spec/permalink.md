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
  `ActiveView`; mirrored by `ShareTargetView` in `@karasu-tools/core`), plus
  `entity`. The `entity` token addresses a **per-domain entity view**: `<id>` is
  a domain id and `#krs-entity-<domainId>` opens that domain's entity view (its
  entities and their intra-domain relations; a qualified cross-domain target is
  drawn as a muted ghost of the foreign entity, sub-labelled with its owning
  domain — see [syntax.md](./syntax.md)). Entity views are emitted into the static all-views bundle
  (`drill-down-svg.ts`) and live inside the system pane, since they are drilled
  from a domain in the system view. In the SPA the entity view is a **sub-mode
  of the `system` view** (not a distinct `ActiveView`): the app drills into the
  domain (`activeView === "system"`, `viewPath` = the domain) and toggles the
  entity sub-mode on, so `buildHash` emits `#krs-entity-<domainId>` in place of
  `#krs-system-<domainId>` and `parseHash` restores it. The share `target`
  carries it as the boolean `entityView` flag (mirroring `orgTree`).
- **`<id>`** — the **author-given `id`** of the element to drill to, passed
  through `sanitizeId` (non-`[A-Za-z0-9_-]` → `_`). The literal `root` denotes
  the view's top level. Identity is always the `id`, never a `label` or any
  translated/display string.
- **`:<highlight>`** *(SPA only)* — an optional `id` to focus-highlight on
  arrival. The static SVG has no highlight channel (CSS `:target` selects one
  element only), so this suffix is dropped there.

The single source of the grammar is `anchorId(viewPrefix, id)` in
`@karasu-tools/core` (`packages/core/src/renderer/svg-renderer.ts`). The
element-anchor producers — the static SVG (`drill-down-svg.ts`) and the SPA
hash builder for the drillable system/org views (`buildHash` in `packages/app`)
— route through `anchorId`, so the two surfaces can't drift (parity-tested).

**Not every fragment is an element anchor.** The SPA also has single-level
whole-view tabs (`#krs-deploy`, `#krs-matrix`) and an org Tree View mode
(`#krs-org-tree`); these carry no `<id>` segment and are intentionally outside
the `anchorId` grammar. A share `target` for one of those views opens the view
itself (no leaf), so `target.node` is only meaningful for `system` / `org`.

## Carrying an anchor in a share URL

The nest inline-share URL (`#s=<payload>` / `/s?s=<payload>`) carries the deep
target **inside** the encoded `SharePayload` as an optional `target`:

```ts
target?: { view: ShareTargetView; node?: string; highlight?: string; orgTree?: boolean; entityView?: boolean }
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
addressing by stable identity; ADR → karasu permalinks are validated against
renames by `pnpm adr:check-permalinks` (the `@kompiro/adr-tools` `krs` kind),
which fails CI when a `permalink:` anchor no longer resolves (#1830).
Do not work around it by anchoring on `label` — labels are display/i18n strings
and are explicitly not identity.

> Related TPLs: [TPL-20260630-01](../test-perspectives/TPL-20260630-01-deep-link-anchor-cross-surface-parity.md) — the static-SVG and SPA-hash anchors must stay one id-based grammar; a divergence makes a permalink resolve on one surface but not the other.
