---
paths:
  - "packages/app/**/*.test.tsx"
  - "packages/app/**/*.test.ts"
---

# App UI Rules — Testing Interactive Components

Established with the shadcn/ui adoption in
[ADR-20260515-01](../../docs/adr/20260515-01-adopt-shadcn-ui.md).
The decisions below codify what was discovered during PR #1379 / #1395.

## Use `userEvent.click` for interactions, not `fireEvent.click`

Radix-backed primitives (Tabs, DropdownMenu, ContextMenu, Select, …)
activate on the full **pointerdown → pointerup → click** sequence, not on
a bare `click`. `fireEvent.click` dispatches only the last step, so
Radix's pointer-event handling silently drops it. `userEvent.click`
models real browser interaction and dispatches the full sequence.

```tsx
import userEvent from "@testing-library/user-event";

it("clicking a tab changes the active view", async () => {
  const user = userEvent.setup();
  const onTabChange = vi.fn();
  const { getByRole } = render(<EditTabBar activeTab="editor" onTabChange={onTabChange} />);
  await user.click(getByRole("tab", { name: /Chat/ }));
  expect(onTabChange).toHaveBeenCalledWith("chat");
});
```

Rules of thumb:

- **`userEvent`** for: click, type, keyboard, hover, focus on any
  interactive control that may be Radix-backed (Dialog triggers, Tabs,
  Popover, Tooltip, DropdownMenu, Select, ContextMenu, anything you
  reach via `@/components/ui/*`)
- **`fireEvent`** is still fine for: non-Radix DOM events that don't
  exist in the userEvent API (e.g. `compositionStart` / `compositionEnd`
  for IME tests, `contextMenu` for the synthetic right-click that opens
  our EdgeContextMenu)

When a new test file is created, default to `userEvent.setup()` at the
top of each test. Existing tests are migrated opportunistically — there
is no "rewrite everything at once" mandate.

## Portal-rendered content is outside the test container

Every shadcn primitive whose content renders behind a Trigger uses a
Radix Portal (`Dialog`, `Popover`, `Tooltip`, `DropdownMenu`, `Select`,
`ContextMenu`). Their DOM is attached to `document.body`, **not** the
RTL render container.

```tsx
// Wrong — silently returns null when content is portalled
const menu = container.querySelector(".edge-context-menu");

// Right — query from document scope
const menu = document.querySelector(".edge-context-menu");
// or use RTL's screen, which queries from document.body
const menu = screen.getByRole("menu");
```

If a test asserts that a dialog/menu is **closed** (absence of DOM), use
the same document-scoped query — `container.querySelector` would return
null both when closed and when portalled, hiding regressions.

## Tooltip needs a Provider in tests

`Tooltip` requires `TooltipProvider` somewhere in the ancestor tree, or
Radix throws. The app provides one globally in `main.tsx`, but unit
tests render components standalone — wrap them:

```tsx
import { TooltipProvider } from "@/components/ui/tooltip";

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}
```

Co-locate the wrapper helper at the top of the test file rather than
extracting it to a shared util — the explicit wrapper makes the
provider-dependency visible.

## Outside-click and Esc are usually not worth asserting in jsdom

Radix's `DismissableLayer` (used by Dialog, Popover, DropdownMenu,
ContextMenu) listens for `pointerdown` on `document` with capture-phase
semantics that jsdom doesn't fully model. `fireEvent.pointerDown(document.body)`
does not reliably close a Radix overlay.

Therefore:

- **Esc-to-close** assertions: skip in jsdom; the Esc path is
  Radix-internal and well-tested upstream. Verify manually instead.
- **Outside-click-to-close** assertions: same — skip in jsdom. The
  behavioral guarantee comes from Radix, not your wrapper code.
- **Cancel/Close button click** assertions: keep — your button wiring
  is what's worth testing.

When you remove an outside-click test as part of a migration, leave a
short comment in the test file pointing at the Radix primitive that
owns the behavior, so the next reader doesn't think coverage was
forgotten.

## Existing fences to keep

These prophylactic tests must survive component migrations:

- **TPL-20260510-04** (IME composition / continuous-input): Tests that
  fire `compositionStart` / `compositionEnd` around a textarea must
  keep doing so after migration. Radix doesn't touch composition events.
- **TPL-20260510-09** (event handler restructure): Tests that assert an
  Enter keypress does **not** confirm/close a dialog (because that
  pattern leaks events to the next-mounted target) must remain.

If a migration changes the way an Esc/Enter handler is wired, update
the comment around the prophylactic test to reflect who now owns the
handler, but keep the assertion.
