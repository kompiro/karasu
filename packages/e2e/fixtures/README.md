# Playwright fixtures

Reusable test fixtures for `@karasu-tools/e2e`.

## `opfs.ts` — OPFS state fixture

Seeds and resets OPFS / `localStorage` state so tests can drive
ProjectMode flows deterministically without depending on the app's
first-run seeding. Also exposes a `mode` switch for running the same
suite against `MemoryModeApp` (`?mode=memory`).

Design rationale: see `docs/design/opfs-fixture-helper.md`.

### Quick start

```ts
import { test, expect } from "../fixtures/opfs";

test("seeded project is preselected", async ({ page, opfs }) => {
  await opfs.seed({
    projects: [
      {
        id: "demo",
        name: "Demo",
        files: { "index.krs": 'system "X" {}\n' },
      },
    ],
    lastProjectId: "demo",
  });
  await opfs.gotoApp();

  await expect(page.locator(".project-selector select.project-selector-dropdown")).toHaveValue(
    "demo",
  );
});
```

### API

| Method                     | Purpose                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `opfs.seed(options)`       | Wipe OPFS + `localStorage`, then write `projects`, `lastProjectId`, and remember the `mode`.    |
| `opfs.reset()`             | Wipe OPFS + `localStorage` without seeding.                                                     |
| `opfs.read(path)`          | Read a file from OPFS (returns `null` if missing).                                              |
| `opfs.gotoApp(path = "/")` | Navigate to the app, appending `?mode=memory` automatically when the fixture is in memory mode. |
| `opfs.mode`                | The current mode (`"opfs"` by default; updated by `seed()`).                                    |

`seed()` and `reset()` are safe to call before or between `gotoApp()`
calls. The fixture establishes the OPFS origin internally by booting
`?mode=memory` once on first use, so tests do not need to perform a
preliminary navigation.

`lastProjectId` is applied in both modes — it is written to
`localStorage` regardless of `mode`. `MemoryModeApp` does not consume
it, but tests that toggle between OPFS and memory in the same
`describe` block can rely on `localStorage` being clean either way.
`projects` are silently dropped in memory mode (and OPFS is left
untouched by that call).

### Two-environment runs (AT-0014 and similar)

When the same scenario must run in both OPFS and InMemory modes,
iterate over the modes in the test body rather than duplicating the
entire test suite via Playwright `projects:`. The fixture's `mode`
parameter handles URL routing.

```ts
test.describe("AT-XXXX scenario", () => {
  for (const mode of ["opfs", "memory"] as const) {
    test(`scenario X (${mode})`, async ({ page, opfs }) => {
      await opfs.seed({
        mode,
        projects: [
          /* ... */
        ],
      });
      await opfs.gotoApp();
      // ...
    });
  }
});
```

This keeps the cost local to the AT that needs it; existing tests
(which depend on the app's first-run seed path) are unaffected.

### Caveats

- **Chromium only.** OPFS support varies across browsers; Playwright
  is already configured chromium-only for this package.
- **Call before `gotoApp`.** `seed()` / `reset()` mutate OPFS in the
  test page, then `gotoApp()` reloads the app so it picks up the
  state. Calling them after a real navigation works (the fixture
  re-uses the established origin) but the app must be reloaded
  separately.
- **`localStorage` is wiped on every `seed()` / `reset()`** so the app
  cannot restore stale `lastProjectId` from a previous run.
